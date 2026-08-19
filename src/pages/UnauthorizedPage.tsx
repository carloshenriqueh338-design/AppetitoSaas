import { navigate } from '@/lib/router';
import { ShieldOff } from 'lucide-react';

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-charcoal-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-error-100">
          <ShieldOff className="h-10 w-10 text-error-600" />
        </div>
        <h1 className="text-2xl font-bold text-charcoal-900">Acesso Negado</h1>
        <p className="mt-2 text-sm text-charcoal-500">
          Voce nao tem permissao para acessar esta area. Faca login com uma conta autorizada.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={() => navigate('/login')}
            className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-500"
          >
            Ir para o login
          </button>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-charcoal-400 transition-colors hover:text-charcoal-700"
          >
            Voltar ao inicio
          </button>
        </div>
      </div>
    </div>
  );
}
