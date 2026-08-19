/*
# Analytics RPCs, Audit Log, and Super Admin Platform Metrics

## Overview
Server-side aggregation for restaurant dashboards and super admin panel.
All calculations run in PostgreSQL — the browser receives only computed results.

## New Tables
1. `audit_logs` — administrative action log

## New RPCs
1. `get_restaurant_analytics(p_restaurant_id, p_start, p_end)` — full dashboard metrics
2. `get_product_analytics(p_restaurant_id, p_start, p_end)` — product/category breakdown
3. `get_order_analytics(p_restaurant_id, p_start, p_end)` — order volume, prep/delivery time, cancellation rate
4. `get_peak_hours(p_restaurant_id, p_start, p_end)` — orders grouped by hour
5. `get_platform_metrics()` — super admin platform-wide metrics
6. `get_admin_restaurants(p_page, p_per_page, p_search, p_status_filter)` — paginated restaurant list
7. `get_audit_logs(p_page, p_per_page)` — paginated audit logs
8. `log_admin_action(p_action, p_tenant_id, p_entity_type, p_entity_id, p_metadata)` — log admin action
9. `update_restaurant_subscription_status(p_restaurant_id, p_status, p_is_open)` — super admin updates subscription
*/

-- =========================================================
-- 1. audit_logs table
-- =========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  tenant_id uuid,
  entity_type text,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs (tenant_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read audit logs
DROP POLICY IF EXISTS "admin_read_audit_logs" ON audit_logs;
CREATE POLICY "admin_read_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Only super admins can insert audit logs
DROP POLICY IF EXISTS "admin_insert_audit_logs" ON audit_logs;
CREATE POLICY "admin_insert_audit_logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- =========================================================
-- 2. log_admin_action RPC
-- =========================================================
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action text,
  p_tenant_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN v_email := 'unknown'; END IF;

  INSERT INTO audit_logs (actor_id, actor_email, action, tenant_id, entity_type, entity_id, metadata)
  VALUES (auth.uid(), v_email, p_action, p_tenant_id, p_entity_type, p_entity_id, p_metadata);

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION log_admin_action(text, uuid, text, text, jsonb) TO authenticated;

-- =========================================================
-- 3. get_restaurant_analytics RPC
-- Returns: revenue, order count, avg ticket, delivery/table/canceled counts,
--          payment breakdown (pay_now/pay_later counts + revenue)
-- =========================================================
CREATE OR REPLACE FUNCTION get_restaurant_analytics(
  p_restaurant_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, date_trunc('day', now()));
  v_end timestamptz := COALESCE(p_end, now());
  v_revenue numeric;
  v_order_count int;
  v_avg_ticket numeric;
  v_delivery_count int;
  v_table_count int;
  v_canceled_count int;
  v_pay_now_count int;
  v_pay_later_count int;
  v_pay_now_revenue numeric;
  v_pay_later_revenue numeric;
  v_is_authorized boolean := false;
BEGIN
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner','Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  SELECT
    COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END), 0),
    COUNT(*),
    COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.total END), 0),
    COUNT(*) FILTER (WHERE o.fulfillment = 'delivery'),
    COUNT(*) FILTER (WHERE o.fulfillment = 'table'),
    COUNT(*) FILTER (WHERE o.status IN ('canceled','rejected')),
    COUNT(*) FILTER (WHERE o.payment_mode = 'pay_now'),
    COUNT(*) FILTER (WHERE o.payment_mode = 'pay_later'),
    COALESCE(SUM(CASE WHEN o.status = 'completed' AND o.payment_mode = 'pay_now' THEN o.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN o.status = 'completed' AND o.payment_mode = 'pay_later' THEN o.total ELSE 0 END), 0)
  INTO v_revenue, v_order_count, v_avg_ticket, v_delivery_count, v_table_count,
       v_canceled_count, v_pay_now_count, v_pay_later_count, v_pay_now_revenue, v_pay_later_revenue
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= v_start AND o.created_at <= v_end;

  RETURN jsonb_build_object(
    'success', true,
    'revenue', v_revenue,
    'order_count', v_order_count,
    'avg_ticket', v_avg_ticket,
    'delivery_count', v_delivery_count,
    'table_count', v_table_count,
    'canceled_count', v_canceled_count,
    'pay_now_count', v_pay_now_count,
    'pay_later_count', v_pay_later_count,
    'pay_now_revenue', v_pay_now_revenue,
    'pay_later_revenue', v_pay_later_revenue
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_restaurant_analytics(uuid, timestamptz, timestamptz) TO authenticated;

-- =========================================================
-- 4. get_product_analytics RPC
-- Returns: best sellers, revenue by product, quantity sold, avg selling price, category performance
-- =========================================================
CREATE OR REPLACE FUNCTION get_product_analytics(
  p_restaurant_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, date_trunc('day', now()));
  v_end timestamptz := COALESCE(p_end, now());
  v_is_authorized boolean := false;
  v_products jsonb;
  v_categories jsonb;
BEGIN
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner','Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  -- Product-level analytics (only from completed orders)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'name', oi.name,
      'quantity', oi.quantity,
      'revenue', oi.line_total,
      'unit_price', CASE WHEN oi.quantity > 0 THEN oi.line_total / oi.quantity ELSE 0 END
    ) ORDER BY (oi.line_total) DESC
  ), '[]'::jsonb) INTO v_products
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.restaurant_id = p_restaurant_id
    AND o.status = 'completed'
    AND o.created_at >= v_start AND o.created_at <= v_end;

  -- Category-level analytics
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category', cat_name,
      'quantity', total_qty,
      'revenue', total_rev
    ) ORDER BY total_rev DESC
  ), '[]'::jsonb) INTO v_categories
  FROM (
    SELECT
      COALESCE(p.category_name, 'Sem categoria') AS cat_name,
      SUM(oi.quantity) AS total_qty,
      SUM(oi.line_total) AS total_rev
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status = 'completed'
      AND o.created_at >= v_start AND o.created_at <= v_end
    GROUP BY COALESCE(p.category_name, 'Sem categoria')
  ) cat;

  RETURN jsonb_build_object(
    'success', true,
    'products', v_products,
    'categories', v_categories
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_product_analytics(uuid, timestamptz, timestamptz) TO authenticated;

-- =========================================================
-- 5. get_order_analytics RPC
-- Returns: order volume, avg prep time, avg delivery time, cancellation rate, payment success rate
-- =========================================================
CREATE OR REPLACE FUNCTION get_order_analytics(
  p_restaurant_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, date_trunc('day', now()));
  v_end timestamptz := COALESCE(p_end, now());
  v_is_authorized boolean := false;
  v_total_orders int;
  v_completed_orders int;
  v_canceled_orders int;
  v_avg_prep_minutes numeric;
  v_avg_delivery_minutes numeric;
  v_cancellation_rate numeric;
  v_payment_success_rate numeric;
  v_pay_now_total int;
  v_pay_now_completed int;
BEGIN
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner','Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE o.status = 'completed'),
    COUNT(*) FILTER (WHERE o.status IN ('canceled','rejected')),
    COUNT(*) FILTER (WHERE o.payment_mode = 'pay_now'),
    COUNT(*) FILTER (WHERE o.payment_mode = 'pay_now' AND o.status = 'completed')
  INTO v_total_orders, v_completed_orders, v_canceled_orders, v_pay_now_total, v_pay_now_completed
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= v_start AND o.created_at <= v_end;

  -- Avg prep time: time from order creation to "ready" status
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (h.created_at - o.created_at)) / 60
  ), 0) INTO v_avg_prep_minutes
  FROM order_status_history h
  JOIN orders o ON o.id = h.order_id
  WHERE o.restaurant_id = p_restaurant_id
    AND h.new_status = 'ready'
    AND o.created_at >= v_start AND o.created_at <= v_end;

  -- Avg delivery time: time from "ready" to "delivered"
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (h2.created_at - h1.created_at)) / 60
  ), 0) INTO v_avg_delivery_minutes
  FROM order_status_history h1
  JOIN order_status_history h2 ON h2.order_id = h1.order_id AND h2.new_status = 'completed'
  JOIN orders o ON o.id = h1.order_id
  WHERE o.restaurant_id = p_restaurant_id
    AND h1.new_status = 'ready'
    AND o.fulfillment = 'delivery'
    AND o.created_at >= v_start AND o.created_at <= v_end;

  v_cancellation_rate := CASE WHEN v_total_orders > 0 THEN (v_canceled_orders::numeric / v_total_orders) * 100 ELSE 0 END;
  v_payment_success_rate := CASE WHEN v_pay_now_total > 0 THEN (v_pay_now_completed::numeric / v_pay_now_total) * 100 ELSE 100 END;

  RETURN jsonb_build_object(
    'success', true,
    'total_orders', v_total_orders,
    'completed_orders', v_completed_orders,
    'canceled_orders', v_canceled_orders,
    'avg_prep_minutes', ROUND(v_avg_prep_minutes, 1),
    'avg_delivery_minutes', ROUND(v_avg_delivery_minutes, 1),
    'cancellation_rate', ROUND(v_cancellation_rate, 1),
    'payment_success_rate', ROUND(v_payment_success_rate, 1)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_order_analytics(uuid, timestamptz, timestamptz) TO authenticated;

-- =========================================================
-- 6. get_peak_hours RPC
-- Returns: orders grouped by hour of day
-- =========================================================
CREATE OR REPLACE FUNCTION get_peak_hours(
  p_restaurant_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, date_trunc('day', now()));
  v_end timestamptz := COALESCE(p_end, now());
  v_is_authorized boolean := false;
  v_hours jsonb;
BEGIN
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner','Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'hour', hr,
      'count', cnt
    ) ORDER BY hr
  ), '[]'::jsonb) INTO v_hours
  FROM (
    SELECT
      EXTRACT(HOUR FROM o.created_at)::int AS hr,
      COUNT(*) AS cnt
    FROM orders o
    WHERE o.restaurant_id = p_restaurant_id
      AND o.created_at >= v_start AND o.created_at <= v_end
    GROUP BY hr
  ) h;

  RETURN jsonb_build_object('success', true, 'hours', v_hours);
