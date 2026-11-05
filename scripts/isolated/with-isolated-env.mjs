// Runs a command against the ISOLATED Supabase project only (vantage-rls-test). Values are never printed.
//   node scripts/isolated/with-isolated-env.mjs <command> [args...]
// Supabase credentials come from the untracked .env.test.local (TEST_*) in the main checkout; only the Anthropic and
// NewsAPI keys come from .env.local. Refuses to run if any value points at the production project.
import { readFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..');
// The env files live in the main checkout (shared by every worktree), found through git, never copied.
const envDir = process.env.ENV_DIR ?? dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: appDir }).toString().trim());
const read = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]));
const test = read(join(envDir, '.env.test.local'));
const prod = read(join(envDir, '.env.local'));
const ISOLATED = 'acqhieylvcemgcevrxvc', PRODUCTION = 'odahuetnflsqkligzwpm';
if (!test.TEST_SUPABASE_URL?.includes(ISOLATED)) { console.error('Refusing: TEST_SUPABASE_URL is not the isolated project.'); process.exit(2); }
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV ?? 'production',
  NEXT_PUBLIC_SUPABASE_URL: test.TEST_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_BROWSER_URL: test.TEST_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: test.TEST_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: test.TEST_SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: prod.ANTHROPIC_API_KEY, NEWSAPI_KEY: prod.NEWSAPI_KEY ?? '',
  NEXT_PUBLIC_APP_URL: `http://localhost:${process.env.PORT_OVERRIDE ?? 3300}`, NEXT_PUBLIC_APP_NAME: 'VANTAGE (isolated test)',
  CRON_SECRET: process.env.CRON_SECRET_OVERRIDE ?? randomBytes(24).toString('hex'), ISOLATED_TEST: '1',
};
for (const [k, v] of Object.entries(env)) if (String(v ?? '').includes(PRODUCTION)) { console.error(`Refusing: ${k} points at production.`); process.exit(2); }
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { cwd: process.env.RUN_CWD ?? appDir, env, stdio: 'inherit' });
process.exit(r.status ?? 1);
