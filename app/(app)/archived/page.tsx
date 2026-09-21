import { redirect } from 'next/navigation';

/** Archived equipment moved under /equipment/archived (Equipment section). */
export default function ArchivedRedirect() {
  redirect('/equipment/archived');
}
