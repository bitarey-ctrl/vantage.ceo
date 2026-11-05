/**
 * The one way to replace a conversation's messages: owned by the account, validated, and only if the stored version
 * is the one the caller last saw (optimistic concurrency on updated_at). Used by the workspace save and by the legacy
 * PATCH endpoint, so neither can silently overwrite newer history.
 */
import { z } from 'zod';
import { advisorMessage } from './messages';

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const conversationMessages = z.array(advisorMessage).max(300);
export type SaveResult = { status: 200; row: Record<string, unknown> } | { status: 400 | 404 | 409 | 500 | 503; error: string };
const missingTable = (e: { code?: string } | null) => Boolean(e && (e.code === '42P01' || e.code === 'PGRST205'));

export async function saveConversation(db: Db, profileId: string, id: string, expectedUpdatedAt: string, rawMessages: unknown): Promise<SaveResult> {
  const parsed = conversationMessages.safeParse(rawMessages);
  if (!parsed.success) return { status: 400, error: 'These messages could not be read, so nothing was saved.' };
  const { data, error } = await db.from('advisor_sessions')
    .update({ messages: parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id).eq('profile_id', profileId).eq('updated_at', expectedUpdatedAt)
    .select().maybeSingle();
  if (missingTable(error)) return { status: 503, error: 'Conversations cannot be saved right now. Nothing was saved.' };
  if (error) return { status: 500, error: 'Could not save this conversation. Keep this page open and copy any unsaved reply.' };
  if (data) return { status: 200, row: data };
  // Nothing updated: either it is not this account's conversation, or it changed since the caller loaded it.
  const { data: exists } = await db.from('advisor_sessions').select('id').eq('id', id).eq('profile_id', profileId).maybeSingle();
  return exists
    ? { status: 409, error: 'This conversation is unavailable or changed in another view. Refresh before continuing.' }
    : { status: 404, error: 'Session not found' };
}
