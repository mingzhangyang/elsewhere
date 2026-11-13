import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = resolve('.');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const notices = new Map();
function installedDirectory(name, from) {
  for (let current = from; ; current = dirname(current)) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dirname(current) === current) throw new Error(`Cannot find runtime dependency ${name}`);
  }
}
async function visit(name, from) {
  const directory = installedDirectory(name, from);
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (notices.has(key)) return;
  notices.set(key, '');
  const files = (await readdir(directory))
    .filter((file) => /^(license|copying|notice)(\.|$)/i.test(file))
    .sort();
  const texts = [];
  for (const file of files) texts.push(await readFile(join(directory, file), 'utf8'));
  if (!texts.length && name === 'astronomy-engine') {
    const source = await readFile(join(directory, 'astronomy.js'), 'utf8');
    texts.push(source.slice(source.indexOf('MIT License'), source.indexOf('*/')).replace(/^ {4}/gm, ''));
  }
  if (!texts.length)
    throw new Error(`No license text for ${key}; review this dependency before distribution.`);
  notices.set(
    key,
    `${key} (${pkg.license})\n${pkg.homepage || pkg.repository?.url || ''}\n\n${texts.join('\n\n').replaceAll('\r\n', '\n').trim()}`,
  );
  for (const dependency of Object.keys(pkg.dependencies || {}).sort()) await visit(dependency, directory);
}
for (const name of Object.keys(manifest.dependencies).sort()) await visit(name, root);
const output =
  'Elsewhere runtime dependency notices\nGenerated from the installed lockfile by scripts/generate-notices.mjs.\nCatalog and image attribution are separate; see credits.html.\n\n' +
  [...notices.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([, value]) => value)
    .join('\n\n' + '='.repeat(72) + '\n\n') +
  '\n';
const path = 'public/licenses/THIRD-PARTY.txt';
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== output)
    throw new Error('Runtime notices changed. Run node scripts/generate-notices.mjs and review the result.');
} else await writeFile(path, output);
console.log(
  `Runtime notices: ${notices.size} packages ${process.argv.includes('--check') ? 'verified' : 'written'}.`,
);
