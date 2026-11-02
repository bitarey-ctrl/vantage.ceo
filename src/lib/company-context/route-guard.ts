/** Same-origin and signed-in checks for the company-context routes (same rules as the workspace API). */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export function sameOrigin(request: Request): boolean {
  let originHost = '';
  try { const o = request.headers.get('origin'); originHost = o ? new URL(o).host : ''; } catch { /* malformed */ }
  const requestHost = request.headers.get('host') || new URL(request.url).host;
  return Boolean(originHost) && originHost === requestHost;
}

export async function signedIn() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}
