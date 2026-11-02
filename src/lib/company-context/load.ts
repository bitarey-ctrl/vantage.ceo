import { normaliseCompanyContext, type CompanyContext } from './context';

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Load the canonical company context for an account (works with the user client or the admin client). */
export async function loadCompanyContext(db: Reader, profileId: string): Promise<CompanyContext> {
  const [{ data: profile }, { data: ctx }] = await Promise.all([
    db.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    db.from('ceo_context').select('*').eq('profile_id', profileId).maybeSingle(),
  ]);
  return normaliseCompanyContext(profileId, profile, ctx);
}
