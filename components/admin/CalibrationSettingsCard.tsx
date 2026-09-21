'use client';

/**
 * The Calibration Due Soon window (`app_settings.calibration.due_soon_days`)
 * — the only app-wide setting the backend currently exposes
 * (`/api/admin/calibration-settings`). It drives when a calibration's status
 * flips from VALID to DUE_SOON across the Dashboard and Equipment Masterlist,
 * so it lives here on Master Data next to the other admin-managed reference
 * values rather than as its own single-setting page.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/client/api';
import { Button, Notice, Spinner, toast } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';

export function CalibrationSettingsCard({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';

  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void api.get<{ due_soon_days: number }>('/api/admin/calibration-settings')
      .then((r) => setDays(String(r.data.due_soon_days)))
      .catch((e) => { if (e instanceof ApiError) setError(e); })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.put('/api/admin/calibration-settings', { due_soon_days: Number(days) });
      setSaved(true);
      toast.success(t('adminMasterData.calibrationSettingsSaved'));
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  }

  const valid = /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 3650;

  return (
    <div>
      <h2 className="text-[15px] font-semibold">{t('adminMasterData.calibrationSettingsTitle')}</h2>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-3)' }}>{t('adminMasterData.calibrationSettingsHint')}</p>
      {error && <div className="mt-2"><Notice tone="alert">{translateError(error.code, language, error.message)}</Notice></div>}
      {loading ? (
        <Spinner label={t('common.loadingEllipsis')} />
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-[13px]">
            {t('adminMasterData.dueSoonDays')}
            <input
              type="number" min={1} max={3650} value={days} disabled={!canManage}
              onChange={(e) => { setDays(e.target.value); setSaved(false); }}
              className="w-24 border px-2 py-1 text-[13px]" style={{ borderColor: 'var(--rule)' }}
            />
          </label>
          {canManage && (
            <Button size="sm" variant="primary" disabled={!valid || saved} loading={busy} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
