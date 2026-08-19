import { supabase } from '@/lib/supabase';
import type { Notification, NotificationChannel, NotificationEvent } from '@/types';

/**
 * Notification service — abstracted so business logic is not coupled to any single provider.
 * Channels (WhatsApp, email, push, SMS) are designed to be dispatched by edge functions
 * that read from the notifications table. This client only logs notifications and
 * provides a provider-agnostic interface.
 */

export type NotificationProvider = {
  channel: NotificationChannel;
  send(recipient: string, event: NotificationEvent, payload: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
};

export async function logNotification(
  restaurantId: string,
  recipientType: 'customer' | 'restaurant' | 'driver' | 'admin',
  recipientId: string,
  eventType: NotificationEvent,
  channel: NotificationChannel = 'in_app',
  payload: Record<string, unknown> = {},
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('create_notification', {
    p_restaurant_id: restaurantId,
    p_recipient_type: recipientType,
    p_recipient_id: recipientId,
    p_event_type: eventType,
    p_channel: channel,
    p_payload: payload,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success?: boolean; error?: string };
  if (!result?.success) return { success: false, error: result?.error };
  return { success: true };
}

export async function fetchNotifications(
  restaurantId: string,
  recipientType?: 'customer' | 'restaurant' | 'driver' | 'admin',
): Promise<Notification[]> {
  const { data, error } = await supabase.rpc('get_notifications', {
    p_restaurant_id: restaurantId,
    p_recipient_type: recipientType ?? null,
  });
  if (error || !data?.success) return [];
  return (data.notifications as Notification[]) ?? [];
}

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  order_received: 'Pedido recebido',
  payment_approved: 'Pagamento aprovado',
  preparing: 'Em preparo',
  ready: 'Pedido pronto',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  canceled: 'Cancelado',
  new_order: 'Novo pedido',
  delivery_assigned: 'Entrega atribuída',
  delivery_changed: 'Entrega alterada',
  delivery_canceled: 'Entrega cancelada',
  delivery_failed: 'Falha na entrega',
};

export const NOTIFICATION_EVENT_ICONS: Record<NotificationEvent, string> = {
  order_received: '📥',
  payment_approved: '✅',
  preparing: '👨‍🍳',
  ready: '📦',
  out_for_delivery: '🛵',
  delivered: '🎉',
  canceled: '❌',
  new_order: '🔔',
  delivery_assigned: '🛵',
  delivery_changed: '🔄',
  delivery_canceled: '❌',
  delivery_failed: '⚠️',
};
