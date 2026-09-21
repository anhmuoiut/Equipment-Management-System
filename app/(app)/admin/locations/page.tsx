import { redirect } from 'next/navigation';

/** Locations management moved onto the Master data page. */
export default function AdminLocationsRedirect() {
  redirect('/admin/master-data');
}
