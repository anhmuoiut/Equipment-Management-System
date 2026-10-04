'use client';

/** Trang User Management (chỉ Admin): Masterlist + Detail Panel; lọc nhanh "Chờ duyệt". */
import { useTranslation } from 'react-i18next';
import { AccountStatusTag, ToneTag } from '@/components/ui/tags';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import { RowCard, type Column } from '@/components/ui/masterlist/Masterlist';
import { UserDetail } from './UserDetail';
import type { UserRow } from '@/lib/types';

export function UsersWorkspace() {
  const { t } = useTranslation();
  const list = useList<UserRow>('/api/users');

  const columns: Column<UserRow>[] = [
    { key: 'account_status', label: t('fields.account_status'), value: (r) => t(`values.${r.account_status}`),
      render: (r) => <AccountStatusTag status={r.account_status} />, filter: true },
    { key: 'full_name', label: t('fields.full_name'), value: (r) => r.full_name, render: (r) => <strong>{r.full_name}</strong> },
    { key: 'username', label: t('fields.username'), value: (r) => r.username },
    { key: 'email', label: t('fields.email'), value: (r) => r.email },
    { key: 'employee_id', label: t('fields.employee_id'), value: (r) => r.employee_id },
    { key: 'department', label: t('fields.department'), value: (r) => r.department, filter: true },
    { key: 'role', label: t('fields.role'), value: (r) => t(`values.${r.role}`), render: (r) => <ToneTag text={t(`values.${r.role}`)} tone="info" />, filter: true },
  ];

  return (
    <ModuleWorkspace<UserRow>
      title={t('nav.users')}
      list={list}
      columns={columns}
      mobileCard={(r) => (
        <RowCard
          title={r.full_name}
          tag={<AccountStatusTag status={r.account_status} />}
          lines={[[r.username, t(`values.${r.role}`)].join(' · '), [r.department, r.email].filter(Boolean).join(' · ')]}
        />
      )}
      storageKey="users"
      exportName="users"
      canAdd
      addLabel={t('usr.add')}
      detailPath={(id) => `/users/${id}`}
      quickFilters={[{ key: 'pending', label: t('usr.pendingFilter', { count: list.rows.filter((r) => r.account_status === 'pending').length }),
        test: (r) => r.account_status === 'pending' }]}
      renderDetail={(ctx) => <UserDetail ctx={ctx} layout="panel" />}
    />
  );
}
