/**
 * seed-first-admin — tạo tài khoản Admin đầu tiên (chưa có admin thì không ai
 * duyệt / tạo được tài khoản khác).
 *
 * Chạy (từ thư mục Equipment-Management-System):
 *   npm run seed:admin -- admin@congty.com "Nguyen Van A" [username]
 *
 * - Tự đọc .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * - Tự tin chứng chỉ của Windows (mạng công ty có proxy SSL).
 * - Email đã có trong Supabase Auth (tài khoản cũ): dùng lại tài khoản đó và
 *   đặt mật khẩu mới, thay vì báo lỗi.
 * - Cần database/04_functions.sql (ghi qua app_write để lịch sử ghi CREATE).
 */
import { existsSync } from 'node:fs';
import tls from 'node:tls';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { normalizeUsername } from '../lib/auth/username';

function trustSystemCertificates() {
  const t = tls as typeof tls & {
    getCACertificates?: (type: 'default' | 'system') => string[];
    setDefaultCACertificates?: (certs: string[]) => void;
  };
  if (typeof t.getCACertificates !== 'function' || typeof t.setDefaultCACertificates !== 'function') return;
  try {
    t.setDefaultCACertificates([...new Set([...t.getCACertificates('default'), ...t.getCACertificates('system')])]);
  } catch {
    // Node cũ: giữ mặc định; nếu bị proxy chặn SSL, chạy bằng `node --use-system-ca`.
  }
}

async function findAuthUserByEmail(db: SupabaseClient, email: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Không đọc được danh sách Supabase Auth: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  trustSystemCertificates();

  const [, , rawEmail, fullName, requestedUsername] = process.argv;
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !fullName) {
    console.error('Cách dùng: npm run seed:admin -- <email> "<Họ tên>" [username]');
    process.exit(1);
  }
  const username = normalizeUsername(requestedUsername ?? email.split('@')[0]);
  if (!username) throw new Error('Username không hợp lệ: chỉ chữ thường không dấu, số và . _ + - (tối đa 64 ký tự).');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (đặt trong .env.local).');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: lookupError } = await db.from('user_profiles').select('id').eq('username', username).limit(1);
  if (lookupError) throw new Error(`Không đọc được user_profiles — đã chạy database/01, 02, 04 chưa? (${lookupError.message})`);
  if (existing?.length) throw new Error(`Username "${username}" đã tồn tại.`);

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
  const password = Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');

  // Tài khoản Supabase Auth: email đã có (tài khoản cũ) thì dùng lại; chưa có thì tạo mới.
  // Mật khẩu của tài khoản cũ chỉ đổi SAU KHI tạo hồ sơ thành công — lỗi giữa chừng không đổi gì.
  let authUserId: string;
  let createdAuthUser = false;
  const old = await findAuthUserByEmail(db, email);
  if (old) {
    const { data: profile } = await db.from('user_profiles').select('id').eq('id', old.id).maybeSingle();
    if (profile) throw new Error(`Email ${email} đã gắn với một tài khoản trong user_profiles.`);
    authUserId = old.id;
  } else {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (!created.data.user) throw new Error(`Tạo tài khoản Supabase Auth thất bại: ${created.error?.message ?? 'unknown'}`);
    authUserId = created.data.user.id;
    createdAuthUser = true;
  }

  // Ghi qua app_write (database/04_functions.sql) với source 'script' → lịch sử ghi CREATE.
  const { error: profErr } = await db.rpc('app_write', {
    p_table: 'user_profiles',
    p_op: 'insert',
    p_id: null,
    p_data: {
      id: authUserId,
      full_name: fullName,
      username,
      email,
      role: 'admin',
      account_status: 'active',
      auth_provider: 'supabase',
      must_change_password: true,
    },
    p_actor: null,
    p_note: 'seed-first-admin',
    p_source: 'script',
  });
  if (profErr) {
    if (createdAuthUser) await db.auth.admin.deleteUser(authUserId);
    const hint = profErr.code === 'PGRST202' ? ' — chưa chạy database/04_functions.sql?' : '';
    throw new Error(`Tạo user_profiles thất bại: ${profErr.message}${hint}`);
  }
  if (!createdAuthUser) {
    const { error } = await db.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
    if (error) throw new Error(`Đã tạo hồ sơ admin nhưng không đặt được mật khẩu mới: ${error.message}`);
    console.log(`  (Dùng lại tài khoản Supabase Auth đã có của ${email}, đặt mật khẩu mới.)`);
  }

  console.log('\n  Admin đầu tiên đã được tạo.\n');
  console.log(`  Username  : ${username}`);
  console.log(`  Email     : ${email}`);
  console.log(`  Mật khẩu  : ${password}`);
  console.log('\n  Đăng nhập bằng USERNAME ở trên và ĐỔI MẬT KHẨU NGAY. Mật khẩu này không hiển thị lại.\n');
}

main().catch((e: unknown) => {
  console.error(`\n  Tạo admin thất bại: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
