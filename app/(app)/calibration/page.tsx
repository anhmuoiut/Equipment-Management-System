'use client';

import { Suspense } from 'react';
import { CalibrationWorkspace } from '@/components/calibration/CalibrationWorkspace';

export default function CalibrationPage() {
  return <Suspense><CalibrationWorkspace /></Suspense>;
}
