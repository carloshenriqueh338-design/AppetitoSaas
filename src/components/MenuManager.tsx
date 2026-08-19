import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, Product } from '@/types';
import { currency, cn, uid } from '@/lib/utils';
import {
  X, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Loader2,
  UtensilsCrossed, Image as ImageIcon, Tag, Upload,
} from 'lucide-react';
import { uploadProductImage } from '@/lib/storage';

type MenuManagerProps = {
  restaurantId: string;
  onClose: () => void;
};

export function MenuManager({ restaurantId, onClose }: MenuManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<{ product: Product | null; categoryId: string } | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const load = useCallback(async () => {
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
      supabase.from('products').select('*, modifiers(*)').eq('restaurant_id', restaurantId).order('sort_order'),
    ]);
    setCategories((cats as Category[]) ?? []);
    setProducts((prods as Product[]) ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), 0);
    const { data } = await supabase
      .from('categories')
      .insert({ restaurant_id: restaurantId, name: newCatName.trim(), sort_order: maxOrder + 1 })
      .select()
      .single();
    if (data) {
      setCategories((prev) => [...prev, data as Category]);
      setExpandedCat((data as Category).id);
    }
    setNewCatName('');
    setAddingCategory(false);
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!confirm('Excluir esta categoria e todos os seus produtos?')) return;
    await supabase.from('categories').delete().eq('id', catId);
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    setProducts((prev) => prev.filter((p) => p.category_id !== catId));
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Excluir este produto?')) return;
    await supabase.from('products').delete().eq('id', productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleToggleAvailability = async (product: Product) => {
    const newVal = !product.is_available;
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_available: newVal } : p)));
    await supabase.from('products').update({ is_available: newVal }).eq('id', product.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal-900">
            <UtensilsCrossed className="h-5 w-5 text-brand-600" />
            Gerenciar Cardápio
          </h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
            </div>
          ) : (
            <>
              {/* Add category */}
              {addingCategory ? (
                <div className="mb-4 flex gap-2">
                  <input
                    autoFocus
                    placeholder="Nome da nova categoria"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    className="flex-1 rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                  <button onClick={handleAddCategory} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500">
                    Adicionar
                  </button>
                  <button onClick={() => { setAddingCategory(false); setNewCatName(''); }} className="rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm text-charcoal-500 transition-colors hover:bg-charcoal-100">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-charcoal-300 py-3 text-sm font-semibold text-charcoal-500 transition-colors hover:border-brand-400 hover:text-brand-600"
                >
                  <Plus className="h-4 w-4" />
                  Nova categoria
                </button>
              )}

              {/* Categories */}
              {categories.length === 0 ? (
                <p className="py-10 text-center text-sm text-charcoal-400">Nenhuma categoria ainda. Crie a primeira!</p>
              ) : (
                <div className="space-y-3">
                  {categories.map((cat) => {
                    const catProducts = products.filter((p) => p.category_id === cat.id);
                    const isExpanded = expandedCat === cat.id;
                    return (
                      <div key={cat.id} className="rounded-2xl border border-charcoal-200 overflow-hidden">
                        {/* Category header */}
                        <div className="flex items-center justify-between bg-charcoal-50 px-4 py-3">
                          <button
                            onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                            className="flex items-center gap-2 text-sm font-bold text-charcoal-800"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Tag className="h-4 w-4 text-brand-600" />
                            {cat.name}
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-charcoal-500">
                              {catProducts.length}
                            </span>
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingProduct({ product: null, categoryId: cat.id })}
                              className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Produto
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-error-50 hover:text-error-500"
                              title="Excluir categoria"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Products */}
                        {isExpanded && (
                          <div className="divide-y divide-charcoal-100">
                            {catProducts.length === 0 ? (
                              <p className="px-4 py-6 text-center text-xs text-charcoal-400">Nenhum produto nesta categoria.</p>
                            ) : (
                              catProducts.map((p) => (
                                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                                  {p.image_url ? (
                                    <img src={p.image_url} alt={p.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                  ) : (
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-charcoal-100 text-charcoal-300">
                                      <ImageIcon className="h-5 w-5" />
                                    </div>
                                  )}
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-charcoal-900">{p.name}</p>
                                    <p className="text-xs text-charcoal-400">{currency(p.price)}</p>
                                  </div>
                                  <button
                                    onClick={() => handleToggleAvailability(p)}
                                    className={cn(
                                      'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                                      p.is_available ? 'bg-success-50 text-success-700' : 'bg-charcoal-100 text-charcoal-500',
                                    )}
                                  >
                                    {p.is_available ? 'Disponível' : 'Indisponível'}
                                  </button>
                                  <button
                                    onClick={() => setEditingProduct({ product: p, categoryId: cat.id })}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(p.id)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-error-50 hover:text-error-500"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Product edit modal */}
      {editingProduct && (
        <ProductEditModal
          restaurantId={restaurantId}
          categoryId={editingProduct.categoryId}
          product={editingProduct.product}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSaved={() => { setEditingProduct(null); load(); }}
        />
      )}
    </div>
  );
}

/* ---------- Product edit modal ---------- */

type ModifierRow = { id: string; name: string; price_delta: string; _new?: boolean };

function ProductEditModal({ restaurantId, categoryId, product, categories, onClose, onSaved }: {
  restaurantId: string;
  categoryId: string;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    image_url: product?.image_url ?? '',
    category_id: product?.category_id ?? categoryId,
    is_available: product?.is_available ?? true,
  });
  const [modifiers, setModifiers] = useState<ModifierRow[]>(
    (product?.modifiers ?? []).map((m) => ({ id: m.id, name: m.name, price_delta: String(m.price_delta) })),
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit = form.name.trim() && form.price.trim();

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    setImageError(null);
    const result = await uploadProductImage(restaurantId, file);
    if (result.success && result.url) {
      setForm((f) => ({ ...f, image_url: result.url! }));
    } else {
      setImageError(result.error ?? 'Erro ao enviar imagem');
    }
    setUploadingImage(false);
  };

  const addModifier = () => {
    setModifiers((prev) => [...prev, { id: uid(), name: '', price_delta: '0', _new: true }]);
  };

  const updateModifier = (id: string, field: keyof ModifierRow, value: string) => {
    setModifiers((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const removeModifier = (id: string) => {
    setModifiers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      category_id: form.category_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price) || 0,
      image_url: form.image_url.trim() || null,
      is_available: form.is_available,
    };

    let productId = product?.id;

    if (isEdit && product) {
      await supabase.from('products').update(payload).eq('id', product.id);
      // Update modifiers: delete existing, insert new ones
      if (product.modifiers && product.modifiers.length > 0) {
        await supabase.from('modifiers').delete().in('id', product.modifiers.map((m) => m.id));
      }
    } else {
      const { data } = await supabase.from('products').insert(payload).select().single();
      productId = (data as Product)?.id;
    }

    // Insert modifiers
    const validMods = modifiers.filter((m) => m.name.trim());
    if (productId && validMods.length > 0) {
      await supabase.from('modifiers').insert(
        validMods.map((m) => ({
          product_id: productId,
          name: m.name.trim(),
          price_delta: parseFloat(m.price_delta) || 0,
        })),
      );
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="text-lg font-bold text-charcoal-900">
            {isEdit ? 'Editar Produto' : 'Adicionar Produto'}
          </h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {/* Image preview */}
            {form.image_url && (
              <div className="relative h-32 overflow-hidden rounded-xl">
                <img src={form.image_url} alt="Preview" className="h-full w-full object-cover" />
              </div>
            )}

            <Field label="Nome do produto" placeholder="Ex: Smash Clássico" value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))} />

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Descrição</label>
              <textarea
                placeholder="Ingredientes, detalhes..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço (R$)" placeholder="18.90" type="number" value={form.price}
                onChange={(v) => setForm((f) => ({ ...f, price: v }))} />
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Categoria</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Image upload */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Foto do produto</label>
              <div className="flex items-center gap-3">
                {form.image_url ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-charcoal-200">
                    <img src={form.image_url} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-charcoal-100 text-charcoal-300">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex items-center gap-2 rounded-full border border-charcoal-200 px-4 py-2 text-sm font-semibold text-charcoal-700 transition-colors hover:bg-charcoal-50 disabled:opacity-50"
                  >
                    {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingImage ? 'Enviando...' : 'Enviar foto'}
                  </button>
                  {imageError && <p className="mt-1 text-xs text-error-600">{imageError}</p>}
                  <p className="mt-1 text-xs text-charcoal-400">JPG, PNG, WebP. Máx 5MB.</p>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={form.is_available}
                onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
                className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600" />
              <span className="text-sm font-medium text-charcoal-700">Disponível para venda</span>
            </label>

            {/* Modifiers */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase text-charcoal-400">Adicionais / Modificadores</label>
                <button onClick={addModifier} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500">
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </button>
              </div>
              {modifiers.length === 0 ? (
                <p className="rounded-xl bg-charcoal-50 px-3 py-2.5 text-xs text-charcoal-400">
                  Nenhum adicional. Ex: "Queijo Extra +R$ 2,50"
                </p>
              ) : (
                <div className="space-y-2">
                  {modifiers.map((m) => (
                    <div key={m.id} className="flex gap-2">
                      <input
                        placeholder="Nome (Ex: Queijo Extra)"
                        value={m.name}
                        onChange={(e) => updateModifier(m.id, 'name', e.target.value)}
                        className="flex-1 rounded-lg border border-charcoal-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                      />
                      <input
                        placeholder="+R$"
                        type="number"
                        value={m.price_delta}
                        onChange={(e) => updateModifier(m.id, 'price_delta', e.target.value)}
                        className="w-24 rounded-lg border border-charcoal-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                      />
                      <button
                        onClick={() => removeModifier(m.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-error-50 hover:text-error-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-charcoal-100 p-5 safe-bottom">
          <button
            onClick={handleSave}
            disabled={!canSubmit || saving}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-semibold text-white shadow-lg transition-all',
              canSubmit && !saving ? 'bg-brand-600 shadow-brand-600/30 hover:bg-brand-500' : 'cursor-not-allowed bg-charcoal-300',
            )}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : isEdit ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {isEdit ? 'Salvar alterações' : 'Adicionar produto'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, type = 'text' }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
    </div>
  );
}
