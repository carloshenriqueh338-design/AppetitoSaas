import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useSEO } from '@/lib/seo';
import type { Restaurant } from '@/types';
import { Logo } from '@/components/Logo';
import { ArrowRight, MapPin, Star, Utensils, Zap, ShieldCheck, Smartphone } from 'lucide-react';

export function LandingPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useSEO({
    title: 'Appetito SaaS — Plataforma de Pedidos para Restaurantes',
    description: 'Cardápio digital premium, checkout híbrido, cozinha em tempo real e roteirização de entrega. Tudo a partir de um único link.',
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    siteName: 'Appetito SaaS',
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('restaurants').select('*').order('name');
      setRestaurants((data as Restaurant[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-charcoal-900">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 via-charcoal-900 to-flame-900/30" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, #DC2626 0%, transparent 50%), radial-gradient(circle at 80% 70%, #EA580C 0%, transparent 50%)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-flame-300 backdrop-blur">
              <Zap className="h-3.5 w-3.5" />
              Plataforma multilocatário de pedidos para restaurantes
            </div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
              Cada restaurante.{' '}
              <span className="bg-gradient-to-r from-brand-500 to-flame-500 bg-clip-text text-transparent">
                Uma plataforma poderosa.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-charcoal-300">
              O Appetito SaaS oferece aos restaurantes independentes um cardápio digital premium, checkout híbrido,
              kanban da cozinha e roteirização de entrega — tudo a partir de um único link.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => navigate('/r/burger-casa')}
                className="group flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-xl shadow-brand-600/30 transition-all hover:bg-brand-500 hover:shadow-brand-600/40"
              >
                Experimente o restaurante demo
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => navigate('/dashboard/burger-casa')}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                Painel da equipe
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-b border-charcoal-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
          <Feature icon={<Smartphone className="h-6 w-6" />} title="Cardápios mobile-first"
            text="Cardápios digitais elegantes com categorias fixas, pop-ups de adicionais e carrinho lateral." />
          <Feature icon={<Utensils className="h-6 w-6" />} title="Checkout híbrido"
            text="Entrega ou pedido na mesa. Pague agora com Pix ou cartão, ou pague depois no caixa." />
          <Feature icon={<ShieldCheck className="h-6 w-6" />} title="Painéis por papel"
            text="Donos veem análise de faturamento. Equipe e cozinha veem apenas o kanban de pedidos." />
        </div>
      </section>

      {/* Restaurant directory */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-charcoal-900 sm:text-3xl">Restaurantes ativos</h2>
            <p className="mt-1 text-charcoal-500">Escolha um restaurante para explorar a vitrine.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-charcoal-100" />
            ))}
          </div>
        ) : restaurants.length === 0 ? (
          <p className="text-charcoal-500">Nenhum restaurante cadastrado.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/r/${r.slug}`)}
                className="group overflow-hidden rounded-2xl border border-charcoal-200 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative h-44 overflow-hidden">
                  {r.hero_url ? (
                    <img src={r.hero_url} alt={r.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-brand-600 to-flame-600" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-charcoal-800 backdrop-blur">
                    <span className={`h-2 w-2 rounded-full ${r.is_open ? 'bg-success-500' : 'bg-charcoal-400'}`} />
                    {r.is_open ? 'Aberto agora' : 'Fechado'}
                  </div>
                  <div className="absolute bottom-4 left-4">
                    <h3 className="text-xl font-bold text-white">{r.name}</h3>
                    <p className="text-sm text-white/80">{r.tagline}</p>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-4 text-sm text-charcoal-500">
                    {r.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" /> {r.address.split('-').slice(-1)[0]?.trim()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-flame-500" /> 4.8
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                    Ver cardápio <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Platform CTA */}
      <section className="bg-gradient-to-br from-charcoal-900 to-charcoal-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
          <Logo size="lg" />
          <h2 className="max-w-2xl text-3xl font-bold text-white sm:text-4xl">
            Lance a presença digital do seu restaurante em minutos
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => navigate('/driver/burger-casa')}
              className="rounded-full bg-flame-600 px-6 py-3 font-semibold text-white shadow-lg shadow-flame-600/30 transition-colors hover:bg-flame-500"
            >
              Painel do Entregador
            </button>
            <button
              onClick={() => navigate('/r/burger-casa?table=5')}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              Testar pedido na mesa (?table=5)
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="text-lg font-bold text-charcoal-900">{title}</h3>
      <p className="text-sm leading-relaxed text-charcoal-500">{text}</p>
    </div>
  );
}
