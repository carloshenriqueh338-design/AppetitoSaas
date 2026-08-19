/*
# Tighten RLS for Multi-Tenant Isolation + Secure Order RPC + Constraints

## Overview
This migration replaces ALL insecure `USING(true)` policies on tenant-owned tables
with proper tenant-scoped policies. It also:
- Adds CHECK constraints for status fields and numeric values
- Creates a secure `create_order` RPC that validates prices server-side
- Locks down the `increment_loyalty` RPC to only work with the order RPC
- Adds `restaurant_id` to `modifiers` for direct tenant scoping (backfilled from products)
- Restricts `staff` table to authenticated staff of the same restaurant
- Keeps public read access for customer-facing data (restaurants, categories, products, modifiers)
  but locks down all writes to authenticated staff only

## Tables Modified
1. `categories` — SELECT public (anon+auth); writes require staff membership
2. `products` — SELECT public; writes require staff membership (Owner/Manager/Staff)
3. `modifiers` — SELECT public; writes require staff membership; added restaurant_id column
4. `orders` — SELECT: anon can read own orders by phone; staff can read their restaurant's orders;
   INSERT removed (now via RPC only); UPDATE restricted to staff
5. `order_items` — SELECT: same as orders; INSERT removed (now via RPC); UPDATE/DELETE restricted to staff
6. `loyalty` — SELECT: anon can read own loyalty by phone; INSERT/UPDATE removed (now via RPC only)
7. `staff` — SELECT/INSERT/UPDATE/DELETE restricted to authenticated staff of same restaurant
8. `restaurants` — SELECT public; writes restricted to Owner/SuperAdmin

## New RPC
- `create_order(p_restaurant_slug, p_fulfillment, p_payment_mode, p_customer_name,
    p_customer_phone, p_address, p_table_number, p_items jsonb)`
  Validates: restaurant exists and is open, each product exists and is available,
  each modifier exists and belongs to the product, recalculates all prices from DB,
  inserts order + order_items + loyalty increment atomically.
  Callable by anon (customers don't log in).

## Security Changes
- All `USING(true)` policies on tenant tables replaced with proper predicates
- `increment_loyalty` EXECUTE revoked from anon/authenticated (now only callable internally by SECURITY DEFINER create_order)
- `staff` table fully locked to authenticated staff only
- Order creation no longer trusts client-supplied prices

## Important Notes
1. The `modifiers` table gets a new `restaurant_id` column backfilled from `products.restaurant_id`.
   This allows direct RLS scoping without a subquery join to products.
2. Customers (anon) can still: read restaurants, categories, products, modifiers; create orders via RPC;
   read their own loyalty by phone. They CANNOT: read staff, read other restaurants' orders, insert/update/delete anything directly.
3. Staff (authenticated with restaurant_users membership) can: read/write their restaurant's categories, products, modifiers;
   read/update their restaurant's orders; read/write staff records for their restaurant.
4. Super Admin can do everything across all tenants.
5. The `create_order` RPC is SECURITY DEFINER so it can insert into orders/order_items/loyalty
   even though the anon role no longer has INSERT policies on those tables.
*/

-- =========================================================
-- 1. ADD restaurant_id TO modifiers (backfill from products)
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modifiers' AND column_name = 'restaurant_id'
  ) THEN
    ALTER TABLE modifiers ADD COLUMN restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE modifiers m
SET restaurant_id = p.restaurant_id
FROM products p
WHERE m.product_id = p.id AND m.restaurant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_modifiers_restaurant ON modifiers(restaurant_id);

