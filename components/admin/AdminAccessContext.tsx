'use client';

/**
 * Who is looking at an admin screen, handed down once by the (server) admin
 * layout — so the tab bar can hide sections this account can't open, and
 * pages know the viewer's own id (e.g. no Deactivate button on your own row)
 * without each one fetching /api/me.
 */
import { createContext, useContext } from 'react';
import type { Role } from '@/lib/permissions';

export type AdminAccess = { userId: string; role: Role; permissions: string[] };

const AdminAccessContext = createContext<AdminAccess | null>(null);

export function AdminAccessProvider({ value, children }: { value: AdminAccess; children: React.ReactNode }) {
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess(): AdminAccess {
  const value = useContext(AdminAccessContext);
  if (!value) throw new Error('useAdminAccess must be used under app/(app)/admin/layout.tsx');
  return value;
}
