import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import type { Plan, SubscriptionInfo, PlatformMetrics, AdminRestaurantRow, AuditLog } from '@/types';
import { currency, cn } from '@/lib/utils';
import { SUBSCRIPTION_STATUS_CONFIG, FEATURE_LABELS } from '@/lib/constants';
import { fetchPlans, fetchSubscription } from '@/lib/billing';
import {
  ChevronLeft, Crown, Store, CheckCircle2, XCircle, Clock, Plus,
  Pencil, ExternalLink, Loader2, LogOut, CreditCard, Zap, X, Check,
  TrendingUp, Search, ShoppingBag, DollarSign, AlertCircle, ChevronRight,
  ScrollText, Activity,
} from 'lucide-react';
import {
  fetchPlatformMetrics, fetchAdminRestaurants, fetchAuditLogs,
  updateRestaurantSubscriptionStatus,
} from '@/lib/analytics';

type Tab = 'overview' | 'restaurants' | 'plans' | 'subscriptions' | 'audit';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'trialing', label: 'Trial' },
  { value: 'suspended', label: 'Suspensos' },
  { value: 'canceled', label: 'Cancelados' },
];

export function SuperAdminPage() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);

  const loadPlans = useCallback(async () => {
    const planList = await fetchPlans();
    setPlans(planList);
  }, []);

  const loadMetrics = useCallback(async () => {
    const m = await fetchPlatformMetrics();
    setPlatformMetrics(m);
  }, []);

  useEffect(() => {
    loadPlans();
    loadMetrics();
  }, [loadPlans, loadMetrics]);

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="mb-2 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
          >
            <ChevronLeft className="h-4 w-4" /> Início
          </button>
          <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-flame-600 text-white shadow-lg shadow-brand-600/30">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-charcoal-900">Painel Super-Admin</h1>
            <p className="text-sm text-charcoal-500">Gerencie restaurantes, planos e assinaturas</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-charcoal-100 p-1">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<TrendingUp className="h-4 w-4" />} label="Visão Geral" />
        <TabButton active={tab === 'restaurants'} onClick={() => setTab('restaurants')} icon={<Store className="h-4 w-4" />} label="Restaurantes" />
        <TabButton active={tab === 'plans'} onClick={() => setTab('plans')} icon={<CreditCard className="h-4 w-4" />} label="Planos" />
        <TabButton active={tab === 'subscriptions'} onClick={() => setTab('subscriptions')} icon={<Activity className="h-4 w-4" />} label="Assinaturas" />
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={<ScrollText className="h-4 w-4" />} label="Auditoria" />
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <OverviewTab metrics={platformMetrics} onRetry={loadMetrics} />
      )}

      {/* Restaurants tab */}
      {tab === 'restaurants' && (
        <RestaurantsTab onMetricsRefresh={loadMetrics} />
      )}

      {/* Plans tab */}
      {tab === 'plans' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-charcoal-900">Planos</h2>
            <button
              onClick={() => setShowAddPlan(true)}
              className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              <Plus className="h-4 w-4" /> Novo Plano
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-charcoal-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-charcoal-900">{plan.name}</h3>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    plan.is_active ? 'bg-success-100 text-success-700' : 'bg-charcoal-100 text-charcoal-500',
                  )}>
                    {plan.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="mb-3 text-xs text-charcoal-500">{plan.description}</p>
                <div className="mb-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal-400">Mensal</span>
                    <span className="font-bold text-charcoal-900">{plan.monthly_price === 0 ? 'Grátis' : currency(plan.monthly_price)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal-400">Anual</span>
                    <span className="font-bold text-charcoal-900">{plan.yearly_price === 0 ? 'Grátis' : currency(plan.yearly_price)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal-400">Trial</span>
                    <span className="font-bold text-charcoal-900">{plan.trial_duration_days} dias</span>
                  </div>
                </div>
                <div className="mb-3 border-t border-charcoal-100 pt-3">
                  <p className="mb-1.5 text-xs font-bold uppercase text-charcoal-400">Limites</p>
                  <div className="space-y-0.5">
                    {Object.entries(plan.feature_limits).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs text-charcoal-600">
                        {typeof value === 'boolean' ? (
                          value ? <Check className="h-3 w-3 text-success-600" /> : <X className="h-3 w-3 text-charcoal-300" />
                        ) : (
                          <Zap className="h-3 w-3 text-brand-500" />
                        )}
                        {FEATURE_LABELS[key] ?? key}: {typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : value === 999 ? 'Ilimitado' : String(value)}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setEditingPlan(plan)}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-charcoal-200 py-2 text-sm font-semibold text-charcoal-700 transition-colors hover:bg-charcoal-50"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Subscriptions tab */}
      {tab === 'subscriptions' && (
        <SubscriptionsTab />
      )}

      {/* Audit tab */}
      {tab === 'audit' && (
        <AuditTab />
      )}

      {/* Modals */}
      {editingPlan && (
        <EditPlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={() => { setEditingPlan(null); loadPlans(); }}
        />
      )}
      {showAddPlan && (
        <EditPlanModal
          plan={null}
          onClose={() => setShowAddPlan(false)}
          onSaved={() => { setShowAddPlan(false); loadPlans(); }}
        />
      )}
    </div>
  );
}

/* ========== Overview Tab ========== */

function OverviewTab({ metrics, onRetry }: { metrics: PlatformMetrics | null; onRetry: () => void }) {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-charcoal-200 bg-white py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
          <p className="text-sm font-medium text-charcoal-500">Carregando métricas...</p>
        </div>
      </div>
    );
  }

  if (metrics.error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-error-200 bg-error-50 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-error-400" />
        <p className="text-sm font-semibold text-error-700">Erro ao carregar métricas da plataforma</p>
        <button onClick={onRetry} className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-500">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Store className="h-5 w-5" />} label="Total de Restaurantes" value={String(metrics.total_restaurants)} accent="bg-brand-600" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Assinaturas Ativas" value={String(metrics.active_restaurants)} accent="bg-success-600" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Em Trial" value={String(metrics.trial_restaurants)} accent="bg-warning-600" />
        <StatCard icon={<XCircle className="h-5 w-5" />} label="Suspensos" value={String(metrics.suspended_restaurants)} accent="bg-error-600" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="Total de Pedidos" value={String(metrics.total_orders)} accent="bg-charcoal-700" />
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Receita da Plataforma" value={currency(metrics.platform_revenue)} accent="bg-brand-600" />
        <StatCard icon={<XCircle className="h-5 w-5" />} label="Restaurantes Cancelados" value={String(metrics.canceled_restaurants)} accent="bg-charcoal-600" />
      </div>

      {metrics.subscription_metrics.length > 0 && (
        <div className="mt-3 rounded-2xl border border-charcoal-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-charcoal-400">Assinaturas por Plano</h3>
          <div className="space-y-2">
            {metrics.subscription_metrics.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium text-charcoal-700">{s.plan_name}</span>
                <span className="rounded-full bg-charcoal-100 px-3 py-0.5 text-xs font-bold text-charcoal-700">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Restaurants Tab (Paginated + Searchable) ========== */

function RestaurantsTab({ onMetricsRefresh }: { onMetricsRefresh: () => void }) {
  const [restaurants, setRestaurants] = useState<AdminRestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<AdminRestaurantRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchAdminRestaurants(page, 20, search || undefined, statusFilter || undefined);
    if (result) {
      setRestaurants(result.restaurants);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-charcoal-900">Restaurantes <span className="text-sm font-normal text-charcoal-400">({total})</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal-400" />
            <input
              placeholder="Buscar..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="rounded-full border border-charcoal-200 py-2 pl-9 pr-4 text-sm focus:border-brand-600 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-full border border-charcoal-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
        </div>
      ) : restaurants.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-charcoal-200 bg-white py-16 text-center">
          <Store className="h-8 w-8 text-charcoal-300" />
          <p className="text-sm font-semibold text-charcoal-500">Nenhum restaurante encontrado</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-charcoal-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-charcoal-200 bg-charcoal-50 text-left text-xs font-bold uppercase tracking-wide text-charcoal-400">
                    <th className="px-4 py-3">Restaurante</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Pedidos</th>
                    <th className="px-4 py-3">Receita</th>
                    <th className="px-4 py-3">Aberto</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {restaurants.map((r) => {
                    const sc = SUBSCRIPTION_STATUS_CONFIG[r.subscription_status ?? 'active'] ?? SUBSCRIPTION_STATUS_CONFIG.active;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-charcoal-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold text-charcoal-900">{r.name}</p>
                          <p className="text-xs text-charcoal-400">/{r.slug}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', sc.color)}>
                            <span className={cn('h-2 w-2 rounded-full', sc.dot)} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-charcoal-600">{r.order_count}</td>
                        <td className="px-4 py-3 text-sm font-medium text-charcoal-700">{currency(r.revenue)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('flex h-2.5 w-2.5 rounded-full', r.is_open ? 'bg-success-500' : 'bg-charcoal-300')} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => navigate(`/r/${r.slug}`)} className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700" title="Ver vitrine">
                              <ExternalLink className="h-4 w-4" />
                            </button>
                            <button onClick={() => navigate(`/dashboard/${r.slug}`)} className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700" title="Painel do restaurante">
                              <Store className="h-4 w-4" />
                            </button>
                            <button onClick={() => setEditing(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700" title="Gerenciar assinatura">
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-charcoal-200 text-charcoal-600 transition-colors hover:bg-charcoal-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-charcoal-600">Página {page} de {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-charcoal-200 text-charcoal-600 transition-colors hover:bg-charcoal-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditSubscriptionModal
          restaurant={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onMetricsRefresh(); }}
        />
      )}
    </>
  );
}

/* ========== Subscriptions Tab ========== */

function SubscriptionsTab() {
  const [restaurants, setRestaurants] = useState<AdminRestaurantRow[]>([]);
  const [subDetails, setSubDetails] = useState<Record<string, SubscriptionInfo | null>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await fetchAdminRestaurants(1, 50);
    if (result) setRestaurants(result.restaurants);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSubDetails = useCallback(async (restaurantId: string) => {
    const sub = await fetchSubscription(restaurantId);
    setSubDetails((prev) => ({ ...prev, [restaurantId]: sub }));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-charcoal-900">Assinaturas</h2>
      <div className="overflow-hidden rounded-2xl border border-charcoal-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal-200 bg-charcoal-50 text-left text-xs font-bold uppercase tracking-wide text-charcoal-400">
                <th className="px-4 py-3">Restaurante</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trial</th>
                <th className="px-4 py-3">Renovação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal-100">
              {restaurants.map((r) => {
                const sub = subDetails[r.id];
                const status = sub?.effective_status ?? r.subscription_status ?? 'active';
                const sc = SUBSCRIPTION_STATUS_CONFIG[status] ?? SUBSCRIPTION_STATUS_CONFIG.active;
                return (
                  <tr key={r.id} className="transition-colors hover:bg-charcoal-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-charcoal-900">{r.name}</p>
                      <p className="text-xs text-charcoal-400">/{r.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      {sub ? (
                        <span className="text-sm font-semibold text-charcoal-700">{sub.plan_name}</span>
                      ) : (
                        <span className="text-sm text-charcoal-400">Sem plano</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', sc.color)}>
                        <span className={cn('h-2 w-2 rounded-full', sc.dot)} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal-600">
                      {sub?.trial_end ? new Date(sub.trial_end).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal-600">
                      {sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!sub && (
                          <button
                            onClick={() => loadSubDetails(r.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700"
                            title="Carregar assinatura"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/billing/${r.slug}`)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700"
                          title="Gerenciar assinatura"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ========== Audit Tab ========== */

function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchAuditLogs(page, 20);
    if (result) {
      setLogs(result.logs);
      setTotalPages(result.total_pages);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const ACTION_LABELS: Record<string, string> = {
    update_subscription_status: 'Atualizou status de assinatura',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-charcoal-200 bg-white py-16 text-center">
        <ScrollText className="h-8 w-8 text-charcoal-300" />
        <p className="text-sm font-semibold text-charcoal-500">Nenhum registro de auditoria ainda</p>
        <p className="text-xs text-charcoal-400">Ações administrativas aparecerão aqui</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-charcoal-900">Registro de Auditoria</h2>
      <div className="space-y-2">
        {logs.map((log) => {
          const meta = log.metadata as Record<string, unknown>;
          return (
            <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-charcoal-200 bg-white p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-charcoal-100 text-charcoal-500">
                <ScrollText className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-charcoal-900">{log.actor_email}</p>
                  <span className="text-xs text-charcoal-400">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-sm text-charcoal-600">{ACTION_LABELS[log.action] ?? log.action}</p>
                {log.entity_type && (
                  <p className="mt-0.5 text-xs text-charcoal-400">
                    Entidade: {log.entity_type}
                    {meta?.restaurant_name ? ` · ${meta.restaurant_name}` : ''}
                  </p>
                )}
                {meta?.old_status !== undefined && meta?.new_status !== undefined && (
                  <p className="mt-0.5 text-xs text-charcoal-400">
                    Status: {String(meta.old_status)} → {String(meta.new_status)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-charcoal-200 text-charcoal-600 transition-colors hover:bg-charcoal-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-charcoal-600">Página {page} de {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-charcoal-200 text-charcoal-600 transition-colors hover:bg-charcoal-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

/* ========== Shared components ========== */

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
        active ? 'bg-white text-charcoal-900 shadow-sm' : 'text-charcoal-500 hover:text-charcoal-700',
      )}
    >
      {icon} {label}
    </button>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-charcoal-200 bg-white p-5 shadow-sm">
      <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-white', accent)}>{icon}</div>
      <p className="text-2xl font-extrabold text-charcoal-900">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-charcoal-400">{label}</p>
    </div>
  );
}

/* ========== Edit Subscription Modal ========== */

function EditSubscriptionModal({ restaurant, onClose, onSaved }: {
  restaurant: AdminRestaurantRow; onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState<string>(restaurant.subscription_status ?? 'active');
  const [isOpen, setIsOpen] = useState(restaurant.is_open);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateRestaurantSubscriptionStatus(restaurant.id, status, isOpen);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="text-lg font-bold text-charcoal-900">Gerenciar Assinatura</h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className="mb-1 text-sm font-bold text-charcoal-900">{restaurant.name}</p>
            <p className="text-xs text-charcoal-400">/{restaurant.slug}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-charcoal-400">Status da Assinatura</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="active">Ativa</option>
              <option value="trial">Trial</option>
              <option value="trialing">Trialing</option>
              <option value="suspended">Suspensa</option>
              <option value="past_due">Pagamento Atrasado</option>
              <option value="paused">Pausada</option>
              <option value="canceled">Cancelada</option>
              <option value="expired">Expirada</option>
            </select>
          </div>
          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600" />
            <span className="text-sm font-medium text-charcoal-700">Restaurante aberto para pedidos</span>
          </label>
        </div>
        <div className="border-t border-charcoal-100 p-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========== Edit/Create Plan Modal ========== */

function EditPlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    monthly_price: plan?.monthly_price?.toString() ?? '0',
    yearly_price: plan?.yearly_price?.toString() ?? '0',
    trial_duration_days: plan?.trial_duration_days?.toString() ?? '14',
    is_active: plan?.is_active ?? true,
    sort_order: plan?.sort_order?.toString() ?? '0',
    max_staff: plan?.feature_limits?.max_staff?.toString() ?? '5',
    max_products: plan?.feature_limits?.max_products?.toString() ?? '50',
    max_orders_per_month: plan?.feature_limits?.max_orders_per_month?.toString() ?? '500',
    max_locations: plan?.feature_limits?.max_locations?.toString() ?? '1',
    advanced_analytics: plan?.feature_limits?.advanced_analytics ?? false,
    delivery_features: plan?.feature_limits?.delivery_features ?? true,
    kitchen_display: plan?.feature_limits?.kitchen_display ?? false,
    priority_support: plan?.feature_limits?.priority_support ?? false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const featureLimits = {
      max_staff: parseInt(form.max_staff) || 0,
      max_products: parseInt(form.max_products) || 0,
      max_orders_per_month: parseInt(form.max_orders_per_month) || 0,
      max_locations: parseInt(form.max_locations) || 1,
      advanced_analytics: form.advanced_analytics,
      delivery_features: form.delivery_features,
      kitchen_display: form.kitchen_display,
      priority_support: form.priority_support,
    };
    const payload = {
      name: form.name,
      description: form.description || null,
      monthly_price: parseFloat(form.monthly_price) || 0,
      yearly_price: parseFloat(form.yearly_price) || 0,
      trial_duration_days: parseInt(form.trial_duration_days) || 0,
      is_active: form.is_active,
      sort_order: parseInt(form.sort_order) || 0,
      feature_limits: featureLimits,
    };

    if (plan) {
      await supabase.from('plans').update(payload).eq('id', plan.id);
    } else {
      await supabase.from('plans').insert(payload);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="text-lg font-bold text-charcoal-900">{plan ? 'Editar Plano' : 'Novo Plano'}</h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700">✕</button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          <FormField label="Nome" placeholder="Ex: Professional" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <FormField label="Descrição" placeholder="Ex: Para restaurantes em crescimento" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Preço Mensal (R$)" placeholder="49.90" value={form.monthly_price} onChange={(v) => setForm((f) => ({ ...f, monthly_price: v }))} />
            <FormField label="Preço Anual (R$)" placeholder="499.00" value={form.yearly_price} onChange={(v) => setForm((f) => ({ ...f, yearly_price: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Trial (dias)" placeholder="14" value={form.trial_duration_days} onChange={(v) => setForm((f) => ({ ...f, trial_duration_days: v }))} />
            <FormField label="Ordem" placeholder="0" value={form.sort_order} onChange={(v) => setForm((f) => ({ ...f, sort_order: v }))} />
          </div>

          <div className="border-t border-charcoal-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase text-charcoal-400">Limites de Recursos</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Máx. Equipe" placeholder="5" value={form.max_staff} onChange={(v) => setForm((f) => ({ ...f, max_staff: v }))} />
              <FormField label="Máx. Produtos" placeholder="50" value={form.max_products} onChange={(v) => setForm((f) => ({ ...f, max_products: v }))} />
              <FormField label="Máx. Pedidos/mês" placeholder="500" value={form.max_orders_per_month} onChange={(v) => setForm((f) => ({ ...f, max_orders_per_month: v }))} />
              <FormField label="Máx. Unidades" placeholder="1" value={form.max_locations} onChange={(v) => setForm((f) => ({ ...f, max_locations: v }))} />
            </div>
          </div>

          <div className="border-t border-charcoal-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase text-charcoal-400">Recursos</p>
            <div className="space-y-2">
              <ToggleField label="Analytics Avançado" checked={form.advanced_analytics} onChange={(v) => setForm((f) => ({ ...f, advanced_analytics: v }))} />
              <ToggleField label="Funcionalidades de Entrega" checked={form.delivery_features} onChange={(v) => setForm((f) => ({ ...f, delivery_features: v }))} />
              <ToggleField label="Tela da Cozinha" checked={form.kitchen_display} onChange={(v) => setForm((f) => ({ ...f, kitchen_display: v }))} />
              <ToggleField label="Suporte Prioritário" checked={form.priority_support} onChange={(v) => setForm((f) => ({ ...f, priority_support: v }))} />
            </div>
          </div>

          <label className="flex items-center gap-2.5 border-t border-charcoal-100 pt-3">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600" />
            <span className="text-sm font-medium text-charcoal-700">Plano ativo (visível para restaurantes)</span>
          </label>
        </div>
        <div className="border-t border-charcoal-100 p-5">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {plan ? 'Salvar alterações' : 'Criar plano'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">{label}</label>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600" />
      <span className="text-sm font-medium text-charcoal-700">{label}</span>
    </label>
  );
}
