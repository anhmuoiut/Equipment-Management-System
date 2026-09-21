/**
 * seed-first-admin — Spec v0.9 mục 55.2.
 *
 * KHÔNG CÓ BƯỚC NÀY THÌ KHÔNG TẠO ĐƯỢC USER NÀO:
 * POST /api/admin/users yêu cầu role admin, mà chưa có admin nào tồn tại.
 * Vòng lặp chicken-and-egg.
 *
 * Chạy: npx tsx scripts/seed-first-admin.ts admin@congty.com "Nguyen Van A"
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { normalizeUsername } from '../lib/auth/username';

async function main() {
  const [, , email, fullName, requestedUsername] = process.argv;
  if (!email || !fullName) {
    console.error('Usage: tsx scripts/seed-first-admin.ts <email> "<Full name>" [username]');
    process.exit(1);
  }

  const username = normalizeUsername(requestedUsername ?? email.split('@')[0]);
  if (!username) throw new Error('Invalid username. Use 1-64 supported characters.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: lookupError } = await db.from('user_profiles')
    .select('id').eq('username', username).limit(1);
  if (lookupError) throw new Error('Run database/full_reset.sql before creating an admin.');
  if (existing?.length) throw new Error('Username already exists.');

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
  const password = Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');

  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) {
    console.error('Tạo auth user thất bại:', error?.message);
    process.exit(1);
  }

  // role='admin' alone bypasses every permission check in the app (mục 17) —
  // there is no user_permissions row an admin needs, the same way an admin
  // was never given field_permissions rows either.
  const { error: profErr } = await db.from('user_profiles').insert({
    id: data.user.id,
    full_name: fullName,
    username,
    email,
    role: 'admin',
    is_active: true,
    must_change_password: true,
  });
  if (profErr) {
    await db.auth.admin.deleteUser(data.user.id);
    console.error('Tạo user_profiles thất bại:', profErr.message);
    process.exit(1);
  }

  console.log('\n  Admin đầu tiên đã được tạo.\n');
  console.log(`  Username  : ${username}`);
  console.log(`  Email     : ${email}`);
  console.log(`  Mật khẩu  : ${password}`);
  console.log('\n  Đăng nhập và ĐỔI MẬT KHẨU NGAY. Mật khẩu này không hiển thị lại.\n');

}

main().catch(() => {
  console.error('Admin setup failed unexpectedly. Check connectivity and configuration.');
  process.exitCode = 1;
});
