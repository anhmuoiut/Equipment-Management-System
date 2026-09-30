import { withAuth, ok } from '@/lib/auth/withAuth';
import { grantFieldEditToBlockedCreators } from '@/lib/services/admin';

/**
 * Grants edit permission on this field to every active user who can create
 * equipment but can't edit it (the Required × permission trap). Admin-only,
 * unlike the rest of Field configuration: it changes other users'
 * permissions, which is never delegated below role=admin.
 */
export const POST = withAuth(
  async (_req, { requestId, profile, params }) =>
    ok(await grantFieldEditToBlockedCreators(params.fieldKey!, profile.id, requestId), requestId),
  { role: ['admin'] },
);
