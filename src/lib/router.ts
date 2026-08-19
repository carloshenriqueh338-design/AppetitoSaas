import { useState, useEffect, useCallback } from 'react';

/**
 * Minimal hash-based router. Routes:
 *   #/                       — landing / restaurant directory
 *   #/r/:slug                 — customer menu
 *   #/r/:slug/checkout        — checkout
 *   #/dashboard/:slug         — restaurant dashboard
 *   #/driver/:slug            — driver dashboard
 *   #/superadmin               — super-admin dashboard
 *   #/login                    — staff login
 *   #/forgot-password          — password reset request
 *   #/reset-password           — password reset form
 *   #/unauthorized             — access denied
 */
export type Route =
  | { name: 'home' }
  | { name: 'menu'; slug: string; table?: string }
  | { name: 'checkout'; slug: string; table?: string }
  | { name: 'dashboard'; slug: string }
  | { name: 'billing'; slug: string }
  | { name: 'settings'; slug: string }
  | { name: 'kitchen'; slug: string }
  | { name: 'driver'; slug: string }
  | { name: 'track'; slug: string; orderId: string }
  | { name: 'superadmin' }
  | { name: 'login' }
  | { name: 'forgot-password' }
  | { name: 'reset-password' }
  | { name: 'unauthorized' }
  | { name: 'privacy'; slug?: string }
  | { name: 'terms'; slug?: string };

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'home' };

  if (parts[0] === 'r' && parts[1]) {
    const table = query ? new URLSearchParams(query).get('table') ?? undefined : undefined;
    if (parts[2] === 'checkout') return { name: 'checkout', slug: parts[1], table };
    return { name: 'menu', slug: parts[1], table };
  }
  if (parts[0] === 'dashboard' && parts[1]) return { name: 'dashboard', slug: parts[1] };
  if (parts[0] === 'billing' && parts[1]) return { name: 'billing', slug: parts[1] };
  if (parts[0] === 'settings' && parts[1]) return { name: 'settings', slug: parts[1] };
  if (parts[0] === 'kitchen' && parts[1]) return { name: 'kitchen', slug: parts[1] };
  if (parts[0] === 'driver' && parts[1]) return { name: 'driver', slug: parts[1] };
  if (parts[0] === 'track' && parts[1] && parts[2]) return { name: 'track', slug: parts[1], orderId: parts[2] };
  if (parts[0] === 'superadmin') return { name: 'superadmin' };
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'forgot-password') return { name: 'forgot-password' };
  if (parts[0] === 'reset-password') return { name: 'reset-password' };
  if (parts[0] === 'unauthorized') return { name: 'unauthorized' };
  if (parts[0] === 'privacy') return { name: 'privacy', slug: parts[1] };
  if (parts[0] === 'terms') return { name: 'terms', slug: parts[1] };

  return { name: 'home' };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);

  return { route, navigate };
}

export function navigate(to: string) {
  window.location.hash = to;
}
