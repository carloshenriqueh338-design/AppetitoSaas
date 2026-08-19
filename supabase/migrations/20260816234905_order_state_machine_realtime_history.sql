/*
# Order State Machine, Status History, Idempotency, and Realtime

## Overview
This migration formalizes the order lifecycle with a state machine, adds order status
history for auditing, makes order creation idempotent to prevent duplicates, and enables
Supabase Realtime on the orders table.

## New Tables
1. `order_status_history`
   - `id` (uuid, primary key)
   - `order_id` (uuid, FK to orders, ON DELETE CASCADE)
   - `previous_status` (text, nullable — null for initial creation)
   - `new_status` (text, not null)
   - `changed_by` (uuid, FK to auth.users, nullable — null for anon-created orders)
   - `changed_at` (timestamptz, default now())
   - Index on order_id for efficient lookups

## Modified Tables
1. `orders`
   - Added `idempotency_key` (text, nullable, unique) — prevents duplicate order creation
   - Status CHECK constraint updated to include new states: confirmed, out_for_delivery, canceled, rejected, payment_failed
   - Added `estimated_prep_minutes` (int, default 25) — estimated prep time for customer tracking

## New RPCs
1. `transition_order_status(p_order_id uuid, p_new_status text, p_reason text)`
   - Validates state transitions against the state machine
   - Records the transition in order_status_history
   - Returns the updated order or an error message
   - SECURITY DEFINER so it can insert into order_status_history (which has no INSERT policy)
   - Callable by authenticated staff only (EXECUTE granted to authenticated)

2. `create_order` (updated)
   - Now accepts `p_idempotency_key` parameter
   - If the same idempotency_key was used before, returns the existing order instead of creating a duplicate
   - Records the initial status in order_status_history

## State Machine
Valid transitions:
- new → confirmed, canceled, rejected, payment_failed
- confirmed → preparing, canceled
- preparing → ready, canceled
- ready → out_for_delivery (delivery only), completed (table orders)
- out_for_delivery → completed, canceled
- completed → (terminal)
- canceled → (terminal)
- rejected → (terminal)
- payment_failed → (terminal)

Table orders skip out_for_delivery: ready → completed directly.

## Security
- `order_status_history` has RLS enabled
- SELECT: staff can read history for their restaurant's orders; anon can read their own order history by phone
- No INSERT/UPDATE/DELETE policies — all writes go through transition_order_status RPC (SECURITY DEFINER)
- `transition_order_status` validates the caller is staff of the order's restaurant or Super Admin
- `create_order` now inserts the initial history record internally

## Realtime
- Adds the orders table to the Supabase Realtime publication if not already present
- This enables realtime UPDATE and INSERT events on orders

## Important Notes
1. The idempotency_key is optional (nullable) for backwards compatibility, but the frontend will always send one.
2. The state machine is enforced at the database level — the frontend cannot make arbitrary status changes.
3. The transition_order_status RPC checks that the caller is a staff member of the order's restaurant (via restaurant_users) or a Super Admin.
4. Table orders go: new → confirmed → preparing → ready → completed (no out_for_delivery).
5. Delivery orders go: new → confirmed → preparing → ready → out_for_delivery → completed.
*/

-- =========================================================
-- 1. Add idempotency_key and estimated_prep_minutes to orders
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE orders ADD COLUMN idempotency_key text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'estimated_prep_minutes'
  ) THEN
    ALTER TABLE orders ADD COLUMN estimated_prep_minutes int NOT NULL DEFAULT 25;
  END IF;
END $$;

-- Unique constraint on idempotency_key (partial — only when not null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_idempotency_key_unique'
  ) THEN
    CREATE UNIQUE INDEX orders_idempotency_key_unique ON orders (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- =========================================================
-- 2. Update CHECK constraint on orders.status
-- =========================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_status;
ALTER TABLE orders ADD CONSTRAINT chk_orders_status
  CHECK (status IN ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'canceled', 'rejected', 'payment_failed'));

