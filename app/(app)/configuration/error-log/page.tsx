'use client';

import { Suspense } from 'react';
import { ErrorLogWorkspace } from '@/components/configuration/ErrorLogWorkspace';

export default function ErrorLogPage() {
  return <Suspense><ErrorLogWorkspace /></Suspense>;
}
