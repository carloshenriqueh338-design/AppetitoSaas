import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useSEO } from '@/lib/seo';
import type { Restaurant, Order, OrderStatus, PaymentStatus } from '@/types';
import { currency, cn, timeAgo } from '@/lib/utils';
import { STATUS_LABELS, ESTIMATED_PREP } from '@/lib/constants';
import { NOTIFICATION_EVENT_LABELS, NOTIFICATION_EVENT_ICONS } from '@/lib/notifications';
import type { Notification } from '@/types';
import {
  ChevronLeft, Clock, ChefHat, Package, Bike, CheckCircle2, XCircle,
  CreditCard, Wallet, Receipt,
} from 'lucide-react';

const STATUS_ICONS: Partial<Record<OrderStatus, React.ReactNode>> = {
  new: <Clock className="h-6 w-6" />,
  confirmed: <CheckCircle2 className="h-6 w-6" />,
  preparing: <ChefHat className="h-6 w-6" />,
  ready: <Package className="h-6 w-6" />,
  out_for_delivery: <Bike className="h-6 w-6" />,
  completed: <CheckCircle2 className="h-6 w-6" />,
  canceled: <XCircle className="h-6 w-6" />,
  rejected: <XCircle className="h-6 w-6" />,
  payment_failed: <XCircle className="h-6 w-6" />,
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Pago',
  pending: 'Pendente',
  processing: 'Processando',
  failed: 'Falhou',
  expired: 'Expirado',
  refunded: 'Reembolsado',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-success-100 text-success-700',
  pending: 'bg-warning-100 text-warning-700',
  processing: 'bg-info-100 text-info-700',
  failed: 'bg-error-100 text-error-700',
  expired: 'bg-error-100 text-error-700',
  refunded: 'bg-charcoal-200 text-charcoal-600',
};

// Ordered stages for the progress bar
const DELIVERY_STAGES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'];
const TABLE_STAGES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'completed'];

