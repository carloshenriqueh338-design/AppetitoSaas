import { lazy, Suspense } from 'react';
import { CartProvider, useCart } from '@/context/CartContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { Navbar } from '@/components/Navbar';
import { LegalFooter } from '@/components/LegalFooter';
import { RouteGuard } from '@/components/RouteGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LandingPage } from '@/pages/LandingPage';
import { MenuPage } from '@/pages/MenuPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { OrderTrackingPage } from '@/pages/OrderTrackingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicyPage';
import { TermsOfUsePage } from '@/pages/TermsOfUsePage';
import { Loader2 } from 'lucide-react';

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const BillingPage = lazy(() => import('@/pages/BillingPage').then(m => ({ default: m.BillingPage })));
const RestaurantSettingsPage = lazy(() => import('@/pages/RestaurantSettingsPage').then(m => ({ default: m.RestaurantSettingsPage })));
const KitchenPage = lazy(() => import('@/pages/KitchenPage').then(m => ({ default: m.KitchenPage })));
const DriverPage = lazy(() => import('@/pages/DriverPage').then(m => ({ default: m.DriverPage })));
const SuperAdminPage = lazy(() => import('@/pages/SuperAdminPage').then(m => ({ default: m.SuperAdminPage })));

function LazyFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

function AppShell() {
  const { route } = useRouter();
  const { count } = useCart();
  const { loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  let page: React.ReactNode;
  let fullScreen = false;
  let showNav = true;
  let showFooter = true;

  switch (route.name) {
    case 'home':
      page = <LandingPage />;
      break;
    case 'menu':
      page = <MenuPage slug={route.slug} table={route.table} />;
      break;
    case 'checkout':
      page = <CheckoutPage slug={route.slug} table={route.table} />;
      break;
    case 'dashboard':
      page = (
        <RouteGuard allowedRoles={['Owner', 'Manager', 'Staff', 'Kitchen', 'Driver']}>
          <DashboardPage slug={route.slug} />
        </RouteGuard>
      );
      break;
    case 'billing':
      page = (
        <RouteGuard allowedRoles={['Owner', 'Manager']}>
          <BillingPage slug={route.slug} />
        </RouteGuard>
      );
      break;
    case 'settings':
      page = (
        <RouteGuard allowedRoles={['Owner', 'Manager']}>
          <RestaurantSettingsPage slug={route.slug} />
        </RouteGuard>
      );
      break;
    case 'kitchen':
      page = (
        <RouteGuard allowedRoles={['Owner', 'Manager', 'Staff', 'Kitchen']}>
          <KitchenPage slug={route.slug} />
        </RouteGuard>
      );
      break;
    case 'driver':
      page = (
        <RouteGuard allowedRoles={['Driver', 'Owner', 'Manager']}>
          <DriverPage slug={route.slug} />
        </RouteGuard>
      );
      break;
    case 'track':
      page = <OrderTrackingPage slug={route.slug} orderId={route.orderId} />;
      break;
    case 'superadmin':
      page = (
        <RouteGuard allowedRoles={['SuperAdmin']} requireRestaurant={false}>
          <SuperAdminPage />
        </RouteGuard>
      );
      break;
    case 'login':
      page = <LoginPage />;
      fullScreen = true;
      showNav = false;
      showFooter = false;
      break;
    case 'forgot-password':
      page = <ForgotPasswordPage />;
      fullScreen = true;
      showNav = false;
      showFooter = false;
      break;
    case 'reset-password':
      page = <ResetPasswordPage />;
      fullScreen = true;
      showNav = false;
      showFooter = false;
      break;
    case 'unauthorized':
      page = <UnauthorizedPage />;
      fullScreen = true;
      showNav = false;
      showFooter = false;
      break;
    case 'privacy':
      page = <PrivacyPolicyPage slug={route.slug} />;
      break;
    case 'terms':
      page = <TermsOfUsePage slug={route.slug} />;
      break;
    default:
      page = <LandingPage />;
  }

  if (fullScreen) return <>{page}</>;

  return (
    <div className="flex min-h-screen flex-col">
      {showNav && <Navbar cartCount={count} />}
      <main className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<LazyFallback />}>
            {page}
          </Suspense>
        </ErrorBoundary>
      </main>
      {showFooter && <LegalFooter />}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
