'use client';

import { Suspense } from 'react';
import { EquipmentMasterlist } from '@/components/equipment/EquipmentMasterlist';

export default function ArchivedEquipmentPage() {
  return (
    <Suspense fallback={null}>
      <EquipmentMasterlist archivedOnly />
    </Suspense>
  );
}
