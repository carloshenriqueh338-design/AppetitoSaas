/*
# Restaurant Settings, Delivery Zones, Driver Assignments, Notifications

## Overview
Adds comprehensive restaurant settings, delivery zone management, driver assignment tracking,
and a pluggable notification architecture.

## Modified Tables
1. `restaurants` — adds settings columns (whatsapp, instagram, business_hours, currency, etc.)
2. `orders` — adds delivery_status, driver_id columns

## New Tables
1. `delivery_zones` — named zones with delivery fee and estimated time
2. `driver_assignments` — links orders to drivers with assignment status
3. `notifications` — notification log with provider abstraction

## New RPCs
1. `assign_driver(p_order_id, p_driver_user_id)` — assigns a driver to an order
2. `update_delivery_status(p_order_id, p_status)` — updates delivery lifecycle
3. `get_driver_deliveries(p_driver_user_id)` — returns deliveries assigned to a driver
4. `create_notification(p_restaurant_id, p_recipient_type, p_recipient_id, p_event_type, p_channel, p_payload)` — logs a notification
5. `get_notifications(p_restaurant_id, p_recipient_type)` — fetches notifications

## Storage
Creates storage buckets for restaurant logos, covers, and product images.
*/

-- =========================================================
-- 1. Add restaurant settings columns
-- =========================================================
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS business_hours jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS minimum_order numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_prep_minutes int DEFAULT 30,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS table_ordering_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS delivery_minimum_order numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_estimated_minutes int DEFAULT 30,
  ADD COLUMN IF NOT EXISTS delivery_zones jsonb DEFAULT '[]'::jsonb;

-- =========================================================
-- 2. Add delivery status + driver to orders
-- =========================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS driver_id uuid;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_delivery_status;
ALTER TABLE orders ADD CONSTRAINT chk_orders_delivery_status
  CHECK (delivery_status IS NULL OR delivery_status IN ('ready','assigned','picked_up','out_for_delivery','delivered','failed','canceled'));

-- Index for driver queries
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders (delivery_status) WHERE delivery_status IS NOT NULL;

-- =========================================================
-- 3. delivery_zones table (structured zone management)
-- =========================================================
CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  estimated_minutes int NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

-- Public can read zones (for checkout display)
DROP POLICY IF EXISTS "public_read_delivery_zones" ON delivery_zones;
CREATE POLICY "public_read_delivery_zones" ON delivery_zones
  FOR SELECT TO anon, authenticated
  USING (is_active);

-- Restaurant staff can manage zones
DROP POLICY IF EXISTS "staff_manage_delivery_zones" ON delivery_zones;
CREATE POLICY "staff_manage_delivery_zones" ON delivery_zones
  FOR ALL TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  );

CREATE OR REPLACE FUNCTION update_delivery_zones_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_delivery_zones_updated_at ON delivery_zones;
CREATE TRIGGER trg_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_delivery_zones_updated_at();

