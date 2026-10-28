import { workspaceResponse } from '@/lib/workspace/page';

export const dynamic = 'force-dynamic';

/** The main signed-in product entry. */
export function GET(request: Request) {
  return workspaceResponse(request);
}
