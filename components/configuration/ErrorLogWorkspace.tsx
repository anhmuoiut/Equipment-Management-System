'use client';

/** Configuration › HỆ THỐNG › Error log — chỉ xem; cùng Masterlist + Detail Panel. */
import { useTranslation } from 'react-i18next';
import { Bug } from 'lucide-react';
import { formatTime } from '@/lib/client/api';
import { DetailPanel, DetailSection, DetailValue } from '@/components/ui/detail/DetailPanel';
import { ErrorState } from '@/components/ui';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import type { Column } from '@/components/ui/masterlist/Masterlist';
import type { ErrorLogRow } from '@/lib/types';

export function ErrorLogWorkspace() {
  const { t } = useTranslation();
  const list = useList<ErrorLogRow>('/api/configuration/error-log');

  const columns: Column<ErrorLogRow>[] = [
    { key: 'created_at', label: t('fields.created_at'), value: (r) => r.created_at, render: (r) => formatTime(r.created_at) },
    { key: 'request_id', label: t('err.requestId'), value: (r) => r.request_id },
    { key: 'error_code', label: t('err.code'), value: (r) => r.error_code, filter: true },
    { key: 'route', label: t('err.route'), value: (r) => r.route, filter: true },
    { key: 'user_name', label: t('err.user'), value: (r) => r.user_name, filter: true },
    { key: 'message', label: t('err.message'), value: (r) => r.message, wrap: true, width: 260 },
  ];

  return (
    <ModuleWorkspace<ErrorLogRow & { created_by_name?: null }>
      title={t('cfg.list.error-log')}
      list={list}
      columns={columns}
      storageKey="configuration-error-log"
      exportName="error-log"
      canAdd={false}
      renderDetail={(ctx) => (
        <DetailPanel layout="panel" icon={<Bug size={18} />} title={ctx.row?.request_id ?? '…'}
          subtitle={ctx.row ? formatTime(ctx.row.created_at) : undefined} nav={ctx.nav} onClose={ctx.onClose}>
          {ctx.error ? <ErrorState message={ctx.error} /> : ctx.row && (
            <div className="dp-body-inner">
              <DetailSection title={t('err.group')}>
                <DetailValue label={t('err.requestId')}>{ctx.row.request_id}</DetailValue>
                <DetailValue label={t('err.code')}>{ctx.row.error_code}</DetailValue>
                <DetailValue label={t('err.route')} wide>{ctx.row.route}</DetailValue>
                <DetailValue label={t('err.user')}>{ctx.row.user_name}</DetailValue>
                <DetailValue label={t('fields.created_at')}>{formatTime(ctx.row.created_at)}</DetailValue>
                <DetailValue label={t('err.message')} wide>{ctx.row.message}</DetailValue>
                <DetailValue label={t('err.stack')} wide>{ctx.row.stack && <pre className="dp-pre">{ctx.row.stack}</pre>}</DetailValue>
              </DetailSection>
            </div>
          )}
        </DetailPanel>
      )}
    />
  );
}