END;
$$;
GRANT EXECUTE ON FUNCTION get_peak_hours(uuid, timestamptz, timestamptz) TO authenticated;

-- =========================================================
-- 7. get_platform_metrics RPC
-- Super admin only — platform-wide metrics
-- =========================================================
CREATE OR REPLACE FUNCTION get_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_restaurants int;
  v_active_restaurants int;
  v_trial_restaurants int;
  v_suspended_restaurants int;
  v_canceled_restaurants int;
  v_total_orders int;
  v_platform_revenue numeric;
  v_subscription_metrics jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.subscription_status IN ('active','trialing')),
    COUNT(*) FILTER (WHERE r.subscription_status IN ('trial','trialing')),
    COUNT(*) FILTER (WHERE r.subscription_status IN ('suspended','past_due')),
    COUNT(*) FILTER (WHERE r.subscription_status = 'canceled')
  INTO v_total_restaurants, v_active_restaurants, v_trial_restaurants, v_suspended_restaurants, v_canceled_restaurants
  FROM restaurants r;

  SELECT COUNT(*) INTO v_total_orders FROM orders;

  -- Platform revenue: sum of all completed order totals
  SELECT COALESCE(SUM(o.total), 0) INTO v_platform_revenue
  FROM orders o WHERE o.status = 'completed';

  -- Subscription metrics: count by plan
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'plan_name', plan_name,
      'count', cnt
    ) ORDER BY cnt DESC
  ), '[]'::jsonb) INTO v_subscription_metrics
  FROM (
    SELECT
      COALESCE(s.plan_name, 'Sem plano') AS plan_name,
      COUNT(*) AS cnt
    FROM restaurants r
    LEFT JOIN subscriptions s ON s.restaurant_id = r.id AND s.status = 'active'
    GROUP BY COALESCE(s.plan_name, 'Sem plano')
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'total_restaurants', v_total_restaurants,
    'active_restaurants', v_active_restaurants,
    'trial_restaurants', v_trial_restaurants,
    'suspended_restaurants', v_suspended_restaurants,
    'canceled_restaurants', v_canceled_restaurants,
    'total_orders', v_total_orders,
    'platform_revenue', v_platform_revenue,
    'subscription_metrics', v_subscription_metrics
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_platform_metrics() TO authenticated;

-- =========================================================
-- 8. get_admin_restaurants RPC
-- Paginated, searchable, filterable restaurant list for super admin
-- =========================================================
CREATE OR REPLACE FUNCTION get_admin_restaurants(
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int := (p_page - 1) * p_per_page;
  v_restaurants jsonb;
  v_total int;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM restaurants r
  WHERE (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.slug ILIKE '%' || p_search || '%')
    AND (p_status_filter IS NULL OR r.subscription_status = p_status_filter);

  -- Get paginated results
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'slug', r.slug,
      'tagline', r.tagline,
      'subscription_status', r.subscription_status,
      'is_open', r.is_open,
      'created_at', r.created_at,
      'order_count', COALESCE(oc.cnt, 0),
      'revenue', COALESCE(oc.rev, 0)
    ) ORDER BY r.created_at DESC
  ), '[]'::jsonb) INTO v_restaurants
  FROM restaurants r
  LEFT JOIN (
    SELECT restaurant_id, COUNT(*) AS cnt, COALESCE(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) AS rev
    FROM orders GROUP BY restaurant_id
  ) oc ON oc.restaurant_id = r.id
  WHERE (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.slug ILIKE '%' || p_search || '%')
    AND (p_status_filter IS NULL OR r.subscription_status = p_status_filter)
  LIMIT p_per_page OFFSET v_offset;

  RETURN jsonb_build_object(
    'success', true,
    'restaurants', v_restaurants,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total::numeric / p_per_page)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_admin_restaurants(int, int, text, text) TO authenticated;

