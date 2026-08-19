
-- =========================================================
-- Seed: Test restaurant "Pizza Bella" with owner, menu, and orders
-- =========================================================

-- 1. Create auth user for the owner
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'owner@pizzabella.com',
  crypt('Owner123!', gen_salt('bf', 10)),
  now(), now(), now(), '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'owner@pizzabella.com')
RETURNING id, email;

-- 2. Create the restaurant
DO $$
DECLARE
  r_id uuid;
  owner_id uuid;
  cat_pizza uuid;
  cat_sweet uuid;
  cat_drinks uuid;
  cat_starters uuid;
  p_id uuid;
  o_id uuid;
  p_margherita uuid;
  p_pepperoni uuid;
  p_chocolate uuid;
  p_drink uuid;
  p_bruschetta uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE email = 'owner@pizzabella.com';
  SELECT id INTO r_id FROM restaurants WHERE slug = 'pizza-bella';

  IF r_id IS NULL THEN
    INSERT INTO restaurants (slug, name, tagline, description, phone, address, primary_color, accent_color, hero_url, subscription_status, delivery_fee, minimum_order, estimated_prep_minutes, delivery_enabled, pickup_enabled, table_ordering_enabled)
    VALUES (
      'pizza-bella',
      'Pizza Bella',
      'Massa artesanal, sabor sem limites',
      'Pizzaria artesanal com massa de fermentação natural, ingredientes frescos e forno a lenha. Peça online e receba em casa.',
      '+55 11 4000-5678',
      'Rua das Oliveiras, 456 - Vila Madalena, São Paulo',
      '#B91C1C',
      '#F59E0B',
      'https://images.pexels.com/photos/845811/pexels-photo-845811.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'active', 6.00, 20.00, 35, true, true, true
    )
    RETURNING id INTO r_id;
  END IF;

  -- 3. Link owner to restaurant
  INSERT INTO restaurant_users (user_id, restaurant_id, role, is_active)
  VALUES (owner_id, r_id, 'Owner', true)
  ON CONFLICT DO NOTHING;

  -- 4. Create subscription
  INSERT INTO subscriptions (restaurant_id, plan_id, status, billing_cycle, start_date, current_period_start, current_period_end)
  SELECT r_id, p.id, 'active', 'monthly', now(), now(), now() + interval '30 days'
  FROM plans p WHERE p.name = 'Starter'
  ON CONFLICT DO NOTHING;

  -- 5. Categories
  INSERT INTO categories (restaurant_id, name, sort_order)
  SELECT r_id, c.name, c.sort_order FROM (VALUES
    ('Pizzas Salgadas', 1),
    ('Pizzas Doces', 2),
    ('Bebidas', 3),
    ('Entradas', 4)
  ) AS c(name, sort_order)
  ON CONFLICT DO NOTHING;

  -- 6. Products + modifiers
  SELECT id INTO cat_pizza FROM categories WHERE restaurant_id = r_id AND name = 'Pizzas Salgadas';
  SELECT id INTO cat_sweet FROM categories WHERE restaurant_id = r_id AND name = 'Pizzas Doces';
  SELECT id INTO cat_drinks FROM categories WHERE restaurant_id = r_id AND name = 'Bebidas';
  SELECT id INTO cat_starters FROM categories WHERE restaurant_id = r_id AND name = 'Entradas';

  -- Pizza: Margherita
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_pizza, 'Margherita', 'Molho de tomate San Marzano, mozzarella de búfala, manjericão fresco e azeite extra virgem.', 42.00,
    'https://images.pexels.com/photos/2147491/pexels-photo-2147491.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Borda Catupiry', 8.00),
    (p_id, 'Extra Mozzarella', 6.00),
    (p_id, 'Azeitonas', 3.00);

  -- Pizza: Pepperoni
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_pizza, 'Pepperoni Premium', 'Pepperoni importado, mozzarella, molho de tomate e orégano.', 49.00,
    'https://images.pexels.com/photos/806461/pexels-photo-806461.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Borda Catupiry', 8.00),
    (p_id, 'Extra Pepperoni', 7.00),
    (p_id, 'Pimenta Calabresa', 0);

  -- Pizza: Quatro Queijos
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_pizza, 'Quatro Queijos', 'Mozzarella, gorgonzola, parmesão e provolone. Para amantes de queijo.', 52.00,
    'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 3)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Borda Catupiry', 8.00),
    (p_id, 'Mel trufado', 5.00);

  -- Pizza Doce: Chocolate
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_sweet, 'Chocolate com Morango', 'Chocolate belga derretido, morangos frescos e leite condensado.', 45.00,
    'https://images.pexels.com/photos/3727256/pexels-photo-3727256.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Borda de Chocolate', 6.00),
    (p_id, 'Extra Morangos', 5.00);

  -- Bebidas: Refrigerante
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_drinks, 'Refrigerante Lata', 'Coca-Cola, Guaraná ou Sprite. 350ml gelado.', 7.00,
    'https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Sem Gás', 0);

  -- Bebidas: Suco Natural
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_drinks, 'Suco Natural', 'Laranja, limão ou maracujá. Feito na hora.', 9.50,
    'https://images.pexels.com/photos/96974/pexels-photo-96974.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2)
  RETURNING id INTO p_id;

  -- Entradas: Bruschetta
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_starters, 'Bruschetta Caprese', 'Pão italiano tostado, tomate, mozzarella de búfala, manjericão e pesto.', 24.00,
    'https://images.pexels.com/photos/1213710/pexels-photo-1213710.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1)
  RETURNING id INTO p_id;
  INSERT INTO modifiers (product_id, name, price_delta) VALUES
    (p_id, 'Sem Glúten', 0),
    (p_id, 'Extra Pesto', 3.00);

  -- Entradas: Bolinho de Bacalhau
  INSERT INTO products (restaurant_id, category_id, name, description, price, image_url, sort_order)
  VALUES (r_id, cat_starters, 'Bolinho de Bacalhau', 'Bolinhos de bacalhau portugueses, crocantes por fora e macios por dentro. 6 unidades.', 28.00,
    'https://images.pexels.com/photos/566566/pexels-photo-566566.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2)
  RETURNING id INTO p_id;

  -- 7. Sample orders
  SELECT id INTO p_margherita FROM products WHERE restaurant_id = r_id AND name = 'Margherita';
  SELECT id INTO p_pepperoni FROM products WHERE restaurant_id = r_id AND name = 'Pepperoni Premium';
  SELECT id INTO p_chocolate FROM products WHERE restaurant_id = r_id AND name = 'Chocolate com Morango';
  SELECT id INTO p_drink FROM products WHERE restaurant_id = r_id AND name = 'Refrigerante Lata';
  SELECT id INTO p_bruschetta FROM products WHERE restaurant_id = r_id AND name = 'Bruschetta Caprese';

  -- Order 1: new, delivery, pay_now
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'new', 'delivery', 'pay_now', 'paid', 'Carlos Oliveira', '11987654321', 'Rua das Flores, 100 - Vila Madalena', 50.00, 6.00, 56.00)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_margherita, 'Margherita', 42.00, 1, '[{"name":"Borda Catupiry","price_delta":8.00}]'::jsonb, 50.00),
    (o_id, p_drink, 'Refrigerante Lata', 7.00, 1, '[]'::jsonb, 7.00);

  -- Order 2: preparing, table, pay_later
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, table_number, subtotal, delivery_fee, total)
  VALUES (r_id, 'preparing', 'table', 'pay_later', 'pending', 'Mesa 3', '3', 49.00, 0, 49.00)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_pepperoni, 'Pepperoni Premium', 49.00, 1, '[]'::jsonb, 49.00);

  -- Order 3: ready, delivery, pay_now
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'ready', 'delivery', 'pay_now', 'paid', 'Fernanda Costa', '11998765432', 'Alameda Franca, 200 - Pinheiros', 45.00, 6.00, 51.00)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_chocolate, 'Chocolate com Morango', 45.00, 1, '[]'::jsonb, 45.00);

  -- Order 4: completed, table, pay_later
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, table_number, subtotal, delivery_fee, total)
  VALUES (r_id, 'completed', 'table', 'pay_later', 'paid', 'Mesa 5', '5', 74.00, 0, 74.00)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_margherita, 'Margherita', 42.00, 1, '[{"name":"Borda Catupiry","price_delta":8.00}]'::jsonb, 50.00),
    (o_id, p_bruschetta, 'Bruschetta Caprese', 24.00, 1, '[]'::jsonb, 24.00);

  -- Order 5: completed, delivery, pay_now
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'completed', 'delivery', 'pay_now', 'paid', 'Ricardo Santos', '11987650000', 'Rua Heitor Penteado, 300 - Sumaré', 102.00, 6.00, 108.00)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_pepperoni, 'Pepperoni Premium', 49.00, 1, '[{"name":"Borda Catupiry","price_delta":8.00}]'::jsonb, 57.00),
    (o_id, p_drink, 'Refrigerante Lata', 7.00, 3, '[]'::jsonb, 21.00),
    (o_id, p_bruschetta, 'Bruschetta Caprese', 24.00, 1, '[]'::jsonb, 24.00);

  -- Order 6: completed, delivery, pay_now
  INSERT INTO orders (restaurant_id, status, fulfillment, payment_mode, payment_status, customer_name, customer_phone, address, subtotal, delivery_fee, total)
  VALUES (r_id, 'completed', 'delivery', 'pay_now', 'paid', 'Juliana Lima', '11987651111', 'Rua Augusta, 1500 - Consolação', 51.00, 6.00, 57.00)
  RETURNING id INTO o_id;
  INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, modifiers, line_total) VALUES
    (o_id, p_chocolate, 'Chocolate com Morango', 45.00, 1, '[{"name":"Borda de Chocolate","price_delta":6.00}]'::jsonb, 51.00);
END $$;
