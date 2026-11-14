import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const imports = (dir: string) =>
  readdirSync(join('src', dir)).flatMap((file) =>
    [...readFileSync(join('src', dir, file), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => ({
      file: `${dir}/${file}`,
      spec: m[1],
    })),
  );

// The domain must run anywhere (tests in plain Node, a future worker or native shell): it may use
// its own modules, shared types, data and pure libraries, never the app, network or renderer.
it('keeps domain calculations free of app, network and renderer code', () => {
  const outward = imports('domain').filter(({ spec }) =>
    /^\.\.\/(lib|services|renderer|components|hooks|dev)\b/.test(spec),
  );
  expect(outward).toEqual([]);
});

it('keeps network clients out of the renderer and domain', () => {
  for (const dir of ['domain', 'renderer'])
    expect(imports(dir).filter(({ spec }) => spec.includes('services/'))).toEqual([]);
});