-- =========================================================
-- 9. get_audit_logs RPC
-- Paginated audit logs for super admin
-- =========================================================
CREATE OR REPLACE FUNCTION get_audit_logs(
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int := (p_page - 1) * p_per_page;
  v_logs jsonb;
  v_total int;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  SELECT COUNT(*) INTO v_total FROM audit_logs;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'actor_email', a.actor_email,
      'action', a.action,
      'tenant_id', a.tenant_id,
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'metadata', a.metadata,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_logs
  FROM audit_logs a
  LIMIT p_per_page OFFSET v_offset;

  RETURN jsonb_build_object(
    'success', true,
    'logs', v_logs,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total::numeric / p_per_page)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_audit_logs(int, int) TO authenticated;

-- =========================================================
-- 10. update_restaurant_subscription_status RPC
-- Super admin updates subscription state + open/closed
-- =========================================================
CREATE OR REPLACE FUNCTION update_restaurant_subscription_status(
  p_restaurant_id uuid,
  p_status text,
  p_is_open boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_old_open boolean;
  v_restaurant_name text;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  SELECT subscription_status, is_open, name INTO v_old_status, v_old_open, v_restaurant_name
  FROM restaurants WHERE id = p_restaurant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Restaurante não encontrado'); END IF;

  UPDATE restaurants
  SET subscription_status = p_status,
      is_open = COALESCE(p_is_open, is_open)
  WHERE id = p_restaurant_id;

  -- Log the action
  PERFORM log_admin_action(
    'update_subscription_status',
    p_restaurant_id,
    'restaurant',
    p_restaurant_id::text,
    jsonb_build_object(
      'restaurant_name', v_restaurant_name,
      'old_status', v_old_status,
      'new_status', p_status,
      'old_open', v_old_open,
      'new_open', COALESCE(p_is_open, v_old_open)
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_restaurant_subscription_status(uuid, text, boolean) TO authenticated;

-- =========================================================
-- 11. Indexes for analytics performance
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created ON orders (restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_new ON order_status_history (order_id, new_status);

-- Realtime on audit_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'audit_logs' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
  END IF;
END $$;
