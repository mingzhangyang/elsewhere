import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The package stands alone: its code imports only its own files and its two runtime dependencies,
// never the Elsewhere app in src/. Its examples import only the package itself, and its tests only
// package files, the same dependencies, Vitest and Node built-ins.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEPENDENCIES = ['astronomy-engine', '@js-temporal/polyfill'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : files(path);
    return /\.(ts|mts|mjs)$/.test(name) ? [path] : [];
  });
}

/** Every static, re-export and dynamic import specifier, and vi.mock targets. */
function specifiers(text: string): string[] {
  // Comments may show usage (such as the fixture checker's example); they are not imports.
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const patterns = [
    /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;])import\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bvi\.mock\(\s*['"]([^'"]+)['"]/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

function violations(dir: string, allowed: (specifier: string, file: string) => boolean): string[] {
  return files(join(packageRoot, dir)).flatMap((file) =>
    specifiers(readFileSync(file, 'utf8'))
      .filter((specifier) => !allowed(specifier, file))
      .map((specifier) => `${relative(packageRoot, file)} imports ${specifier}`),
  );
}

const inside = (specifier: string, file: string, ...dirs: string[]) => {
  if (!specifier.startsWith('.')) return false;
  const target = resolve(dirname(file), specifier);
  return dirs.some((dir) => (target + sep).startsWith(join(packageRoot, dir) + sep));
};

it('package code imports only package files, astronomy-engine and @js-temporal/polyfill', () => {
  const found = files(join(packageRoot, 'src'));
  expect(found.length).toBeGreaterThan(30);
  expect(
    violations(
      'src',
      (specifier, file) => DEPENDENCIES.includes(specifier) || inside(specifier, file, 'src'),
    ),
  ).toEqual([]);
});

it('examples import only the package by name and each other', () => {
  expect(
    violations(
      'examples',
      (specifier, file) => specifier === '@orangely/sky-engine' || inside(specifier, file, 'examples'),
    ),
  ).toEqual([]);
});

it('package tests import only package files, the dependencies, Vitest and Node built-ins', () => {
  expect(
    violations(
      'test',
      (specifier, file) =>
        DEPENDENCIES.includes(specifier) ||
        specifier === 'vitest' ||
        specifier.startsWith('node:') ||
        specifier === '@orangely/sky-engine' ||
        inside(specifier, file, 'src', 'test', 'examples', 'fixtures'),
    ),
  ).toEqual([]);
});

it('the shared fixture checker imports nothing, so any consumer can run it as it is', () => {
  const source = readFileSync(join(packageRoot, 'fixtures', 'verify.mjs'), 'utf8');
  expect(specifiers(source)).toEqual([]);
});

it('the import scanner sees the kinds of imports it must police', () => {
  expect(
    specifiers(
      [
        "import a from '../../src/x';",
        "import type { B } from 'three';",
        "export * from 'react';",
        "import './side-effect';",
        // Split so that this sample is not itself an import of the app.
        'const c = await imp' + "ort('../../../src/app');",
        "vi.mock('../src/y', () => ({}));",
        '// imp' + "ort z from 'not-an-import';",
      ].join('\n'),
    ),
  ).toEqual(['../../src/x', 'three', 'react', './side-effect', '../../../src/app', '../src/y']);
});
