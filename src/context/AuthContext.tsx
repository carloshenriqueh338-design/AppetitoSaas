import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AuthUser } from '@/types';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function buildAuthUser(supabaseUser: User): Promise<AuthUser | null> {
  const [membershipResult, platformResult] = await Promise.all([
    supabase
      .from('restaurant_users')
      .select('id, user_id, restaurant_id, role, is_active, restaurants!inner(slug)')
      .eq('user_id', supabaseUser.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('platform_users')
      .select('id')
      .eq('user_id', supabaseUser.id)
      .maybeSingle(),
  ]);

  if (platformResult.data) {
    return {
      id: supabaseUser.id,
      email: supabaseUser.email ?? '',
      restaurantId: null,
      restaurantSlug: null,
      role: 'SuperAdmin',
      isActive: true,
    };
  }

  if (membershipResult.data) {
    const m = membershipResult.data as unknown as {
      id: string;
      user_id: string;
      restaurant_id: string;
      role: AuthUser['role'];
      is_active: boolean;
      restaurants: { slug: string };
    };
    return {
      id: m.user_id,
      email: supabaseUser.email ?? '',
      restaurantId: m.restaurant_id,
      restaurantSlug: m.restaurants.slug,
      role: m.role,
      isActive: m.is_active,
    };
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      (async () => {
        if (!session?.user) {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
          return;
        }
        const authUser = await buildAuthUser(session.user);
        if (mounted) {
          setUser(authUser);
          setLoading(false);
        }
      })();
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      const authUser = await buildAuthUser(data.session.user);
      if (mounted) {
        setUser(authUser);
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const authUser = await buildAuthUser(data.user);
      if (authUser) setUser(authUser);
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
