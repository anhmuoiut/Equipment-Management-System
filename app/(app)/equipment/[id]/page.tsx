'use client';

/** Chi tiết thiết bị toàn trang — nút ⤢ và link QR (/equipment/{id}). */
import { use } from 'react';
import { RecordPage } from '@/components/ui/workspace/RecordPage';
import { EquipmentDetail } from '@/components/equipment/EquipmentDetail';
import { useEquipmentCalibrationSection } from '@/components/calibration/equipmentExtension';
import type { EquipmentRow } from '@/lib/types';

export default function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const calibration = useEquipmentCalibrationSection();
  return (
    <RecordPage<EquipmentRow> url={`/api/equipment/${id}`} listPath="/equipment">
      {(ctx) => <EquipmentDetail ctx={ctx} layout="page" extensions={[calibration]} />}
    </RecordPage>
  );
}