export function OrderTrackingPage({ slug, orderId }: { slug: string; orderId: string }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications] = useState<Notification[]>([]);

  const loadOrder = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (err || !data) {
      setError('Pedido não encontrado.');
      return;
    }
    setOrder(data as Order);
  }, [orderId]);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
      if (r) setRestaurant(r as Restaurant);
      await loadOrder();
      setLoading(false);
    })();
  }, [slug, loadOrder]);

  // Realtime subscription for this specific order
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => { loadOrder(); },
      )
      .subscribe();

    // Fallback polling
    const interval = setInterval(loadOrder, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [orderId, loadOrder]);

  useSEO({
    title: order ? `Pedido #${order.id.slice(0, 8)} — ${restaurant?.name ?? 'Appetito SaaS'}` : 'Pedido — Appetito SaaS',
    description: order ? `Acompanhe o status do seu pedido em tempo real. Status atual: ${STATUS_LABELS[order.status]}.` : 'Acompanhe o status do seu pedido em tempo real.',
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <XCircle className="mx-auto mb-4 h-12 w-12 text-charcoal-300" />
        <p className="text-lg font-semibold text-charcoal-700">{error ?? 'Pedido não encontrado.'}</p>
        <button onClick={() => navigate(`/r/${slug}`)} className="mt-4 text-brand-600 font-semibold">Ver o cardápio</button>
      </div>
    );
  }

  const isDelivery = order.fulfillment === 'delivery';
  const stages = isDelivery ? DELIVERY_STAGES : TABLE_STAGES;
  const currentStageIndex = stages.indexOf(order.status);
  const isTerminal = ['completed', 'canceled', 'rejected', 'payment_failed'].includes(order.status);
  const isCancelled = ['canceled', 'rejected', 'payment_failed'].includes(order.status);

  // Estimated remaining time
  let estimatedRemaining = 0;
  if (!isTerminal) {
    for (let i = currentStageIndex; i < stages.length - 1; i++) {
      estimatedRemaining += ESTIMATED_PREP[stages[i]] ?? 0;
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <button
        onClick={() => navigate(`/r/${slug}`)}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar ao cardápio
      </button>

      <div className="rounded-3xl border border-charcoal-200 bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className={cn(
            'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full',
            isCancelled ? 'bg-error-100 text-error-600' :
            order.status === 'completed' ? 'bg-success-100 text-success-600' :
            'bg-brand-100 text-brand-600',
          )}>
            {STATUS_ICONS[order.status]}
          </div>
          <h1 className="text-2xl font-bold text-charcoal-900">{STATUS_LABELS[order.status]}</h1>
          <p className="mt-1 font-mono text-sm text-charcoal-400">Pedido #{order.id.slice(0, 8)}</p>
          <p className="mt-1 text-xs text-charcoal-500">{restaurant?.name}</p>
        </div>

        {/* Estimated time */}
        {!isTerminal && estimatedRemaining > 0 && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
            <Clock className="h-4 w-4" />
            Tempo estimado restante: ~{estimatedRemaining} min
          </div>
        )}

        {isCancelled && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-error-50 px-4 py-3 text-sm font-semibold text-error-700">
            <XCircle className="h-4 w-4" />
            Este pedido foi {STATUS_LABELS[order.status].toLowerCase()}.
          </div>
        )}

        {/* Progress bar */}
        {!isCancelled && (
          <div className="mb-6">
            <div className="flex items-center justify-between">
              {stages.map((stage, i) => (
                <div key={stage} className="flex flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    {i > 0 && (
                      <div className={cn('h-1 flex-1 rounded-full', i <= currentStageIndex ? 'bg-brand-500' : 'bg-charcoal-200')} />
                    )}
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                      i < currentStageIndex ? 'bg-brand-500 text-white' :
                      i === currentStageIndex ? 'bg-brand-600 text-white ring-4 ring-brand-100' :
                      'bg-charcoal-200 text-charcoal-400',
                    )}>
                      {i < currentStageIndex ? '✓' : i + 1}
                    </div>
                    {i < stages.length - 1 && (
                      <div className={cn('h-1 flex-1 rounded-full', i < currentStageIndex ? 'bg-brand-500' : 'bg-charcoal-200')} />
                    )}
                  </div>
                  <span className={cn(
                    'mt-1.5 text-center text-[10px] font-medium leading-tight',
                    i <= currentStageIndex ? 'text-charcoal-700' : 'text-charcoal-400',
                  )}>
                    {STATUS_LABELS[stage]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order details */}
        <div className="space-y-3 rounded-2xl border border-charcoal-100 bg-charcoal-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal-500">Tipo</span>
            <span className="flex items-center gap-1 font-semibold text-charcoal-700">
              {isDelivery ? <><Bike className="h-4 w-4 text-flame-600" /> Entrega</> : <><Receipt className="h-4 w-4 text-charcoal-600" /> Mesa {order.table_number}</>}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal-500">Pagamento</span>
            <span className="flex items-center gap-1 font-semibold text-charcoal-700">
              {order.payment_mode === 'pay_now' ? <><CreditCard className="h-4 w-4" /> Pelo App</> : <><Wallet className="h-4 w-4" /> Na entrega/caixa</>}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal-500">Status do pagamento</span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              PAYMENT_STATUS_COLORS[order.payment_status as PaymentStatus] ?? 'bg-warning-100 text-warning-700',
            )}>
              {PAYMENT_STATUS_LABELS[order.payment_status as PaymentStatus] ?? 'Pendente'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal-500">Feito há</span>
            <span className="font-semibold text-charcoal-700">{timeAgo(order.created_at)}</span>
          </div>
        </div>

        {/* Items */}
        {order.order_items && order.order_items.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-charcoal-700">Itens do pedido</h3>
            <div className="space-y-1.5 rounded-2xl border border-charcoal-100 bg-white p-4">
              {order.order_items.map((it) => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span className="text-charcoal-600">
                    {it.quantity}× {it.name}
                    {it.modifiers && it.modifiers.length > 0 && (
                      <span className="block text-xs text-charcoal-400">
                        {it.modifiers.map((m) => m.name).join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-charcoal-800">{currency(it.line_total)}</span>
                </div>
              ))}
              <div className="mt-3 space-y-1 border-t border-charcoal-100 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-500">Subtotal</span>
                  <span className="font-medium text-charcoal-700">{currency(order.subtotal)}</span>
                </div>
                {isDelivery && (
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal-500">Taxa de entrega</span>
                    <span className="font-medium text-charcoal-700">{currency(order.delivery_fee)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1">
                  <span className="font-bold text-charcoal-900">Total</span>
                  <span className="font-bold text-brand-600">{currency(order.total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification timeline */}
        {notifications.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-charcoal-700">Histórico de atualizações</h3>
            <div className="space-y-2 rounded-2xl border border-charcoal-100 bg-white p-4">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-center gap-3 text-sm">
                  <span className="text-lg">{NOTIFICATION_EVENT_ICONS[n.event_type] ?? '🔔'}</span>
                  <div className="flex-1">
                    <p className="font-medium text-charcoal-700">{NOTIFICATION_EVENT_LABELS[n.event_type] ?? n.event_type}</p>
                    <p className="text-xs text-charcoal-400">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {order.status === 'completed' && (
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate(`/r/${slug}`)}
              className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-500"
            >
              Fazer novo pedido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
