'use client';

import { Suspense, use } from 'react';
import { notFound } from 'next/navigation';
import { configList } from '@/lib/configuration';
import { ConfigWorkspace } from '@/components/configuration/ConfigWorkspace';

export default function ConfigListPage({ params }: { params: Promise<{ list: string }> }) {
  const { list } = use(params);
  const def = configList(list);
  if (!def) notFound();
  return <Suspense><ConfigWorkspace key={def.key} listKey={def.key} /></Suspense>;
}
