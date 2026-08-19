import { supabase } from '@/lib/supabase';
import type {
  RestaurantAnalytics, ProductAnalytics, OrderAnalytics,
  PeakHoursResult, PlatformMetrics, AdminRestaurantsResult, AuditLogsResult,
} from '@/types';

export type DateRange = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'custom';

export function getDateRange(range: DateRange, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (range) {
    case 'today':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
        end: now.toISOString(),
      };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return {
        start: new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString(),
        end: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59).toISOString(),
      };
    }
    case 'last_7_days': {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: new Date(s.getFullYear(), s.getMonth(), s.getDate()).toISOString(), end: now.toISOString() };
    }
    case 'last_30_days': {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { start: new Date(s.getFullYear(), s.getMonth(), s.getDate()).toISOString(), end: now.toISOString() };
    }
    case 'custom':
      return {
        start: customStart ? new Date(customStart + 'T00:00:00').toISOString() : new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
        end: customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : now.toISOString(),
      };
  }
}

export async function fetchRestaurantAnalytics(
  restaurantId: string, start: string, end: string,
): Promise<RestaurantAnalytics | null> {
  const { data, error } = await supabase.rpc('get_restaurant_analytics', {
    p_restaurant_id: restaurantId,
    p_start: start,
    p_end: end,
  });
  if (error || !data?.success) return null;
  return data as RestaurantAnalytics;
}

export async function fetchProductAnalytics(
  restaurantId: string, start: string, end: string,
): Promise<ProductAnalytics | null> {
  const { data, error } = await supabase.rpc('get_product_analytics', {
    p_restaurant_id: restaurantId,
    p_start: start,
    p_end: end,
  });
  if (error || !data?.success) return null;
  return data as ProductAnalytics;
}

export async function fetchOrderAnalytics(
  restaurantId: string, start: string, end: string,
): Promise<OrderAnalytics | null> {
  const { data, error } = await supabase.rpc('get_order_analytics', {
    p_restaurant_id: restaurantId,
    p_start: start,
    p_end: end,
  });
  if (error || !data?.success) return null;
  return data as OrderAnalytics;
}

export async function fetchPeakHours(
  restaurantId: string, start: string, end: string,
): Promise<PeakHourData[]> {
  const { data, error } = await supabase.rpc('get_peak_hours', {
    p_restaurant_id: restaurantId,
    p_start: start,
    p_end: end,
  });
  if (error || !data?.success) return [];
  return (data as PeakHoursResult).hours ?? [];
}

export type PeakHourData = { hour: number; count: number };

export async function fetchPlatformMetrics(): Promise<PlatformMetrics | null> {
  const { data, error } = await supabase.rpc('get_platform_metrics');
  if (error || !data?.success) return null;
  return data as PlatformMetrics;
}

export async function fetchAdminRestaurants(
  page: number, perPage: number, search?: string, statusFilter?: string,
): Promise<AdminRestaurantsResult | null> {
  const { data, error } = await supabase.rpc('get_admin_restaurants', {
    p_page: page,
    p_per_page: perPage,
    p_search: search ?? null,
    p_status_filter: statusFilter ?? null,
  });
  if (error || !data?.success) return null;
  return data as AdminRestaurantsResult;
}

export async function fetchAuditLogs(page: number, perPage: number): Promise<AuditLogsResult | null> {
  const { data, error } = await supabase.rpc('get_audit_logs', {
    p_page: page,
    p_per_page: perPage,
  });
  if (error || !data?.success) return null;
  return data as AuditLogsResult;
}

export async function updateRestaurantSubscriptionStatus(
  restaurantId: string, status: string, isOpen?: boolean,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_restaurant_subscription_status', {
    p_restaurant_id: restaurantId,
    p_status: status,
    p_is_open: isOpen ?? null,
  });
  if (error || !data?.success) return false;
  return true;
}
