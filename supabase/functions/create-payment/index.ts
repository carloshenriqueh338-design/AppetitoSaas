import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * create-payment edge function
 *
 * Creates a payment session with the configured payment provider (Stripe).
 * Called by the frontend after an order is created with payment_mode = 'pay_now'.
 *
 * Flow:
 * 1. Frontend creates order via create_order RPC
 * 2. Frontend calls this edge function with { order_id, method: 'pix' | 'card' }
 * 3. This function:
 *    a. Calls create_payment_session RPC to create a payments row
 *    b. Calls Stripe API to create a PaymentIntent (card) or PaymentIntent with Pix (Pix)
 *    c. Updates the payment row with provider_payment_id and provider_metadata
 *    d. Returns the provider data (client_secret for card, QR code for Pix)
 *
 * Required environment secrets (configure in Supabase dashboard):
 *   STRIPE_SECRET_KEY — Stripe API secret key (sk_test_... or sk_live_...)
 *
 * If STRIPE_SECRET_KEY is not configured, returns a structured error so the
 * frontend can show "payment provider not configured" to the user.
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if Stripe is configured
    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({
          error: "payment_provider_not_configured",
          message: "O provedor de pagamento não está configurado. Entre em contato com o restaurante.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { order_id, method } = body;

    if (!order_id || !method) {
      return new Response(
        JSON.stringify({ error: "Missing order_id or method" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create supabase client using the service role key (from Authorization header)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization")!;
    const apiKey = req.headers.get("apikey") || authHeader.replace("Bearer ", "");

    // Step 1: Create payment record via RPC
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/create_payment_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": apiKey,
      },
      body: JSON.stringify({ p_order_id: order_id, p_method: method }),
    });

    const rpcData = await rpcResponse.json();

    if (!rpcData.success) {
      return new Response(
        JSON.stringify({ error: rpcData.error || "Failed to create payment session" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const paymentId = rpcData.payment_id;
    const amount = Math.round(rpcData.amount * 100); // Stripe expects cents

    // Step 2: Create Stripe PaymentIntent
    const stripePayload: Record<string, unknown> = {
      amount,
      currency: "brl",
      payment_method_types: method === "pix" ? ["pix"] : ["card"],
      metadata: {
        order_id,
        payment_id: paymentId,
        appetito_payment: "true",
      },
      description: `Pedido Appetito ${order_id.slice(0, 8)}`,
    };

    const stripeResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(
        Object.entries(stripePayload).map(([k, v]) => [k, String(v)]),
      ),
    });

    const stripeData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      // Update payment to failed
      await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({
          status: "failed",
          failure_reason: stripeData.error?.message || "Stripe error",
        }),
      });

      return new Response(
        JSON.stringify({
          error: "stripe_error",
          message: stripeData.error?.message || "Erro ao criar pagamento no Stripe",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 3: Update payment record with Stripe data
    const providerMetadata: Record<string, unknown> = {
      stripe_payment_intent_id: stripeData.id,
      client_secret: stripeData.client_secret,
    };

    if (method === "pix") {
      // For Pix, Stripe returns a payment method data with QR code info
      // The next_action contains the Pix QR code data
      if (stripeData.next_action?.pix_display_qr_code) {
        providerMetadata.pix_qr_code = stripeData.next_action.pix_display_qr_code.image_url_png;
        providerMetadata.pix_copy_paste = stripeData.next_action.pix_display_qr_code.copy_paste_code;
        providerMetadata.pix_expires_at = stripeData.next_action.pix_display_qr_code.expires_at;
      }
    }

    await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({
        provider_payment_id: stripeData.id,
        provider_metadata: providerMetadata,
        status: "processing",
      }),
    });

    // Step 4: Return provider data to frontend
    return new Response(
      JSON.stringify({
        success: true,
        payment_id: paymentId,
        provider_payment_id: stripeData.id,
        client_secret: stripeData.client_secret,
        method,
        metadata: providerMetadata,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
