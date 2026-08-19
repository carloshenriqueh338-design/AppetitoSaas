import { supabase } from '@/lib/supabase';
import type { Plan, SubscriptionInfo, FeatureCheckResult } from '@/types';

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.rpc('get_plans');
  if (error || !data?.success) return [];
  return (data.plans as Plan[]) ?? [];
}

export async function fetchSubscription(restaurantId: string): Promise<SubscriptionInfo | null> {
  const { data, error } = await supabase.rpc('get_subscription_status', {
    p_restaurant_id: restaurantId,
  });
  if (error || !data) return null;
  return data as SubscriptionInfo;
}

export async function startSubscription(
  restaurantId: string,
  planId: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly',
): Promise<{ success: boolean; error?: string; subscription_id?: string }> {
  const { data, error } = await supabase.rpc('create_subscription', {
    p_restaurant_id: restaurantId,
    p_plan_id: planId,
    p_billing_cycle: billingCycle,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success?: boolean; error?: string; subscription_id?: string };
  if (!result?.success) return { success: false, error: result?.error };
  return { success: true, subscription_id: result.subscription_id };
}

export async function changePlan(
  restaurantId: string,
  newPlanId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('change_subscription_plan', {
    p_restaurant_id: restaurantId,
    p_new_plan_id: newPlanId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success?: boolean; error?: string };
  if (!result?.success) return { success: false, error: result?.error };
  return { success: true };
}

export async function cancelSubscription(
  restaurantId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { data, error } = await supabase.rpc('cancel_subscription', {
    p_restaurant_id: restaurantId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success?: boolean; error?: string; message?: string };
  if (!result?.success) return { success: false, error: result?.error };
  return { success: true, message: result.message };
}

export async function checkFeature(
  restaurantId: string,
  feature: string,
): Promise<FeatureCheckResult> {
  const { data, error } = await supabase.rpc('check_feature_limit', {
    p_restaurant_id: restaurantId,
    p_feature: feature,
  });
  if (error) return { allowed: true, reason: 'check_failed' };
  return data as FeatureCheckResult;
}
