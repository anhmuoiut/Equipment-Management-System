'use client';

/**
 * Printable Equipment Label — deliberately outside the (app) route group so
 * it renders with no sidebar/topbar, just the root layout (theme + i18n
 * providers only). Reachable only by an authenticated session — middleware
 * protects every non-public route the same way it protects the rest of the
 * app; this page adds no auth logic of its own.
 *
 * The QR code is generated client-side from the equipment's deep link
 * (/equipment/{uuid}) at render/print time and never stored anywhere — see
 * the QR/label requirement in the V2 spec. The immutable equipment UUID is
 * the encoded identifier, not the Serial Number, so the link keeps working
 * even if the serial is ever corrected.
 */
import { useEffect, useState, use as usePromise } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/client/api';
import type { EquipmentRow } from '@/lib/types';
import { translateError } from '@/lib/i18n/errors';

export default function EquipmentLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [eq, setEq] = useState<EquipmentRow | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void api.get<EquipmentRow>(`/api/equipment/${id}`)
      .then((r) => setEq(r.data))
      .catch((e) => { if (e instanceof ApiError) setError(e); });
  }, [id]);

  useEffect(() => {
    const url = `${window.location.origin}/equipment/${id}`;
    void QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#002B49', light: '#FFFFFF' } }).then(setQrDataUrl);
  }, [id]);

  if (error) {
    return <main className="label-page"><p className="label-error">{translateError(error.code, language, error.message)}</p></main>;
  }
  if (!eq || !qrDataUrl) {
    return <main className="label-page"><p>{t('common.loadingEllipsis')}</p></main>;
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
