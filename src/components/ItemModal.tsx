import { useState } from 'react';
import type { Product, ModifierSelection } from '@/types';
import { currency } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { X, Minus, Plus, ShoppingCart } from 'lucide-react';

export function ItemModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<ModifierSelection[]>([]);

  const toggleMod = (m: ModifierSelection) => {
    setSelected((prev) =>
      prev.some((s) => s.id === m.id)
        ? prev.filter((s) => s.id !== m.id)
        : [...prev, m],
    );
  };

  const modsTotal = selected.reduce((s, m) => s + m.price_delta, 0);
  const unitPrice = product.price + modsTotal;
  const total = unitPrice * qty;

  const handleAdd = () => {
    addItem({
      product_id: product.id,
      name: product.name,
      unit_price: product.price,
      quantity: qty,
      image_url: product.image_url,
      selected_modifiers: selected,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl max-h-[92vh] flex flex-col">
        {/* Image */}
        <div className="relative h-48 shrink-0 overflow-hidden sm:h-56">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand-500 to-flame-500" />
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-charcoal-700 shadow-lg backdrop-blur transition-colors hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="p-5">
            <h2 className="text-xl font-bold text-charcoal-900">{product.name}</h2>
            <p className="mt-1 text-sm leading-relaxed text-charcoal-500">{product.description}</p>
            <p className="mt-2 text-lg font-bold text-brand-600">{currency(product.price)}</p>
          </div>

          {/* Modifiers */}
          {product.modifiers && product.modifiers.length > 0 && (
            <div className="px-5 pb-2">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-charcoal-400">
                Personalize seu pedido
              </h3>
              <div className="space-y-2">
                {product.modifiers.map((m) => {
                  const sel = selected.some((s) => s.id === m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMod(m)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                        sel
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-charcoal-200 bg-white hover:border-charcoal-300'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                            sel ? 'border-brand-600 bg-brand-600' : 'border-charcoal-300'
                          }`}
                        >
                          {sel && <span className="h-2 w-2 rounded-sm bg-white" />}
                        </span>
                        <span className="text-sm font-medium text-charcoal-800">{m.name}</span>
                      </span>
                      <span className="text-sm font-semibold text-charcoal-600">
                        {m.price_delta > 0 ? `+ ${currency(m.price_delta)}` : 'Grátis'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-charcoal-100 p-4 safe-bottom">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-charcoal-200 p-1">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-charcoal-600 transition-colors hover:bg-charcoal-100"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold text-charcoal-900">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-charcoal-600 transition-colors hover:bg-charcoal-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={handleAdd}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              <ShoppingCart className="h-5 w-5" />
              Adicionar · {currency(total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
