
CREATE OR REPLACE FUNCTION public.get_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_restaurants int;
  v_active_restaurants int;
  v_trial_restaurants int;
  v_suspended_restaurants int;
  v_canceled_restaurants int;
  v_total_orders int;
  v_platform_revenue numeric;
  v_subscription_metrics jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('error', 'Não autorizado');
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.subscription_status IN ('active','trialing')),
    COUNT(*) FILTER (WHERE r.subscription_status IN ('trial','trialing')),
    COUNT(*) FILTER (WHERE r.subscription_status IN ('suspended','past_due')),
    COUNT(*) FILTER (WHERE r.subscription_status = 'canceled')
  INTO v_total_restaurants, v_active_restaurants, v_trial_restaurants, v_suspended_restaurants, v_canceled_restaurants
  FROM restaurants r;

  SELECT COUNT(*) INTO v_total_orders FROM orders;

  SELECT COALESCE(SUM(o.total), 0) INTO v_platform_revenue
  FROM orders o WHERE o.status = 'completed';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'plan_name', plan_name,
      'count', cnt
    ) ORDER BY cnt DESC
  ), '[]'::jsonb) INTO v_subscription_metrics
  FROM (
    SELECT
      COALESCE(p.name, 'Sem plano') AS plan_name,
      COUNT(*) AS cnt
    FROM restaurants r
    LEFT JOIN subscriptions s ON s.restaurant_id = r.id AND s.status = 'active'
    LEFT JOIN plans p ON p.id = s.plan_id
    GROUP BY COALESCE(p.name, 'Sem plano')
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'total_restaurants', v_total_restaurants,
    'active_restaurants', v_active_restaurants,
    'trial_restaurants', v_trial_restaurants,
    'suspended_restaurants', v_suspended_restaurants,
    'canceled_restaurants', v_canceled_restaurants,
    'total_orders', v_total_orders,
    'platform_revenue', v_platform_revenue,
    'subscription_metrics', v_subscription_metrics
  );
END;
$function$;
