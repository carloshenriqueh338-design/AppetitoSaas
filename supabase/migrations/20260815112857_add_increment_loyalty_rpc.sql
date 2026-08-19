/*
# Add increment_loyalty RPC

## Overview
Creates a SECURITY DEFINER function that atomically increments the order_count
for a given (restaurant_id, customer_phone) loyalty row, inserting it if missing.
This supports the digital loyalty program's order counter.

## Security
- SECURITY DEFINER so the anon role can upsert/increment without needing separate
  INSERT + UPDATE policies to perfectly race-free. The function only touches the
  loyalty table for the given restaurant/phone pair.
- Granted EXECUTE to anon and authenticated.
*/

CREATE OR REPLACE FUNCTION increment_loyalty(p_restaurant uuid, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO loyalty (restaurant_id, customer_phone, order_count)
  VALUES (p_restaurant, p_phone, 1)
  ON CONFLICT (restaurant_id, customer_phone)
  DO UPDATE SET order_count = loyalty.order_count + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_loyalty(uuid, text) TO anon, authenticated;
