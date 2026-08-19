import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import { useOrderRealtime } from '@/lib/useOrderRealtime';
import type { Restaurant, Order, OrderStatus, StaffRole, SubscriptionInfo, RestaurantAnalytics, ProductAnalytics, OrderAnalytics } from '@/types';
import { currency, cn, timeAgo } from '@/lib/utils';
import {
  STATUS_COLUMNS, STATUS_LABELS, STATUS_COLORS,
  primaryNextStatus, SHOW_ANALYTICS_ROLES,
} from '@/lib/constants';import {
  ChevronLeft, DollarSign, Bike, Table, CreditCard, Wallet, TrendingUp,
  Clock, Package, CheckCircle2, ChefHat, Printer, ArrowRight, ShieldOff, UtensilsCrossed,
  Users, LogOut, Bike as DeliveryIcon, XCircle, Loader2, Calendar, BarChart3,
  ShoppingBag, Percent, Timer, AlertCircle, CreditCard as BillingIcon,
} from 'lucide-react';
import { MenuManager } from '@/components/MenuManager';
import { StaffManager } from '@/components/StaffManager';
import { fetchSubscription } from '@/lib/billing';
import { SUBSCRIPTION_STATUS_CONFIG } from '@/lib/constants';
import {
  fetchRestaurantAnalytics, fetchProductAnalytics, fetchOrderAnalytics, fetchPeakHours,
  getDateRange, type DateRange, type PeakHourData,
} from '@/lib/analytics';

const STATUS_ICONS: Partial<Record<OrderStatus, React.ReactNode>> = {
  new: <Clock className="h-4 w-4" />,
  confirmed: <CheckCircle2 className="h-4 w-4" />,
  preparing: <ChefHat className="h-4 w-4" />,
  ready: <Package className="h-4 w-4" />,
  out_for_delivery: <DeliveryIcon className="h-4 w-4" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last_7_days: 'Últimos 7 dias',
  last_30_days: 'Últimos 30 dias',
  custom: 'Personalizado',
};

