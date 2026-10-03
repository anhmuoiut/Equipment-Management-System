'use client';

import { Suspense } from 'react';
import { GoldenWorkspace } from '@/components/golden/GoldenWorkspace';

export default function GoldenPage() {
  return <Suspense><GoldenWorkspace /></Suspense>;
}
