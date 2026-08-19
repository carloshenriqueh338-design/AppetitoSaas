import { useCart } from '@/context/CartContext';
import { currency } from '@/lib/utils';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';

export function CartDrawer({ open, onClose, onCheckout }: { open: boolean; onClose: () => void; onCheckout: () => void }) {
  const { items, removeItem, updateQty, subtotal, count } = useCart();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-bold text-charcoal-900">Seu carrinho</h2>
            {count > 0 && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
                {count} {count === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-charcoal-500 transition-colors hover:bg-charcoal-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-charcoal-100">
              <ShoppingBag className="h-10 w-10 text-charcoal-300" />
            </div>
            <p className="text-lg font-semibold text-charcoal-700">Seu carrinho está vazio</p>
            <p className="text-sm text-charcoal-400">Adicione itens do cardápio para começar.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-2xl border border-charcoal-100 p-3">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-charcoal-900">{item.name}</h3>
                      <button onClick={() => removeItem(item.id)} className="text-charcoal-300 transition-colors hover:text-error-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {item.selected_modifiers.length > 0 && (
                      <p className="mt-0.5 text-xs text-charcoal-400">
                        {item.selected_modifiers.map((m) => m.name).join(', ')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-full border border-charcoal-200 p-0.5">
                        <button onClick={() => updateQty(item.id, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full text-charcoal-600 hover:bg-charcoal-100">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full text-charcoal-600 hover:bg-charcoal-100">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-charcoal-900">{currency(item.line_total)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-charcoal-100 p-5 safe-bottom">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-charcoal-500">Subtotal</span>
              <span className="text-xl font-bold text-charcoal-900">{currency(subtotal)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              Finalizar Pedido
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
