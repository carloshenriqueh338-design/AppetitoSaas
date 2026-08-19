import { supabase } from '@/lib/supabase';
import type { PaymentSession, PaymentStatusResult, PaymentMethod } from '@/types';

/**
 * Payment service — talks to the create-payment edge function and the
 * check_payment_status RPC. The actual Stripe integration lives in the
 * edge function; this service handles the frontend side.
 *
 * Flow for "pay now":
 * 1. Order is created via create_order RPC (returns order_id)
 * 2. This service calls the create-payment edge function with { order_id, method }
 * 3. The edge function creates a Stripe PaymentIntent and returns provider data
 * 4. For Pix: display QR code + copy-paste code, poll for payment status
 * 5. For Card: redirect to Stripe Checkout or use Stripe Elements with client_secret
 * 6. The webhook edge function receives Stripe events and updates payment status
 * 7. This service polls check_payment_status RPC to detect when payment is confirmed
 */

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`;

export async function createPaymentSession(
  orderId: string,
  method: PaymentMethod,
): Promise<PaymentSession> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? '';

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ order_id: orderId, method }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      payment_id: '',
      method,
      metadata: null,
      error: data.error || 'payment_failed',
      message: data.message || 'Erro ao criar pagamento',
    };
  }

  return data as PaymentSession;
}

export async function checkPaymentStatus(orderId: string): Promise<PaymentStatusResult> {
  const { data, error } = await supabase.rpc('check_payment_status', {
    p_order_id: orderId,
  });

  if (error) {
    return { has_payment: false };
  }

  return data as PaymentStatusResult;
}

/**
 * Polls payment status until it reaches a terminal state (paid, failed, expired, canceled)
 * or the timeout expires. Calls onUpdate on each poll with the latest status.
 *
 * @param orderId The order ID to check
 * @param onUpdate Callback called with each status update
 * @param intervalMs Polling interval in milliseconds (default 3000)
 * @param timeoutMs Total timeout in milliseconds (default 300000 = 5 min)
 * @returns A cleanup function to stop polling
 */
export function pollPaymentStatus(
  orderId: string,
  onUpdate: (result: PaymentStatusResult) => void,
  intervalMs = 3000,
  timeoutMs = 300000,
): () => void {
  let stopped = false;
  const startTime = Date.now();

  const poll = async () => {
    if (stopped) return;

    if (Date.now() - startTime > timeoutMs) {
      stopped = true;
      onUpdate({ has_payment: false, status: 'expired', failure_reason: 'Tempo limite excedido' });
      return;
    }

    const result = await checkPaymentStatus(orderId);
    onUpdate(result);

    if (result.status && ['paid', 'failed', 'expired', 'canceled', 'refunded'].includes(result.status)) {
      stopped = true;
      return;
    }

    if (!stopped) {
      setTimeout(poll, intervalMs);
    }
  };

  poll();

  return () => { stopped = true; };
}
