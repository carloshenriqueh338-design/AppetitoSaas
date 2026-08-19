import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import {
  fetchPlans, fetchSubscription, startSubscription,
  changePlan, cancelSubscription,
} from '@/lib/billing';
import type { Restaurant, Plan, SubscriptionInfo } from '@/types';
import { currency, cn } from '@/lib/utils';
import { SUBSCRIPTION_STATUS_CONFIG, FEATURE_LABELS } from '@/lib/constants';
import {
  ChevronLeft, CreditCard, Check, X, Loader2, AlertCircle, Calendar,
  TrendingUp, Zap, Crown, LogOut, ArrowUpRight, ArrowDownRight, XCircle,
} from 'lucide-react';

export function BillingPage({ slug }: { slug: string }) {
  const { user, signOut } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'start' | 'upgrade' | 'downgrade' | 'cancel' | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
    if (!r) { setLoading(false); return; }
    const rest = r as Restaurant;
    setRestaurant(rest);

    const [planList, subInfo] = await Promise.all([
      fetchPlans(),
      fetchSubscription(rest.id),
    ]);
    setPlans(planList);
    setSubscription(subInfo);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const handleStart = async (plan: Plan) => {
    if (!restaurant) return;
    setActionLoading(true);
    setError(null);
    const result = await startSubscription(restaurant.id, plan.id, billingCycle);
    if (result.success) {
      setSuccessMsg('Assinatura criada! Seu período de trial começou.');
      setConfirmAction(null);
      await load();
    } else {
      setError(result.error || 'Erro ao criar assinatura');
    }
    setActionLoading(false);
  };

  const handleUpgrade = async (plan: Plan) => {
    if (!restaurant) return;
    setActionLoading(true);
    setError(null);
    const result = await changePlan(restaurant.id, plan.id);
    if (result.success) {
      setSuccessMsg(`Plano alterado para ${plan.name}!`);
      setConfirmAction(null);
      await load();
    } else {
      setError(result.error || 'Erro ao alterar plano');
    }
    setActionLoading(false);
  };

  const handleCancel = async () => {
    if (!restaurant) return;
    setActionLoading(true);
    setError(null);
    const result = await cancelSubscription(restaurant.id);
    if (result.success) {
      setSuccessMsg(result.message || 'Assinatura cancelada. Seus dados foram preservados.');
      setConfirmAction(null);
      await load();
    } else {
      setError(result.error || 'Erro ao cancelar assinatura');
    }
    setActionLoading(false);
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

  const subStatus = subscription?.effective_status ?? 'active';
  const statusConfig = SUBSCRIPTION_STATUS_CONFIG[subStatus] ?? SUBSCRIPTION_STATUS_CONFIG.active;
  const hasActiveSub = subscription?.has_subscription && !['canceled', 'expired'].includes(subStatus);
  const currentPlanId = subscription?.plan_id;

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => navigate(`/dashboard/${slug}`)}
            className="mb-2 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
          >
            <ChevronLeft className="h-4 w-4" /> Painel
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-charcoal-900">Assinatura e Planos</h1>
              <p className="text-sm text-charcoal-500">{restaurant.name}</p>
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

      {/* Alerts */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-700">
          <Check className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Current subscription card */}
      {subscription && (
        <div className="mb-8 rounded-2xl border border-charcoal-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-bold text-charcoal-900">Plano Atual</h2>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', statusConfig.color)}>
                  <span className={cn('h-2 w-2 rounded-full', statusConfig.dot)} />
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-charcoal-900">{subscription.plan_name}</p>
              {subscription.monthly_price !== undefined && subscription.monthly_price > 0 && (
                <p className="mt-1 text-sm text-charcoal-500">
                  {currency(subscription.billing_cycle === 'yearly' ? subscription.yearly_price ?? 0 : subscription.monthly_price)} / {subscription.billing_cycle === 'yearly' ? 'ano' : 'mês'}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {subscription.trial_end && (
                <InfoItem icon={<Calendar className="h-4 w-4" />} label="Trial termina em" value={new Date(subscription.trial_end).toLocaleDateString('pt-BR')} />
              )}
              {subscription.current_period_end && (
                <InfoItem icon={<Calendar className="h-4 w-4" />} label="Próxima renovação" value={new Date(subscription.current_period_end).toLocaleDateString('pt-BR')} />
              )}
              {subscription.renewal_date && (
                <InfoItem icon={<TrendingUp className="h-4 w-4" />} label="Renovação" value={new Date(subscription.renewal_date).toLocaleDateString('pt-BR')} />
              )}
              {subscription.canceled_at && (
                <InfoItem icon={<XCircle className="h-4 w-4" />} label="Cancelado em" value={new Date(subscription.canceled_at).toLocaleDateString('pt-BR')} />
              )}
            </div>
          </div>

          {/* Feature limits display */}
          {subscription.feature_limits && Object.keys(subscription.feature_limits).length > 0 && (
            <div className="mt-4 border-t border-charcoal-100 pt-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-charcoal-400">Recursos do plano</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(subscription.feature_limits).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 rounded-lg bg-charcoal-50 px-3 py-2">
                    {typeof value === 'boolean' ? (
                      value ? (
                        <Check className="h-4 w-4 shrink-0 text-success-600" />
                      ) : (
                        <X className="h-4 w-4 shrink-0 text-charcoal-300" />
                      )
                    ) : (
                      <Zap className="h-4 w-4 shrink-0 text-brand-500" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-charcoal-600">{FEATURE_LABELS[key] ?? key}</p>
                      <p className="text-xs font-bold text-charcoal-900">
                        {typeof value === 'boolean' ? (value ? 'Incluso' : 'Não incluso') : value === 999 ? 'Ilimitado' : String(value)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancel button */}
          {hasActiveSub && !['canceled', 'expired'].includes(subStatus) && (
            <div className="mt-4 border-t border-charcoal-100 pt-4">
              <button
                onClick={() => setConfirmAction('cancel')}
                className="flex items-center gap-2 rounded-full border border-error-200 px-4 py-2 text-sm font-semibold text-error-600 transition-colors hover:bg-error-50"
              >
                <XCircle className="h-4 w-4" /> Cancelar assinatura
              </button>
            </div>
          )}
        </div>
      )}

      {/* Billing cycle toggle */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <button
          onClick={() => setBillingCycle('monthly')}
          className={cn(
            'rounded-full px-5 py-2 text-sm font-semibold transition-all',
            billingCycle === 'monthly' ? 'bg-brand-600 text-white shadow-md' : 'bg-charcoal-100 text-charcoal-600 hover:bg-charcoal-200',
          )}
        >
          Mensal
        </button>
        <button
          onClick={() => setBillingCycle('yearly')}
          className={cn(
            'rounded-full px-5 py-2 text-sm font-semibold transition-all',
            billingCycle === 'yearly' ? 'bg-brand-600 text-white shadow-md' : 'bg-charcoal-100 text-charcoal-600 hover:bg-charcoal-200',
          )}
        >
          Anual <span className="text-xs opacity-80">(2 meses grátis)</span>
        </button>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isUpgrade = subscription && plans.findIndex(p => p.id === plan.id) > plans.findIndex(p => p.id === currentPlanId);
          const isDowngrade = subscription && plans.findIndex(p => p.id === plan.id) < plans.findIndex(p => p.id === currentPlanId);
          const price = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price;

          return (
            <div key={plan.id} className={cn(
              'relative flex flex-col rounded-2xl border-2 bg-white p-5 transition-all',
              isCurrent ? 'border-brand-600 ring-2 ring-brand-100' : 'border-charcoal-200 hover:border-charcoal-300',
            )}>
              {isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
                  Plano Atual
                </span>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-charcoal-900">{plan.name}</h3>
                <p className="mt-1 text-xs text-charcoal-500">{plan.description}</p>
              </div>
              <div className="mb-4">
                <p className="text-3xl font-extrabold text-charcoal-900">{price === 0 ? 'Grátis' : currency(price)}</p>
                <p className="text-xs text-charcoal-400">/ {billingCycle === 'yearly' ? 'ano' : 'mês'}</p>
              </div>

              <div className="mb-4 flex-1 space-y-1.5">
                {Object.entries(plan.feature_limits).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {typeof value === 'boolean' ? (
                      value ? <Check className="h-3.5 w-3.5 shrink-0 text-success-600" /> : <X className="h-3.5 w-3.5 shrink-0 text-charcoal-300" />
                    ) : (
                      <Check className="h-3.5 w-3.5 shrink-0 text-success-600" />
                    )}
                    <span className="text-charcoal-600">
                      {typeof value === 'boolean' ? FEATURE_LABELS[key] : `${value === 999 ? 'Ilimitado' : value} ${FEATURE_LABELS[key] ?? key}`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action button */}
              {isCurrent ? (
                <button disabled className="w-full cursor-default rounded-full bg-charcoal-100 py-3 text-sm font-semibold text-charcoal-500">
                  Seu plano atual
                </button>
              ) : !hasActiveSub ? (
                <button
                  onClick={() => { setSelectedPlan(plan); setConfirmAction('start'); }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
                >
                  <Crown className="h-4 w-4" /> Iniciar Trial
                </button>
              ) : isUpgrade ? (
                <button
                  onClick={() => { setSelectedPlan(plan); setConfirmAction('upgrade'); }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
                >
                  <ArrowUpRight className="h-4 w-4" /> Fazer Upgrade
                </button>
              ) : isDowngrade ? (
                <button
                  onClick={() => { setSelectedPlan(plan); setConfirmAction('downgrade'); }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-charcoal-300 bg-white py-3 text-sm font-semibold text-charcoal-700 transition-all hover:bg-charcoal-50"
                >
                  <ArrowDownRight className="h-4 w-4" /> Fazer Downgrade
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Confirmation modal */}
      {confirmAction && selectedPlan && (
        <ConfirmModal
          action={confirmAction}
          plan={selectedPlan}
          billingCycle={billingCycle}
          loading={actionLoading}
          onConfirm={() => {
            if (confirmAction === 'start') handleStart(selectedPlan);
            else if (confirmAction === 'upgrade' || confirmAction === 'downgrade') handleUpgrade(selectedPlan);
            else if (confirmAction === 'cancel') handleCancel();
          }}
          onClose={() => { setConfirmAction(null); setSelectedPlan(null); }}
        />
      )}

      {confirmAction === 'cancel' && (
        <ConfirmModal
          action="cancel"
          plan={null}
          billingCycle={billingCycle}
          loading={actionLoading}
          onConfirm={handleCancel}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-charcoal-400">{icon}</span>
      <div>
        <p className="text-xs text-charcoal-400">{label}</p>
        <p className="font-semibold text-charcoal-700">{value}</p>
      </div>
    </div>
  );
}

function ConfirmModal({ action, plan, billingCycle, loading, onConfirm, onClose }: {
  action: 'start' | 'upgrade' | 'downgrade' | 'cancel';
  plan: Plan | null;
  billingCycle: 'monthly' | 'yearly';
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const title = action === 'start' ? 'Iniciar Trial' : action === 'upgrade' ? 'Fazer Upgrade' : action === 'downgrade' ? 'Fazer Downgrade' : 'Cancelar Assinatura';
  const message = action === 'cancel'
    ? 'Sua assinatura será cancelada. Seus dados serão preservados, mas novos pedidos serão bloqueados. Você pode reativar a qualquer momento.'
    : action === 'start'
    ? `Você começará um trial gratuito de ${plan?.trial_duration_days ?? 14} dias no plano ${plan?.name}.`
    : `Seu plano será alterado para ${plan?.name}. A cobrança será ajustada no próximo ciclo.`;
  const buttonLabel = action === 'start' ? 'Iniciar Trial' : action === 'upgrade' ? 'Confirmar Upgrade' : action === 'downgrade' ? 'Confirmar Downgrade' : 'Cancelar Assinatura';
  const buttonColor = action === 'cancel' ? 'bg-error-600 hover:bg-error-500' : 'bg-brand-600 hover:bg-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="text-lg font-bold text-charcoal-900">{title}</h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700">✕</button>
        </div>
        <div className="p-5">
          <p className="text-sm text-charcoal-600">{message}</p>
          {plan && (
            <div className="mt-4 rounded-xl bg-charcoal-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-charcoal-900">{plan.name}</span>
                <span className="text-sm font-bold text-brand-600">
                  {plan.monthly_price === 0 ? 'Grátis' : currency(billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price)}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-charcoal-100 p-5">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn('flex w-full items-center justify-center gap-2 rounded-full py-3 font-semibold text-white shadow-lg transition-all disabled:opacity-50', buttonColor)}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {buttonLabel}
          </button>
          <button onClick={onClose} className="mt-2 w-full rounded-full py-3 text-sm font-medium text-charcoal-500 transition-colors hover:bg-charcoal-50">
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
