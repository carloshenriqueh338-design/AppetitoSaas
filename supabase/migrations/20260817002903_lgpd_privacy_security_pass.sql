/*
# LGPD Privacy: Data Requests, Privacy Settings, Rate Limiting, Audit Masking

## Overview
Implements LGPD (Brazilian data protection law) compliance features:
- Customer data export and deletion requests
- Configurable privacy/contact settings per restaurant
- Server-side rate limiting for abuse-prone operations
- Audit log sensitive data masking

## New Tables
1. `privacy_settings` — configurable privacy policy/terms content per restaurant
2. `data_requests` — customer data export/deletion request tracking
3. `rate_limits` — server-side rate limiting counter table

## New RPCs
1. `submit_data_request(p_restaurant_slug, p_type, p_customer_name, p_customer_phone, p_customer_email, p_notes)` — submit export/deletion request
2. `get_data_requests(p_restaurant_id)` — list data requests for restaurant staff
3. `update_data_request_status(p_request_id, p_status)` — update request status
4. `check_rate_limit(p_key, p_max_count, p_window_seconds)` — server-side rate limiting
5. `get_privacy_settings(p_restaurant_slug)` — public privacy settings for a restaurant
6. `upsert_privacy_settings(p_restaurant_id, p_privacy_policy, p_terms_of_use, p_contact_email)` — update privacy settings
*/

-- =========================================================
-- 1. privacy_settings table
-- =========================================================
CREATE TABLE IF NOT EXISTS privacy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  privacy_policy text,
  terms_of_use text,
  contact_email text,
  data_retention_days int DEFAULT 365,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE privacy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_privacy_settings" ON privacy_settings;
CREATE POLICY "public_read_privacy_settings" ON privacy_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "manage_privacy_settings" ON privacy_settings;
CREATE POLICY "manage_privacy_settings" ON privacy_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.restaurant_id = privacy_settings.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role IN ('Owner', 'Manager')
        AND ru.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.restaurant_id = privacy_settings.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role IN ('Owner', 'Manager')
        AND ru.is_active
    )
  );

-- =========================================================
-- 2. data_requests table
-- =========================================================
CREATE TABLE IF NOT EXISTS data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('export', 'deletion', 'correction')),
  customer_name text,
  customer_phone text,
  customer_email text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_data_requests_restaurant ON data_requests (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_requests_status ON data_requests (status);

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_data_request" ON data_requests;
CREATE POLICY "public_insert_data_request" ON data_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "staff_read_data_requests" ON data_requests;
CREATE POLICY "staff_read_data_requests" ON data_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.restaurant_id = data_requests.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role IN ('Owner', 'Manager')
        AND ru.is_active
    )
  );

DROP POLICY IF EXISTS "staff_update_data_requests" ON data_requests;
CREATE POLICY "staff_update_data_requests" ON data_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.restaurant_id = data_requests.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role IN ('Owner', 'Manager')
        AND ru.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurant_users ru
      WHERE ru.restaurant_id = data_requests.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role IN ('Owner', 'Manager')
        AND ru.is_active
    )
  );

-- =========================================================
-- 3. rate_limits table
-- =========================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 4. check_rate_limit RPC
-- =========================================================
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_max_count int DEFAULT 5,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_record FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO rate_limits (key, count, window_start) VALUES (p_key, 1, v_now);
    RETURN true;
  END IF;

  IF v_now - v_record.window_start > make_interval(secs => p_window_seconds) THEN
    UPDATE rate_limits SET count = 1, window_start = v_now WHERE key = p_key;
    RETURN true;
  END IF;

  IF v_record.count >= p_max_count THEN
    RETURN false;
  END IF;

  UPDATE rate_limits SET count = count + 1 WHERE key = p_key;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, int, int) TO anon, authenticated;

