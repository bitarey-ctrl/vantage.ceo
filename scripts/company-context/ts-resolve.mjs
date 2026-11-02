// Test-only resolve hook: lets Node's type-stripping run src/ modules that use extensionless relative imports.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const SRC = new URL('../../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    // The "@/…" path alias from tsconfig.json.
    if (specifier.startsWith('@/')) {
      const candidate = new URL(`${specifier.slice(2)}.ts`, SRC);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.startsWith('file:')) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