-- =========================================================
-- 4. driver_assignments table
-- =========================================================
CREATE TABLE IF NOT EXISTS driver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_driver_assignment_status CHECK (status IN ('assigned','picked_up','out_for_delivery','delivered','failed','canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_assignments_order_active
  ON driver_assignments (order_id) WHERE status NOT IN ('canceled','failed');
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver ON driver_assignments (driver_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_status ON driver_assignments (status);

ALTER TABLE driver_assignments ENABLE ROW LEVEL SECURITY;

-- Drivers can read their own assignments
DROP POLICY IF EXISTS "driver_read_own_assignments" ON driver_assignments;
CREATE POLICY "driver_read_own_assignments" ON driver_assignments
  FOR SELECT TO authenticated
  USING (
    driver_user_id = auth.uid()
    OR restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  );

-- Restaurant staff can insert/update assignments (assign drivers)
DROP POLICY IF EXISTS "staff_manage_driver_assignments" ON driver_assignments;
CREATE POLICY "staff_manage_driver_assignments" ON driver_assignments
  FOR ALL TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  );

-- Drivers can update their own assignment status
DROP POLICY IF EXISTS "driver_update_own_assignment" ON driver_assignments;
CREATE POLICY "driver_update_own_assignment" ON driver_assignments
  FOR UPDATE TO authenticated
  USING (driver_user_id = auth.uid())
  WITH CHECK (driver_user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_driver_assignments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_driver_assignments_updated_at ON driver_assignments;
CREATE TRIGGER trg_driver_assignments_updated_at BEFORE UPDATE ON driver_assignments
  FOR EACH ROW EXECUTE FUNCTION update_driver_assignments_updated_at();

-- =========================================================
-- 5. notifications table
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  recipient_type text NOT NULL,
  recipient_id text,
  recipient_contact text,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  status text NOT NULL DEFAULT 'pending',
  payload jsonb DEFAULT '{}'::jsonb,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT chk_notif_recipient CHECK (recipient_type IN ('customer','restaurant','driver','admin')),
  CONSTRAINT chk_notif_channel CHECK (channel IN ('in_app','whatsapp','email','push','sms')),
  CONSTRAINT chk_notif_status CHECK (status IN ('pending','sent','failed','delivered','read'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_restaurant ON notifications (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Restaurant staff can read their notifications
DROP POLICY IF EXISTS "staff_read_notifications" ON notifications;
CREATE POLICY "staff_read_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (
    restaurant_id IS NULL OR restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  );

-- Anyone can insert notifications (triggered by RPCs)
DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Restaurant staff can update notification status
DROP POLICY IF EXISTS "staff_update_notifications" ON notifications;
CREATE POLICY "staff_update_notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (
    restaurant_id IS NULL OR restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    ) OR is_super_admin()
  )
  WITH CHECK (true);

-- =========================================================
-- 6. assign_driver RPC
-- =========================================================
CREATE OR REPLACE FUNCTION assign_driver(p_order_id uuid, p_driver_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_is_authorized boolean := false;
  v_existing uuid;
BEGIN
  SELECT id, restaurant_id, status, fulfillment INTO v_order
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pedido não encontrado'); END IF;

  IF v_order.fulfillment != 'delivery' THEN
    RETURN jsonb_build_object('error', 'Pedido não é de entrega');
  END IF;

  -- Check authorization
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = v_order.restaurant_id
        AND ru.role IN ('Owner','Manager','Staff') AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  -- Check for existing active assignment
  SELECT id INTO v_existing FROM driver_assignments
  WHERE order_id = p_order_id AND status NOT IN ('canceled','failed') LIMIT 1;
  IF FOUND THEN
    -- Reassign: cancel old, create new
    UPDATE driver_assignments SET status = 'canceled' WHERE id = v_existing;
  END IF;

  -- Create new assignment
  INSERT INTO driver_assignments (order_id, driver_user_id, restaurant_id, status)
  VALUES (p_order_id, p_driver_user_id, v_order.restaurant_id, 'assigned');

  -- Update order
  UPDATE orders SET
    driver_id = p_driver_user_id,
    delivery_status = 'assigned'
  WHERE id = p_order_id;

  -- Log notification
  INSERT INTO notifications (restaurant_id, order_id, recipient_type, recipient_id, event_type, channel, status, payload)
  VALUES (v_order.restaurant_id, p_order_id, 'driver', p_driver_user_id::text, 'delivery_assigned', 'in_app', 'pending',
    jsonb_build_object('order_id', p_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION assign_driver(uuid, uuid) TO authenticated;

-- =========================================================
-- 7. update_delivery_status RPC
-- =========================================================
CREATE OR REPLACE FUNCTION update_delivery_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_assignment RECORD;
  v_is_authorized boolean := false;
  v_new_order_status text;
  v_event_type text;
BEGIN
  IF p_status NOT IN ('picked_up','out_for_delivery','delivered','failed','canceled') THEN
    RETURN jsonb_build_object('error', 'Status inválido');
  END IF;

  SELECT id, restaurant_id, status, fulfillment, driver_id, delivery_status INTO v_order
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pedido não encontrado'); END IF;

  -- Check authorization: driver assigned to this order OR restaurant staff
  IF v_order.driver_id = auth.uid() THEN
    v_is_authorized := true;
  ELSIF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.restaurant_id = v_order.restaurant_id
        AND ru.is_active
    ) INTO v_is_authorized;
  END IF;
  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  -- Update assignment
  SELECT id INTO v_assignment FROM driver_assignments
  WHERE order_id = p_order_id AND status NOT IN ('canceled','failed') LIMIT 1;

  IF FOUND THEN
    UPDATE driver_assignments SET
      status = p_status,
      picked_up_at = CASE WHEN p_status = 'picked_up' THEN now() ELSE picked_up_at END,
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
      failed_at = CASE WHEN p_status = 'failed' THEN now() ELSE failed_at END
    WHERE id = v_assignment.id;
  END IF;

  -- Update order delivery_status
  UPDATE orders SET delivery_status = p_status WHERE id = p_order_id;

  -- Map delivery status to order status
  v_new_order_status := CASE p_status
    WHEN 'picked_up' THEN 'out_for_delivery'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'completed'
    WHEN 'failed' THEN 'canceled'
    WHEN 'canceled' THEN 'canceled'
  END;

  IF v_new_order_status IS NOT NULL AND v_new_order_status != v_order.status THEN
    UPDATE orders SET status = v_new_order_status WHERE id = p_order_id;
    INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
    VALUES (p_order_id, v_order.status, v_new_order_status, auth.uid());
  END IF;

  -- Log notification
  v_event_type := CASE p_status
    WHEN 'picked_up' THEN 'out_for_delivery'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'delivery_failed'
    WHEN 'canceled' THEN 'canceled'
  END;

  INSERT INTO notifications (restaurant_id, order_id, recipient_type, recipient_id, event_type, channel, status, payload)
  VALUES (v_order.restaurant_id, p_order_id, 'customer', v_order.customer_phone, v_event_type, 'in_app', 'pending',
    jsonb_build_object('order_id', p_order_id, 'status', p_status));

  RETURN jsonb_build_object('success', true, 'order_status', v_new_order_status);
END;
$$;
GRANT EXECUTE ON FUNCTION update_delivery_status(uuid, text) TO authenticated;

-- =========================================================
-- 8. get_driver_deliveries RPC
-- Returns only deliveries assigned to this driver
-- =========================================================
CREATE OR REPLACE FUNCTION get_driver_deliveries(p_driver_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deliveries jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      'status', o.status,
      'delivery_status', o.delivery_status,
      'customer_name', o.customer_name,
      'customer_phone', o.customer_phone,
      'address', o.address,
      'total', o.total,
      'created_at', o.created_at,
      'restaurant_name', r.name,
      'restaurant_address', r.address,
      'assignment_status', da.status,
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('name', oi.name, 'quantity', oi.quantity, 'line_total', oi.line_total)
        ), '[]'::jsonb)
        FROM order_items oi WHERE oi.order_id = o.id
      )
    )
  ), '[]'::jsonb) INTO v_deliveries
  FROM orders o
  JOIN driver_assignments da ON da.order_id = o.id
  JOIN restaurants r ON r.id = o.restaurant_id
  WHERE da.driver_user_id = p_driver_user_id
    AND da.status NOT IN ('canceled','failed')
    AND o.fulfillment = 'delivery'
  ORDER BY o.created_at DESC;

  RETURN jsonb_build_object('success', true, 'deliveries', v_deliveries);
