'use client';

/**
 * Người đang xem trang — AppShell đặt một lần, mọi module đọc để ẩn / hiện
 * nút theo nhóm quyền. Server vẫn kiểm tra lại mọi thao tác (withAuth).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { canDelete, canEdit, isAdmin, type Role } from '@/lib/permissions';

export type Viewer = { userId: string; username: string; fullName: string; role: Role };

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error('useViewer outside ViewerProvider');
  return viewer;
}

/** Quyền của người đang xem: sửa (Admin, User), xóa và quản trị (Admin). */
export function useCan() {
  const { role } = useViewer();
  return { edit: canEdit(role), remove: canDelete(role), admin: isAdmin(role) };
}
