'use client';

import { Suspense } from 'react';
import { EquipmentMasterlist } from '@/components/equipment/EquipmentMasterlist';

export default function EquipmentPage() {
  return (
    <Suspense fallback={null}>
      <EquipmentMasterlist archivedOnly={false} />
    </Suspense>
  );
}
