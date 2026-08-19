import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RestaurantUser, StaffRole } from '@/types';
import { cn } from '@/lib/utils';
import {
  Users, Plus, Loader2, X, ShieldCheck, UserCog, ChefHat, Bike, User, Crown,
} from 'lucide-react';

const ROLES: { value: StaffRole; label: string; icon: React.ReactNode }[] = [
  { value: 'Owner', label: 'Owner', icon: <Crown className="h-4 w-4" /> },
  { value: 'Manager', label: 'Manager', icon: <ShieldCheck className="h-4 w-4" /> },
  { value: 'Staff', label: 'Staff', icon: <UserCog className="h-4 w-4" /> },
  { value: 'Kitchen', label: 'Kitchen', icon: <ChefHat className="h-4 w-4" /> },
  { value: 'Driver', label: 'Driver', icon: <Bike className="h-4 w-4" /> },
];

const ROLE_COLORS: Record<StaffRole, string> = {
  Owner: 'bg-brand-100 text-brand-700',
  Manager: 'bg-success-100 text-success-700',
  Staff: 'bg-charcoal-100 text-charcoal-600',
  Kitchen: 'bg-warning-100 text-warning-700',
  Driver: 'bg-flame-100 text-flame-700',
};

type StaffMember = RestaurantUser & { email: string };

export function StaffManager({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', role: 'Staff' as StaffRole });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('restaurant_users')
      .select(`
        id, user_id, restaurant_id, role, is_active, created_at, updated_at
      `)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true });

    if (!data) { setLoading(false); return; }

    const userIds = data.map((d) => d.user_id);
    const { data: authUsers } = await supabase
      .from('auth.users')
      .select('id, email')
      .in('id', userIds);

    const emailMap = new Map<string, string>();
    (authUsers ?? []).forEach((u: { id: string; email: string }) => emailMap.set(u.id, u.email));

    const staffWithEmail: StaffMember[] = (data as RestaurantUser[]).map((ru) => ({
      ...ru,
      email: emailMap.get(ru.user_id) ?? '—',
    }));

    setStaff(staffWithEmail);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setAddError(null);
    setAdding(true);
    try {
      const { data: authUser, error: lookupError } = await supabase
        .from('auth.users')
        .select('id, email')
        .eq('email', addForm.email.toLowerCase())
        .maybeSingle();

      if (lookupError || !authUser) {
        setAddError('Usuario nao encontrado. O email precisa estar cadastrado no sistema.');
        setAdding(false);
        return;
      }

      const { error: insertError } = await supabase.from('restaurant_users').insert({
        user_id: authUser.id,
        restaurant_id: restaurantId,
        role: addForm.role,
        is_active: true,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          setAddError('Este usuario ja e membro deste restaurante.');
        } else {
          setAddError(insertError.message);
        }
        setAdding(false);
        return;
      }

      setShowAdd(false);
      setAddForm({ email: '', role: 'Staff' });
      await load();
    } finally {
      setAdding(false);
    }
  };

  const updateRole = async (memberId: string, role: StaffRole) => {
    await supabase.from('restaurant_users').update({ role }).eq('id', memberId);
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, role } : s)));
  };

  const toggleActive = async (memberId: string, isActive: boolean) => {
    await supabase.from('restaurant_users').update({ is_active: !isActive }).eq('id', memberId);
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, is_active: !isActive } : s)));
  };

  const removeMember = async (memberId: string) => {
    await supabase.from('restaurant_users').delete().eq('id', memberId);
    setStaff((prev) => prev.filter((s) => s.id !== memberId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-2xl animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal-900">
            <Users className="h-5 w-5 text-brand-600" /> Gerenciar Equipe
          </h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : staff.length === 0 ? (
            <p className="py-12 text-center text-charcoal-400">Nenhum membro na equipe.</p>
          ) : (
            <div className="space-y-3">
              {staff.map((member) => (
                <div key={member.id} className={cn(
                  'flex items-center justify-between rounded-2xl border p-4 transition-all',
                  member.is_active ? 'border-charcoal-200 bg-white' : 'border-charcoal-100 bg-charcoal-50 opacity-60',
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', ROLE_COLORS[member.role])}>
                      {ROLES.find((r) => r.value === member.role)?.icon ?? <User className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-charcoal-900">{member.email}</p>
                      <p className="text-xs text-charcoal-400">
                        {member.is_active ? 'Ativo' : 'Desativado'} · desde {new Date(member.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => updateRole(member.id, e.target.value as StaffRole)}
                      className="rounded-lg border border-charcoal-200 px-2 py-1.5 text-xs font-semibold text-charcoal-700 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => toggleActive(member.id, member.is_active)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        member.is_active
                          ? 'bg-warning-50 text-warning-700 hover:bg-warning-100'
                          : 'bg-success-50 text-success-700 hover:bg-success-100',
                      )}
                    >
                      {member.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => removeMember(member.id)}
                      className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-semibold text-error-700 transition-colors hover:bg-error-100"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-charcoal-100 p-5">
          {showAdd ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Email do usuario</label>
                  <input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={addForm.email}
                    onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-charcoal-400">Papel</label>
                  <select
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
                    className="w-full rounded-xl border border-charcoal-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {addError && <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700">{addError}</div>}
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={adding || !addForm.email.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  Adicionar membro
                </button>
                <button
                  onClick={() => { setShowAdd(false); setAddError(null); }}
                  className="rounded-full border border-charcoal-200 px-6 py-3 font-semibold text-charcoal-600 transition-colors hover:bg-charcoal-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500"
            >
              <Plus className="h-5 w-5" /> Adicionar membro a equipe
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
