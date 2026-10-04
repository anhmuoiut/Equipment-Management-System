'use client';

/**
 * Printable Equipment Label — deliberately outside the (app) route group so
 * it renders with no sidebar/topbar, just the root layout (theme + i18n
 * providers only). Reachable only by an authenticated session — middleware
 * protects every non-public route the same way it protects the rest of the
 * app; this page adds no auth logic of its own.
 *
 * The QR code is generated client-side from the equipment's deep link
 * (/equipment/{uuid}) at render/print time and never stored anywhere. The
 * immutable equipment UUID is
 * the encoded identifier, not the Serial Number, so the link keeps working
 * even if the serial is ever corrected.
 */
import { useEffect, useState, use as usePromise } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/client/api';
import { useFetch } from '@/lib/client/useFetch';
import { ErrorState, Spinner } from '@/components/ui';
import type { EquipmentRow } from '@/lib/types';

export default function EquipmentLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { t } = useTranslation();
  const { data: eq, error, reload } = useFetch<EquipmentRow>(`/api/equipment/${id}`);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/equipment/${id}`;
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#002B49', light: '#FFFFFF' } })
      .then(setQrDataUrl, (e: unknown) => setQrError(errorMessage(e, t)));
  }, [id, t]);

  const failure = error ?? qrError;
  if (failure) {
    return <main className="label-page"><ErrorState message={failure} onRetry={error ? reload : undefined} /></main>;
  }
  if (!eq || !qrDataUrl) {
    return <main className="label-page"><Spinner label={t('common.loadingEllipsis')} size="lg" /></main>;
  }

  return (
    <main className="label-page">
      <div className="label-toolbar no-print">
        <button type="button" onClick={() => window.print()}>{t('label.print')}</button>
      </div>
      <div className="label-card">
        <p className="label-heading">{t('label.equipment')}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a locally
            generated data: URL gains nothing from next/image's remote
            optimization pipeline. */}
        <img src={qrDataUrl} alt={t('label.qrAlt', { serial: eq.serial_number })} className="label-qr" />
        <p className="label-field"><span>{t('label.serialShort')}</span><strong className="ident">{eq.serial_number}</strong></p>
        {eq.part_number && <p className="label-field"><span>{t('label.partShort')}</span><strong className="ident">{eq.part_number}</strong></p>}
      </div>
    </main>
  );
}
