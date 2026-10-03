'use client';

/**
 * Trang Equipment — điểm ghép module: Equipment nhận nhóm Hiệu chuẩn của
 * module Calibration qua extension point, không import trực tiếp lẫn nhau.
 */
import { Suspense } from 'react';
import { EquipmentWorkspace } from '@/components/equipment/EquipmentWorkspace';
import { useEquipmentCalibrationSection } from '@/components/calibration/equipmentExtension';

function Page() {
  const calibration = useEquipmentCalibrationSection();
  return <EquipmentWorkspace extensions={[calibration]} />;
}

export default function EquipmentPage() {
  return <Suspense><Page /></Suspense>;
}
