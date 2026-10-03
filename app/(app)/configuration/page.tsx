import { redirect } from 'next/navigation';

/** Mở menu Configuration → danh sách đầu tiên (Part Number). */
export default function ConfigurationIndex() {
  redirect('/configuration/part-numbers');
}