-- =========================================================
-- 3. Create order_status_history table
-- =========================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_at ON order_status_history(changed_at);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Staff can read history for their restaurant's orders
DROP POLICY IF EXISTS "staff_read_order_history" ON order_status_history;
CREATE POLICY "staff_read_order_history" ON order_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_status_history.order_id
        AND o.restaurant_id IN (
          SELECT ru.restaurant_id FROM restaurant_users ru
          WHERE ru.user_id = auth.uid() AND ru.is_active
        )
    )
    OR is_super_admin()
  );

-- Anon can read history for their own orders by phone
DROP POLICY IF EXISTS "anon_read_own_order_history" ON order_status_history;
CREATE POLICY "anon_read_own_order_history" ON order_status_history FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_status_history.order_id
        AND o.customer_phone IS NOT NULL
        AND o.customer_phone = current_setting('app.current_customer_phone', true)
    )
  );

-- =========================================================
-- 4. Create transition_order_status RPC
-- =========================================================
CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_previous_status text;
  v_is_authorized boolean := false;
  v_fulfillment text;
  v_valid_transitions text[];
BEGIN
  -- Fetch the order
  SELECT status, restaurant_id, fulfillment INTO v_order
  FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Pedido não encontrado');
  END IF;

  v_previous_status := v_order.status;
  v_fulfillment := v_order.fulfillment;

  -- Check authorization: caller must be staff of the order's restaurant or Super Admin
  IF is_super_admin() THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.user_id = auth.uid()
        AND ru.restaurant_id = v_order.restaurant_id
        AND ru.is_active
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('error', 'Não autorizado a modificar este pedido');
  END IF;

  -- Validate the new status is a known status
  IF p_new_status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'canceled', 'rejected', 'payment_failed') THEN
    RETURN jsonb_build_object('error', 'Status inválido');
  END IF;

  -- No-op if same status
  IF v_previous_status = p_new_status THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', p_new_status, 'no_op', true);
  END IF;

  -- Define valid transitions based on fulfillment type
  IF v_fulfillment = 'table' THEN
    -- Table orders: no out_for_delivery
    v_valid_transitions := CASE v_previous_status
      WHEN 'new' THEN ARRAY['confirmed', 'canceled', 'rejected', 'payment_failed']
      WHEN 'confirmed' THEN ARRAY['preparing', 'canceled']
      WHEN 'preparing' THEN ARRAY['ready', 'canceled']
      WHEN 'ready' THEN ARRAY['completed', 'canceled']
      WHEN 'out_for_delivery' THEN ARRAY['completed', 'canceled']
      ELSE ARRAY[]::text[]
    END;
  ELSE
    -- Delivery orders
    v_valid_transitions := CASE v_previous_status
      WHEN 'new' THEN ARRAY['confirmed', 'canceled', 'rejected', 'payment_failed']
      WHEN 'confirmed' THEN ARRAY['preparing', 'canceled']
      WHEN 'preparing' THEN ARRAY['ready', 'canceled']
      WHEN 'ready' THEN ARRAY['out_for_delivery', 'canceled']
      WHEN 'out_for_delivery' THEN ARRAY['completed', 'canceled']
      ELSE ARRAY[]::text[]
    END;
  END IF;

  -- Check the transition is valid
  IF NOT (p_new_status = ANY(v_valid_transitions)) THEN
    RETURN jsonb_build_object(
      'error', 'Transição inválida',
      'from', v_previous_status,
      'to', p_new_status
    );
  END IF;

  -- Perform the transition
  UPDATE orders SET status = p_new_status WHERE id = p_order_id;

  -- Record in history
  INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
  VALUES (p_order_id, v_previous_status, p_new_status, auth.uid());

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_previous_status,
    'status', p_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION transition_order_status(uuid, text, text) TO authenticated;

