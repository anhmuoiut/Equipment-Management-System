'use client';

/**
 * Chi tiết tài khoản (docs/DETAIL_MODEL.md 4.5). Tài khoản chờ duyệt có nút
 * chính Duyệt / Từ chối; [⋯]: Đặt lại mật khẩu · Khóa / Mở khóa. Không bao
 * giờ hiện mật khẩu đã băm, token_version, sessions_revoked_at.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, KeyRound, Lock, LockOpen, UserRound, X } from 'lucide-react';
import { api, formatTime } from '@/lib/client/api';
import { toSelect, useOptions } from '@/lib/client/options';
import { useViewer } from '@/components/ViewerContext';
import { AccountStatusTag, ToneTag } from '@/components/ui/tags';
import { ActionField, ActionScreen, RecordDetail, type ActionCtx, type SectionDef } from '@/components/ui/detail/RecordDetail';
import type { PanelLayout } from '@/components/ui/detail/DetailPanel';
import type { DetailCtx } from '@/components/ui/workspace/ModuleWorkspace';
import { ROLES, type Role } from '@/lib/permissions';
import type { UserRow } from '@/lib/types';

export function UserDetail({ ctx, layout }: { ctx: DetailCtx<UserRow>; layout: PanelLayout }) {
  const { t } = useTranslation();
  const options = useOptions();
  const viewer = useViewer();
  const roleOptions = ROLES.map((r) => ({ value: r, label: t(`values.${r}`) }));

  const sections: SectionDef<UserRow>[] = [
    {
      key: 'account', title: t('usr.groupAccount'), fields: [
        { key: 'username', label: t('fields.username'), required: true, maxLength: 64, hint: t('usr.usernameHint') },
        { key: 'full_name', label: t('fields.full_name'), required: true, maxLength: 200 },
        { key: 'email', label: t('fields.email'), maxLength: 200,
          lock: (r) => (r?.auth_provider === 'supabase' ? t('usr.emailLocked') : null) },
        { key: 'employee_id', label: t('fields.employee_id'), maxLength: 100 },
        { key: 'department_id', label: t('fields.department'), kind: 'select', view: (r) => r.department,
          options: (_d, r) => toSelect(options?.departments, r?.department_id, ` (${t('cfg.hidden')})`) },
        { key: 'password', label: t('usr.initialPassword'), kind: 'password', required: true, createOnly: true, hint: t('usr.passwordHint') },
      ],
    },
    {
      key: 'permission', title: t('usr.groupPermission'), fields: [
        { key: 'role', label: t('fields.role'), kind: 'select', required: true, options: roleOptions,
          view: (r) => <ToneTag text={t(`values.${r.role}`)} tone="info" />,
          lock: (r) => (r?.id === viewer.userId ? t('usr.ownRoleLocked') : null) },
      ],
    },
    {
      key: 'status', title: t('usr.groupStatus'), hideInCreate: true, fields: [
        { key: 'account_status', label: t('fields.account_status'), readOnly: true, view: (r) => <AccountStatusTag status={r.account_status} /> },
        { key: 'approved_by', label: t('fields.approved_by'), readOnly: true, view: (r) => r.approved_by_name },
        { key: 'approved_at', label: t('fields.approved_at'), readOnly: true, view: (r) => (r.approved_at ? formatTime(r.approved_at) : null) },
        { key: 'auth_provider', label: t('fields.auth_provider'), readOnly: true, view: (r) => t(`values.${r.auth_provider}`) },
        { key: 'must_change_password', label: t('fields.must_change_password'), readOnly: true,
          view: (r) => (r.must_change_password ? t('common.yes') : t('common.no')) },
      ],
    },
  ];

  return (
    <RecordDetail<UserRow>
      layout={layout}
      record={ctx.row}
      creating={ctx.creating}
      loading={ctx.loading}
      error={ctx.error}
      onRetry={ctx.onRetry}
      icon={<UserRound size={18} />}
      createTitle={t('usr.addTitle')}
      heading={(r) => ({
        title: r.full_name,
        tags: <><AccountStatusTag status={r.account_status} /><ToneTag text={t(`values.${r.role}`)} tone="info" /></>,
        subtitle: [r.username, r.department].filter(Boolean).join(' · '),
        meta: <span>{t('usr.createdAt', { when: formatTime(r.created_at) })}</span>,
      })}
      sections={sections}
      defaults={{ role: 'readonly' }}
      validate={(d): Record<string, string> =>
        (typeof d.password === 'string' && d.password.length > 0 && d.password.length < 10 ? { password: t('usr.passwordHint') } : {})}
      historyUrl={(r) => `/api/users/${r.id}/history`}
      historyLabels={{ department: t('fields.department'), approved_by: t('fields.approved_by') }}
      canEdit
      onSave={async (payload, record) => {
        const res = record
          ? await api.put<UserRow>(`/api/users/${record.id}`, payload)
          : await api.post<UserRow>('/api/users', payload);
        return { row: res.data };
      }}
      actions={[
        { key: 'approve', label: t('usr.approve'), primary: true, icon: <Check size={14} aria-hidden="true" />,
          visible: (r) => r.account_status === 'pending', screen: (a) => <ApproveScreen ctx={a} /> },
        { key: 'reject', label: t('usr.reject'), primary: true, icon: <X size={14} aria-hidden="true" />,
          visible: (r) => r.account_status === 'pending', screen: (a) => <RejectScreen ctx={a} /> },
        { key: 'password', label: t('usr.resetPassword'), icon: <KeyRound size={14} aria-hidden="true" />,
          visible: (r) => r.id !== viewer.userId && r.account_status === 'active', screen: (a) => <ResetPasswordScreen ctx={a} /> },
        { key: 'disable', label: t('usr.disable'), icon: <Lock size={14} aria-hidden="true" />,
          visible: (r) => r.id !== viewer.userId && r.account_status === 'active', screen: (a) => <DisableScreen ctx={a} /> },
        { key: 'enable', label: t('usr.enable'), icon: <LockOpen size={14} aria-hidden="true" />,
          visible: (r) => r.account_status === 'disabled', runMessage: t('usr.enabled'),
          run: async (r) => (await api.post<UserRow>(`/api/users/${r.id}/enable`)).data },
      ]}
      nav={ctx.nav}
      onClose={ctx.onClose}
      onExpand={ctx.onExpand}
      onSaved={ctx.onSaved}
      onDeleted={ctx.onDeleted}
      leaveRef={ctx.leaveRef}
    />
  );
}

function ApproveScreen({ ctx }: { ctx: ActionCtx<UserRow> }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role>('readonly');
  async function confirm() {
    ctx.done((await api.post<UserRow>(`/api/users/${ctx.record.id}/approve`, { role })).data, t('usr.approved'));
  }
  return (
    <ActionScreen title={t('usr.approve')} description={t('usr.approveDesc', { name: ctx.record.full_name, username: ctx.record.username })}
      onCancel={ctx.cancel} onConfirm={confirm} confirmLabel={t('usr.approve')}>
      <ActionField label={t('fields.role')} required>
        <div className="dp-checks" role="radiogroup" aria-label={t('fields.role')}>
          {ROLES.map((r) => (
            <label key={r}>
              <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
              {t(`values.${r}`)} <span className="dp-hint">— {t(`usr.roleHint.${r}`)}</span>
            </label>
          ))}
        </div>
      </ActionField>
    </ActionScreen>
  );
}

function RejectScreen({ ctx }: { ctx: ActionCtx<UserRow> }) {
  const { t } = useTranslation();
  async function confirm() {
    ctx.done((await api.post<UserRow>(`/api/users/${ctx.record.id}/reject`)).data, t('usr.rejected'));
  }
  return (
    <ActionScreen title={t('usr.reject')} description={t('usr.rejectDesc', { name: ctx.record.full_name })}
      onCancel={ctx.cancel} onConfirm={confirm} confirmLabel={t('usr.reject')} danger />
  );
}

function ResetPasswordScreen({ ctx }: { ctx: ActionCtx<UserRow> }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  async function confirm() {
    ctx.done((await api.post<UserRow>(`/api/users/${ctx.record.id}/password`, { password })).data, t('usr.passwordReset'));
  }
  return (
    <ActionScreen title={t('usr.resetPassword')} description={t('usr.resetDesc', { name: ctx.record.full_name })}
      onCancel={ctx.cancel} onConfirm={confirm} confirmDisabled={password.length < 10}>
      <ActionField label={t('usr.newPassword')} required hint={t('usr.passwordHint')}>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </ActionField>
    </ActionScreen>
  );
}

function DisableScreen({ ctx }: { ctx: ActionCtx<UserRow> }) {
  const { t } = useTranslation();
  async function confirm() {
    ctx.done((await api.post<UserRow>(`/api/users/${ctx.record.id}/disable`)).data, t('usr.disabled'));
  }
  return (
    <ActionScreen title={t('usr.disable')} description={t('usr.disableDesc', { name: ctx.record.full_name })}
      onCancel={ctx.cancel} onConfirm={confirm} confirmLabel={t('usr.disable')} danger />
  );
}
