import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A temporary exception for one known dev-tooling-only advisory, not a blanket audit bypass.
// Reassess as soon as picomatch ships a fix; the exception also expires automatically.
const ADVISORY_URL = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const EXCEPTION_DEADLINE = Date.parse('2026-12-17T23:59:59Z');
const EXCEPTION_VERSION = '4.0.7';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const reject = (reason) => ({ ok: false, exception: false, reason });

export function checkAuditReport(report, lockfile, now = new Date()) {
  if (!isObject(report) || report.error || !isObject(report.vulnerabilities)) {
    return reject('npm audit returned an error or an invalid vulnerability report');
  }
  const counts = report.metadata?.vulnerabilities;
  if (!isObject(counts) || !Number.isInteger(counts.high) || !Number.isInteger(counts.critical)) {
    return reject('npm audit vulnerability counts are missing or invalid');
  }
  const severe = new Map(
    Object.entries(report.vulnerabilities).filter(
      ([, finding]) => finding?.severity === 'high' || finding?.severity === 'critical',
    ),
  );
  if (counts.high + counts.critical !== severe.size) {
    return reject('npm audit vulnerability counts do not match the reported findings');
  }
  if (severe.size === 0) return { ok: true, exception: false, reason: 'No high or critical findings' };

  if (now.getTime() > EXCEPTION_DEADLINE) {
    return reject('The temporary picomatch exception expired on 2026-12-17');
  }
  if (counts.critical !== 0 || !isObject(lockfile?.packages)) {
    return reject('Critical findings or an unavailable package lockfile cannot be exempted');
  }
  if (
    lockfile.packages['node_modules/picomatch']?.version !== EXCEPTION_VERSION ||
    lockfile.packages['node_modules/picomatch']?.dev !== true
  ) {
    return reject('The picomatch version or dependency scope changed; review the exception');
  }

  const root = severe.get('picomatch');
  if (
    !root ||
    !Array.isArray(root.via) ||
    root.via.length !== 1 ||
    !isObject(root.via[0]) ||
    root.via[0].name !== 'picomatch' ||
    root.via[0].url !== ADVISORY_URL ||
    root.via[0].severity !== 'high'
  ) {
    return reject('High-severity findings include something other than the known picomatch advisory');
  }

  const reachesKnownAdvisory = (name, visited = new Set()) => {
    if (name === 'picomatch') return true;
    const finding = severe.get(name);
    if (!finding || !Array.isArray(finding.via) || finding.via.length === 0 || visited.has(name)) {
      return false;
    }
    const path = new Set([...visited, name]);
    return finding.via.every(
      (cause) => typeof cause === 'string' && reachesKnownAdvisory(cause, path),
    );
  };
  for (const [name, finding] of severe) {
    if (
      !Array.isArray(finding.nodes) ||
      finding.nodes.length === 0 ||
      finding.nodes.some((node) => lockfile.packages[node]?.dev !== true)
    ) {
      return reject(`${name} is not verified as a development-only dependency`);
    }
    if (!reachesKnownAdvisory(name)) {
      return reject(`${name} does not trace exclusively to the known picomatch advisory`);
    }
  }

  return {
    ok: true,
    exception: true,
    reason: `${severe.size} dev-only findings trace to ${ADVISORY_URL}; expires 2026-12-17`,
  };
}

function main() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const audit = spawnSync(command, ['audit', '--json', '--audit-level=high'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (audit.error) throw audit.error;
  if (audit.signal || (audit.status !== 0 && audit.status !== 1)) {
    console.error('npm audit terminated unexpectedly:', audit.stderr || audit.signal);
    process.exitCode = 1;
    return;
  }
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error('npm audit did not return valid JSON:', audit.stderr || audit.stdout);
    process.exitCode = 1;
    return;
  }
  const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const result = checkAuditReport(report, lockfile);
  if (!result.ok || (audit.status !== 0 && !result.exception)) {
    console.error(`Security audit blocked: ${result.reason}`);
    if (audit.stderr) console.error(audit.stderr);
    process.exitCode = 1;
    return;
  }
  if (result.exception) {
    console.warn(`Temporary, scoped security exception: ${result.reason}`);
  } else {
    console.log('Security audit passed:', result.reason);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