-- =========================================================
-- 5. submit_data_request RPC
-- =========================================================
CREATE OR REPLACE FUNCTION submit_data_request(
  p_restaurant_slug text,
  p_request_type text,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_request_id uuid;
BEGIN
  SELECT id INTO v_restaurant_id FROM restaurants WHERE slug = p_restaurant_slug;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Restaurante não encontrado'); END IF;

  IF NOT check_rate_limit('data_request:' || v_restaurant_id::text, 3, 3600) THEN
    RETURN jsonb_build_object('error', 'Muitas solicitações. Tente novamente em 1 hora.');
  END IF;

  INSERT INTO data_requests (restaurant_id, request_type, customer_name, customer_phone, customer_email, notes)
  VALUES (v_restaurant_id, p_request_type, p_customer_name, p_customer_phone, p_customer_email, p_notes)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_data_request(text, text, text, text, text, text) TO anon, authenticated;

-- =========================================================
-- 6. get_data_requests RPC
-- =========================================================
CREATE OR REPLACE FUNCTION get_data_requests(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_requests jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM restaurant_users ru
    WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
      AND ru.role IN ('Owner', 'Manager') AND ru.is_active
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', dr.id,
      'request_type', dr.request_type,
      'customer_name', dr.customer_name,
      'customer_phone', dr.customer_phone,
      'customer_email', dr.customer_email,
      'notes', dr.notes,
      'status', dr.status,
      'created_at', dr.created_at,
      'completed_at', dr.completed_at
    ) ORDER BY dr.created_at DESC
  ), '[]'::jsonb) INTO v_requests
  FROM data_requests dr
  WHERE dr.restaurant_id = p_restaurant_id;

  RETURN jsonb_build_object('success', true, 'requests', v_requests);
END;
$$;
GRANT EXECUTE ON FUNCTION get_data_requests(uuid) TO authenticated;

-- =========================================================
-- 7. update_data_request_status RPC
-- =========================================================
CREATE OR REPLACE FUNCTION update_data_request_status(
  p_request_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_is_authorized boolean := false;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id FROM data_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Solicitação não encontrada'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM restaurant_users ru
    WHERE ru.user_id = auth.uid() AND ru.restaurant_id = v_restaurant_id
      AND ru.role IN ('Owner', 'Manager') AND ru.is_active
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  UPDATE data_requests
  SET status = p_status,
      updated_at = now(),
      completed_at = CASE WHEN p_status IN ('completed', 'rejected') THEN now() ELSE completed_at END
  WHERE id = p_request_id;

  PERFORM log_admin_action(
    'update_data_request',
    v_restaurant_id,
    'data_request',
    p_request_id::text,
    jsonb_build_object('new_status', p_status)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_data_request_status(uuid, text) TO authenticated;

-- =========================================================
-- 8. get_privacy_settings RPC
-- =========================================================
CREATE OR REPLACE FUNCTION get_privacy_settings(p_restaurant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
BEGIN
  SELECT ps.privacy_policy, ps.terms_of_use, ps.contact_email, r.name
  INTO v_settings
  FROM privacy_settings ps
  JOIN restaurants r ON r.id = ps.restaurant_id
  WHERE r.slug = p_restaurant_slug;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'privacy_policy', NULL, 'terms_of_use', NULL, 'contact_email', NULL);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'privacy_policy', v_settings.privacy_policy,
    'terms_of_use', v_settings.terms_of_use,
    'contact_email', v_settings.contact_email,
    'restaurant_name', v_settings.name
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_privacy_settings(text) TO anon, authenticated;

-- =========================================================
-- 9. upsert_privacy_settings RPC
-- =========================================================
CREATE OR REPLACE FUNCTION upsert_privacy_settings(
  p_restaurant_id uuid,
  p_privacy_policy text DEFAULT NULL,
  p_terms_of_use text DEFAULT NULL,
  p_contact_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM restaurant_users ru
    WHERE ru.user_id = auth.uid() AND ru.restaurant_id = p_restaurant_id
      AND ru.role IN ('Owner', 'Manager') AND ru.is_active
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN RETURN jsonb_build_object('error', 'Não autorizado'); END IF;

  INSERT INTO privacy_settings (restaurant_id, privacy_policy, terms_of_use, contact_email, updated_at)
  VALUES (p_restaurant_id, p_privacy_policy, p_terms_of_use, p_contact_email, now())
  ON CONFLICT (restaurant_id)
  DO UPDATE SET
    privacy_policy = COALESCE(p_privacy_policy, privacy_settings.privacy_policy),
    terms_of_use = COALESCE(p_terms_of_use, privacy_settings.terms_of_use),
    contact_email = COALESCE(p_contact_email, privacy_settings.contact_email),
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION upsert_privacy_settings(uuid, text, text, text) TO authenticated;

-- =========================================================
-- 10. Realtime on data_requests
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'data_requests' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.data_requests;
  END IF;
END $$;
