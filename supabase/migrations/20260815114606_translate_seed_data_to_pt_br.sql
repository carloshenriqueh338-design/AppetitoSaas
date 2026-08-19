/*
# Translate seed data to Brazilian Portuguese (pt-BR)

## Overview
Updates all seeded restaurant data to Brazilian Portuguese and changes the
restaurant slug from 'burger-haus' to 'burger-casa' to match the new branding.

## Changes
1. Restaurant: name → 'Burger Casa', tagline + description → pt-BR, slug → 'burger-casa'
2. Categories: 'Drinks' → 'Bebidas' (Burgers and Combos are common terms in BR)
3. Products: all 7 product names + descriptions → pt-BR
4. Modifiers: all modifier names → pt-BR
5. Staff: names → Brazilian names (Ana Silva, Marcus Oliveira, etc.)
6. Order items: historical order item names → pt-BR to match new product names
7. Slug: 'burger-haus' → 'burger-casa' (done last so all subqueries resolve)

## Security
No security changes. RLS policies unchanged.

## Important Notes
1. UPDATE statements only — no data loss.
2. The DO block early-returns if slug 'burger-haus' is not found (already migrated).
3. Slug changes last so all preceding subqueries can use the old slug.
*/

DO $$
DECLARE
  r_id uuid;
BEGIN
  SELECT id INTO r_id FROM restaurants WHERE slug = 'burger-haus';
  IF r_id IS NULL THEN
    RETURN;
  END IF;

  -- Restaurant branding
  UPDATE restaurants SET
    name = 'Burger Casa',
    tagline = 'Smash. Empilhe. Devore.',
    description = 'Hambúrgueres smash premium feitos com carne de origem local, cheddar envelhecido e molhos da casa. Peça antes e evite filas.'
  WHERE id = r_id;

  -- Categories
  UPDATE categories SET name = 'Bebidas' WHERE restaurant_id = r_id AND name = 'Drinks';

  -- Products
  UPDATE products SET name = 'Smash Clássico', description = 'Duplo hambúrguer smash, queijo americano, picles, molho da casa no pão brioche.' WHERE restaurant_id = r_id AND name = 'Classic Smash';
  UPDATE products SET name = 'Trufado Premium', description = 'Blend de wagyu, aioli de trufa, cebola caramelizada, gruyère no pão de pretzel.' WHERE restaurant_id = r_id AND name = 'Truffle Deluxe';
  UPDATE products SET name = 'Frango Crocante', description = 'Coxa de frango empanada no leitelho, slaw, mel quente, picles.' WHERE restaurant_id = r_id AND name = 'Chicken Crunch';
  UPDATE products SET name = 'Refrigerante Artesanal', description = 'Cola da casa com açúcar de cana, servida com gelo moído.' WHERE restaurant_id = r_id AND name = 'Craft Soda';
  UPDATE products SET name = 'Citrus Fizz', description = 'Refrigerante cítrico com toque de gengibre.' WHERE restaurant_id = r_id AND name = 'Fizzy Fizz';
  UPDATE products SET name = 'Combo Casa', description = 'Smash Clássico + batata + refrigerante artesanal. A experiência completa da Casa.' WHERE restaurant_id = r_id AND name = 'Haus Combo';
  UPDATE products SET name = 'Combo Duplo', description = 'Dois hambúrgueres Smash Clássico, batata carregada e um Citrus Fizz.' WHERE restaurant_id = r_id AND name = 'Double Down Combo';

  -- Modifiers
  UPDATE modifiers SET name = 'Queijo Extra' WHERE name = 'Extra Cheese' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Mal Passado' WHERE name = 'Medium Rare' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Bem Passado' WHERE name = 'Well Done' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Hambúrguer Extra' WHERE name = 'Extra Patty' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Batata Trufada' WHERE name = 'Truffle Fries' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Ao Ponto' WHERE name = 'Medium' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Molho Extra' WHERE name = 'Extra Sauce' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Mais Pimenta' WHERE name = 'Spicy Level Up' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Adicionar Batata' WHERE name = 'Add Fries' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Grande' WHERE name = 'Large' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Limão' WHERE name = 'Lemon' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Sem Gelo' WHERE name = 'No Ice' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Upgrade para Batata Trufada' WHERE name = 'Upgrade to Truffle Fries' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Bebida Grande' WHERE name = 'Large Drink' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);
  UPDATE modifiers SET name = 'Queijo Extra x2' WHERE name = 'Extra Cheese x2' AND product_id IN (SELECT id FROM products WHERE restaurant_id = r_id);

  -- Staff names
  UPDATE staff SET name = 'Ana Silva' WHERE name = 'Ana Owner' AND restaurant_id = r_id;
  UPDATE staff SET name = 'Marcus Oliveira' WHERE name = 'Marcus Manager' AND restaurant_id = r_id;
  UPDATE staff SET name = 'Sam Santos' WHERE name = 'Sam Staff' AND restaurant_id = r_id;
  UPDATE staff SET name = 'Kai Costa' WHERE name = 'Kai Kitchen' AND restaurant_id = r_id;
  UPDATE staff SET name = 'Dana Dias' WHERE name = 'Dana Driver' AND restaurant_id = r_id;

  -- Historical order item names
  UPDATE order_items SET name = 'Smash Clássico' WHERE name = 'Classic Smash' AND order_id IN (SELECT id FROM orders WHERE restaurant_id = r_id);
  UPDATE order_items SET name = 'Trufado Premium' WHERE name = 'Truffle Deluxe' AND order_id IN (SELECT id FROM orders WHERE restaurant_id = r_id);
  UPDATE order_items SET name = 'Combo Casa' WHERE name = 'Haus Combo' AND order_id IN (SELECT id FROM orders WHERE restaurant_id = r_id);
  UPDATE order_items SET name = 'Refrigerante Artesanal' WHERE name = 'Craft Soda' AND order_id IN (SELECT id FROM orders WHERE restaurant_id = r_id);

  -- Change slug last
  UPDATE restaurants SET slug = 'burger-casa' WHERE id = r_id;
END $$;
