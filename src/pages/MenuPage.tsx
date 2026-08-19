import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useSEO } from '@/lib/seo';
import type { Restaurant, Category, Product } from '@/types';
import { currency, cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { ItemModal } from '@/components/ItemModal';
import { CartDrawer } from '@/components/CartDrawer';
import { ShoppingCart, MapPin, Phone, Clock, ChevronLeft, UtensilsCrossed, Table } from 'lucide-react';

export function MenuPage({ slug, table }: { slug: string; table?: string }) {
  const { count } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (!r) { setLoading(false); return; }
      setRestaurant(r as Restaurant);

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', r.id)
        .order('sort_order');
      setCategories((cats as Category[]) ?? []);

      const { data: prods } = await supabase
        .from('products')
        .select('*, modifiers(*)')
        .eq('restaurant_id', r.id)
        .eq('is_available', true)
        .order('sort_order');
      setProducts((prods as Product[]) ?? []);
      if (cats && cats.length > 0) setActiveCat((cats as Category[])[0].id);
      setLoading(false);
    })();
  }, [slug]);

  // Scroll spy for sticky category bar
  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.id);
      },
      { rootMargin: '-120px 0px -70% 0px' },
    );
    categories.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [categories]);

  const scrollToCat = (catId: string) => {
    setActiveCat(catId);
    catRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isTableOrder = !!table;

  useSEO({
    title: restaurant ? `${restaurant.name} — Cardápio Digital` : 'Cardápio Digital — Appetito SaaS',
    description: restaurant?.description ?? restaurant?.tagline ?? 'Faça seu pedido online com o Appetito SaaS.',
    image: restaurant?.hero_url ?? undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    type: 'website',
    siteName: restaurant?.name,
    jsonLd: restaurant ? {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: restaurant.name,
      description: restaurant.description ?? restaurant.tagline ?? '',
      image: restaurant.hero_url ?? undefined,
      address: restaurant.address ? { '@type': 'PostalAddress', streetAddress: restaurant.address } : undefined,
      telephone: restaurant.phone ?? undefined,
      url: window.location.href,
    } : undefined,
  });

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

  return (
    <div className="animate-fade-in pb-24">
      {/* Hero / restaurant header */}
      <div className="relative h-56 overflow-hidden sm:h-72">
        {restaurant.hero_url ? (
          <img src={restaurant.hero_url} alt={restaurant.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-600 to-flame-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal-900 via-charcoal-900/40 to-transparent" />
        <button
          onClick={() => navigate('/')}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-charcoal-700 shadow-lg backdrop-blur transition-colors hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{restaurant.name}</h1>
            {restaurant.tagline && <p className="mt-1 text-lg text-white/90">{restaurant.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/80">
              {restaurant.address && (
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {restaurant.address}</span>
              )}
              {restaurant.phone && (
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {restaurant.phone}</span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {restaurant.is_open ? 'Aberto agora' : 'Fechado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table banner */}
      {isTableOrder && (
        <div className="bg-flame-600 text-white">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 text-sm font-semibold sm:px-6">
            <Table className="h-4 w-4" />
            Pedido na mesa · Mesa {table} bloqueada
          </div>
        </div>
      )}

      {/* Sticky category bar */}
      {categories.length > 0 && (
        <div className="sticky top-16 z-30 border-b border-charcoal-200 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="no-scrollbar flex gap-2 overflow-x-auto py-3">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => scrollToCat(c.id)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all',
                    activeCat === c.id
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'bg-charcoal-100 text-charcoal-600 hover:bg-charcoal-200',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Menu sections */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {restaurant.description && (
          <p className="mb-6 max-w-2xl text-charcoal-500">{restaurant.description}</p>
        )}

        {categories.map((cat) => {
          const catProducts = products.filter((p) => p.category_id === cat.id);
          if (catProducts.length === 0) return null;
          return (
            <section
              key={cat.id}
              id={cat.id}
              ref={(el) => { catRefs.current[cat.id] = el; }}
              className="mb-8 scroll-mt-32"
            >
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-charcoal-900">
                <UtensilsCrossed className="h-5 w-5 text-brand-600" />
                {cat.name}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {catProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    className="group flex gap-3 overflow-hidden rounded-2xl border border-charcoal-100 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-1 flex-col">
                      <h3 className="font-bold text-charcoal-900">{p.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-sm text-charcoal-500">{p.description}</p>
                      <p className="mt-2 text-base font-bold text-brand-600">{currency(p.price)}</p>
                    </div>
                    {p.image_url && (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {categories.length === 0 && (
          <p className="text-center text-charcoal-500">Nenhum item disponível no cardápio.</p>
        )}
      </div>

      {/* Floating cart button */}
      {count > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-brand-600 py-3.5 pl-5 pr-4 text-white shadow-2xl shadow-brand-600/40 transition-all hover:bg-brand-500"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="font-semibold">Ver carrinho</span>
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-brand-600">
            {count}
          </span>
        </button>
      )}

      {/* Modals */}
      {selectedProduct && (
        <ItemModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          navigate(`/r/${slug}/checkout${isTableOrder ? `?table=${table}` : ''}`);
        }}
      />
    </div>
  );
}
