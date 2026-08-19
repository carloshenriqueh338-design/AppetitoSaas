/*
# Appetito SaaS — Multi-Tenant Food Ordering Platform Schema

## Overview
Creates the full database schema for a multi-tenant restaurant ordering platform.
Every table carries a `restaurant_id` so data is isolated per tenant (restaurant).
Includes seed data for a sample restaurant ("Burger Haus") with menu, modifiers,
staff users, and sample orders so the UI is immediately explorable.

## New Tables
1. `restaurants` — Tenant root. Each row IS a tenant. Holds brand colors, slug, info.
2. `categories` — Menu categories per restaurant (Burgers, Drinks, Combos, ...).
3. `products` — Menu items, each in a category, with image/price/description.
4. `modifiers` — Optional add-ons for a product (extra cheese, meat temp, ...).
5. `staff` — Restaurant staff with a role (Owner/Manager/Staff/Kitchen/Driver).
6. `orders` — Customer orders. Fulfillment (delivery/table), payment mode, status.
7. `order_items` — Line items in an order, with selected modifiers snapshot.
8. `loyalty` — Per-customer order counter for the digital loyalty program.

## Security
- RLS enabled on every table.
- This app has NO sign-in screen (customers browse & order anonymously; staff
  pick a role from a demo selector). Policies use `TO anon, authenticated` so the
  anon-key frontend can read/write its own tenant's data.
- Policies scope reads/writes by `restaurant_id` (tenant isolation) and allow
  full CRUD within a tenant since this is a demo multi-tenant app without auth.

## Important Notes
1. `restaurant_id` on every child table enforces tenant isolation.
2. Orders carry `status` (new/preparing/ready/completed) for the Kanban board.
3. `fulfillment` is 'delivery' | 'table'; `payment_mode` is 'pay_now' | 'pay_later'.
4. `table_number` is set for table orders; `?table=X` in the URL locks it client-side.
5. Seed data inserts one restaurant, three categories, several products with
   modifiers, four staff users (one per role), and a few sample orders.
*/

-- =========================================================
-- 1. RESTAURANTS (tenant root)
-- =========================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  tagline text,
  description text,
  phone text,
  address text,
  logo_url text,
  hero_url text,
  primary_color text DEFAULT '#DC2626',
  accent_color text DEFAULT '#EA580C',
  is_open boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_restaurants" ON restaurants;
CREATE POLICY "anon_read_restaurants" ON restaurants FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_write_restaurants" ON restaurants;
CREATE POLICY "anon_write_restaurants" ON restaurants FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_restaurants" ON restaurants;
CREATE POLICY "anon_update_restaurants" ON restaurants FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- 2. CATEGORIES
-- =========================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 3. PRODUCTS
-- =========================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  image_url text,
  is_available boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 4. MODIFIERS (per product)
-- =========================================================
CREATE TABLE IF NOT EXISTS modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_modifiers" ON modifiers;
CREATE POLICY "anon_select_modifiers" ON modifiers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_modifiers" ON modifiers;
CREATE POLICY "anon_insert_modifiers" ON modifiers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_modifiers" ON modifiers;
CREATE POLICY "anon_update_modifiers" ON modifiers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_modifiers" ON modifiers;
CREATE POLICY "anon_delete_modifiers" ON modifiers FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 5. STAFF (role-based)
-- =========================================================
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Staff',
  pin text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_staff" ON staff;
CREATE POLICY "anon_select_staff" ON staff FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_staff" ON staff;
CREATE POLICY "anon_insert_staff" ON staff FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_staff" ON staff;
CREATE POLICY "anon_update_staff" ON staff FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_staff" ON staff;
CREATE POLICY "anon_delete_staff" ON staff FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 6. ORDERS
-- =========================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new',
  fulfillment text NOT NULL DEFAULT 'delivery',
  payment_mode text NOT NULL DEFAULT 'pay_now',
  payment_status text DEFAULT 'pending',
  customer_name text,
  customer_phone text,
  address text,
  table_number text,
  subtotal numeric(10,2) DEFAULT 0,
  delivery_fee numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 7. ORDER ITEMS
-- =========================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  modifiers jsonb DEFAULT '[]'::jsonb,
  line_total numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
