import { readFileSync } from 'node:fs';
import prettier from 'prettier';

const path = 'src/styles.css';
const input = readFileSync(path, 'utf8');
const output = await prettier.format(input, { ...(await prettier.resolveConfig(path)), filepath: path });
const lines = output.split('\n');
console.log('--- Prettier expected CSS around the preview ---');
for (let i = 1548; i < 1690 && i < lines.length; i++) console.log(`${i + 1}: ${lines[i]}`);
process.exitCode = 1;
