/*
# SaaS Plans, Subscriptions, and Feature Limits

Creates plans table, subscriptions table, feature-limit enforcement RPCs,
and seeds default plans. Updates create_order to check subscription status.
*/

-- =========================================================
-- 1. plans table
-- =========================================================
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  yearly_price numeric(10,2) NOT NULL DEFAULT 0,
  trial_duration_days int NOT NULL DEFAULT 14,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  feature_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_plans_prices CHECK (monthly_price >= 0 AND yearly_price >= 0),
  CONSTRAINT chk_plans_trial CHECK (trial_duration_days >= 0)
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_plans" ON plans;
CREATE POLICY "public_read_plans" ON plans
  FOR SELECT TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS "superadmin_read_all_plans" ON plans;
CREATE POLICY "superadmin_read_all_plans" ON plans
  FOR SELECT TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "superadmin_insert_plans" ON plans;
CREATE POLICY "superadmin_insert_plans" ON plans
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "superadmin_update_plans" ON plans;
CREATE POLICY "superadmin_update_plans" ON plans
  FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "superadmin_delete_plans" ON plans;
CREATE POLICY "superadmin_delete_plans" ON plans
  FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE OR REPLACE FUNCTION update_plans_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_plans_updated_at ON plans;
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_plans_updated_at();

-- =========================================================
-- 2. subscriptions table
-- =========================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'trialing',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  start_date timestamptz NOT NULL DEFAULT now(),
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  renewal_date timestamptz,
  canceled_at timestamptz,
  provider text DEFAULT 'manual',
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sub_status CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')),
  CONSTRAINT chk_sub_cycle CHECK (billing_cycle IN ('monthly', 'yearly')),
  CONSTRAINT chk_sub_provider CHECK (provider IN ('stripe', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_restaurant_active
  ON subscriptions (restaurant_id) WHERE status NOT IN ('canceled', 'expired');
CREATE INDEX IF NOT EXISTS idx_subscriptions_restaurant_id ON subscriptions (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_subscription" ON subscriptions;
CREATE POLICY "owner_read_subscription" ON subscriptions
  FOR SELECT TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    )
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "superadmin_insert_subscriptions" ON subscriptions;
CREATE POLICY "superadmin_insert_subscriptions" ON subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "superadmin_update_subscriptions" ON subscriptions;
CREATE POLICY "superadmin_update_subscriptions" ON subscriptions
  FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "superadmin_delete_subscriptions" ON subscriptions;
CREATE POLICY "superadmin_delete_subscriptions" ON subscriptions
  FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

-- =========================================================
-- 3. Update restaurants subscription_status CHECK
-- =========================================================
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS chk_restaurants_subscription;
ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_subscription
  CHECK (subscription_status IS NULL OR subscription_status IN ('active', 'trial', 'suspended', 'canceled', 'trialing', 'past_due', 'paused', 'expired'));

-- =========================================================
-- 4. get_plans RPC
-- =========================================================
CREATE OR REPLACE FUNCTION get_plans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plans jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id, 'name', p.name, 'description', p.description,
      'monthly_price', p.monthly_price, 'yearly_price', p.yearly_price,
      'trial_duration_days', p.trial_duration_days, 'is_active', p.is_active,
      'sort_order', p.sort_order, 'feature_limits', p.feature_limits
    ) ORDER BY p.sort_order
  ), '[]'::jsonb) INTO v_plans
  FROM plans p
  WHERE p.is_active OR is_super_admin();

  RETURN jsonb_build_object('success', true, 'plans', v_plans);
END;
$$;
GRANT EXECUTE ON FUNCTION get_plans() TO anon, authenticated;

