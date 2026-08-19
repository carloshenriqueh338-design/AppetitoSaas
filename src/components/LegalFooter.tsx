import { ShieldCheck, Instagram, MessageCircle } from 'lucide-react';

export function LegalFooter() {
  return (
    <footer className="border-t border-charcoal-200 bg-charcoal-900 text-charcoal-300">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-white">
              <ShieldCheck className="h-5 w-5 text-flame-500" />
              <span className="text-sm font-bold">Conformidade LGPD</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-charcoal-400">
              O Appetito SaaS processa dados de clientes em conformidade com a Lei Geral de Proteção
              de Dados (LGPD, Lei nº 13.709/2018).
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex gap-4 text-sm">
              <a href="#/terms" className="text-charcoal-300 transition-colors hover:text-white">
                Termos de Uso
              </a>
              <span className="text-charcoal-600">·</span>
              <a href="#/privacy" className="text-charcoal-300 transition-colors hover:text-white">
                Política de Privacidade
              </a>
            </div>
            <p className="text-xs text-charcoal-500">
              Documentos legais são modelos e devem ser revisados por um advogado.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-charcoal-800 pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-center text-xs leading-relaxed text-charcoal-400 sm:text-left">
              © 2026 Appetito SaaS - [Razão Social] - CNPJ: [00.000.000/0000-00] - Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://wa.me/551140020000"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Fale conosco no WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal-800 text-charcoal-300 transition-all duration-200 hover:scale-105 hover:bg-success-600 hover:text-white"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              <a
                href="https://instagram.com/appetito.saas"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Siga-nos no Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal-800 text-charcoal-300 transition-all duration-200 hover:scale-105 hover:bg-gradient-to-br hover:from-fuchsia-600 hover:to-orange-500 hover:text-white"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
