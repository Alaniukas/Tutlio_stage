import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards against white-screen regressions when a Route references a component
 * that was never imported (e.g. CompanyMessages dropped from App.tsx lazy list).
 */
describe('App.tsx route components', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  const lazyNames = [...appSource.matchAll(/^const ([A-Z][A-Za-z0-9_]*) = lazy\(/gm)].map((m) => m[1]);
  const defaultImportNames = [...appSource.matchAll(/^import ([A-Z][A-Za-z0-9_]*) from /gm)].map((m) => m[1]);
  const namedImportNames = [...appSource.matchAll(/^import \{([^}]+)\} from /gm)].flatMap((m) =>
    m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter((name) => /^[A-Z]/.test(name)),
  );
  const localFunctions = [...appSource.matchAll(/^function ([A-Z][A-Za-z0-9_]*)\(/gm)].map((m) => m[1]);
  const defined = new Set([...lazyNames, ...defaultImportNames, ...namedImportNames, ...localFunctions]);

  const routeComponents = [
    ...appSource.matchAll(/element=\{<([A-Z][A-Za-z0-9_]*)(?:\s|\/>|>)/g),
  ].map((m) => m[1]);

  const allowedExternals = new Set(['Navigate', 'StaticLocaleProvider']);

  it('defines every JSX component used in Route element props', () => {
    const missing = [...new Set(routeComponents)].filter(
      (name) => !defined.has(name) && !allowedExternals.has(name),
    );
    expect(missing, `App.tsx routes reference undefined components: ${missing.join(', ')}`).toEqual([]);
  });
});