export function DashboardPage({ slug }: { slug: string }) {
  const { user, signOut } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketPreview, setTicketPreview] = useState<Order | null>(null);
  const [menuManagerOpen, setMenuManagerOpen] = useState(false);
  const [staffManagerOpen, setStaffManagerOpen] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const loadOrders = useCallback(async (restaurantId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders((data as Order[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
      if (!r) { setLoading(false); return; }
      const rest = r as Restaurant;
      setRestaurant(rest);
      await loadOrders(rest.id);
      const sub = await fetchSubscription(rest.id);
      setSubscription(sub);
      setLoading(false);
    })();
  }, [slug, loadOrders]);

  useOrderRealtime(restaurant?.id ?? null, () => {
    if (restaurant) loadOrders(restaurant.id);
  }, () => {
    if (restaurant) loadOrders(restaurant.id);
  });

  const advanceOrder = async (order: Order) => {
    const next = primaryNextStatus(order.status, order.fulfillment);
    if (!next) return;
    setTransitioning(order.id);
    try {
      const { data, error } = await supabase.rpc('transition_order_status', {
        p_order_id: order.id,
        p_new_status: next,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        alert(result?.error ?? 'Erro ao alterar status');
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao alterar status. Tente novamente.');
    } finally {
      setTransitioning(null);
    }
  };

  const cancelOrder = async (order: Order) => {
    if (!confirm('Cancelar este pedido?')) return;
    setTransitioning(order.id);
    try {
      const { data, error } = await supabase.rpc('transition_order_status', {
        p_order_id: order.id,
        p_new_status: 'canceled',
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        alert(result?.error ?? 'Erro ao cancelar pedido');
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'canceled' as OrderStatus } : o)));
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao cancelar. Tente novamente.');
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

  const role = user?.role as StaffRole | undefined;
  const showAnalytics = role ? SHOW_ANALYTICS_ROLES.includes(role) : false;
  const canManageMenu = role === 'Owner' || role === 'Manager' || role === 'Staff';
  const canManageStaff = role === 'Owner';

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
          <h1 className="text-2xl font-bold text-charcoal-900">{restaurant.name} · Painel</h1>
          <p className="text-sm text-charcoal-500">Gerencie pedidos e visualize métricas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageStaff && (
            <button
              onClick={() => setStaffManagerOpen(true)}
              className="flex items-center gap-2 rounded-full bg-charcoal-800 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-charcoal-700"
            >
              <Users className="h-4 w-4" />
              Gerenciar Equipe
            </button>
          )}
          {canManageMenu && (
            <button
              onClick={() => setMenuManagerOpen(true)}
              className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              <UtensilsCrossed className="h-4 w-4" />
              Gerenciar Cardápio
            </button>
          )}
          <div className="flex items-center gap-2 rounded-xl bg-charcoal-50 px-3 py-2">
            <span className="text-sm font-medium text-charcoal-500">{user?.email}</span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-bold',
              showAnalytics ? 'bg-success-100 text-success-700' : 'bg-charcoal-200 text-charcoal-600',
            )}>
              {role}
            </span>
            <button
              onClick={() => signOut()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-200 hover:text-charcoal-700"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className={cn(
        'mb-6 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        showAnalytics ? 'bg-success-50 text-success-700' : 'bg-charcoal-100 text-charcoal-600',
      )}>
        {showAnalytics ? <TrendingUp className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
        {showAnalytics
          ? `Acesso ${role} — métricas financeiras visíveis`
          : `Acesso ${role} — métricas ocultas, apenas quadro operacional`}
      </div>

      {/* Subscription banner */}
      {subscription && ['expired', 'suspended', 'past_due'].includes(subscription.effective_status) && (
        <div className="mb-6 flex items-center justify-between rounded-xl bg-error-50 px-4 py-3 text-sm font-semibold text-error-700">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Assinatura {SUBSCRIPTION_STATUS_CONFIG[subscription.effective_status]?.label ?? 'inativa'}. Novos pedidos estão bloqueados.
          </span>
          {(role === 'Owner' || role === 'Manager') && (
            <button
              onClick={() => navigate(`/billing/${slug}`)}
              className="flex items-center gap-2 rounded-full bg-error-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-error-500"
            >
              <BillingIcon className="h-3.5 w-3.5" /> Reativar
            </button>
          )}
        </div>
      )}
      {subscription && subscription.effective_status === 'trialing' && subscription.trial_end && (
        <div className="mb-6 flex items-center justify-between rounded-xl bg-warning-50 px-4 py-3 text-sm font-semibold text-warning-700">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Trial termina em {new Date(subscription.trial_end).toLocaleDateString('pt-BR')} — plano {subscription.plan_name}
          </span>
          {(role === 'Owner' || role === 'Manager') && (
            <button
              onClick={() => navigate(`/billing/${slug}`)}
              className="flex items-center gap-2 rounded-full bg-warning-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-warning-500"
            >
              <BillingIcon className="h-3.5 w-3.5" /> Ver planos
            </button>
          )}
        </div>
      )}

      {showAnalytics && restaurant && (
        <AnalyticsDashboard restaurantId={restaurant.id} dateRange={dateRange} customStart={customStart} customEnd={customEnd} onDateRangeChange={setDateRange} onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd} />
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-charcoal-900">Quadro de pedidos ao vivo</h2>
        <span className="flex items-center gap-1.5 text-sm text-charcoal-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success-500" /> Tempo real
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STATUS_COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.key);
          return (
            <div key={col.key} className="flex flex-col rounded-2xl border border-charcoal-200 bg-charcoal-50">
              <div className="flex items-center justify-between border-b border-charcoal-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', col.color)}>
                    {STATUS_ICONS[col.key] ?? <Clock className="h-4 w-4" />}
                  </span>
                  <h3 className="text-sm font-bold text-charcoal-800">{col.label}</h3>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-charcoal-600">{colOrders.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: '60vh' }}>
                {colOrders.length === 0 ? (
                  <p className="py-8 text-center text-xs text-charcoal-400">Sem pedidos</p>
                ) : (
                  colOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      transitioning={transitioning === order.id}
                      onAdvance={() => advanceOrder(order)}
                      onCancel={() => cancelOrder(order)}
                      onPrint={() => setTicketPreview(order)}
                      onTrack={() => navigate(`/track/${slug}/${order.id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {ticketPreview && (
        <KitchenTicketModal order={ticketPreview} onClose={() => setTicketPreview(null)} />
      )}

      {menuManagerOpen && restaurant && (
        <MenuManager restaurantId={restaurant.id} onClose={() => setMenuManagerOpen(false)} />
      )}

      {staffManagerOpen && restaurant && (
        <StaffManager restaurantId={restaurant.id} onClose={() => setStaffManagerOpen(false)} />
      )}
    </div>
  );
}

/* ========== Server-side Analytics Dashboard ========== */

function AnalyticsDashboard({ restaurantId, dateRange, customStart, customEnd, onDateRangeChange, onCustomStartChange, onCustomEndChange }: {
  restaurantId: string;
  dateRange: DateRange;
  customStart: string;
  customEnd: string;
  onDateRangeChange: (r: DateRange) => void;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}) {
  const [analytics, setAnalytics] = useState<RestaurantAnalytics | null>(null);
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics | null>(null);
  const [orderAnalytics, setOrderAnalytics] = useState<OrderAnalytics | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHourData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { start, end } = getDateRange(dateRange, customStart, customEnd);
    const [a, p, o, h] = await Promise.all([
      fetchRestaurantAnalytics(restaurantId, start, end),
      fetchProductAnalytics(restaurantId, start, end),
      fetchOrderAnalytics(restaurantId, start, end),
      fetchPeakHours(restaurantId, start, end),
    ]);
    if (!a) { setError(true); setLoading(false); return; }
    setAnalytics(a);
    setProductAnalytics(p);
    setOrderAnalytics(o);
    setPeakHours(h);
    setLoading(false);
  }, [restaurantId, dateRange, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="mb-8 flex items-center justify-center rounded-2xl border border-charcoal-200 bg-white py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
          <p className="text-sm font-medium text-charcoal-500">Calculando métricas...</p>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="mb-8 flex items-center justify-center rounded-2xl border border-error-200 bg-error-50 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-error-400" />
          <p className="text-sm font-semibold text-error-700">Erro ao carregar métricas</p>
          <button onClick={load} className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-500">Tentar novamente</button>
        </div>
      </div>
    );
  }

  const maxPeak = Math.max(...peakHours.map((h) => h.count), 1);

  return (
    <div className="mb-8 animate-slide-up">
      {/* Date filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-charcoal-900">
          <BarChart3 className="h-5 w-5 text-brand-600" />
          Métricas
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => onDateRangeChange(r)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                dateRange === r ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'bg-white border border-charcoal-200 text-charcoal-600 hover:bg-charcoal-50',
              )}
            >
              {DATE_RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {dateRange === 'custom' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-charcoal-50 p-3">
          <Calendar className="h-4 w-4 text-charcoal-400" />
          <input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} className="rounded-lg border border-charcoal-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none" />
          <span className="text-charcoal-400">—</span>
          <input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} className="rounded-lg border border-charcoal-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none" />
          <button onClick={load} className="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-500">Aplicar</button>
        </div>
      )}

      {/* Revenue cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={<DollarSign className="h-5 w-5" />} label="Faturamento" value={currency(analytics.revenue)} accent="bg-brand-600" />
        <MetricCard icon={<ShoppingBag className="h-5 w-5" />} label="Pedidos" value={String(analytics.order_count)} accent="bg-charcoal-700" />
        <MetricCard icon={<CreditCard className="h-5 w-5" />} label="Ticket Médio" value={currency(analytics.avg_ticket)} accent="bg-success-600" />
        <MetricCard icon={<XCircle className="h-5 w-5" />} label="Cancelados" value={String(analytics.canceled_count)} accent="bg-error-600" />
      </div>

      {/* Fulfillment + payment breakdown */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-charcoal-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-charcoal-400">Tipos de Pedido</h3>
          <div className="space-y-3">
            <PaymentBar label="Entrega" count={analytics.delivery_count} revenue={0} total={analytics.delivery_count + analytics.table_count} color="bg-flame-600" icon={<Bike className="h-4 w-4" />} showRevenue={false} />
            <PaymentBar label="Mesa" count={analytics.table_count} revenue={0} total={analytics.delivery_count + analytics.table_count} color="bg-charcoal-700" icon={<Table className="h-4 w-4" />} showRevenue={false} />
          </div>
        </div>
        <div className="rounded-2xl border border-charcoal-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-charcoal-400">Pagamentos</h3>
          <div className="space-y-3">
            <PaymentBar label="Pagar Agora" count={analytics.pay_now_count} revenue={analytics.pay_now_revenue} total={analytics.pay_now_count + analytics.pay_later_count} color="bg-brand-600" icon={<CreditCard className="h-4 w-4" />} />
            <PaymentBar label="Pagar Depois" count={analytics.pay_later_count} revenue={analytics.pay_later_revenue} total={analytics.pay_now_count + analytics.pay_later_count} color="bg-flame-500" icon={<Wallet className="h-4 w-4" />} />
          </div>
        </div>
      </div>

      {/* Order analytics */}
      {orderAnalytics && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={<Timer className="h-5 w-5" />} label="Tempo Médio de Preparo" value={`${orderAnalytics.avg_prep_minutes} min`} accent="bg-info-600" />
          <MetricCard icon={<Bike className="h-5 w-5" />} label="Tempo Médio de Entrega" value={`${orderAnalytics.avg_delivery_minutes} min`} accent="bg-flame-600" />
          <MetricCard icon={<Percent className="h-5 w-5" />} label="Taxa de Cancelamento" value={`${orderAnalytics.cancellation_rate}%`} accent="bg-error-600" />
          <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Taxa de Pagamento" value={`${orderAnalytics.payment_success_rate}%`} accent="bg-success-600" />
        </div>
      )}

      {/* Peak hours */}
      {peakHours.length > 0 && (
        <div className="mt-3 rounded-2xl border border-charcoal-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-charcoal-400">Horários de Pico</h3>
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {peakHours.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-brand-600 transition-all hover:bg-brand-500"
                  style={{ height: `${(h.count / maxPeak) * 100}%`, minHeight: '4px' }}
                  title={`${h.count} pedidos`}
                />
                <span className="text-[10px] font-medium text-charcoal-400">{h.hour}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product analytics */}
      {productAnalytics && productAnalytics.products.length > 0 && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-charcoal-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-charcoal-400">Mais Vendidos</h3>
            <div className="space-y-2">
              {productAnalytics.products.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                    <span className="font-medium text-charcoal-700">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-charcoal-500">
                    <span>{p.quantity}× un</span>
                    <span className="font-semibold text-charcoal-700">{currency(p.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-charcoal-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-charcoal-400">Desempenho por Categoria</h3>
            <div className="space-y-2">
              {productAnalytics.categories.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-charcoal-700">{c.category}</span>
                  <div className="flex items-center gap-3 text-xs text-charcoal-500">
                    <span>{c.quantity}× un</span>
                    <span className="font-semibold text-charcoal-700">{currency(c.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {analytics.order_count === 0 && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-charcoal-200 bg-white py-12 text-center">
          <Package className="h-8 w-8 text-charcoal-300" />
          <p className="text-sm font-semibold text-charcoal-500">Nenhum pedido no período selecionado</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-charcoal-200 bg-white p-5 shadow-sm">
      <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-white', accent)}>{icon}</div>
      <p className="text-2xl font-extrabold text-charcoal-900">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-charcoal-400">{label}</p>
    </div>
  );
}

function PaymentBar({ label, count, revenue, total, color, icon, showRevenue = true }: {
  label: string; count: number; revenue: number; total: number; color: string; icon: React.ReactNode; showRevenue?: boolean;
}) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-charcoal-700">{icon} {label}</span>
        <span className="font-semibold text-charcoal-900">{count}{showRevenue ? ` · ${currency(revenue)}` : ''}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-charcoal-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OrderCard({ order, transitioning, onAdvance, onCancel, onPrint, onTrack }: {
  order: Order; transitioning: boolean; onAdvance: () => void; onCancel: () => void; onPrint: () => void; onTrack: () => void;
}) {
  const next = primaryNextStatus(order.status, order.fulfillment);
  const isTerminal = ['completed', 'canceled', 'rejected', 'payment_failed'].includes(order.status);
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
          <span className={cn(
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            order.fulfillment === 'delivery' ? 'bg-flame-50 text-flame-700' : 'bg-charcoal-100 text-charcoal-600',
          )}>
            {order.fulfillment === 'delivery' ? 'Entrega' : 'Mesa'}
          </span>
        </div>
      </div>

      {order.order_items && order.order_items.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-charcoal-100 pt-2">
          {order.order_items.map((it) => (
            <div key={it.id} className="flex justify-between text-xs text-charcoal-600">
              <span>{it.quantity}× {it.name}</span>
              <span className="font-medium">{currency(it.line_total)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-charcoal-100 pt-2">
        <span className="text-sm font-bold text-charcoal-900">{currency(order.total)}</span>
        <div className="flex items-center gap-1">
          <button onClick={onPrint} className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700" title="Imprimir cupom">
            <Printer className="h-4 w-4" />
          </button>
          <button onClick={onTrack} className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700" title="Rastrear pedido">
            <Package className="h-4 w-4" />
          </button>
          {!isTerminal && (
            <button
              onClick={onCancel}
              disabled={transitioning}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:opacity-50"
              title="Cancelar pedido"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
          {next && (
            <button
              onClick={onAdvance}
              disabled={transitioning}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
            >
              {transitioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
              {STATUS_LABELS[next]}
            </button>
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