-- =========================================================
-- 5. get_subscription_status RPC
-- =========================================================
CREATE OR REPLACE FUNCTION get_subscription_status(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_effective_status text;
  v_legacy_status text;
BEGIN
  SELECT s.id, s.status, s.billing_cycle, s.start_date, s.trial_end,
         s.current_period_start, s.current_period_end, s.renewal_date, s.canceled_at,
         p.name as plan_name, p.id as plan_id, p.feature_limits, p.monthly_price, p.yearly_price
  INTO v_sub
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.restaurant_id = p_restaurant_id
    AND s.status NOT IN ('canceled', 'expired')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT subscription_status INTO v_legacy_status
    FROM restaurants WHERE id = p_restaurant_id;
    RETURN jsonb_build_object(
      'has_subscription', false,
      'effective_status', COALESCE(v_legacy_status, 'active'),
      'plan_name', 'Sem plano',
      'feature_limits', '{}'::jsonb
    );
  END IF;

  v_effective_status := v_sub.status;

  IF v_sub.status = 'trialing' AND v_sub.trial_end IS NOT NULL AND now() > v_sub.trial_end THEN
    v_effective_status := 'expired';
    UPDATE subscriptions SET status = 'expired' WHERE id = v_sub.id;
    UPDATE restaurants SET subscription_status = 'suspended' WHERE id = p_restaurant_id;
  END IF;

  IF v_sub.status = 'active' AND v_sub.current_period_end IS NOT NULL AND now() > v_sub.current_period_end THEN
    v_effective_status := 'past_due';
    UPDATE subscriptions SET status = 'past_due' WHERE id = v_sub.id;
    UPDATE restaurants SET subscription_status = 'suspended' WHERE id = p_restaurant_id;
  END IF;

  RETURN jsonb_build_object(
    'has_subscription', true,
    'subscription_id', v_sub.id,
    'effective_status', v_effective_status,
    'plan_id', v_sub.plan_id,
    'plan_name', v_sub.plan_name,
    'billing_cycle', v_sub.billing_cycle,
    'feature_limits', v_sub.feature_limits,
    'monthly_price', v_sub.monthly_price,
    'yearly_price', v_sub.yearly_price,
    'start_date', v_sub.start_date,
    'trial_end', v_sub.trial_end,
    'current_period_start', v_sub.current_period_start,
    'current_period_end', v_sub.current_period_end,
    'renewal_date', v_sub.renewal_date,
    'canceled_at', v_sub.canceled_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_subscription_status(uuid) TO anon, authenticated;

-- =========================================================
-- 6. create_subscription RPC
-- =========================================================
CREATE OR REPLACE FUNCTION create_subscription(
  p_restaurant_id uuid, p_plan_id uuid, p_billing_cycle text DEFAULT 'monthly'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_existing RECORD;
  v_sub_id uuid;
  v_trial_end timestamptz;
  v_period_end timestamptz;
  v_is_authorized boolean := false;
BEGIN
  IF p_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RETURN jsonb_build_object('error', 'Ciclo de cobrança inválido');
  END IF;

  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner', 'Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  SELECT name, trial_duration_days, is_active INTO v_plan FROM plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Plano não encontrado'); END IF;
  IF NOT v_plan.is_active THEN RETURN jsonb_build_object('error', 'Plano não está ativo'); END IF;

  SELECT id INTO v_existing FROM subscriptions
  WHERE restaurant_id = p_restaurant_id AND status NOT IN ('canceled', 'expired') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('error', 'Restaurante já possui assinatura ativa'); END IF;

  v_trial_end := now() + (v_plan.trial_duration_days || ' days')::interval;
  IF p_billing_cycle = 'yearly' THEN
    v_period_end := now() + '1 year'::interval;
  ELSE
    v_period_end := now() + '1 month'::interval;
  END IF;

  INSERT INTO subscriptions (
    restaurant_id, plan_id, status, billing_cycle,
    start_date, trial_end, current_period_start, current_period_end, renewal_date
  )
  VALUES (p_restaurant_id, p_plan_id, 'trialing', p_billing_cycle, now(), v_trial_end, now(), v_period_end, v_period_end)
  RETURNING id INTO v_sub_id;

  UPDATE restaurants SET subscription_status = 'trial' WHERE id = p_restaurant_id;

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub_id, 'status', 'trialing', 'trial_end', v_trial_end);
END;
$$;
GRANT EXECUTE ON FUNCTION create_subscription(uuid, uuid, text) TO authenticated;

-- =========================================================
-- 7. change_subscription_plan RPC
-- =========================================================
CREATE OR REPLACE FUNCTION change_subscription_plan(p_restaurant_id uuid, p_new_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_plan RECORD;
  v_is_authorized boolean := false;
  v_new_period_end timestamptz;
BEGIN
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner', 'Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  SELECT id, status, billing_cycle INTO v_sub FROM subscriptions
  WHERE restaurant_id = p_restaurant_id AND status NOT IN ('canceled', 'expired')
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Nenhuma assinatura ativa encontrada'); END IF;

  SELECT name, is_active INTO v_plan FROM plans WHERE id = p_new_plan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Plano não encontrado'); END IF;
  IF NOT v_plan.is_active THEN RETURN jsonb_build_object('error', 'Plano não está ativo'); END IF;

  IF v_sub.billing_cycle = 'yearly' THEN
    v_new_period_end := now() + '1 year'::interval;
  ELSE
    v_new_period_end := now() + '1 month'::interval;
  END IF;

  UPDATE subscriptions SET
    plan_id = p_new_plan_id, current_period_start = now(),
    current_period_end = v_new_period_end, renewal_date = v_new_period_end,
    status = CASE WHEN v_sub.status = 'trialing' THEN 'trialing' ELSE 'active' END
  WHERE id = v_sub.id;

  UPDATE restaurants SET subscription_status = 'active' WHERE id = p_restaurant_id;

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub.id, 'new_plan_id', p_new_plan_id);
END;
$$;
GRANT EXECUTE ON FUNCTION change_subscription_plan(uuid, uuid) TO authenticated;

-- =========================================================
-- 8. cancel_subscription RPC
-- =========================================================
CREATE OR REPLACE FUNCTION cancel_subscription(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_is_authorized boolean := false;
BEGIN
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
        AND ru.role IN ('Owner', 'Manager') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  SELECT id INTO v_sub FROM subscriptions
  WHERE restaurant_id = p_restaurant_id AND status NOT IN ('canceled', 'expired')
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Nenhuma assinatura ativa encontrada'); END IF;

  UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE id = v_sub.id;
  UPDATE restaurants SET subscription_status = 'suspended' WHERE id = p_restaurant_id;

  RETURN jsonb_build_object('success', true, 'status', 'canceled',
    'message', 'Assinatura cancelada. Seus dados foram preservados.');
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_subscription(uuid) TO authenticated;

-- =========================================================
-- 9. check_feature_limit RPC
-- =========================================================
CREATE OR REPLACE FUNCTION check_feature_limit(p_restaurant_id uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_status jsonb;
  v_limits jsonb;
  v_limit_value jsonb;
  v_current_count int;
  v_effective_status text;
BEGIN
  SELECT get_subscription_status(p_restaurant_id) INTO v_sub_status;
  v_effective_status := v_sub_status->>'effective_status';
  v_limits := v_sub_status->'feature_limits';

  IF v_limits IS NULL OR v_limits = '{}'::jsonb THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_limits');
  END IF;

  IF v_effective_status IN ('expired', 'suspended', 'past_due') THEN
    IF p_feature IN ('create_order', 'add_product', 'add_staff') THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_inactive', 'status', v_effective_status);
    END IF;
  END IF;

  v_limit_value := v_limits->p_feature;

  IF v_limit_value IS NOT NULL AND (v_limit_value::text = 'true' OR v_limit_value::text = 'false') THEN
    RETURN jsonb_build_object('allowed', v_limit_value::bool, 'feature', p_feature);
  END IF;

  IF v_limit_value IS NOT NULL AND v_limit_value::text ~ '^[0-9]+$' THEN
    v_current_count := 0;
    IF p_feature = 'max_staff' THEN
      SELECT count(*) INTO v_current_count FROM restaurant_users WHERE restaurant_id = p_restaurant_id AND is_active;
    ELSIF p_feature = 'max_products' THEN
      SELECT count(*) INTO v_current_count FROM products WHERE restaurant_id = p_restaurant_id;
    ELSIF p_feature = 'max_locations' THEN
      v_current_count := 1;
    END IF;
    RETURN jsonb_build_object('allowed', v_current_count < v_limit_value::int, 'current', v_current_count, 'limit', v_limit_value::int, 'feature', p_feature);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'no_limit_defined');
END;
$$;
GRANT EXECUTE ON FUNCTION check_feature_limit(uuid, text) TO authenticated;

-- =========================================================
-- 10. enforce_feature_limit RPC (internal)
-- =========================================================
CREATE OR REPLACE FUNCTION enforce_feature_limit(p_restaurant_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT check_feature_limit(p_restaurant_id, p_feature) INTO v_result;
  IF NOT (v_result->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Limite do plano excedido: %', v_result->>'feature'
      USING HINT = 'Faça upgrade do seu plano para continuar.';
  END IF;
END;
$$;

-- =========================================================
-- 11. Update create_order to check subscription
-- =========================================================
CREATE OR REPLACE FUNCTION create_order(
  p_restaurant_slug text, p_fulfillment text, p_payment_mode text,
  p_customer_name text, p_customer_phone text, p_address text, p_table_number text,
  p_items jsonb, p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant RECORD;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_delivery_fee numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_product RECORD;
  v_mod_record RECORD;
  v_line_total numeric(10,2);
  v_modifiers jsonb;
  v_mod_id uuid;
  v_order_items_to_insert text := '';
  v_first boolean := true;
  v_existing_order_id uuid;
  v_sub_status jsonb;
  v_effective_status text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_order_id FROM orders WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'order_id', v_existing_order_id, 'idempotent_replay', true);
    END IF;
  END IF;

  IF p_fulfillment NOT IN ('delivery', 'table') THEN
    RETURN jsonb_build_object('error', 'Tipo de entrega inválido');
  END IF;
  IF p_payment_mode NOT IN ('pay_now', 'pay_later') THEN
    RETURN jsonb_build_object('error', 'Modo de pagamento inválido');
  END IF;

  SELECT id, slug, name, is_open, subscription_status INTO v_restaurant
  FROM restaurants WHERE slug = p_restaurant_slug;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Restaurante não encontrado'); END IF;
  IF NOT v_restaurant.is_open THEN RETURN jsonb_build_object('error', 'Restaurante fechado no momento'); END IF;

  SELECT get_subscription_status(v_restaurant.id) INTO v_sub_status;
  v_effective_status := v_sub_status->>'effective_status';
  IF v_effective_status IN ('expired', 'suspended', 'past_due', 'canceled') THEN
    RETURN jsonb_build_object('error', 'Assinatura do restaurante inativa');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('error', 'Nenhum item no pedido');
  END IF;
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RETURN jsonb_build_object('error', 'Nome do cliente é obrigatório');
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RETURN jsonb_build_object('error', 'Telefone do cliente é obrigatório');
  END IF;
  IF p_fulfillment = 'delivery' AND (p_address IS NULL OR btrim(p_address) = '') THEN
    RETURN jsonb_build_object('error', 'Endereço de entrega é obrigatório');
  END IF;
  IF p_fulfillment = 'table' AND (p_table_number IS NULL OR btrim(p_table_number) = '') THEN
    RETURN jsonb_build_object('error', 'Número da mesa é obrigatório');
  END IF;

  IF p_fulfillment = 'delivery' THEN v_delivery_fee := 5.00; ELSE v_delivery_fee := 0; END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    SELECT id, name, price, is_available INTO v_product
    FROM products WHERE id = (v_item->>'product_id')::uuid AND restaurant_id = v_restaurant.id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Produto não encontrado: ' || (v_item->>'product_id')); END IF;
    IF NOT v_product.is_available THEN RETURN jsonb_build_object('error', 'Produto indisponível: ' || v_product.name); END IF;
    IF (v_item->>'quantity')::int <= 0 THEN RETURN jsonb_build_object('error', 'Quantidade inválida para: ' || v_product.name); END IF;

    v_line_total := v_product.price;
    v_modifiers := '[]'::jsonb;

    IF v_item ? 'selected_modifiers' AND jsonb_array_length(v_item->'selected_modifiers') > 0 THEN
      FOR v_mod_id IN SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_item->'selected_modifiers') AS elem
      LOOP
        SELECT name, price_delta INTO v_mod_record FROM modifiers WHERE id = v_mod_id AND product_id = v_product.id;
        IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Modificador inválido para o produto: ' || v_product.name); END IF;
        v_line_total := v_line_total + v_mod_record.price_delta;
        v_modifiers := v_modifiers || jsonb_build_object('id', v_mod_id, 'name', v_mod_record.name, 'price_delta', v_mod_record.price_delta);
      END LOOP;
    END IF;

    v_line_total := v_line_total * (v_item->>'quantity')::int;
    v_subtotal := v_subtotal + v_line_total;

    IF NOT v_first THEN v_order_items_to_insert := v_order_items_to_insert || ','; END IF;
    v_first := false;
    v_order_items_to_insert := v_order_items_to_insert || format(
      '($1, %L, %L, %L, %L, %L, %L)',
      v_product.id, v_product.name, v_product.price,
      (v_item->>'quantity')::int, v_modifiers::text, v_line_total
    );
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  INSERT INTO orders (
    restaurant_id, status, fulfillment, payment_mode, payment_status,
    customer_name, customer_phone, address, table_number,
    subtotal, delivery_fee, total, idempotency_key
  )
  VALUES (
    v_restaurant.id, 'new', p_fulfillment, p_payment_mode,
    CASE WHEN p_payment_mode = 'pay_now' THEN 'paid' ELSE 'pending' END,
    p_customer_name, p_customer_phone,
    CASE WHEN p_fulfillment = 'delivery' THEN p_address ELSE NULL END,
    CASE WHEN p_fulfillment = 'table' THEN p_table_number ELSE NULL END,
    v_subtotal, v_delivery_fee, v_total, p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  EXECUTE format(
    'INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES %s',
    v_order_items_to_insert
  ) USING v_order_id;

  INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
  VALUES (v_order_id, NULL, 'new', NULL);

  PERFORM increment_loyalty(v_restaurant.id, p_customer_phone);

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'total', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, jsonb, text) TO anon, authenticated;

-- =========================================================
-- 12. Seed default plans
-- =========================================================
INSERT INTO plans (name, description, monthly_price, yearly_price, trial_duration_days, is_active, sort_order, feature_limits)
VALUES
  ('Trial', 'Teste gratuito com recursos básicos', 0, 0, 14, true, 0,
   '{"max_staff": 2, "max_products": 20, "max_orders_per_month": 100, "max_locations": 1, "advanced_analytics": false, "delivery_features": true, "kitchen_display": false, "priority_support": false}'::jsonb),
  ('Starter', 'Ideal para pequenos restaurantes começando no delivery', 49.90, 499.00, 14, true, 1,
   '{"max_staff": 5, "max_products": 50, "max_orders_per_month": 500, "max_locations": 1, "advanced_analytics": false, "delivery_features": true, "kitchen_display": true, "priority_support": false}'::jsonb),
  ('Professional', 'Para restaurantes em crescimento com múltiplos canais', 149.90, 1499.00, 14, true, 2,
   '{"max_staff": 20, "max_products": 200, "max_orders_per_month": 5000, "max_locations": 3, "advanced_analytics": true, "delivery_features": true, "kitchen_display": true, "priority_support": true}'::jsonb),
  ('Enterprise', 'Para redes e franquias com alto volume', 499.90, 4999.00, 30, true, 3,
   '{"max_staff": 999, "max_products": 999, "max_orders_per_month": 99999, "max_locations": 50, "advanced_analytics": true, "delivery_features": true, "kitchen_display": true, "priority_support": true}'::jsonb)
ON CONFLICT DO NOTHING;

-- =========================================================
-- 13. Realtime on subscriptions
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;
END $$;
