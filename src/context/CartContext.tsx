import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CartItem, ModifierSelection } from '@/types';
import { uid } from '@/lib/utils';

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id' | 'line_total'>) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: Omit<CartItem, 'id' | 'line_total'>) => {
    const modsTotal = item.selected_modifiers.reduce((s, m) => s + m.price_delta, 0);
    const line_total = (item.unit_price + modsTotal) * item.quantity;
    setItems((prev) => [...prev, { ...item, id: uid(), line_total }]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i;
          const modsTotal = i.selected_modifiers.reduce((s, m) => s + m.price_delta, 0);
          return { ...i, quantity: qty, line_total: (i.unit_price + modsTotal) * qty };
        })
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export type { ModifierSelection };
