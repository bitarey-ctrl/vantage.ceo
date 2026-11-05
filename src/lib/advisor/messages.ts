/** The stored shape of one Advisor conversation message (advisor_sessions.messages[]). */
import { z } from 'zod';

export const endStatusSchema = z.enum(['complete', 'max_tokens', 'refusal', 'cancelled', 'transport', 'error', 'incomplete']);
export const advisorMessage = z.object({
  role: z.enum(['user', 'assistant']), content: z.string().max(40000), incomplete: z.boolean().optional(),
  // How the answer ended, kept across reloads. Anything but "complete" is stored as incomplete.
  status: endStatusSchema.optional(), turnId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(), at: z.string().max(40).optional(),
  attempts: z.array(z.object({ content: z.string().max(40000), status: endStatusSchema, at: z.string().max(40).nullable() })).max(3).optional(),
}).transform((m) => (m.status && m.status !== 'complete' ? { ...m, incomplete: true } : m));
