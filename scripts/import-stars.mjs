import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Reproduce the small bundled derivative without requiring the full source in Git.
const source = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
const expected = 'd9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd';
const csv = process.argv[2]
  ? await readFile(process.argv[2])
  : Buffer.from(await (await fetch(source)).arrayBuffer());
if (createHash('sha256').update(csv).digest('hex') !== expected)
  throw new Error('HYG source changed. Review provenance before updating.');
function fields(line) {
  const result = [];
  let field = '',
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (line[i] === ',' && !quoted) {
      result.push(field);
      field = '';
    } else field += line[i];
  }
  result.push(field);
  return result;
}
const [header, ...lines] = csv.toString('utf8').trim().split(/\r?\n/).map(fields);
const rows = lines
  .map((line) => Object.fromEntries(header.map((key, i) => [key, line[i]])))
  .filter((s) => Number(s.dist) > 0 && s.mag !== '' && Number(s.mag) <= 6)
  .map((s) => [
    Number(s.id),
    s.proper,
    Number(s.ra),
    Number(s.dec),
    Number(s.mag),
    s.ci === '' ? null : Number(s.ci),
    Number(s.pmra),
    Number(s.pmdec),
  ])
  .sort((a, b) => a[4] - b[4] || a[0] - b[0]);
await writeFile(new URL('../src/data/stars.json', import.meta.url), JSON.stringify(rows) + '\n');
console.log(`${rows.length} HYG v4.1 stars, magnitude <= 6.0, J2000 epoch/equinox; CC BY-SA 4.0.`);
