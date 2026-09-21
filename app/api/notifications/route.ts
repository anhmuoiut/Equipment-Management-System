import { withAuth, ok } from '@/lib/auth/withAuth';
import { listNotifications } from '@/lib/services/notifications';

/** Any authenticated role — the bell is global chrome, not a permission-gated
 *  feature. What each alert links to (the equipment record) is still subject
 *  to the equipment view permission Equipment Masterlist already enforces. */
export const GET = withAuth(async (_req, { requestId, profile }) =>
  ok(await listNotifications(profile.id), requestId),
);
