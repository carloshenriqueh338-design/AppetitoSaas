import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useSEO } from '@/lib/seo';
import { ChevronLeft, ShieldCheck, AlertCircle, Loader2, Send, CheckCircle2 } from 'lucide-react';

export function PrivacyPolicyPage({ slug }: { slug?: string }) {
  useSEO({
    title: 'Política de Privacidade — Appetito SaaS',
    description: 'Saiba como o Appetito SaaS coleta, usa e protege seus dados pessoais em conformidade com a LGPD.',
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  });

  const [privacyPolicy, setPrivacyPolicy] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!slug);
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase.rpc('get_privacy_settings', { p_restaurant_slug: slug });
      if (data?.success) {
        setPrivacyPolicy(data.privacy_policy);
        setContactEmail(data.contact_email);
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
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-charcoal-900">Política de Privacidade</h1>
          <p className="text-sm text-charcoal-500">
            {restaurantName ? `${restaurantName} · ` : ''}Conformidade LGPD (Lei nº 13.709/2018)
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
      ) : privacyPolicy ? (
        <div className="prose prose-sm max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-charcoal-700">{privacyPolicy}</pre>
        </div>
      ) : (
        <DefaultPrivacyPolicy restaurantName={restaurantName} contactEmail={contactEmail} />
      )}

      {/* LGPD Rights Section */}
      <div className="mt-8 rounded-2xl border border-charcoal-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-charcoal-900">Seus Direitos (LGPD)</h2>
        <ul className="space-y-2 text-sm text-charcoal-600">
          <li>Confirmação da existência de tratamento de dados pessoais</li>
          <li>Acesso aos seus dados pessoais</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
          <li>Portabilidade dos dados a outro fornecedor</li>
          <li>Eliminação dos dados pessoais tratados com consentimento</li>
          <li>Informação sobre compartilhamento de dados com terceiros</li>
          <li>Revogação do consentimento</li>
        </ul>

        {contactEmail && (
          <p className="mt-4 text-sm text-charcoal-600">
            Para exercer seus direitos, entre em contato:{' '}
            <a href={`mailto:${contactEmail}`} className="font-semibold text-brand-600 hover:text-brand-500">
              {contactEmail}
            </a>
          </p>
        )}

        <button
          onClick={() => setShowRequestForm(!showRequestForm)}
          className="mt-4 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-500"
        >
          <Send className="h-4 w-4" />
          Solicitar acesso ou exclusão de dados
        </button>

        {showRequestForm && slug && (
          <DataRequestForm slug={slug} />
        )}
      </div>
    </div>
  );
}

function DefaultPrivacyPolicy({ restaurantName, contactEmail }: { restaurantName: string | null; contactEmail: string | null }) {
  const name = restaurantName ?? 'Appetito SaaS';
  return (
    <div className="space-y-4 text-sm leading-relaxed text-charcoal-700">
      <p><strong>Última atualização:</strong> {new Date().toLocaleDateString('pt-BR')}</p>

      <h2 className="text-lg font-bold text-charcoal-900">1. Dados Coletados</h2>
      <p>
        O {name} coleta os seguintes dados pessoais quando você faz um pedido:
      </p>
      <ul className="ml-4 list-disc space-y-1">
        <li>Nome completo (necessário para identificação do pedido)</li>
        <li>Telefone (necessário para contato sobre a entrega)</li>
        <li>Endereço de entrega (necessário apenas para pedidos de entrega)</li>
        <li>Número da mesa (necessário apenas para pedidos no local)</li>
      </ul>
      <p className="text-xs text-charcoal-500">
        Não coletamos dados desnecessários. Seguimos o princípio da minimização de dados da LGPD.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">2. Uso dos Dados</h2>
      <p>Seus dados pessoais são usados exclusivamente para:</p>
      <ul className="ml-4 list-disc space-y-1">
        <li>Processar e entregar seu pedido</li>
        <li>Comunicar o status do pedido</li>
        <li>Cumprir obrigações legais e fiscais</li>
      </ul>

      <h2 className="text-lg font-bold text-charcoal-900">3. Retenção de Dados</h2>
      <p>
        Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas,
        respeitando prazos legais e regulatórios. Dados de pedidos são retidos por até
        365 dias, após o que são anonimizados ou excluídos.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">4. Compartilhamento</h2>
      <p>
        Não compartilhamos seus dados pessoais com terceiros, exceto quando necessário
        para a entrega do pedido (ex: endereço ao entregador) ou por obrigação legal.
      </p>

      <h2 className="text-lg font-bold text-charcoal-900">5. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger seus dados,
        incluindo criptografia em trânsito (HTTPS) e controle de acesso baseado em funções.
      </p>

      {contactEmail && (
        <>
          <h2 className="text-lg font-bold text-charcoal-900">6. Contato</h2>
          <p>
            Para dúvidas sobre privacidade, entre em contato:{' '}
            <a href={`mailto:${contactEmail}`} className="font-semibold text-brand-600 hover:text-brand-500">{contactEmail}</a>
          </p>
        </>
      )}

      <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
        <p className="text-xs font-medium text-warning-800">
          Este documento é um modelo padrão e não constitui aconselhamento jurídico.
          Deve ser revisado e personalizado por um advogado antes da publicação.
        </p>
      </div>
    </div>
  );
}

function DataRequestForm({ slug }: { slug: string }) {
  const [form, setForm] = useState({ type: 'export', name: '', phone: '', email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data } = await supabase.rpc('submit_data_request', {
      p_restaurant_slug: slug,
      p_request_type: form.type,
      p_customer_name: form.name,
      p_customer_phone: form.phone,
      p_customer_email: form.email || null,
      p_notes: form.notes || null,
    });
    setSubmitting(false);
    if (data?.error) {
      setError(data.error);
      return;
    }
    if (data?.success) {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-success-50 px-4 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success-600" />
        <p className="text-sm font-semibold text-success-700">Solicitação enviada com sucesso!</p>
        <p className="text-xs text-success-600">Você será contatado em breve sobre seu pedido.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-charcoal-200 bg-charcoal-50 p-4">
      {error && (
        <div className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</div>
      )}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Tipo de Solicitação</label>
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        >
          <option value="export">Exportar meus dados</option>
          <option value="deletion">Excluir meus dados</option>
          <option value="correction">Corrigir meus dados</option>
        </select>
      </div>
      <input
        placeholder="Nome completo *"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
      />
      <input
        placeholder="Telefone *"
        type="tel"
        value={form.phone}
        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
      />
      <input
        placeholder="E-mail (opcional)"
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
      />
      <textarea
        placeholder="Dethes da solicitação (opcional)"
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        rows={2}
        className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar solicitação
      </button>
    </div>
  );
}
