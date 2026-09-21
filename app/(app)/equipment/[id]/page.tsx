'use client';

/**
 * Direct Equipment Detail route — the QR/label deep-link target
 * (`/equipment/{equipment_id}`, the immutable uuid, never the serial
 * number). Scan → open app → land exactly here; if not authenticated,
 * middleware.ts already redirects to `/login?next=/equipment/{id}` and the
 * login page already restores that destination after sign-in (see
 * lib/auth/username.ts's safeLoginDestination and app/login/page.tsx) — no
 * extra plumbing needed for that flow.
 *
 * Reuses EquipmentDetailModal exactly as the Masterlist's row-click overlay
 * does, just rendered in the page's normal flow instead of a fixed overlay,
 * so a directly-opened link looks like a real page rather than a dialog
 * with nothing behind it.
 */
import { useEffect, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type FieldDefinition, type LocationRef, type MasterDataRef, type StatusRef } from '@/lib/client/api';
import { Notice, Spinner } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';
import { EquipmentDetailModal, type Me } from '@/components/equipment/EquipmentDetailModal';

type Bootstrap = {
  me: Me; fields: FieldDefinition[]; locations: LocationRef[];
  equipmentTypes: MasterDataRef[]; equipmentLevels: MasterDataRef[]; equipmentStatuses: StatusRef[];
};

export default function EquipmentDirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [meRes, fieldRes, locRes, masterRes] = await Promise.all([
          api.get<Me>('/api/me'),
          api.get<{ fields: FieldDefinition[]; editable_fields: string[] }>('/api/fields'),
          api.get<LocationRef[]>('/api/locations'),
          api.get<{ types: MasterDataRef[]; statuses: StatusRef[]; levels: MasterDataRef[] }>('/api/master-data'),
        ]);
        setBoot({
          me: { ...meRes.data, editable_fields: meRes.data.editable_fields },
          fields: fieldRes.data.fields, locations: locRes.data,
          equipmentTypes: masterRes.data.types, equipmentLevels: masterRes.data.levels, equipmentStatuses: masterRes.data.statuses,
        });
      } catch (e) {
        if (e instanceof ApiError) setError(e);
      }
    })();
  }, []);

  if (error) {
    return <div className="equipment-direct-page"><Notice tone="alert">{translateError(error.code, language, error.message)}</Notice></div>;
  }
  if (!boot) {
    return <div className="equipment-direct-page"><Spinner label={t('common.loadingEllipsis')} /></div>;
  }

  return (
    <div className="equipment-direct-page">
      <div className="equipment-detail-page-frame">
        <EquipmentDetailModal
          id={id}
          me={boot.me}
          fields={boot.fields}
          locations={boot.locations}
          equipmentTypes={boot.equipmentTypes}
          equipmentLevels={boot.equipmentLevels}
          equipmentStatuses={boot.equipmentStatuses}
          initialMode="view"
          onClose={() => router.push('/equipment')}
          onChanged={() => {}}
          onOpenOther={(otherId) => router.push(`/equipment/${otherId}`)}
        />
      </div>
    </div>
  );
}
