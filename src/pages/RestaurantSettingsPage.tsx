import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import type { Restaurant, DeliveryZoneConfig } from '@/types';
import { cn } from '@/lib/utils';
import { uploadRestaurantImage } from '@/lib/storage';
import {
  ChevronLeft, Settings as SettingsIcon, Loader2, CheckCircle2, Store,
  Image as ImageIcon, Phone, MessageCircle, Instagram, Clock, Palette,
  Bike, MapPin, DollarSign, Upload, Save, Plus, Trash2,
} from 'lucide-react';

type Tab = 'general' | 'contact' | 'hours' | 'delivery' | 'appearance';

const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const DAY_LABELS: Record<string, string> = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
};

type ZoneRow = { name: string; delivery_fee: string; estimated_minutes: string };

export function RestaurantSettingsPage({ slug }: { slug: string }) {
  const { signOut } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [zones, setZones] = useState<ZoneRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
    if (!data) { setLoading(false); return; }
    const r = data as Restaurant;
    setRestaurant(r);
    setForm({
      name: r.name,
      tagline: r.tagline ?? '',
      description: r.description ?? '',
      phone: r.phone ?? '',
      address: r.address ?? '',
      whatsapp: r.whatsapp ?? '',
      instagram: r.instagram ?? '',
      logo_url: r.logo_url ?? '',
      hero_url: r.hero_url ?? '',
      primary_color: r.primary_color,
      accent_color: r.accent_color,
      currency: r.currency,
      minimum_order: r.minimum_order ?? 0,
      estimated_prep_minutes: r.estimated_prep_minutes ?? 30,
      is_open: r.is_open,
      delivery_enabled: r.delivery_enabled ?? true,
      pickup_enabled: r.pickup_enabled ?? false,
      table_ordering_enabled: r.table_ordering_enabled ?? true,
      delivery_fee: r.delivery_fee ?? 5,
      delivery_minimum_order: r.delivery_minimum_order ?? 0,
      delivery_estimated_minutes: r.delivery_estimated_minutes ?? 30,
      business_hours: r.business_hours ?? {},
      closed_days: r.closed_days ?? [],
    });
    setZones((r.delivery_zones ?? []).map((z) => ({
      name: z.name,
      delivery_fee: String(z.delivery_fee),
      estimated_minutes: String(z.estimated_minutes),
    })));
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!restaurant) return;
    setSaving(true);
    const zonePayload: DeliveryZoneConfig[] = zones.map((z, i) => ({
      name: z.name,
      delivery_fee: parseFloat(z.delivery_fee) || 0,
      estimated_minutes: parseInt(z.estimated_minutes) || 30,
      is_active: true,
      sort_order: i,
    }));
    await supabase.from('restaurants').update({
      name: form.name,
      tagline: (form.tagline as string) || null,
      description: (form.description as string) || null,
      phone: (form.phone as string) || null,
      address: (form.address as string) || null,
      whatsapp: (form.whatsapp as string) || null,
      instagram: (form.instagram as string) || null,
      logo_url: (form.logo_url as string) || null,
      hero_url: (form.hero_url as string) || null,
      primary_color: form.primary_color,
      accent_color: form.accent_color,
      currency: form.currency,
      minimum_order: parseFloat(form.minimum_order as string) || 0,
      estimated_prep_minutes: parseInt(form.estimated_prep_minutes as string) || 30,
      is_open: form.is_open,
      delivery_enabled: form.delivery_enabled,
      pickup_enabled: form.pickup_enabled,
      table_ordering_enabled: form.table_ordering_enabled,
      delivery_fee: parseFloat(form.delivery_fee as string) || 0,
      delivery_minimum_order: parseFloat(form.delivery_minimum_order as string) || 0,
      delivery_estimated_minutes: parseInt(form.delivery_estimated_minutes as string) || 30,
      business_hours: form.business_hours,
      closed_days: form.closed_days,
      delivery_zones: zonePayload,
    }).eq('id', restaurant.id);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-charcoal-200 border-t-brand-600" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold text-charcoal-700">Restaurante não encontrado.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-brand-600 font-semibold">Voltar ao início</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => navigate(`/dashboard/${slug}`)}
            className="mb-2 flex items-center gap-1 text-sm font-medium text-charcoal-500 transition-colors hover:text-charcoal-800"
          >
            <ChevronLeft className="h-4 w-4" /> Painel
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal-800 text-white shadow-lg">
              <SettingsIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-charcoal-900">Configurações</h1>
              <p className="text-sm text-charcoal-500">{restaurant.name}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedMsg && (
            <span className="flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Salvo!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-all hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
          <button
            onClick={() => signOut()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal-700"
            title="Sair"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-charcoal-100 p-1">
        <TabButton active={tab === 'general'} onClick={() => setTab('general')} icon={<Store className="h-4 w-4" />} label="Geral" />
        <TabButton active={tab === 'contact'} onClick={() => setTab('contact')} icon={<Phone className="h-4 w-4" />} label="Contato" />
        <TabButton active={tab === 'hours'} onClick={() => setTab('hours')} icon={<Clock className="h-4 w-4" />} label="Horários" />
        <TabButton active={tab === 'delivery'} onClick={() => setTab('delivery')} icon={<Bike className="h-4 w-4" />} label="Entrega" />
        <TabButton active={tab === 'appearance'} onClick={() => setTab('appearance')} icon={<Palette className="h-4 w-4" />} label="Aparência" />
      </div>

      {/* General tab */}
      {tab === 'general' && (
        <div className="space-y-4">
          <Card title="Informações do restaurante" icon={<Store className="h-5 w-5" />}>
            <FormField label="Nome" value={form.name as string} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <FormField label="Slogan / Tagline" value={form.tagline as string} onChange={(v) => setForm((f) => ({ ...f, tagline: v }))} />
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Descrição</label>
              <textarea
                value={form.description as string}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <FormField label="Endereço" value={form.address as string} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Moeda" value={form.currency as string} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} />
              <FormField label="Pedido mínimo (R$)" type="number" value={String(form.minimum_order)} onChange={(v) => setForm((f) => ({ ...f, minimum_order: v }))} />
            </div>
            <FormField label="Tempo estimado de preparo (min)" type="number" value={String(form.estimated_prep_minutes)} onChange={(v) => setForm((f) => ({ ...f, estimated_prep_minutes: v }))} />
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={form.is_open as boolean} onChange={(e) => setForm((f) => ({ ...f, is_open: e.target.checked }))} className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600" />
              <span className="text-sm font-medium text-charcoal-700">Restaurante aberto para pedidos</span>
            </label>
          </Card>

          <Card title="Logo e capa" icon={<ImageIcon className="h-5 w-5" />}>
            <ImageUploadField
              label="Logo do restaurante"
              currentUrl={form.logo_url as string}
              restaurantId={restaurant.id}
              type="logo"
              onUploaded={(url) => setForm((f) => ({ ...f, logo_url: url }))}
            />
            <ImageUploadField
              label="Imagem de capa"
              currentUrl={form.hero_url as string}
              restaurantId={restaurant.id}
              type="cover"
              onUploaded={(url) => setForm((f) => ({ ...f, hero_url: url }))}
            />
          </Card>
        </div>
      )}

      {/* Contact tab */}
      {tab === 'contact' && (
        <Card title="Contato e redes sociais" icon={<Phone className="h-5 w-5" />}>
          <FormField label="Telefone" value={form.phone as string} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} icon={<Phone className="h-4 w-4" />} />
          <FormField label="WhatsApp (com DDD)" value={form.whatsapp as string} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} icon={<MessageCircle className="h-4 w-4" />} placeholder="Ex: 5511999999999" />
          <FormField label="Instagram" value={form.instagram as string} onChange={(v) => setForm((f) => ({ ...f, instagram: v }))} icon={<Instagram className="h-4 w-4" />} placeholder="Ex: @meurestaurante" />
        </Card>
      )}

      {/* Hours tab */}
      {tab === 'hours' && (
        <Card title="Horários de funcionamento" icon={<Clock className="h-5 w-5" />}>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const hours = (form.business_hours as Record<string, { open: string; close: string; closed: boolean }>)[day];
              const isOpen = hours ? !hours.closed : true;
              const openTime = hours?.open ?? '09:00';
              const closeTime = hours?.close ?? '22:00';
              return (
                <div key={day} className="flex items-center gap-3 rounded-xl border border-charcoal-100 p-3">
                  <span className="w-20 text-sm font-semibold text-charcoal-700">{DAY_LABELS[day]}</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isOpen}
                      onChange={(e) => {
                        const newHours = { ...(form.business_hours as Record<string, { open: string; close: string; closed: boolean }>) };
                        newHours[day] = { open: openTime, close: closeTime, closed: !e.target.checked };
                        setForm((f) => ({ ...f, business_hours: newHours }));
                      }}
                      className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span className="text-xs text-charcoal-500">{isOpen ? 'Aberto' : 'Fechado'}</span>
                  </label>
                  {isOpen && (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="time"
                        value={openTime}
                        onChange={(e) => {
                          const newHours = { ...(form.business_hours as Record<string, { open: string; close: string; closed: boolean }>) };
                          newHours[day] = { open: e.target.value, close: closeTime, closed: false };
                          setForm((f) => ({ ...f, business_hours: newHours }));
                        }}
                        className="rounded-lg border border-charcoal-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                      />
                      <span className="text-charcoal-400">—</span>
                      <input
                        type="time"
                        value={closeTime}
                        onChange={(e) => {
                          const newHours = { ...(form.business_hours as Record<string, { open: string; close: string; closed: boolean }>) };
                          newHours[day] = { open: openTime, close: e.target.value, closed: false };
                          setForm((f) => ({ ...f, business_hours: newHours }));
                        }}
                        className="rounded-lg border border-charcoal-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Delivery tab */}
      {tab === 'delivery' && (
        <div className="space-y-4">
          <Card title="Opções de atendimento" icon={<Bike className="h-5 w-5" />}>
            <ToggleField label="Entrega (Delivery)" checked={form.delivery_enabled as boolean} onChange={(v) => setForm((f) => ({ ...f, delivery_enabled: v }))} />
            <ToggleField label="Retirada no balcão" checked={form.pickup_enabled as boolean} onChange={(v) => setForm((f) => ({ ...f, pickup_enabled: v }))} />
            <ToggleField label="Pedido na mesa" checked={form.table_ordering_enabled as boolean} onChange={(v) => setForm((f) => ({ ...f, table_ordering_enabled: v }))} />
          </Card>

          <Card title="Configurações de entrega" icon={<DollarSign className="h-5 w-5" />}>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Taxa de entrega (R$)" type="number" value={String(form.delivery_fee)} onChange={(v) => setForm((f) => ({ ...f, delivery_fee: v }))} />
              <FormField label="Pedido mínimo p/ entrega (R$)" type="number" value={String(form.delivery_minimum_order)} onChange={(v) => setForm((f) => ({ ...f, delivery_minimum_order: v }))} />
            </div>
            <FormField label="Tempo estimado de entrega (min)" type="number" value={String(form.delivery_estimated_minutes)} onChange={(v) => setForm((f) => ({ ...f, delivery_estimated_minutes: v }))} />
          </Card>

          <Card title="Zonas de entrega" icon={<MapPin className="h-5 w-5" />}>
            <p className="mb-3 text-xs text-charcoal-500">Defina zonas com taxas e tempos diferentes. A arquitetura suporta precificação por distância no futuro.</p>
            {zones.length === 0 ? (
              <p className="rounded-xl bg-charcoal-50 px-3 py-2.5 text-xs text-charcoal-400">Nenhuma zona configurada. A taxa padrão será usada.</p>
            ) : (
              <div className="space-y-2">
                {zones.map((zone, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl border border-charcoal-100 p-3">
                    <input
                      placeholder="Nome da zona"
                      value={zone.name}
                      onChange={(e) => setZones((prev) => prev.map((z, idx) => idx === i ? ({ ...z, name: e.target.value }) : z))}
                      className="flex-1 rounded-lg border border-charcoal-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Taxa"
                      value={zone.delivery_fee}
                      onChange={(e) => setZones((prev) => prev.map((z, idx) => idx === i ? ({ ...z, delivery_fee: e.target.value }) : z))}
                      className="w-20 rounded-lg border border-charcoal-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Min"
                      value={zone.estimated_minutes}
                      onChange={(e) => setZones((prev) => prev.map((z, idx) => idx === i ? ({ ...z, estimated_minutes: e.target.value }) : z))}
                      className="w-16 rounded-lg border border-charcoal-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                    />
                    <button
                      onClick={() => setZones((prev) => prev.filter((_, idx) => idx !== i))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-400 transition-colors hover:bg-error-50 hover:text-error-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setZones((prev) => [...prev, { name: '', delivery_fee: '5', estimated_minutes: '30' }])}
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-500"
            >
              <Plus className="h-4 w-4" /> Adicionar zona
            </button>
          </Card>
        </div>
      )}

      {/* Appearance tab */}
      {tab === 'appearance' && (
        <Card title="Cores do tema" icon={<Palette className="h-5 w-5" />}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-charcoal-400">Cor primária</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primary_color as string}
                  onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-charcoal-200"
                />
                <input
                  value={form.primary_color as string}
                  onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="flex-1 rounded-lg border border-charcoal-200 px-3 py-2 text-sm font-mono focus:border-brand-600 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-charcoal-400">Cor de destaque</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.accent_color as string}
                  onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-charcoal-200"
                />
                <input
                  value={form.accent_color as string}
                  onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                  className="flex-1 rounded-lg border border-charcoal-200 px-3 py-2 text-sm font-mono focus:border-brand-600 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl p-6" style={{ background: form.primary_color as string }}>
            <p className="text-sm font-bold text-white">Prévia da cor primária</p>
            <button className="mt-2 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: form.accent_color as string }}>
              Botão de destaque
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
        active ? 'bg-white text-charcoal-900 shadow-sm' : 'text-charcoal-500 hover:text-charcoal-700',
      )}
    >
      {icon} {label}
    </button>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-charcoal-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-charcoal-900">
        <span className="text-brand-600">{icon}</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', icon, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; icon?: React.ReactNode; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">{label}</label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400">{icon}</span>}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-charcoal-200 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600',
            icon ? 'pl-10 pr-4' : 'px-4',
          )}
        />
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-charcoal-300 text-brand-600 focus:ring-brand-600" />
      <span className="text-sm font-medium text-charcoal-700">{label}</span>
    </label>
  );
}

function ImageUploadField({ label, currentUrl, restaurantId, type, onUploaded }: {
  label: string; currentUrl: string; restaurantId: string; type: 'logo' | 'cover'; onUploaded: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    const result = await uploadRestaurantImage(restaurantId, file, type);
    if (result.success && result.url) {
      onUploaded(result.url);
    } else {
      setError(result.error ?? 'Erro ao enviar imagem');
    }
    setUploading(false);
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">{label}</label>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          <div className={cn('overflow-hidden rounded-xl border border-charcoal-200', type === 'logo' ? 'h-16 w-16' : 'h-16 w-28')}>
            <img src={currentUrl} alt={label} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className={cn('flex items-center justify-center rounded-xl bg-charcoal-100 text-charcoal-300', type === 'logo' ? 'h-16 w-16' : 'h-16 w-28')}>
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-full border border-charcoal-200 px-4 py-2 text-sm font-semibold text-charcoal-700 transition-colors hover:bg-charcoal-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Enviando...' : 'Enviar imagem'}
          </button>
          {error && <p className="mt-1 text-xs text-error-600">{error}</p>}
          <p className="mt-1 text-xs text-charcoal-400">JPG, PNG, WebP. Máx 5MB.</p>
        </div>
      </div>
    </div>
  );
}
