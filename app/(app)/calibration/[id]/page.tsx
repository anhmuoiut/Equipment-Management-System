'use client';

import { use } from 'react';
import { RecordPage } from '@/components/ui/workspace/RecordPage';
import { CalibrationDetail } from '@/components/calibration/CalibrationDetail';
import type { CalibrationRow } from '@/lib/types';

export default function CalibrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RecordPage<CalibrationRow> url={`/api/calibration/${id}`} listPath="/calibration">
      {(ctx) => <CalibrationDetail ctx={ctx} layout="page" />}
    </RecordPage>
  );
}