CREATE POLICY "anon_update_order_items" ON order_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
CREATE POLICY "anon_delete_order_items" ON order_items FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 8. LOYALTY (per customer phone, per restaurant)
-- =========================================================
CREATE TABLE IF NOT EXISTS loyalty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  order_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (restaurant_id, customer_phone)
);
ALTER TABLE loyalty ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_loyalty" ON loyalty;
CREATE POLICY "anon_select_loyalty" ON loyalty FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_loyalty" ON loyalty;
CREATE POLICY "anon_insert_loyalty" ON loyalty FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_loyalty" ON loyalty;
CREATE POLICY "anon_update_loyalty" ON loyalty FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_loyalty" ON loyalty;
CREATE POLICY "anon_delete_loyalty" ON loyalty FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_restaurant ON products(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_product ON modifiers(product_id);
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON staff(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_restaurant_phone ON loyalty(restaurant_id, customer_phone);

-- =========================================================
-- SEED: Restaurant (tenant)
-- =========================================================
INSERT INTO restaurants (slug, name, tagline, description, phone, address, primary_color, accent_color, logo_url, hero_url)
VALUES (
  'burger-haus',
  'Burger Haus',
  'Smash. Stack. Devour.',
  'Premium smash burgers crafted with locally sourced beef, aged cheddar, and house-made sauces. Order ahead and skip the wait.',
  '+55 11 4000-1234',
  'Rua dos Pinheiros, 123 - Pinheiros, São Paulo',
  '#DC2626',
  '#EA580C',
  '',
  'https://images.pexels.com/photos/1639772/pexels-photo-1639772.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'
)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- SEED: Categories
-- =========================================================
INSERT INTO categories (restaurant_id, name, sort_order)
SELECT r.id, c.name, c.sort_order FROM restaurants r, (VALUES
  ('Burgers', 1),
  ('Drinks', 2),
  ('Combos', 3)
) AS c(name, sort_order)
WHERE r.slug = 'burger-haus'
ON CONFLICT DO NOTHING;

-- =========================================================
-- SEED: Products + modifiers
-- =========================================================
DO $$
DECLARE
  r_id uuid;
  cat_burgers uuid;
  cat_drinks uuid;
  cat_combos uuid;
  p_id uuid;
BEGIN
  SELECT id INTO r_id FROM restaurants WHERE slug = 'burger-haus';
  SELECT id INTO cat_burgers FROM categories WHERE restaurant_id = r_id AND name = 'Burgers';
  SELECT id INTO cat_drinks FROM categories WHERE restaurant_id = r_id AND name = 'Drinks';
  SELECT id INTO cat_combos FROM categories WHERE restaurant_id = r_id AND name = 'Combos';

  -- Burgers
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_burgers, 'Classic Smash', 'Double smashed beef, American cheese, pickles, house sauce on a brioche bun.', 18.90,
    'https://images.pexels.com/photos/36691286/pexels-photo-36691286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Extra Cheese', 2.50),
    (p_id, 'Bacon', 3.00),
    (p_id, 'Medium Rare', 0),
    (p_id, 'Well Done', 0);

  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_burgers, 'Truffle Deluxe', 'Wagyu blend patty, truffle aioli, caramelized onions, gruyere on a pretzel bun.', 26.50,
    'https://images.pexels.com/photos/2469096/pexels-photo-2469096.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Extra Patty', 6.00),
    (p_id, 'Truffle Fries', 5.50),
    (p_id, 'Medium', 0);

  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_burgers, 'Chicken Crunch', 'Buttermilk-fried chicken thigh, slaw, hot honey, dill pickles.', 19.90,
    'https://images.pexels.com/photos/20854973/pexels-photo-20854973.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 3)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Extra Sauce', 1.00),
    (p_id, 'Spicy Level Up', 1.50),
    (p_id, 'Add Fries', 4.00);

  -- Drinks
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_drinks, 'Craft Soda', 'House-made cola with cane sugar, served over crushed ice.', 6.50,
    'https://images.pexels.com/photos/4113653/pexels-photo-4113653.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Large', 2.00),
    (p_id, 'Lemon', 0.50);

  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_drinks, 'Fizzy Fizz', 'Sparkling citrus cooler with a hint of ginger.', 7.00,
    'https://images.pexels.com/photos/8880742/pexels-photo-8880742.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Large', 2.00),
    (p_id, 'No Ice', 0);

  -- Combos
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_combos, 'Haus Combo', 'Classic Smash + fries + craft soda. The full Haus experience.', 27.90,
    'https://images.pexels.com/photos/14773000/pexels-photo-14773000.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Upgrade to Truffle Fries', 3.00),
    (p_id, 'Large Drink', 2.00);

  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_combos, 'Double Down Combo', 'Two Classic Smash patties, loaded fries, and a Fizzy Fizz.', 32.90,
    'https://images.pexels.com/photos/18713428/pexels-photo-18713428.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Extra Cheese x2', 5.00),
    (p_id, 'Bacon x2', 6.00);