END;
$$;
GRANT EXECUTE ON FUNCTION get_driver_deliveries(uuid) TO authenticated;

-- =========================================================
-- 9. create_notification RPC
-- =========================================================
CREATE OR REPLACE FUNCTION create_notification(
  p_restaurant_id uuid,
  p_recipient_type text,
  p_recipient_id text,
  p_event_type text,
  p_channel text DEFAULT 'in_app',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif_id uuid;
BEGIN
  IF p_recipient_type NOT IN ('customer','restaurant','driver','admin') THEN
    RETURN jsonb_build_object('error', 'Tipo de destinatário inválido');
  END IF;
  IF p_channel NOT IN ('in_app','whatsapp','email','push','sms') THEN
    RETURN jsonb_build_object('error', 'Canal inválido');
  END IF;

  INSERT INTO notifications (restaurant_id, recipient_type, recipient_id, event_type, channel, status, payload)
  VALUES (p_restaurant_id, p_recipient_type, p_recipient_id, p_event_type, p_channel, 'pending', p_payload)
  RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object('success', true, 'notification_id', v_notif_id);
END;
$$;
GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, jsonb) TO anon, authenticated;

-- =========================================================
-- 10. get_notifications RPC
-- =========================================================
CREATE OR REPLACE FUNCTION get_notifications(p_restaurant_id uuid, p_recipient_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notifs jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'recipient_type', n.recipient_type,
      'recipient_id', n.recipient_id,
      'event_type', n.event_type,
      'channel', n.channel,
      'status', n.status,
      'payload', n.payload,
      'created_at', n.created_at
    ) ORDER BY n.created_at DESC
  ), '[]'::jsonb) INTO v_notifs
  FROM notifications n
  WHERE n.restaurant_id = p_restaurant_id
    AND (p_recipient_type IS NULL OR n.recipient_type = p_recipient_type)
  LIMIT 50;

  RETURN jsonb_build_object('success', true, 'notifications', v_notifs);
