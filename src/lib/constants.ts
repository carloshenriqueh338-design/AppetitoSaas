import type { OrderStatus, StaffRole } from '@/types';

/**
 * State machine: valid next states for each current state.
 * Table orders skip out_for_delivery.
 */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'canceled', 'rejected'],
  confirmed: ['preparing', 'canceled'],
  preparing: ['ready', 'canceled'],
  ready: ['out_for_delivery', 'completed', 'canceled'],
  out_for_delivery: ['completed', 'canceled'],
  completed: [],
  canceled: [],
  rejected: [],
  payment_failed: [],
};

/**
 * Primary next status for one-click advancement (dashboard/kitchen).
 * Table orders: ready → completed; delivery orders: ready → out_for_delivery.
 */
export function primaryNextStatus(status: OrderStatus, fulfillment: 'delivery' | 'table'): OrderStatus | null {
  switch (status) {
    case 'new': return 'confirmed';
    case 'confirmed': return 'preparing';
    case 'preparing': return 'ready';
    case 'ready': return fulfillment === 'delivery' ? 'out_for_delivery' : 'completed';
    case 'out_for_delivery': return 'completed';
    default: return null;
  }
}

export const STATUS_COLUMNS: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'new', label: 'Novos', color: 'bg-charcoal-100 text-charcoal-700' },
  { key: 'confirmed', label: 'Confirmados', color: 'bg-brand-100 text-brand-700' },
  { key: 'preparing', label: 'Em Preparo', color: 'bg-warning-100 text-warning-700' },
  { key: 'ready', label: 'Pronto', color: 'bg-flame-100 text-flame-700' },
  { key: 'out_for_delivery', label: 'Saiu p/ Entrega', color: 'bg-info-100 text-info-700' },
  { key: 'completed', label: 'Concluídos', color: 'bg-success-100 text-success-700' },
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Novo',
  confirmed: 'Confirmado',
  preparing: 'Em Preparo',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para Entrega',
  completed: 'Concluído',
  canceled: 'Cancelado',
  rejected: 'Rejeitado',
  payment_failed: 'Pagamento Falhou',
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-charcoal-100 text-charcoal-700',
  confirmed: 'bg-brand-100 text-brand-700',
  preparing: 'bg-warning-100 text-warning-700',
  ready: 'bg-flame-100 text-flame-700',
  out_for_delivery: 'bg-info-100 text-info-700',
  completed: 'bg-success-100 text-success-700',
  canceled: 'bg-error-100 text-error-700',
  rejected: 'bg-error-100 text-error-700',
  payment_failed: 'bg-error-100 text-error-700',
};

export const SHOW_ANALYTICS_ROLES: StaffRole[] = ['Owner', 'Manager'];

export const SUBSCRIPTION_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Ativa', color: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500' },
  trial: { label: 'Trial', color: 'bg-warning-50 text-warning-700 border-warning-200', dot: 'bg-warning-500' },
  trialing: { label: 'Trial', color: 'bg-warning-50 text-warning-700 border-warning-200', dot: 'bg-warning-500' },
  suspended: { label: 'Suspensa', color: 'bg-error-50 text-error-700 border-error-200', dot: 'bg-error-500' },
  canceled: { label: 'Cancelada', color: 'bg-charcoal-100 text-charcoal-500 border-charcoal-200', dot: 'bg-charcoal-400' },
  past_due: { label: 'Pagamento Atrasado', color: 'bg-error-50 text-error-700 border-error-200', dot: 'bg-error-500' },
  paused: { label: 'Pausada', color: 'bg-charcoal-100 text-charcoal-500 border-charcoal-200', dot: 'bg-charcoal-400' },
  expired: { label: 'Expirada', color: 'bg-error-50 text-error-700 border-error-200', dot: 'bg-error-500' },
};

export const FEATURE_LABELS: Record<string, string> = {
  max_staff: 'Membros da equipe',
  max_products: 'Produtos no cardápio',
  max_orders_per_month: 'Pedidos por mês',
  max_locations: 'Unidades/Localizações',
  advanced_analytics: 'Analytics avançado',
  delivery_features: 'Funcionalidades de entrega',
  kitchen_display: 'Tela da cozinha',
  priority_support: 'Suporte prioritário',
};

/** Estimated prep time per status stage in minutes */
export const ESTIMATED_PREP: Record<OrderStatus, number> = {
  new: 5,
  confirmed: 5,
  preparing: 20,
  ready: 5,
  out_for_delivery: 15,
  completed: 0,
  canceled: 0,
  rejected: 0,
  payment_failed: 0,
};
