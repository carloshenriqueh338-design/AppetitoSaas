import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import type { DriverDelivery } from '@/types';
import { cn, currency, timeAgo } from '@/lib/utils';
import {
  ChevronLeft, Bike, MapPin, Navigation, Phone, Package, CheckCircle2,
  Loader2, ExternalLink, LogOut, XCircle,
} from 'lucide-react';

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  ready: 'Pronto para retirada',
  assigned: 'Atribuída a você',
  picked_up: 'Pedido retirado',
  out_for_delivery: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falha na entrega',
  canceled: 'Cancelada',
};

export function DriverPage({ slug }: { slug: string }) {
  const { user, signOut } = useAuth();
  const [restaurantName, setRestaurantName] = useState('');
  const [deliveries, setDeliveries] = useState<DriverDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const loadDeliveries = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('get_driver_deliveries', {
      p_driver_user_id: user.id,
    });
    if (error) { setLoading(false); return; }
    const result = data as { success?: boolean; deliveries?: DriverDelivery[] };
    setDeliveries(result?.deliveries ?? []);

    // Get restaurant name from first delivery or slug
    if (result?.deliveries?.length) {
      setRestaurantName(result.deliveries[0].restaurant_name);
    } else {
      const { data: r } = await supabase.from('restaurants').select('name').eq('slug', slug).maybeSingle();
      if (r) setRestaurantName((r as { name: string }).name);
    }
    setLoading(false);
  }, [user?.id, slug]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  // Realtime subscription for driver assignments
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`driver:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_assignments', filter: `driver_user_id=eq.${user.id}` },
        () => loadDeliveries(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => loadDeliveries(),
      )
      .subscribe();

    const interval = setInterval(loadDeliveries, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.id, loadDeliveries]);

  const updateStatus = async (orderId: string, status: 'picked_up' | 'out_for_delivery' | 'delivered' | 'failed') => {
    setTransitioning(orderId);
    try {
      const { data, error } = await supabase.rpc('update_delivery_status', {
        p_order_id: orderId,
        p_status: status,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        alert(result?.error ?? 'Erro ao atualizar status');
        return;
      }
      await loadDeliveries();
    } catch (err) {
      console.error(err);
      alert('Erro de conexão. Tente novamente.');
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

  const activeDeliveries = deliveries.filter((d) => !['delivered', 'failed', 'canceled'].includes(d.assignment_status));
  const completedDeliveries = deliveries.filter((d) => d.assignment_status === 'delivered');

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-6 sm:px-6">
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-flame-600 text-white shadow-lg shadow-flame-600/30">
            <Bike className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-charcoal-900">Painel do Entregador</h1>
            <p className="text-sm text-charcoal-500">{restaurantName || 'Entregas'} · {activeDeliveries.length} ativas</p>
          </div>
        </div>
      </div>

      {/* Realtime indicator */}
      <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-50 px-4 py-2.5 text-sm font-semibold text-success-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-success-500" /> Atualização em tempo real
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-charcoal-200 bg-white p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-flame-100 text-flame-600"><Package className="h-4 w-4" /></div>
          <p className="text-xl font-extrabold text-charcoal-900">{activeDeliveries.filter((d) => d.assignment_status === 'assigned').length}</p>
          <p className="text-xs font-medium uppercase text-charcoal-400">Atribuídas</p>
        </div>
        <div className="rounded-2xl border border-charcoal-200 bg-white p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-info-100 text-info-600"><Bike className="h-4 w-4" /></div>
          <p className="text-xl font-extrabold text-charcoal-900">{activeDeliveries.filter((d) => ['picked_up', 'out_for_delivery'].includes(d.assignment_status)).length}</p>
          <p className="text-xs font-medium uppercase text-charcoal-400">A caminho</p>
        </div>
        <div className="rounded-2xl border border-charcoal-200 bg-white p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-success-100 text-success-600"><CheckCircle2 className="h-4 w-4" /></div>
          <p className="text-xl font-extrabold text-charcoal-900">{completedDeliveries.length}</p>
          <p className="text-xs font-medium uppercase text-charcoal-400">Entregues</p>
        </div>
      </div>

      {/* Active deliveries */}
      {activeDeliveries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-charcoal-100">
            <Bike className="h-10 w-10 text-charcoal-300" />
          </div>
          <p className="text-lg font-semibold text-charcoal-700">Nenhuma entrega atribuída</p>
          <p className="text-sm text-charcoal-400">Pedidos atribuídos a você aparecerão aqui automaticamente.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeDeliveries.map((delivery) => (
            <DeliveryCard
              key={delivery.order_id}
              delivery={delivery}
              transitioning={transitioning === delivery.order_id}
              onPickUp={() => updateStatus(delivery.order_id, 'picked_up')}
              onStartDelivery={() => updateStatus(delivery.order_id, 'out_for_delivery')}
              onDelivered={() => updateStatus(delivery.order_id, 'delivered')}
              onFailed={() => updateStatus(delivery.order_id, 'failed')}
            />
          ))}
        </div>
      )}

      {/* Completed deliveries */}
      {completedDeliveries.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase text-charcoal-400">Entregas concluídas hoje</h2>
          <div className="space-y-2">
            {completedDeliveries.map((d) => (
              <div key={d.order_id} className="flex items-center justify-between rounded-xl border border-charcoal-100 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-charcoal-700">{d.customer_name}</p>
                  <p className="text-xs text-charcoal-400">{d.address ?? '—'} · {timeAgo(d.created_at)}</p>
                </div>
                <span className="text-sm font-bold text-charcoal-700">{currency(d.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeliveryCard({ delivery, transitioning, onPickUp, onStartDelivery, onDelivered, onFailed }: {
  delivery: DriverDelivery;
  transitioning: boolean;
  onPickUp: () => void;
  onStartDelivery: () => void;
  onDelivered: () => void;
  onFailed: () => void;
}) {
  const status = delivery.assignment_status;
  const destination = delivery.address ?? '';
  const encodedDest = encodeURIComponent(destination);
  const encodedOrigin = encodeURIComponent(delivery.restaurant_address ?? '');
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDest}&travelmode=driving`;
  const wazeUrl = `https://www.waze.com/ul?navigate=yes&text=${encodedDest}`;

  const statusColor = status === 'assigned' ? 'bg-flame-50 text-flame-700' :
    status === 'picked_up' ? 'bg-info-50 text-info-700' :
    'bg-info-50 text-info-700';

  return (
    <div className={cn(
      'rounded-2xl border bg-white p-5 shadow-sm transition-all',
      status === 'assigned' ? 'border-flame-300 ring-1 ring-flame-200' : 'border-info-300 ring-1 ring-info-200',
    )}>
      <div className={cn('mb-4 flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold', statusColor)}>
        <span className="flex items-center gap-2">
          {status === 'assigned' ? <Package className="h-4 w-4" /> : <Bike className="h-4 w-4" />}
          {DELIVERY_STATUS_LABELS[status] ?? status}
        </span>
        <span className="font-mono text-xs text-charcoal-400">#{delivery.order_id.slice(0, 8)}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-charcoal-100 text-charcoal-600">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal-900">{delivery.customer_name}</p>
            <p className="text-xs text-charcoal-500">{delivery.customer_phone}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase text-charcoal-400">Destino</p>
            <p className="text-sm font-medium text-charcoal-800">{destination}</p>
          </div>
        </div>
      </div>

      {delivery.items && delivery.items.length > 0 && (
        <div className="mt-3 rounded-xl bg-charcoal-50 p-3">
          <p className="mb-1.5 text-xs font-bold uppercase text-charcoal-400">Itens do pedido</p>
          <div className="space-y-0.5">
            {delivery.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm text-charcoal-600">
                <span>{it.quantity}× {it.name}</span>
                <span className="font-medium">{currency(it.line_total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-charcoal-200 pt-2 text-sm font-bold text-charcoal-900">
            <span>Total</span>
            <span>{currency(delivery.total)}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-charcoal-400">Feito há {timeAgo(delivery.created_at)}</p>

      {/* Action buttons */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {status === 'assigned' && (
          <button
            onClick={onPickUp}
            disabled={transitioning}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-flame-600 py-3 font-semibold text-white shadow-lg shadow-flame-600/30 transition-all hover:bg-flame-500 disabled:opacity-50"
          >
            {transitioning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
            Confirmar retirada
          </button>
        )}

        {status === 'picked_up' && (
          <>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              <Navigation className="h-5 w-5" /> Navegar
            </a>
            <button
              onClick={onStartDelivery}
              disabled={transitioning}
              className="flex items-center justify-center gap-2 rounded-full bg-info-600 px-4 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-info-500 disabled:opacity-50"
            >
              {transitioning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bike className="h-5 w-5" />}
              Saiu p/ entrega
            </button>
          </>
        )}

        {status === 'out_for_delivery' && (
          <>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              <Navigation className="h-5 w-5" /> Maps
            </a>
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full border border-charcoal-200 bg-white px-4 py-3 font-semibold text-charcoal-700 transition-colors hover:bg-charcoal-50"
            >
              <ExternalLink className="h-5 w-5" /> Waze
            </a>
            <button
              onClick={onDelivered}
              disabled={transitioning}
              className="flex items-center justify-center gap-2 rounded-full bg-success-600 px-4 py-3 font-semibold text-white shadow-lg shadow-success-600/30 transition-colors hover:bg-success-500 disabled:opacity-50"
            >
              {transitioning ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              Entregue
            </button>
            <button
              onClick={onFailed}
              disabled={transitioning}
              className="flex items-center justify-center gap-2 rounded-full border border-error-200 px-4 py-3 font-semibold text-error-600 transition-colors hover:bg-error-50 disabled:opacity-50"
            >
              <XCircle className="h-5 w-5" /> Falha
            </button>
          </>
        )}
      </div>
    </div>
  );
}