END;
$$;
GRANT EXECUTE ON FUNCTION get_notifications(uuid, text) TO authenticated;

-- =========================================================
-- 11. Trigger: auto-create notifications on order status change
-- =========================================================
CREATE OR REPLACE FUNCTION notify_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_customer_contact text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    v_event_type := CASE NEW.status
      WHEN 'new' THEN 'order_received'
      WHEN 'confirmed' THEN 'order_received'
      WHEN 'preparing' THEN 'preparing'
      WHEN 'ready' THEN 'ready'
      WHEN 'out_for_delivery' THEN 'out_for_delivery'
      WHEN 'completed' THEN 'delivered'
      WHEN 'canceled' THEN 'canceled'
      WHEN 'rejected' THEN 'canceled'
      ELSE NULL
    END;

    IF v_event_type IS NOT NULL THEN
      -- Customer notification
      INSERT INTO notifications (restaurant_id, order_id, recipient_type, recipient_id, recipient_contact, event_type, channel, status, payload)
      VALUES (NEW.restaurant_id, NEW.id, 'customer', NEW.customer_phone, NEW.customer_phone, v_event_type, 'in_app', 'pending',
        jsonb_build_object('order_id', NEW.id, 'status', NEW.status));

      -- Restaurant notification for new orders
      IF NEW.status = 'new' THEN
        INSERT INTO notifications (restaurant_id, order_id, recipient_type, recipient_id, event_type, channel, status, payload)
        VALUES (NEW.restaurant_id, NEW.id, 'restaurant', NEW.restaurant_id::text, 'new_order', 'in_app', 'pending',
          jsonb_build_object('order_id', NEW.id));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_status ON orders;
CREATE TRIGGER trg_notify_order_status AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_on_order_status_change();

-- =========================================================
-- 12. Storage buckets for images
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-images', 'restaurant-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: restaurant staff can upload, public can read
DROP POLICY IF EXISTS "public_read_restaurant_images" ON storage.objects;
CREATE POLICY "public_read_restaurant_images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('restaurant-images','product-images'));

DROP POLICY IF EXISTS "staff_upload_restaurant_images" ON storage.objects;
CREATE POLICY "staff_upload_restaurant_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('restaurant-images','product-images')
  );

DROP POLICY IF EXISTS "staff_update_restaurant_images" ON storage.objects;
CREATE POLICY "staff_update_restaurant_images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('restaurant-images','product-images'))
  WITH CHECK (bucket_id IN ('restaurant-images','product-images'));

DROP POLICY IF EXISTS "staff_delete_restaurant_images" ON storage.objects;
CREATE POLICY "staff_delete_restaurant_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('restaurant-images','product-images'));

-- =========================================================
-- 13. Realtime on new tables
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_assignments' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