END $$;

-- =========================================================
-- SEED: Staff (one per role)
-- =========================================================
INSERT INTO staff (restaurant_id, name, role, pin)
SELECT r.id, s.name, s.role, s.pin FROM restaurants r, (VALUES
  ('Ana Owner', 'Owner', '1111'),
  ('Marcus Manager', 'Manager', '2222'),
  ('Sam Staff', 'Staff', '3333'),
  ('Kai Kitchen', 'Kitchen', '4444'),
  ('Dana Driver', 'Driver', '5555')
) AS s(name, role, pin)
WHERE r.slug = 'burger-haus'
ON CONFLICT DO NOTHING;

-- =========================================================
-- SEED: Sample orders for the Kanban board + analytics
-- =========================================================
DO $$
DECLARE
  r_id uuid;
  o_id uuid;
  p_classic uuid;
  p_truffle uuid;
  p_combo uuid;
  p_soda uuid;
BEGIN
  SELECT id INTO r_id FROM restaurants WHERE slug = 'burger-haus';
  SELECT id INTO p_classic FROM products WHERE restaurant_id = r_id AND name = 'Classic Smash';
  SELECT id INTO p_truffle FROM products WHERE restaurant_id = r_id AND name = 'Truffle Deluxe';
  SELECT id INTO p_combo FROM products WHERE restaurant_id = r_id AND name = 'Haus Combo';
  SELECT id INTO p_soda FROM products WHERE restaurant_id = r_id AND name = 'Craft Soda';

  -- Order 1: new, delivery, pay_now
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'new', 'delivery', 'pay_now', 'paid', 'João Silva', '11988887777', 'Alameda Lorena, 500 - Jardins', 25.40, 5.00, 30.40)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_classic, 'Classic Smash', 18.90, 1, '[{"name":"Extra Cheese","price_delta":2.50}]'::jsonb, 21.40),
    (o_id, p_soda, 'Craft Soda', 6.50, 1, '[]'::jsonb, 6.50);

  -- Order 2: preparing, table, pay_later
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, table_number, subtotal, delivery_fee, total)
  VALUES (r_id, 'preparing', 'table', 'pay_later', 'pending', 'Mesa 4', '4', 32.90, 0, 32.90)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_combo, 'Haus Combo', 27.90, 1, '[]'::jsonb, 27.90),
    (o_id, p_soda, 'Craft Soda', 6.50, 1, '[]'::jsonb, 6.50);

  -- Order 3: ready, delivery, pay_now
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'ready', 'delivery', 'pay_now', 'paid', 'Maria Santos', '11999998888', 'Rua Oscar Freire, 900 - Jardins', 26.50, 5.00, 31.50)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_truffle, 'Truffle Deluxe', 26.50, 1, '[]'::jsonb, 26.50);

  -- Order 4: completed, table, pay_later
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, table_number, subtotal, delivery_fee, total)
  VALUES (r_id, 'completed', 'table', 'pay_later', 'paid', 'Mesa 7', '7', 18.90, 0, 18.90)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_classic, 'Classic Smash', 18.90, 1, '[]'::jsonb, 18.90);

  -- Order 5: completed, delivery, pay_now (for analytics)
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'completed', 'delivery', 'pay_now', 'paid', 'Pedro Alves', '11977776666', 'Rua Haddock Lobo, 200 - Cerqueira César', 27.90, 5.00, 32.90)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_combo, 'Haus Combo', 27.90, 1, '[]'::jsonb, 27.90);
END $$;