-- =========================================================
-- 2. CHECK CONSTRAINTS
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_status') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_status
      CHECK (status IN ('new', 'preparing', 'ready', 'completed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_fulfillment') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_fulfillment
      CHECK (fulfillment IN ('delivery', 'table'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_mode') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_mode
      CHECK (payment_mode IN ('pay_now', 'pay_later'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_status') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_status
      CHECK (payment_status IS NULL OR payment_status IN ('paid', 'pending', 'refunded', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_total_nonneg') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_total_nonneg
      CHECK (total >= 0 AND subtotal >= 0 AND delivery_fee >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_restaurants_subscription') THEN
    ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_subscription
      CHECK (subscription_status IS NULL OR subscription_status IN ('active', 'trial', 'suspended', 'canceled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_restaurant_users_role') THEN
    ALTER TABLE restaurant_users ADD CONSTRAINT chk_restaurant_users_role
      CHECK (role IN ('Owner', 'Manager', 'Staff', 'Kitchen', 'Driver'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_qty_positive') THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_order_items_qty_positive
      CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_price_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_price_nonneg
      CHECK (price >= 0);
  END IF;
END $$;

-- =========================================================
-- 3. DROP ALL OLD anon_* POLICIES
-- =========================================================
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;

DROP POLICY IF EXISTS "anon_select_products" ON products;
DROP POLICY IF EXISTS "anon_insert_products" ON products;
DROP POLICY IF EXISTS "anon_update_products" ON products;
DROP POLICY IF EXISTS "anon_delete_products" ON products;

DROP POLICY IF EXISTS "anon_select_modifiers" ON modifiers;
DROP POLICY IF EXISTS "anon_insert_modifiers" ON modifiers;
DROP POLICY IF EXISTS "anon_update_modifiers" ON modifiers;
DROP POLICY IF EXISTS "anon_delete_modifiers" ON modifiers;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;

DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;

DROP POLICY IF EXISTS "anon_select_loyalty" ON loyalty;
DROP POLICY IF EXISTS "anon_insert_loyalty" ON loyalty;
DROP POLICY IF EXISTS "anon_update_loyalty" ON loyalty;
DROP POLICY IF EXISTS "anon_delete_loyalty" ON loyalty;

DROP POLICY IF EXISTS "anon_select_staff" ON staff;
DROP POLICY IF EXISTS "anon_insert_staff" ON staff;
DROP POLICY IF EXISTS "anon_update_staff" ON staff;
DROP POLICY IF EXISTS "anon_delete_staff" ON staff;

DROP POLICY IF EXISTS "anon_read_restaurants" ON restaurants;
DROP POLICY IF EXISTS "anon_write_restaurants" ON restaurants;
DROP POLICY IF EXISTS "anon_update_restaurants" ON restaurants;

-- =========================================================
-- 4. RESTAURANTS — public read; Owner/SuperAdmin write
-- =========================================================
CREATE POLICY "public_read_restaurants" ON restaurants FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "owner_insert_restaurants" ON restaurants FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "owner_update_restaurants" ON restaurants FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role = 'Owner'
    )
    OR is_super_admin()
  )
  WITH CHECK (
    id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role = 'Owner'
    )
    OR is_super_admin()
  );

CREATE POLICY "superadmin_delete_restaurants" ON restaurants FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- =========================================================
-- 5. CATEGORIES — public read; staff write
-- =========================================================
CREATE POLICY "public_read_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "staff_insert_categories" ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_update_categories" ON categories FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_delete_categories" ON categories FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

-- =========================================================
-- 6. PRODUCTS — public read; staff write
-- =========================================================
CREATE POLICY "public_read_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "staff_insert_products" ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_update_products" ON products FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_delete_products" ON products FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

-- =========================================================
-- 7. MODIFIERS — public read; staff write (scoped by restaurant_id)
-- =========================================================
CREATE POLICY "public_read_modifiers" ON modifiers FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "staff_insert_modifiers" ON modifiers FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_update_modifiers" ON modifiers FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_delete_modifiers" ON modifiers FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager', 'Staff')
    )
    OR is_super_admin()
  );

-- =========================================================
-- 8. ORDERS — anon reads own by phone; staff reads their restaurant; staff updates; NO direct insert
-- =========================================================
CREATE POLICY "anon_read_own_orders" ON orders FOR SELECT
  TO anon, authenticated
  USING (
    customer_phone IS NOT NULL
    AND customer_phone = current_setting('app.current_customer_phone', true)
  );

CREATE POLICY "staff_read_orders" ON orders FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_update_orders" ON orders FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    )
    OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_delete_orders" ON orders FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role IN ('Owner', 'Manager')
    )
    OR is_super_admin()
  );

-- =========================================================
-- 9. ORDER_ITEMS — same model as orders (via parent order's restaurant_id)
-- =========================================================
CREATE POLICY "anon_read_own_order_items" ON order_items FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.customer_phone IS NOT NULL
        AND o.customer_phone = current_setting('app.current_customer_phone', true)
    )
  );

CREATE POLICY "staff_read_order_items" ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id IN (
          SELECT ru.restaurant_id FROM restaurant_users ru
          WHERE ru.user_id = auth.uid() AND ru.is_active
        )
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_update_order_items" ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id IN (
          SELECT ru.restaurant_id FROM restaurant_users ru
          WHERE ru.user_id = auth.uid() AND ru.is_active
        )
    )
    OR is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id IN (
          SELECT ru.restaurant_id FROM restaurant_users ru
          WHERE ru.user_id = auth.uid() AND ru.is_active
        )
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_delete_order_items" ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id IN (
          SELECT ru.restaurant_id FROM restaurant_users ru
          WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role IN ('Owner', 'Manager')
        )
    )
    OR is_super_admin()
  );

-- =========================================================
-- 10. LOYALTY — anon reads own by phone; NO direct insert/update (RPC only)
-- =========================================================
CREATE POLICY "anon_read_own_loyalty" ON loyalty FOR SELECT
  TO anon, authenticated
  USING (
    customer_phone IS NOT NULL
    AND customer_phone = current_setting('app.current_customer_phone', true)
  );

CREATE POLICY "staff_read_loyalty" ON loyalty FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    )
    OR is_super_admin()
  );

