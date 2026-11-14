import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The science docs and the in-app Sources & limitations page state the same numerical conventions;
// a change to one that misses the others would tell readers the opposite of what the app does.
const published = ['README.md', 'docs/SCIENCE.md', 'docs/VALIDATION.md', 'public/credits.html'].map(
  (path) => ({
    path,
    text: readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8').replace(/\s+/g, ' '),
  }),
);

const sentences = (text: string) => text.split(/(?<=\.)\s/);

it.each(published)('$path describes star altitudes as refracted', ({ text }) => {
  const stale = sentences(text).filter((sentence) =>
    /stellar refraction[^.]*(omitted|outside scope)|stars use geometric altitude/i.test(sentence),
  );
  expect(stale).toEqual([]);
  const stated = sentences(text).some(
    (sentence) =>
      /\bstars?\b/i.test(sentence) &&
      /altitude/i.test(sentence) &&
      /refraction/i.test(sentence) &&
      !/omitted|outside scope/i.test(sentence),
  );
  expect(stated, 'a sentence stating that star altitudes include refraction').toBe(true);
});
