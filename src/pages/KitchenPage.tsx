import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import { useOrderRealtime } from '@/lib/useOrderRealtime';
import type { Restaurant, Order, OrderStatus } from '@/types';
import { currency, cn, timeAgo } from '@/lib/utils';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';
import {
  ChevronLeft, ChefHat, Clock, Package, CheckCircle2, Printer,
  ArrowRight, LogOut, Loader2, UtensilsCrossed, Bike,
} from 'lucide-react';

const KITCHEN_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready'];

export function KitchenPage({ slug }: { slug: string }) {
  const { user, signOut } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketOrder, setTicketOrder] = useState<Order | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const loadOrders = useCallback(async (restaurantId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurantId)
      .in('status', KITCHEN_STATUSES)
      .order('created_at', { ascending: true });
    setOrders((data as Order[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
      if (!r) { setLoading(false); return; }
      const rest = r as Restaurant;
      setRestaurant(rest);
      await loadOrders(rest.id);
      setLoading(false);
    })();
  }, [slug, loadOrders]);

  // Realtime + polling fallback
  useOrderRealtime(restaurant?.id ?? null, () => {
    // On any realtime event, reload orders
    if (restaurant) loadOrders(restaurant.id);
  }, () => {
    if (restaurant) loadOrders(restaurant.id);
  });

  const transitionOrder = async (orderId: string, newStatus: OrderStatus) => {
    setTransitioning(orderId);
    try {
      const { data, error } = await supabase.rpc('transition_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        alert(result?.error ?? 'Erro ao alterar status do pedido');
        return;
      }
      // Update local state immediately
      setOrders((prev) =>
        KITCHEN_STATUSES.includes(newStatus)
          ? prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
          : prev.filter((o) => o.id !== orderId)
      );
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao alterar status. Tente novamente.');
    } finally {
      setTransitioning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold text-charcoal-700">Restaurante não encontrado.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-brand-600 font-semibold">Voltar ao início</button>
      </div>
    );
  }

  const newOrders = orders.filter((o) => o.status === 'new');
  const preparingOrders = orders.filter((o) => o.status === 'preparing' || o.status === 'confirmed');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => navigate('/')}
            className="mb-2 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
          >
            <ChevronLeft className="h-4 w-4" /> Início
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-500 text-white shadow-lg shadow-warning-500/30">
              <ChefHat className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-charcoal-900">Cozinha · {restaurant.name}</h1>
              <p className="text-sm text-charcoal-500">Pedidos em tempo real</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-charcoal-50 px-3 py-2">
          <span className="text-sm font-medium text-charcoal-500">{user?.email}</span>
          <button
            onClick={() => signOut()}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-200 hover:text-charcoal-700"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-50 px-4 py-2.5 text-sm font-semibold text-success-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-success-500" /> Atualização em tempo real
      </div>

      {/* Three columns: New, Preparing, Ready */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* New Orders */}
        <KitchenColumn
          title="Novos Pedidos"
          icon={<Clock className="h-5 w-5" />}
          color="bg-charcoal-100 text-charcoal-700"
          count={newOrders.length}
        >
          {newOrders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              transitioning={transitioning === order.id}
              onAccept={() => transitionOrder(order.id, 'confirmed')}
              onPrint={() => setTicketOrder(order)}
              actionLabel="Aceitar"
              actionIcon={<ArrowRight className="h-3 w-3" />}
              actionColor="bg-brand-600 hover:bg-brand-500"
            />
          ))}
        </KitchenColumn>

        {/* Preparing */}
        <KitchenColumn
          title="Em Preparo"
          icon={<UtensilsCrossed className="h-5 w-5" />}
          color="bg-warning-100 text-warning-700"
          count={preparingOrders.length}
        >
          {preparingOrders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              transitioning={transitioning === order.id}
              onAccept={() => transitionOrder(order.id, 'ready')}
              onPrint={() => setTicketOrder(order)}
              actionLabel="Marcar Pronto"
              actionIcon={<CheckCircle2 className="h-3 w-3" />}
              actionColor="bg-flame-600 hover:bg-flame-500"
            />
          ))}
        </KitchenColumn>

        {/* Ready */}
        <KitchenColumn
          title="Pronto"
          icon={<Package className="h-5 w-5" />}
          color="bg-success-100 text-success-700"
          count={readyOrders.length}
        >
          {readyOrders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              transitioning={transitioning === order.id}
              onPrint={() => setTicketOrder(order)}
              fulfillment={order.fulfillment}
              showReadyBadge
            />
          ))}
        </KitchenColumn>
      </div>

      {ticketOrder && (
        <KitchenTicketModal order={ticketOrder} onClose={() => setTicketOrder(null)} />
      )}
    </div>
  );
}

