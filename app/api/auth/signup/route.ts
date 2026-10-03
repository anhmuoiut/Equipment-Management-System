import { withAuth, ok } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import { requestAccount } from '@/lib/services/signup';

export const POST = withAuth(async (req, { requestId }) => {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new AppError('FORBIDDEN');
  const text = await req.text();
  if (text.length > 4096) throw new AppError('VALIDATION_ERROR');
  let input;
  try { input = JSON.parse(text); } catch { throw new AppError('VALIDATION_ERROR'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('VALIDATION_ERROR');

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim();
  const result = await requestAccount(input, ip);
  const response = ok(result, requestId);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}, { allowAnonymous: true });
