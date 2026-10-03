'use client';

import { use } from 'react';
import { RecordPage } from '@/components/ui/workspace/RecordPage';
import { UserDetail } from '@/components/users/UserDetail';
import type { UserRow } from '@/lib/types';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RecordPage<UserRow> url={`/api/users/${id}`} listPath="/users">
      {(ctx) => <UserDetail ctx={ctx} layout="page" />}
    </RecordPage>
  );
}
