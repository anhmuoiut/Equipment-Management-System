import { withAuth, ok } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import { ADMIN_AUDIT_ENTITIES, listAdminAudit, type AdminAuditEntity } from '@/lib/services/admin';

/** Admin-side audit trail: who changed which user, permission, field or
 *  master-data row, and from what to what. `before` pages backwards by
 *  created_at. */
export const GET = withAuth(async (req, { requestId }) => {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit') ?? 50) || 50, 200);
  const entity = sp.get('entity_type') || undefined;
  if (entity && !(ADMIN_AUDIT_ENTITIES as readonly string[]).includes(entity)) {
    throw new AppError('VALIDATION_ERROR', { entity_type: 'unknown' });
  }
  const before = sp.get('before') || undefined;
  if (before && Number.isNaN(Date.parse(before))) throw new AppError('VALIDATION_ERROR', { before: 'not a timestamp' });
  return ok(await listAdminAudit({ entityType: entity as AdminAuditEntity | undefined, limit, before }), requestId);
}, { role: ['admin'] });