-- =========================================================
-- 11. STAFF — authenticated staff of same restaurant only
-- =========================================================
CREATE POLICY "staff_read_staff" ON staff FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_insert_staff" ON staff FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_update_staff" ON staff FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager')
    )
    OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role IN ('Owner', 'Manager')
    )
    OR is_super_admin()
  );

CREATE POLICY "staff_delete_staff" ON staff FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active
        AND ru.role = 'Owner'
    )
    OR is_super_admin()
  );

-- =========================================================
-- 12. REVOKE EXECUTE ON increment_loyalty from anon/authenticated
-- =========================================================
REVOKE EXECUTE ON FUNCTION increment_loyalty(uuid, text) FROM anon, authenticated;

-- =========================================================
-- 13. CREATE SECURE create_order RPC
-- =========================================================
CREATE OR REPLACE FUNCTION create_order(
  p_restaurant_slug text,
  p_fulfillment text,
  p_payment_mode text,
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_table_number text,
  p_items jsonb
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
  v_mod_name text;
  v_mod_price numeric(10,2);
  v_mod_id uuid;
  v_order_items_to_insert text := '';
  v_first boolean := true;
  v_item_count int := 0;
BEGIN
  -- Validate fulfillment and payment_mode
  IF p_fulfillment NOT IN ('delivery', 'table') THEN
    RETURN jsonb_build_object('error', 'Invalid fulfillment type');
  END IF;
  IF p_payment_mode NOT IN ('pay_now', 'pay_later') THEN
    RETURN jsonb_build_object('error', 'Invalid payment mode');
  END IF;

  -- Fetch restaurant by slug
  SELECT id, slug, name, is_open, subscription_status INTO v_restaurant
  FROM restaurants WHERE slug = p_restaurant_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Restaurant not found');
  END IF;
  IF NOT v_restaurant.is_open THEN
    RETURN jsonb_build_object('error', 'Restaurant is currently closed');
  END IF;
  IF v_restaurant.subscription_status = 'suspended' OR v_restaurant.subscription_status = 'canceled' THEN
    RETURN jsonb_build_object('error', 'Restaurant subscription is not active');
  END IF;

  -- Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('error', 'No items in order');
  END IF;

  -- Validate required customer fields
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RETURN jsonb_build_object('error', 'Customer name is required');
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RETURN jsonb_build_object('error', 'Customer phone is required');
  END IF;
  IF p_fulfillment = 'delivery' AND (p_address IS NULL OR btrim(p_address) = '') THEN
    RETURN jsonb_build_object('error', 'Delivery address is required');
  END IF;
  IF p_fulfillment = 'table' AND (p_table_number IS NULL OR btrim(p_table_number) = '') THEN
    RETURN jsonb_build_object('error', 'Table number is required');
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
    v_item_count := v_item_count + 1;

    -- Fetch product from DB (not from client)
    SELECT id, name, price, is_available INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
      AND restaurant_id = v_restaurant.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Product not found: ' || (v_item->>'product_id'));
    END IF;
    IF NOT v_product.is_available THEN
      RETURN jsonb_build_object('error', 'Product not available: ' || v_product.name);
    END IF;

    -- Validate quantity
    IF (v_item->>'quantity')::int <= 0 THEN
      RETURN jsonb_build_object('error', 'Invalid quantity for: ' || v_product.name);
    END IF;

    -- Calculate line total from DB prices
    v_line_total := v_product.price;
    v_modifiers := '[]'::jsonb;

    -- Validate and price each modifier from DB
    IF v_item ? 'selected_modifiers' AND jsonb_array_length(v_item->'selected_modifiers') > 0 THEN
      FOR v_mod_id IN SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_item->'selected_modifiers') AS elem
      LOOP
        SELECT name, price_delta INTO v_mod_record
        FROM modifiers
        WHERE id = v_mod_id AND product_id = v_product.id;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('error', 'Invalid modifier for product: ' || v_product.name);
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

    -- Build INSERT values
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

  -- Insert order with server-calculated totals
  INSERT INTO orders (
    restaurant_id, status, fulfillment, payment_mode, payment_status,
    customer_name, customer_phone, address, table_number,
    subtotal, delivery_fee, total
  )
  VALUES (
    v_restaurant.id, 'new', p_fulfillment, p_payment_mode,
    CASE WHEN p_payment_mode = 'pay_now' THEN 'paid' ELSE 'pending' END,
    p_customer_name, p_customer_phone,
    CASE WHEN p_fulfillment = 'delivery' THEN p_address ELSE NULL END,
    CASE WHEN p_fulfillment = 'table' THEN p_table_number ELSE NULL END,
    v_subtotal, v_delivery_fee, v_total
  )
  RETURNING id INTO v_order_id;

  -- Insert order items with server-validated data
  EXECUTE format(
    'INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES %s',
    v_order_items_to_insert
  ) USING v_order_id;

  -- Increment loyalty (internal call, not exposed to anon)
  PERFORM increment_loyalty(v_restaurant.id, p_customer_phone);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, jsonb) TO anon, authenticated;
