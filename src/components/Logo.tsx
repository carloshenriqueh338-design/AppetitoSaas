import { UtensilsCrossed } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const text = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${dims} rounded-xl bg-gradient-to-br from-brand-600 to-flame-600 flex items-center justify-center shadow-lg shadow-brand-600/30`}>
        <UtensilsCrossed className="h-1/2 w-1/2 text-white" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`${text} font-extrabold tracking-tight text-charcoal-900`}>
          Appetito
        </span>
        <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-flame-600">
          SaaS
        </span>
      </div>
    </div>
  );
}
