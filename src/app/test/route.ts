import { workspaceResponse } from '@/lib/workspace/page';

export const dynamic = 'force-dynamic';

/** Alias of the main app (/app): same implementation, same account data. */
export function GET(request: Request) {
  return workspaceResponse(request);
}
