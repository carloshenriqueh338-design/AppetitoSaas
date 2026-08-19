import { type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { navigate } from '@/lib/router';
import { Loader2 } from 'lucide-react';
import type { AuthUser } from '@/types';

type AllowedRole = AuthUser['role'];

type RouteGuardProps = {
  children: ReactNode;
  allowedRoles?: AllowedRole[];
  requireRestaurant?: boolean;
};

export function RouteGuard({ children, allowedRoles, requireRestaurant = true }: RouteGuardProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  if (requireRestaurant && !user.restaurantId && user.role !== 'SuperAdmin') {
    navigate('/unauthorized');
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    navigate('/unauthorized');
    return null;
  }

  return <>{children}</>;
}
