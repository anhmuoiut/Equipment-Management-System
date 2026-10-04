'use client';

/**
 * Tag hiển thị dùng chung. Tag trạng thái tô bằng màu admin chọn ở
 * Configuration › Status (statuses.color, 5 màu hệ thống); hạn hiệu chuẩn và
 * trạng thái tài khoản có màu theo ý nghĩa — luôn kèm chữ, không chỉ màu.
 */
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/client/api';
import type { DueState, StatusColor } from '@/lib/types';

export function StatusTag({ name, color }: { name: string | null; color: StatusColor | null | undefined }) {
  if (!name) return null;
  return (
    <span className="tag tag-status" data-status-color={color ?? 'gray'}>
      <span className="tag-dot" aria-hidden="true" />{name}
    </span>
  );
}

export function ToneTag({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'alert' | 'neutral' | 'info' }) {
  return <span className="tag" data-tone={tone}>{text}</span>;
}

const DUE_TONE: Record<DueState, 'ok' | 'warn' | 'alert' | 'neutral'> = {
  overdue: 'alert', due_soon: 'warn', ok: 'ok', none: 'neutral', no_interval: 'neutral',
};

/** Ngày đến hạn có màu: đỏ = quá hạn, vàng = sắp đến hạn. */
export function DueDate({ date, state }: { date: string | null; state: DueState }) {
  const { t } = useTranslation();
  if (state === 'no_interval') return <span className="due" data-tone="neutral">{t('cal.noInterval')}</span>;
  if (!date) return null;
  return (
    <span className="due" data-tone={DUE_TONE[state]} title={t(`cal.due.${state}`)}>
      {formatDate(date)}
      {(state === 'overdue' || state === 'due_soon') && <span className="due-label">{t(`cal.due.${state}`)}</span>}
    </span>
  );
}

const ACCOUNT_TONE = { pending: 'warn', active: 'ok', rejected: 'neutral', disabled: 'alert' } as const;

export function AccountStatusTag({ status }: { status: keyof typeof ACCOUNT_TONE }) {
  const { t } = useTranslation();
  return <ToneTag text={t(`values.${status}`)} tone={ACCOUNT_TONE[status]} />;
}