-- =========================================================
-- 5. Update create_order RPC to support idempotency + history
-- =========================================================
CREATE OR REPLACE FUNCTION create_order(
  p_restaurant_slug text,
  p_fulfillment text,
  p_payment_mode text,
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_table_number text,
  p_items jsonb,
  p_idempotency_key text DEFAULT NULL
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
BEGIN
  -- Idempotency check: if this key was used before, return the existing order
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_order_id FROM orders WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order_id,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- Validate fulfillment and payment_mode
  IF p_fulfillment NOT IN ('delivery', 'table') THEN
    RETURN jsonb_build_object('error', 'Tipo de entrega inválido');
  END IF;
  IF p_payment_mode NOT IN ('pay_now', 'pay_later') THEN
    RETURN jsonb_build_object('error', 'Modo de pagamento inválido');
  END IF;

  -- Fetch restaurant by slug
  SELECT id, slug, name, is_open, subscription_status INTO v_restaurant
  FROM restaurants WHERE slug = p_restaurant_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Restaurante não encontrado');
  END IF;
  IF NOT v_restaurant.is_open THEN
    RETURN jsonb_build_object('error', 'Restaurante fechado no momento');
  END IF;
  IF v_restaurant.subscription_status = 'suspended' OR v_restaurant.subscription_status = 'canceled' THEN
    RETURN jsonb_build_object('error', 'Assinatura do restaurante inativa');
  END IF;

  -- Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('error', 'Nenhum item no pedido');
  END IF;

  -- Validate required customer fields
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

  -- Set delivery fee
  IF p_fulfillment = 'delivery' THEN
    v_delivery_fee := 5.00;
  ELSE
    v_delivery_fee := 0;
  END IF;

  -- Validate each item and calculate prices from DB
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    SELECT id, name, price, is_available INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
      AND restaurant_id = v_restaurant.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Produto não encontrado: ' || (v_item->>'product_id'));
    END IF;
    IF NOT v_product.is_available THEN
      RETURN jsonb_build_object('error', 'Produto indisponível: ' || v_product.name);
    END IF;

    IF (v_item->>'quantity')::int <= 0 THEN
      RETURN jsonb_build_object('error', 'Quantidade inválida para: ' || v_product.name);
    END IF;

    v_line_total := v_product.price;
    v_modifiers := '[]'::jsonb;

    IF v_item ? 'selected_modifiers' AND jsonb_array_length(v_item->'selected_modifiers') > 0 THEN
      FOR v_mod_id IN SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_item->'selected_modifiers') AS elem
      LOOP
        SELECT name, price_delta INTO v_mod_record
        FROM modifiers
        WHERE id = v_mod_id AND product_id = v_product.id;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('error', 'Modificador inválido para o produto: ' || v_product.name);
        END IF;
        v_line_total := v_line_total + v_mod_record.price_delta;
        v_modifiers := v_modifiers || jsonb_build_object(
          'id', v_mod_id,
          'name', v_mod_record.name,
          'price_delta', v_mod_record.price_delta
        );
      END LOOP;
    END IF;

    v_line_total := v_line_total * (v_item->>'quantity')::int;
    v_subtotal := v_subtotal + v_line_total;

    IF NOT v_first THEN
      v_order_items_to_insert := v_order_items_to_insert || ',';
    END IF;
    v_first := false;
    v_order_items_to_insert := v_order_items_to_insert || format(
      '($1, %L, %L, %L, %L, %L, %L)',
      v_product.id,
      v_product.name,
      v_product.price,
      (v_item->>'quantity')::int,
      v_modifiers::text,
      v_line_total
    );
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  -- Insert order with server-calculated totals and idempotency key
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

  -- Insert order items
  EXECUTE format(
    'INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES %s',
    v_order_items_to_insert
  ) USING v_order_id;

  -- Record initial status in history
  INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
  VALUES (v_order_id, NULL, 'new', NULL);

  -- Increment loyalty
  PERFORM increment_loyalty(v_restaurant.id, p_customer_phone);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, jsonb, text) TO anon, authenticated;

-- =========================================================
-- 6. Enable Realtime on orders table
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;
