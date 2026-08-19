import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useSEO } from '@/lib/seo';
import { ChevronLeft, FileText, AlertCircle, Loader2 } from 'lucide-react';

export function TermsOfUsePage({ slug }: { slug?: string }) {
  useSEO({
    title: 'Termos de Uso — Appetito SaaS',
    description: 'Termos e condições de uso da plataforma Appetito SaaS.',
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  });

  const [termsOfUse, setTermsOfUse] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!slug);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase.rpc('get_privacy_settings', { p_restaurant_slug: slug });
      if (data?.success) {
        setTermsOfUse(data.terms_of_use);
        setRestaurantName(data.restaurant_name);
      }
      setLoading(false);
    })();
  }, [slug]);

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button
        onClick={() => navigate(slug ? `/r/${slug}` : '/')}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal-800 text-white shadow-lg">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-charcoal-900">Termos de Uso</h1>
          <p className="text-sm text-charcoal-500">
            {restaurantName ? `${restaurantName} · ` : ''}Termos e condições
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
        <p className="text-xs font-medium text-warning-800">
          <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
          Este documento é um modelo e deve ser revisado por um advogado antes da publicação.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : termsOfUse ? (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-charcoal-700">{termsOfUse}</pre>
      ) : (
        <DefaultTerms restaurantName={restaurantName} />
      )}
    </div>
  );
}

function DefaultTerms({ restaurantName }: { restaurantName: string | null }) {
  const name = restaurantName ?? 'Appetito SaaS';
  return (
    <div className="space-y-4 text-sm leading-relaxed text-charcoal-700">
      <p><strong>Última atualização:</strong> {new Date().toLocaleDateString('pt-BR')}</p>

      <h2 className="text-lg font-bold text-charcoal-900">1. Aceitação dos Termos</h2>
      <p>
        Ao utilizar a plataforma {name}, você concorda com estes Termos de Uso.
        Se não concordar, não utilize o serviço.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">2. Descrição do Serviço</h2>
      <p>
        O {name} é uma plataforma de pedidos online que permite aos clientes fazer pedidos
        de delivery ou consumo no local, com pagamento online ou na entrega.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">3. Pedidos</h2>
      <ul className="ml-4 list-disc space-y-1">
        <li>Pedidos estão sujeitos a confirmação e disponibilidade.</li>
        <li>Preços e itens do cardápio podem mudar sem aviso prévio.</li>
        <li>O tempo de entrega é estimado e pode variar.</li>
      </ul>

      <h2 className="text-lg font-bold text-charcoal-900">4. Pagamentos</h2>
      <p>
        Pagamentos online são processados por provedores certificados.
        Não armazenamos dados de cartão de crédito.
        Para pagamentos na entrega, o valor deve ser pago no ato da entrega.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">5. Cancelamentos</h2>
      <p>
        Pedidos podem ser cancelados antes do início do preparo.
        Cancelamentos após o início do preparo ficam a critério do restaurante.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">6. Responsabilidade</h2>
      <p>
        O {name} atua como intermediário tecnológico entre cliente e restaurante.
        Questões sobre qualidade dos produtos devem ser dirigidas ao restaurante.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">7. Privacidade</h2>
      <p>
        O tratamento de dados pessoais segue nossa Política de Privacidade,
        em conformidade com a LGPD (Lei nº 13.709/2018).
      </p>

      <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
        <p className="text-xs font-medium text-warning-800">
          Este documento é um modelo padrão e não constitui aconselhamento jurídico.
          Deve ser revisado e personalizado por um advogado antes da publicação.
        </p>
      </div>
    </div>
  );
}
