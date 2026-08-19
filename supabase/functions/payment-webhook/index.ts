import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Stripe-Signature",
};

/**
 * payment-webhook edge function
 *
 * Receives webhook events from Stripe and processes them idempotently.
 *
 * Security:
 * - Verifies Stripe webhook signature using STRIPE_WEBHOOK_SECRET
 * - Idempotent: duplicate events are no-ops (enforced by process_payment_webhook RPC)
 * - All events are logged in webhook_events table
 * - Never creates duplicate payments or orders
 *
 * Required environment secrets:
 *   STRIPE_WEBHOOK_SECRET — Stripe webhook signing secret (whsec_...)
 *   STRIPE_SECRET_KEY — Stripe API key (for verifying payment status if needed)
 *
 * Supported Stripe events:
 *   payment_intent.succeeded → payment status = 'paid', order payment_status = 'paid'
 *   payment_intent.payment_failed → payment status = 'failed'
 *   payment_intent.canceled → payment status = 'canceled'
 *   payment_intent.expired → payment status = 'expired'
 *   charge.refunded → payment status = 'refunded' or 'partially_refunded'
 */

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

// Stripe signature verification using Web Crypto API
async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(",");
    const sigMap: Record<string, string> = {};
    for (const part of parts) {
      const [key, value] = part.split("=");
      sigMap[key] = value;
    }

    const timestamp = sigMap["t"];
    const sig = sigMap["v1"];

    if (!timestamp || !sig) return false;

    // Check timestamp is within 5 minutes
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (age > 300) return false;

    // Compute HMAC-SHA256
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const computedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const computedHex = Array.from(new Uint8Array(computedSig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedHex === sig;
  } catch {
    return false;
  }
}

// Map Stripe event types to payment statuses
function mapStripeStatus(eventType: string, isPartial: boolean): string | null {
  switch (eventType) {
    case "payment_intent.succeeded": return "paid";
    case "payment_intent.payment_failed": return "failed";
    case "payment_intent.canceled": return "canceled";
    case "payment_intent.expired": return "expired";
    case "charge.refunded": return isPartial ? "partially_refunded" : "refunded";
    default: return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if webhook secret is configured
    if (!STRIPE_WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({ error: "webhook_secret_not_configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("Stripe-Signature") || "";

    // Verify signature
    const isValid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "invalid_signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type;
    const stripeEventId = event.id;

    // Extract payment info from the Stripe event
    const paymentIntent = event.data?.object;
    const paymentId = paymentIntent?.metadata?.payment_id;
    const providerPaymentId = paymentIntent?.id;

    if (!paymentId) {
      // No payment_id in metadata — might be a non-Appetito payment
      return new Response(
        JSON.stringify({ received: true, skipped: true, reason: "no_payment_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine new status
    let newStatus: string | null = null;
    let isPartial = false;

    if (eventType === "charge.refunded") {
      // Check if partial refund
      const refundAmount = paymentIntent?.amount_refunded || 0;
      const totalAmount = paymentIntent?.amount || 0;
      isPartial = refundAmount < totalAmount && refundAmount > 0;
      newStatus = mapStripeStatus(eventType, isPartial);
    } else {
      newStatus = mapStripeStatus(eventType, false);
    }

    if (!newStatus) {
      // Unhandled event type — acknowledge but don't process
      return new Response(
        JSON.stringify({ received: true, skipped: true, reason: `unhandled_event: ${eventType}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build payload for process_payment_webhook RPC
    const webhookPayload = {
      payment_id: paymentId,
      status: newStatus,
      provider_payment_id: providerPaymentId,
      metadata: {
        stripe_event_id: stripeEventId,
        stripe_event_type: eventType,
      },
      failure_reason: eventType === "payment_intent.payment_failed"
        ? paymentIntent?.last_payment_error?.message || "Pagamento falhou"
        : null,
    };

    // Call process_payment_webhook RPC with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/process_payment_webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({
        p_provider: "stripe",
        p_event_id: stripeEventId,
        p_event_type: eventType,
        p_payload: webhookPayload,
      }),
    });

    const rpcData = await rpcResponse.json();

    if (!rpcData.success && !rpcData.idempotent_replay) {
      return new Response(
        JSON.stringify({ error: rpcData.error || "Failed to process webhook" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ received: true, processed: true, idempotent: rpcData.idempotent_replay || false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