function KitchenColumn({ title, icon, color, count, children }: {
  title: string; icon: React.ReactNode; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-charcoal-200 bg-charcoal-50">
      <div className="flex items-center justify-between border-b border-charcoal-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', color)}>{icon}</span>
          <h3 className="text-sm font-bold text-charcoal-800">{title}</h3>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-charcoal-600">{count}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: '70vh' }}>
        {count === 0 ? (
          <p className="py-8 text-center text-xs text-charcoal-400">Sem pedidos</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function KitchenOrderCard({ order, transitioning, onAccept, onPrint, actionLabel, actionIcon, actionColor, showReadyBadge, fulfillment }: {
  order: Order;
  transitioning: boolean;
  onAccept?: () => void;
  onPrint: () => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  actionColor?: string;
  showReadyBadge?: boolean;
  fulfillment?: string;
}) {
  return (
    <div className="rounded-xl border border-charcoal-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs font-bold text-charcoal-400">#{order.id.slice(0, 8)}</p>
          <p className="text-sm font-bold text-charcoal-900">
            {order.fulfillment === 'table' ? `Mesa ${order.table_number}` : order.customer_name}
          </p>
          <p className="text-xs text-charcoal-500">{timeAgo(order.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_COLORS[order.status])}>
            {STATUS_LABELS[order.status]}
          </span>
          {order.fulfillment === 'delivery' ? (
            <span className="flex items-center gap-0.5 text-xs text-flame-600"><Bike className="h-3 w-3" /> Entrega</span>
          ) : (
            <span className="text-xs text-charcoal-500">Mesa</span>
          )}
        </div>
      </div>

      {order.order_items && order.order_items.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-charcoal-100 pt-2">
          {order.order_items.map((it) => (
            <div key={it.id}>
              <div className="flex justify-between text-sm text-charcoal-700">
                <span className="font-semibold">{it.quantity}× {it.name}</span>
              </div>
              {it.modifiers && it.modifiers.length > 0 && (
                <ul className="ml-4 list-disc text-xs text-charcoal-500">
                  {it.modifiers.map((m, i) => <li key={i}>{m.name}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {order.notes && (
        <div className="mt-2 rounded-lg bg-flame-50 px-2 py-1.5 text-xs text-flame-700">
          <span className="font-semibold">Obs: </span>{order.notes}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-charcoal-100 pt-2">
        <span className="text-sm font-bold text-charcoal-900">{currency(order.total)}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrint}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700"
            title="Imprimir cupom"
          >
            <Printer className="h-4 w-4" />
          </button>
          {onAccept && actionLabel && (
            <button
              onClick={onAccept}
              disabled={transitioning}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50',
                actionColor,
              )}
            >
              {transitioning ? <Loader2 className="h-3 w-3 animate-spin" /> : actionIcon}
              {actionLabel}
            </button>
          )}
          {showReadyBadge && (
            <span className="flex items-center gap-1 rounded-lg bg-success-100 px-2.5 py-1.5 text-xs font-semibold text-success-700">
              {fulfillment === 'delivery' ? 'Aguardando entregador' : 'Aguardando retirada'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KitchenTicketModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal-900">
            <Printer className="h-5 w-5 text-brand-600" /> Cupom da Cozinha
          </h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700">✕</button>
        </div>
        <div className="p-5">
          <div className="rounded-lg border-2 border-dashed border-charcoal-300 p-4 font-mono text-sm">
            <div className="text-center">
              <p className="font-bold uppercase tracking-wide">Pedido da Cozinha</p>
              <p className="text-xs text-charcoal-500">#{order.id.slice(0, 8)}</p>
              <p className="mt-1 text-xs">
                {order.fulfillment === 'table' ? `MESA ${order.table_number}` : 'ENTREGA'}
              </p>
              <p className="text-xs text-charcoal-500">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
            </div>
            <div className="my-3 border-t border-dashed border-charcoal-300" />
            <div className="space-y-2">
              {order.order_items?.map((it) => (
                <div key={it.id}>
                  <div className="flex justify-between font-bold">
                    <span>{it.quantity}× {it.name}</span>
                  </div>
                  {it.modifiers && it.modifiers.length > 0 && (
                    <ul className="ml-4 list-disc text-xs text-charcoal-600">
                      {it.modifiers.map((m, i) => <li key={i}>{m.name}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {order.notes && (
              <>
                <div className="my-3 border-t border-dashed border-charcoal-300" />
                <p className="text-xs"><span className="font-bold">Obs:</span> {order.notes}</p>
              </>
            )}
            <div className="my-3 border-t border-dashed border-charcoal-300" />
            <div className="text-center text-xs text-charcoal-500">
              {order.customer_name} · {order.customer_phone ?? '—'}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-charcoal-800 py-3 font-semibold text-white transition-colors hover:bg-charcoal-700"
          >
            <Printer className="h-5 w-5" /> Imprimir cupom
          </button>
        </div>
      </div>
    </div>
  );
}
