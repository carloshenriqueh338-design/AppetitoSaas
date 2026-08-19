import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useCart } from '@/context/CartContext';
import { createPaymentSession, pollPaymentStatus } from '@/lib/payment';
import { checkClientRateLimit } from '@/lib/rateLimit';
import type { Restaurant, Fulfillment, PaymentMode, PaymentMethod, PaymentStatusResult } from '@/types';
import { currency, cn, uid } from '@/lib/utils';
import {
  ChevronLeft, Bike, Table, CreditCard, Wallet, CheckCircle2,
  User, Phone, MapPin, Hash, Lock, MessageCircle, Loader2, Receipt,
  AlertCircle, Clock, Copy, Check,
} from 'lucide-react';

type CheckoutPhase = 'form' | 'paying' | 'payment_failed' | 'success';

export function CheckoutPage({ slug, table }: { slug: string; table?: string }) {
  const { items, subtotal, clear } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(table ? 'table' : 'delivery');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('pay_now');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('pix');
  const [form, setForm] = useState({ name: '', phone: '', address: '', tableNumber: table ?? '' });
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<CheckoutPhase>('form');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ qrCode?: string; copyPaste?: string } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const idempotencyKeyRef = useRef<string>(uid());
  const stopPollingRef = useRef<(() => void) | null>(null);

  const tableLocked = !!table;
  const deliveryFee = fulfillment === 'delivery' ? (restaurant?.delivery_fee ?? 5) : 0;
  const deliveryMinimum = restaurant?.delivery_minimum_order ?? 0;
  const meetsDeliveryMinimum = fulfillment !== 'delivery' || subtotal >= deliveryMinimum;
  const total = subtotal + deliveryFee;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
      if (data) setRestaurant(data as Restaurant);
    })();
  }, [slug]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (stopPollingRef.current) stopPollingRef.current();
    };
  }, []);

  const canSubmit =
    items.length > 0 &&
    form.name.trim() &&
    form.phone.trim() &&
    (fulfillment === 'table' ? form.tableNumber.trim() : form.address.trim()) &&
    meetsDeliveryMinimum;

  const handlePaymentStatusUpdate = useCallback((result: PaymentStatusResult) => {
    if (result.status) setPaymentStatus(result.status);

    if (result.status === 'paid') {
      setPhase('success');
      clear();
      if (stopPollingRef.current) stopPollingRef.current();
    } else if (result.status === 'failed') {
      setPhase('payment_failed');
      setPaymentError(result.failure_reason || 'Pagamento falhou');
      if (stopPollingRef.current) stopPollingRef.current();
    } else if (result.status === 'expired') {
      setPhase('payment_failed');
      setPaymentError('O tempo do pagamento expirou. Tente novamente.');
      if (stopPollingRef.current) stopPollingRef.current();
    } else if (result.status === 'canceled') {
      setPhase('payment_failed');
      setPaymentError('O pagamento foi cancelado.');
      if (stopPollingRef.current) stopPollingRef.current();
    }
  }, [clear]);

  const handleSubmit = async () => {
    if (!restaurant || !canSubmit) return;
    if (!checkClientRateLimit('order_submit', 5, 60000)) {
      setPaymentError('Muitos pedidos em pouco tempo. Aguarde 1 minuto e tente novamente.');
      return;
    }
    setSubmitting(true);
    setPaymentError(null);
    try {
      // Step 1: Create the order
      const { data, error } = await supabase.rpc('create_order', {
        p_restaurant_slug: slug,
        p_fulfillment: fulfillment,
        p_payment_mode: paymentMode,
        p_customer_name: form.name,
        p_customer_phone: form.phone,
        p_address: fulfillment === 'delivery' ? form.address : null,
        p_table_number: fulfillment === 'table' ? form.tableNumber : null,
        p_items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          selected_modifiers: i.selected_modifiers,
        })),
        p_idempotency_key: idempotencyKeyRef.current,
      });

      if (error) throw error;

      const result = data as { success?: boolean; order_id?: string; error?: string; idempotent_replay?: boolean };
      if (!result?.success || result.error) {
        throw new Error(result?.error ?? 'Erro desconhecido');
      }

      const newOrderId = result.order_id ?? null;
      setOrderId(newOrderId);

      // Step 2: If pay_later, go straight to success
      if (paymentMode === 'pay_later') {
        setPhase('success');
        clear();
        return;
      }

      // Step 3: If pay_now, create payment session via edge function
      setPhase('paying');
      const session = await createPaymentSession(newOrderId!, payMethod);

      if (!session.success) {
        if (session.error === 'payment_provider_not_configured') {
          // Provider not configured — show message but still let order go through as pay_later
          setPaymentError(session.message || 'Provedor de pagamento não configurado. O pedido foi criado como pagamento na entrega.');
          setPhase('success');
          clear();
          return;
        }
        setPhase('payment_failed');
        setPaymentError(session.message || 'Erro ao criar pagamento');
        return;
      }

      // Step 4: Display provider data (Pix QR code or card redirect)
      if (payMethod === 'pix' && session.metadata) {
        setPixData({
          qrCode: session.metadata.pix_qr_code,
          copyPaste: session.metadata.pix_copy_paste,
        });
      }

      // Step 5: Start polling for payment status
      stopPollingRef.current = pollPaymentStatus(newOrderId!, handlePaymentStatusUpdate);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setPaymentError(`Erro ao enviar seu pedido: ${msg}. Tente novamente.`);
      setPhase('form');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setPhase('form');
    setPaymentError(null);
    setPixData(null);
    setPaymentStatus(null);
    // Generate a new idempotency key for the retry
    idempotencyKeyRef.current = uid();
  };

  // Success screen
  if (phase === 'success' && orderId) {
    return (
      <div className="animate-fade-in mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success-100">
          <CheckCircle2 className="h-10 w-10 text-success-600" />
        </div>
        <h1 className="text-2xl font-bold text-charcoal-900">Pedido realizado!</h1>
        <p className="mt-2 text-charcoal-500">
          {paymentMode === 'pay_later' || paymentStatus !== 'paid'
            ? fulfillment === 'delivery'
              ? 'Pague na entrega — tenha dinheiro ou cartão pronto quando o pedido chegar.'
              : 'Seus itens foram enviados para a cozinha. Acerte no caixa quando terminar.'
            : 'Seu pagamento foi confirmado. A cozinha está preparando seu pedido agora.'}
        </p>
        {paymentError && (
          <div className="mt-3 rounded-xl bg-warning-50 px-4 py-2 text-sm text-warning-700">
            {paymentError}
          </div>
        )}
        <div className="mt-6 rounded-2xl border border-charcoal-100 bg-white p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal-500">Nº do pedido</span>
            <span className="font-mono font-semibold text-charcoal-700">{orderId.slice(0, 8)}</span>
          </div>
          {fulfillment === 'table' && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-charcoal-500">Mesa</span>
              <span className="font-semibold text-charcoal-700">{form.tableNumber}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => navigate(`/track/${slug}/${orderId}`)}
          className="mt-4 w-full rounded-full bg-charcoal-800 px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-charcoal-700"
        >
          Acompanhar meu pedido
        </button>
        <button
          onClick={() => navigate(`/r/${slug}`)}
          className="mt-3 rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-500"
        >
          Voltar ao cardápio
        </button>
      </div>
    );
  }

  // Payment failed screen
  if (phase === 'payment_failed') {
    return (
      <div className="animate-fade-in mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-error-100">
          <AlertCircle className="h-10 w-10 text-error-600" />
        </div>
        <h1 className="text-2xl font-bold text-charcoal-900">Pagamento falhou</h1>
        <p className="mt-2 text-charcoal-500">{paymentError}</p>
        {orderId && (
          <div className="mt-4 rounded-2xl border border-charcoal-100 bg-white p-4 text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal-500">Nº do pedido</span>
              <span className="font-mono font-semibold text-charcoal-700">{orderId.slice(0, 8)}</span>
            </div>
            <p className="mt-2 text-xs text-charcoal-400">Seu pedido foi criado mas o pagamento não foi confirmado. Tente pagar novamente.</p>
          </div>
        )}
        <button
          onClick={handleRetry}
          className="mt-6 rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-500"
        >
          Tentar novamente
        </button>
        {orderId && (
          <button
            onClick={() => navigate(`/track/${slug}/${orderId}`)}
            className="mt-3 rounded-full bg-charcoal-100 px-6 py-3 font-semibold text-charcoal-700 transition-colors hover:bg-charcoal-200"
          >
            Acompanhar pedido mesmo assim
          </button>
        )}
      </div>
    );
  }

  // Paying screen (waiting for payment confirmation)
  if (phase === 'paying' && orderId) {
    return (
      <div className="animate-fade-in mx-auto max-w-md px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-charcoal-900">Pagamento</h1>
        <p className="mb-6 text-sm text-charcoal-500">Pedido #{orderId.slice(0, 8)} · {currency(total)}</p>

        {payMethod === 'pix' && (
          <div className="rounded-2xl border border-charcoal-200 bg-white p-6">
            {pixData?.qrCode ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 overflow-hidden rounded-xl border border-charcoal-200 bg-white p-4">
                  <img src={pixData.qrCode} alt="QR Code Pix" className="h-48 w-48" />
                </div>
                <p className="text-sm font-semibold text-charcoal-700">Escaneie o QR Code para pagar</p>
                <p className="mt-1 text-xs text-charcoal-400">ou copie o código abaixo</p>

                {pixData.copyPaste && (
                  <div className="mt-3 w-full">
                    <div className="flex items-center gap-2 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3">
                      <code className="flex-1 truncate text-xs text-charcoal-600">{pixData.copyPaste}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(pixData.copyPaste!);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-500"
                        title="Copiar código"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando confirmação do pagamento...
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-brand-600" />
                <p className="text-sm text-charcoal-500">Gerando QR Code Pix...</p>
              </div>
            )}
          </div>
        )}

        {payMethod === 'card' && (
          <div className="rounded-2xl border border-charcoal-200 bg-white p-6">
            <div className="flex flex-col items-center py-8">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-brand-600" />
              <p className="text-sm font-semibold text-charcoal-700">Processando pagamento com cartão...</p>
              <p className="mt-1 text-xs text-charcoal-400">Aguarde a confirmação</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-charcoal-50 px-4 py-3 text-xs text-charcoal-500">
          <Clock className="h-4 w-4 shrink-0" />
          O pagamento é confirmado automaticamente. Não feche esta página.
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold text-charcoal-700">Seu carrinho está vazio.</p>
        <button onClick={() => navigate(`/r/${slug}`)} className="mt-4 text-brand-600 font-semibold">Ver o cardápio</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <button
        onClick={() => navigate(`/r/${slug}`)}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar ao cardápio
      </button>

      <h1 className="mb-6 text-2xl font-bold text-charcoal-900">Finalizar Pedido</h1>

      {/* Step 1: Fulfillment */}
      <Section number={1} title="Como você deseja receber seu pedido?">
        <div className="grid grid-cols-2 gap-3">
          {restaurant?.delivery_enabled !== false && (
            <ChoiceCard
              active={fulfillment === 'delivery'}
              onClick={() => !tableLocked && setFulfillment('delivery')}
              disabled={tableLocked}
              icon={<Bike className="h-6 w-6" />}
              title="Entrega (Delivery)"
              subtitle={`Taxa: ${currency(restaurant?.delivery_fee ?? 5)}`}
            />
          )}
          {restaurant?.table_ordering_enabled !== false && (
            <ChoiceCard
              active={fulfillment === 'table'}
              onClick={() => setFulfillment('table')}
              icon={<Table className="h-6 w-6" />}
              title="Pedido na Mesa"
              subtitle="Comer no local"
            />
          )}
          {restaurant?.pickup_enabled && (
            <ChoiceCard
              active={fulfillment === 'table'}
              onClick={() => setFulfillment('table')}
              icon={<Table className="h-6 w-6" />}
              title="Retirada"
              subtitle="No balcão"
            />
          )}
        </div>
        {fulfillment === 'delivery' && !meetsDeliveryMinimum && deliveryMinimum > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-warning-50 px-4 py-3 text-sm font-medium text-warning-700">
            <AlertCircle className="h-4 w-4" />
            Pedido mínimo para entrega: {currency(deliveryMinimum)} · Faltam {currency(deliveryMinimum - subtotal)}
          </div>
        )}
      </Section>

      {/* Step 2: Details */}
      <Section number={2} title="Seus dados">
        <div className="space-y-3">
          <Field icon={<User className="h-4 w-4" />} placeholder="Nome completo" value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field icon={<Phone className="h-4 w-4" />} placeholder="Telefone" type="tel" value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />

          {fulfillment === 'delivery' ? (
            <Field icon={<MapPin className="h-4 w-4" />} placeholder="Endereço de entrega" value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
          ) : (
            <Field
              icon={<Hash className="h-4 w-4" />}
              placeholder="Número da mesa"
              value={form.tableNumber}
              onChange={(v) => setForm((f) => ({ ...f, tableNumber: v }))}
              disabled={tableLocked}
              suffix={tableLocked ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-flame-600">
                  <Lock className="h-3 w-3" /> Bloqueada
                </span>
              ) : undefined}
            />
          )}
        </div>
      </Section>

      {/* Step 3: Payment */}
      <Section number={3} title="Forma de pagamento">
        <div className="grid grid-cols-2 gap-3">
          <ChoiceCard
            active={paymentMode === 'pay_now'}
            onClick={() => setPaymentMode('pay_now')}
            icon={<CreditCard className="h-6 w-6" />}
            title="Pagar Agora pelo App (Pix/Cartão)"
            subtitle="Pix ou cartão"
          />
          <ChoiceCard
            active={paymentMode === 'pay_later'}
            onClick={() => setPaymentMode('pay_later')}
            icon={<Wallet className="h-6 w-6" />}
            title="Pagar no Caixa / Na Entrega"
            subtitle={fulfillment === 'delivery' ? 'Pagar na entrega' : 'Pagar no caixa'}
          />
        </div>

        {paymentMode === 'pay_now' && (
          <div className="mt-4 animate-slide-up">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPayMethod('pix')}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-4 transition-all',
                  payMethod === 'pix' ? 'border-brand-600 bg-brand-50' : 'border-charcoal-200 hover:border-charcoal-300',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-500 text-white font-bold text-sm">Pix</div>
                <div className="text-left">
                  <p className="text-sm font-bold text-charcoal-900">Pix</p>
                  <p className="text-xs text-charcoal-500">Pagamento instantâneo</p>
                </div>
              </button>
              <button
                onClick={() => setPayMethod('card')}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-4 transition-all',
                  payMethod === 'card' ? 'border-brand-600 bg-brand-50' : 'border-charcoal-200 hover:border-charcoal-300',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-charcoal-800 text-white">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-charcoal-900">Cartão</p>
                  <p className="text-xs text-charcoal-500">Crédito / débito</p>
                </div>
              </button>
            </div>
            <p className="mt-3 text-xs text-charcoal-400">
              O pagamento é processado com segurança pelo Stripe. Seus dados de cartão nunca passam pelo nosso servidor.
            </p>
          </div>
        )}

        {paymentMode === 'pay_later' && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-flame-200 bg-flame-50 p-4">
            <Wallet className="h-5 w-5 shrink-0 text-flame-600" />
            <p className="text-sm text-flame-800">
              {fulfillment === 'delivery'
                ? 'Você pagará o entregador quando o pedido chegar (Pagar na Entrega).'
                : 'Os itens serão enviados à cozinha e adicionados à conta da mesa — acerte no caixa quando estiver pronto.'}
            </p>
          </div>
        )}
      </Section>

      {/* Order summary */}
      <Section number={4} title="Resumo do pedido">
        <div className="rounded-2xl border border-charcoal-100 bg-white p-4">
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-charcoal-600">
                  {i.quantity}× {i.name}
                  {i.selected_modifiers.length > 0 && (
                    <span className="block text-xs text-charcoal-400">
                      {i.selected_modifiers.map((m) => m.name).join(', ')}
                    </span>
                  )}
                </span>
                <span className="font-semibold text-charcoal-800">{currency(i.line_total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 border-t border-charcoal-100 pt-3">
            <Row label="Subtotal" value={currency(subtotal)} />
            {fulfillment === 'delivery' && <Row label="Taxa de entrega" value={currency(deliveryFee)} />}
            <div className="flex justify-between pt-1">
              <span className="font-bold text-charcoal-900">Total</span>
              <span className="text-lg font-bold text-brand-600">{currency(total)}</span>
            </div>
          </div>
        </div>

        {/* WhatsApp generator */}
        <button
          onClick={() => {
            const msg = `*New Order — ${restaurant?.name}*\n\n` +
              items.map((i) => `• ${i.quantity}× ${i.name} — ${currency(i.line_total)}`).join('\n') +
              `\n\n*Total: ${currency(total)}*\n` +
              `Fulfillment: ${fulfillment}\n` +
              `Name: ${form.name}\nPhone: ${form.phone}` +
              (fulfillment === 'delivery' ? `\nAddress: ${form.address}` : `\nTable: ${form.tableNumber}`);
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-success-300 bg-success-50 py-3 font-semibold text-success-700 transition-colors hover:bg-success-100"
        >
          <MessageCircle className="h-5 w-5" />
          Enviar pedido via WhatsApp
        </button>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            'mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-semibold text-white shadow-lg transition-all',
            canSubmit && !submitting
              ? 'bg-brand-600 shadow-brand-600/30 hover:bg-brand-500'
              : 'cursor-not-allowed bg-charcoal-300 shadow-none',
          )}
        >
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Processando...</>
          ) : (
            <><Receipt className="h-5 w-5" /> Confirmar pedido · {currency(total)}</>
          )}
        </button>
      </Section>
    </div>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{number}</span>
        <h2 className="text-lg font-bold text-charcoal-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ChoiceCard({ active, onClick, disabled, icon, title, subtitle }: {
  active: boolean; onClick: () => void; disabled?: boolean; icon: React.ReactNode; title: string; subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1 rounded-2xl border-2 p-4 text-center transition-all',
        active ? 'border-brand-600 bg-brand-50' : 'border-charcoal-200 bg-white hover:border-charcoal-300',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className={cn('flex h-12 w-12 items-center justify-center rounded-xl', active ? 'bg-brand-600 text-white' : 'bg-charcoal-100 text-charcoal-500')}>
        {icon}
      </span>
      <span className="mt-1 text-sm font-bold text-charcoal-900">{title}</span>
      <span className="text-xs text-charcoal-500">{subtitle}</span>
    </button>
  );
}

function Field({ icon, placeholder, value, onChange, type = 'text', disabled, suffix }: {
  icon: React.ReactNode; placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; disabled?: boolean; suffix?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal-400">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-xl border border-charcoal-200 py-3 pl-11 pr-4 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600',
          disabled && 'bg-charcoal-50 text-charcoal-500',
          suffix && 'pr-24',
        )}
      />
      {suffix && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{suffix}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-charcoal-500">{label}</span>
      <span className="font-medium text-charcoal-700">{value}</span>
    </div>
  );
}
