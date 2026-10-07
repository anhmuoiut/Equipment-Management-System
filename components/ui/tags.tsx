'use client';

/**
 * Tag hiển thị dùng chung. Tag trạng thái tô bằng màu admin chọn ở
 * Configuration › Tag (tags.color, 5 màu hệ thống); hạn hiệu chuẩn và
 * trạng thái tài khoản có màu theo ý nghĩa — luôn kèm chữ, không chỉ màu.
 */
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/client/api';
import type { CalibrationStatus, DueState, StatusColor, TagItem } from '@/lib/types';

export function StatusTag({ name, color }: { name: string | null; color: StatusColor | null | undefined }) {
  if (!name) return null;
  return (
    <span className="tag tag-status" data-status-color={color ?? 'gray'}>{name}</span>
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

/**
 * Usage của thiết bị: In use (xanh đặc, chấm sáng) / Not in use (xám, chấm rỗng) — khác Status.
 * Chấm tròn chỉ có ở tag Usage; tag Status không có chấm.
 */
export function UsageTag({ usage }: { usage: 'in_use' | 'not_in_use' }) {
  const { t } = useTranslation();
  return (
    <span className="tag tag-usage" data-usage={usage}>
      <span className="tag-dot" aria-hidden="true" />{t(`values.${usage}`)}
    </span>
  );
}

/** Màu cố định của Calibration Status (hệ thống tự tính). */
export const CALIBRATION_STATUS_COLOR: Record<CalibrationStatus, StatusColor> = {
  under_calibration: 'blue', valid: 'green', due_soon: 'yellow', overdue: 'red',
};

/** Calibration Status: Under calibration / Valid / Due soon / Overdue — do hệ thống tự tính, không ai chọn. */
export function CalibrationStatusTag({ status }: { status: CalibrationStatus }) {
  const { t } = useTranslation();
  return <StatusTag name={t(`cal.status.${status}`)} color={CALIBRATION_STATUS_COLOR[status]} />;
}

/** Các thẻ đang gắn trên một bản ghi (tô màu admin chọn ở Configuration › Tag). */
export function TagChips({ items }: { items: TagItem[] }) {
  if (!items.length) return null;
  return (
    <span className="tag-chips">
      {items.map((tag) => <StatusTag key={tag.id} name={tag.display_name} color={tag.color} />)}
    </span>
  );
}

/** Ô Remark trong danh sách: thẻ rồi chữ ghi chú. */
export function RemarkCell({ tags, remark }: { tags: TagItem[]; remark: string | null }) {
  if (!tags.length && !remark) return null;
  return <span className="remark-cell"><TagChips items={tags} />{remark && <span>{remark}</span>}</span>;
}
