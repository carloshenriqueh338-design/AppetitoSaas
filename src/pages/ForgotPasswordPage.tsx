import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { navigate } from '@/lib/router';
import { checkClientRateLimit } from '@/lib/rateLimit';
import { Logo } from '@/components/Logo';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!checkClientRateLimit('password_reset', 3, 60000)) {
      setError('Muitas tentativas. Aguarde 1 minuto e tente novamente.');
      return;
    }
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) { setError(error); return; }
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-charcoal-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center"><Logo /></div>
          <h1 className="text-2xl font-bold text-charcoal-900">Recuperar Senha</h1>
          <p className="mt-1 text-sm text-charcoal-500">Enviaremos um link de recuperacao para seu email</p>
        </div>

        <div className="rounded-3xl border border-charcoal-100 bg-white p-8 shadow-xl shadow-charcoal-200/30">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
                <CheckCircle2 className="h-8 w-8 text-success-600" />
              </div>
              <p className="text-sm text-charcoal-600">
                Se uma conta existir com <strong>{email}</strong>, voce recebera um email com instrucoes para redefinir sua senha.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-500"
              >
                Voltar ao login
              </button>
            </div>
          ) : (
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
              {error && <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Enviar link de recuperacao
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <button onClick={() => navigate('/login')} className="text-sm text-charcoal-400 transition-colors hover:text-charcoal-700">
            Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}
