import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { navigate } from '@/lib/router';
import { checkClientRateLimit, resetClientRateLimit } from '@/lib/rateLimit';
import { Logo } from '@/components/Logo';
import { Loader2, Mail, Lock, ChefHat, Bike, Crown, ShieldCheck } from 'lucide-react';

export function LoginPage() {
  const { signIn, signUp, user } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.role === 'SuperAdmin') {
        navigate('/superadmin');
      } else if (user.restaurantSlug) {
        navigate(`/dashboard/${user.restaurantSlug}`);
      } else {
        navigate('/');
      }
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rateLimitKey = `login:${email}`;
    if (!checkClientRateLimit(rateLimitKey, 5, 60000)) {
      setError('Muitas tentativas. Aguarde 1 minuto e tente novamente.');
      return;
    }

    setLoading(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    resetClientRateLimit(rateLimitKey);
    if (mode === 'signup') {
      setError('Conta criada! Solicite que um Owner adicione você ao restaurante.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-charcoal-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold text-charcoal-900">
            {mode === 'login' ? 'Acessar Painel' : 'Criar Conta'}
          </h1>
          <p className="mt-1 text-sm text-charcoal-500">
            {mode === 'login'
              ? 'Entre com suas credenciais de equipe'
              : 'Cadastre-se para acessar o sistema'}
          </p>
        </div>

        <div className="rounded-3xl border border-charcoal-100 bg-white p-8 shadow-xl shadow-charcoal-200/30">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-charcoal-400">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-xl border border-charcoal-200 py-3 pl-11 pr-4 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-charcoal-400">Senha</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  className="w-full rounded-xl border border-charcoal-200 py-3 pl-11 pr-4 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => navigate('/forgot-password')}
              className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Esqueceu sua senha?
            </button>
          </div>

          <div className="mt-6 border-t border-charcoal-100 pt-4 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
              className="text-sm text-charcoal-500 transition-colors hover:text-charcoal-800"
            >
              {mode === 'login' ? 'Nao tem conta? Cadastre-se' : 'Ja tem conta? Entrar'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2">
          {[
            { icon: <Crown className="h-4 w-4" />, label: 'Owner' },
            { icon: <ShieldCheck className="h-4 w-4" />, label: 'Manager' },
            { icon: <ChefHat className="h-4 w-4" />, label: 'Kitchen' },
            { icon: <Bike className="h-4 w-4" />, label: 'Driver' },
            { icon: <Crown className="h-4 w-4" />, label: 'Super Admin' },
          ].map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-1 rounded-xl bg-white/60 py-3 text-charcoal-500">
              {r.icon}
              <span className="text-xs font-medium">{r.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button onClick={() => navigate('/')} className="text-sm text-charcoal-400 transition-colors hover:text-charcoal-700">
            Voltar ao inicio
          </button>
        </div>
      </div>
    </div>
  );
}
