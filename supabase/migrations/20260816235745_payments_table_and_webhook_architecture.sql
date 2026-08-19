/*
# Payments Table, Payment Status, and Webhook Event Logging

## Overview
Creates the production payment architecture: a `payments` table linked to orders,
a `webhook_events` table for idempotent webhook processing, and RPCs for payment
session creation, status checking, and webhook processing.

## New Tables
1. `payments` — payment entity per order with provider, amount, status, method, metadata
2. `webhook_events` — idempotent webhook event log with unique (provider, event_id)

## New RPCs
1. `create_payment_session(p_order_id, p_method)` — creates a payment record, returns session info
2. `check_payment_status(p_order_id)` — returns latest payment status for frontend polling
3. `process_payment_webhook(p_provider, p_event_id, p_event_type, p_payload)` — idempotent webhook processor

## Security
- payments: RLS enabled, anon reads own by phone, staff reads their restaurant's
- webhook_events: RLS enabled, no direct access — only via SECURITY DEFINER RPC
- process_payment_webhook: EXECUTE only to authenticated (service role / webhook edge function)
- No card numbers, CVVs, or sensitive credentials stored

## Payment Status Values
pending, processing, paid, failed, expired, canceled, refunded, partially_refunded

## Important Notes
1. Actual provider integration lives in edge functions, not the database
2. Webhook events are idempotent via unique (provider, event_id)
3. Order payment_status is derived from payments table, never set by frontend
4. pay_later orders create no payment row
5. provider_metadata stores non-sensitive data (Pix QR code, copy-paste code) — never card details
*/

-- =========================================================
-- 1. Create payments table
-- =========================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  provider_payment_id text,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  method text,
  provider_metadata jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'canceled', 'refunded', 'partially_refunded')),
  CONSTRAINT chk_payments_amount_positive CHECK (amount >= 0),
  CONSTRAINT chk_payments_provider CHECK (provider IN ('stripe', 'pagarme', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_provider_unique
  ON payments (order_id, provider) WHERE status NOT IN ('failed', 'canceled', 'expired');

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments (provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_own_payments" ON payments;
CREATE POLICY "anon_read_own_payments" ON payments
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = payments.order_id
        AND o.customer_phone IS NOT NULL
        AND o.customer_phone = current_setting('app.current_customer_phone', true)
    )
  );

DROP POLICY IF EXISTS "staff_read_payments" ON payments;
CREATE POLICY "staff_read_payments" ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = payments.order_id
        AND o.restaurant_id IN (
          SELECT ru.restaurant_id FROM restaurant_users ru
          WHERE ru.user_id = auth.uid() AND ru.is_active
        )
    )
    OR is_super_admin()
  );

-- =========================================================
-- 2. Create webhook_events table
-- =========================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events (processed_at);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3. Update orders payment_status CHECK constraint
-- =========================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_payment_status;
ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_status
  CHECK (payment_status IS NULL OR payment_status IN ('paid', 'pending', 'processing', 'expired', 'refunded', 'failed'));

-- =========================================================
-- 4. updated_at trigger for payments
-- =========================================================
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

-- =========================================================
-- 5. process_payment_webhook RPC
-- =========================================================
CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_payment_id uuid;
  v_order_id uuid;
  v_new_status text;
  v_provider_payment_id text;
  v_metadata jsonb;
  v_failure_reason text;
BEGIN
  -- Idempotency: check if this event was already processed
  SELECT id, processed_at INTO v_existing
  FROM webhook_events
  WHERE provider = p_provider AND event_id = p_event_id;

  IF FOUND AND v_existing.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true);
  END IF;

  -- Insert or update the webhook event record
  INSERT INTO webhook_events (provider, event_id, event_type, payload, processed_at)
  VALUES (p_provider, p_event_id, p_event_type, p_payload, now())
  ON CONFLICT (provider, event_id) DO UPDATE SET processed_at = now();

  -- Extract payment info from payload
  v_payment_id := (p_payload->>'payment_id')::uuid;
  v_new_status := p_payload->>'status';
  v_provider_payment_id := p_payload->>'provider_payment_id';
  v_metadata := p_payload->'metadata';
  v_failure_reason := p_payload->>'failure_reason';

  IF v_payment_id IS NULL OR v_new_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Missing payment_id or status in payload');
  END IF;

  SELECT order_id INTO v_order_id FROM payments WHERE id = v_payment_id;
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;

  -- Update the payment record
  UPDATE payments SET
    status = v_new_status,
    provider_payment_id = COALESCE(v_provider_payment_id, provider_payment_id),
    provider_metadata = COALESCE(v_metadata, provider_metadata),
    failure_reason = v_failure_reason,
    paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = v_payment_id;

  -- Cascade to order's payment_status
  IF v_new_status = 'paid' THEN
    UPDATE orders SET payment_status = 'paid' WHERE id = v_order_id;
  ELSIF v_new_status IN ('failed', 'expired', 'canceled') THEN
    UPDATE orders SET payment_status = 'failed' WHERE id = v_order_id AND payment_status <> 'paid';
  ELSIF v_new_status = 'refunded' THEN
    UPDATE orders SET payment_status = 'refunded' WHERE id = v_order_id;
  ELSIF v_new_status = 'processing' THEN
    UPDATE orders SET payment_status = 'processing' WHERE id = v_order_id AND payment_status = 'pending';
  END IF;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'status', v_new_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION process_payment_webhook(text, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION process_payment_webhook(text, text, text, jsonb) TO authenticated;

-- =========================================================
-- 6. create_payment_session RPC
-- =========================================================
CREATE OR REPLACE FUNCTION create_payment_session(
  p_order_id uuid,
  p_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_payment_id uuid;
  v_existing_payment RECORD;
BEGIN
  IF p_method NOT IN ('pix', 'card') THEN
    RETURN jsonb_build_object('error', 'Método de pagamento inválido');
  END IF;

  SELECT id, restaurant_id, total, payment_mode, payment_status, fulfillment, customer_name
  INTO v_order
  FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Pedido não encontrado');
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('error', 'Este pedido já foi pago');
  END IF;

  -- Check for existing pending/processing payment
  SELECT id, status, provider_metadata INTO v_existing_payment
  FROM payments
  WHERE order_id = p_order_id
    AND status IN ('pending', 'processing')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_existing_payment.id,
      'status', v_existing_payment.status,
      'metadata', v_existing_payment.provider_metadata,
      'existing', true
    );
  END IF;

  INSERT INTO payments (order_id, provider, amount, currency, status, method)
  VALUES (p_order_id, 'stripe', v_order.total, 'BRL', 'pending', p_method)
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'amount', v_order.total,
    'currency', 'BRL',
    'method', p_method,
    'status', 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_payment_session(uuid, text) TO anon, authenticated;

-- =========================================================
-- 7. check_payment_status RPC
-- =========================================================
CREATE OR REPLACE FUNCTION check_payment_status(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  SELECT id, status, method, provider_metadata, failure_reason, paid_at
  INTO v_payment
  FROM payments
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_payment', false);
  END IF;

  RETURN jsonb_build_object(
    'has_payment', true,
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'method', v_payment.method,
    'metadata', v_payment.provider_metadata,
    'failure_reason', v_payment.failure_reason,
    'paid_at', v_payment.paid_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_payment_status(uuid) TO anon, authenticated;

-- =========================================================
-- 8. Realtime on payments
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payments' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;
