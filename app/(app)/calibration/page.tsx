'use client';

import { Suspense } from 'react';
import { CalibrationList } from '@/components/calibration/CalibrationList';

export default function CalibrationPage() {
  return (
    <Suspense fallback={null}>
      <CalibrationList />
    </Suspense>
  );
}
