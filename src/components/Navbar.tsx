import { Logo } from '@/components/Logo';
import { navigate } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import { ShoppingCart, LayoutDashboard, Bike, Home, Crown, LogIn, LogOut, ChefHat, CreditCard, Settings } from 'lucide-react';

export function Navbar({ cartCount = 0 }: { cartCount?: number }) {
  const { user, signOut } = useAuth();

  const dashboardSlug = user?.restaurantSlug ?? 'burger-casa';
  const isStaff = user && user.role !== 'SuperAdmin';
  const isSuperAdmin = user?.role === 'SuperAdmin';

  return (
    <header className="sticky top-0 z-40 border-b border-charcoal-200/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <button onClick={() => navigate('/')} className="transition-transform hover:scale-[1.02]">
          <Logo />
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          <NavButton icon={<Home className="h-4 w-4" />} label="Início" onClick={() => navigate('/')} />
          {isStaff && (
            <NavButton icon={<LayoutDashboard className="h-4 w-4" />} label="Painel" onClick={() => navigate(`/dashboard/${dashboardSlug}`)} />
          )}
          {isStaff && (user?.role === 'Owner' || user?.role === 'Manager') && (
            <NavButton icon={<CreditCard className="h-4 w-4" />} label="Assinatura" onClick={() => navigate(`/billing/${dashboardSlug}`)} />
          )}
          {isStaff && (user?.role === 'Owner' || user?.role === 'Manager') && (
            <NavButton icon={<Settings className="h-4 w-4" />} label="Config" onClick={() => navigate(`/settings/${dashboardSlug}`)} />
          )}
          {isStaff && (user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Staff' || user?.role === 'Kitchen') && (
            <NavButton icon={<ChefHat className="h-4 w-4" />} label="Cozinha" onClick={() => navigate(`/kitchen/${dashboardSlug}`)} />
          )}
          {isStaff && (user?.role === 'Driver' || user?.role === 'Owner' || user?.role === 'Manager') && (
            <NavButton icon={<Bike className="h-4 w-4" />} label="Entregador" onClick={() => navigate(`/driver/${dashboardSlug}`)} />
          )}
          {isSuperAdmin && (
            <NavButton icon={<Crown className="h-4 w-4" />} label="Super-Admin" onClick={() => navigate('/superadmin')} />
          )}
          {cartCount > 0 && (
            <button
              onClick={() => navigate(`/r/${dashboardSlug}`)}
              className="relative flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-all hover:bg-brand-700"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrinho</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-brand-600">
                {cartCount}
              </span>
            </button>
          )}
          {user ? (
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-charcoal-500 transition-colors hover:bg-charcoal-100 hover:text-charcoal-900"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 rounded-full bg-charcoal-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-charcoal-700"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Entrar</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-charcoal-600 transition-colors hover:bg-charcoal-100 hover:text-charcoal-900"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
