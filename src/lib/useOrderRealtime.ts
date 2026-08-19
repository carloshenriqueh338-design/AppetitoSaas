import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/types';

type RealtimeCallback = (payload: { eventType: string; newOrder?: Order; oldOrder?: Order }) => void;

/**
 * Subscribes to realtime updates on the orders table for a specific restaurant.
 * Falls back to polling if realtime fails or doesn't receive events within a timeout.
 *
 * - No duplicate subscriptions (uses a single channel ref)
 * - Cleans up on unmount
 * - Falls back to 10s polling if no realtime event arrives within 15s
 */
export function useOrderRealtime(
  restaurantId: string | null,
  onEvent: RealtimeCallback,
  pollFallback: () => void,
) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastEventTime = useRef<number>(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef(onEvent);
  const pollRef2 = useRef(pollFallback);

  // Keep refs current without re-subscribing
  useEffect(() => {
    onEventRef.current = onEvent;
    pollRef2.current = pollFallback;
  });

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      pollRef2.current();
    }, 10000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    // Reset event timer
    lastEventTime.current = Date.now();

    // Start fallback polling — will be stopped once realtime events arrive
    startPolling();

    // Subscribe to realtime changes on orders for this restaurant
    const channel = supabase
      .channel(`orders:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          lastEventTime.current = Date.now();
          stopPolling();
          onEventRef.current({
            eventType: payload.eventType,
            newOrder: payload.new as Order | undefined,
            oldOrder: payload.old as Order | undefined,
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Realtime is live — but keep the watchdog below to detect stalls
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          startPolling();
        }
      });

    channelRef.current = channel;

    // Watchdog: if no realtime event for 15s, start polling as fallback
    const watchdog = setInterval(() => {
      const elapsed = Date.now() - lastEventTime.current;
      if (elapsed > 15000) {
        startPolling();
      } else {
        stopPolling();
      }
    }, 5000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      stopPolling();
      clearInterval(watchdog);
    };
  }, [restaurantId, startPolling, stopPolling]);
}
