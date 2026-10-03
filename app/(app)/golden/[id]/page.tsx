'use client';

import { use } from 'react';
import { RecordPage } from '@/components/ui/workspace/RecordPage';
import { GoldenDetail } from '@/components/golden/GoldenDetail';
import type { GoldenRow } from '@/lib/types';

export default function GoldenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RecordPage<GoldenRow> url={`/api/golden/${id}`} listPath="/golden">
      {(ctx) => <GoldenDetail ctx={ctx} layout="page" />}
    </RecordPage>
  );
}
