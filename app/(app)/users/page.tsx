'use client';

import { Suspense } from 'react';
import { UsersWorkspace } from '@/components/users/UsersWorkspace';

export default function UsersPage() {
  return <Suspense><UsersWorkspace /></Suspense>;
}
