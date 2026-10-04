import 'server-only';

/**
 * Supabase admin client (service_role).
 *
 * ĐÂY LÀ FILE DUY NHẤT trong toàn bộ repo được phép đọc
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Ba lớp bảo vệ:
 *   1. 'server-only'  — build lỗi ngay nếu file này lọt vào client bundle
 *   2. ESLint no-restricted-imports — chặn import từ app/** và components/**
 *   3. Biến môi trường không có tiền tố NEXT_PUBLIC_
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Xem .env.example.',
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
