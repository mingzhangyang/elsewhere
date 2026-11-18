import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAuditReport } from './check-audit.mjs';

const advisory = {
  name: 'picomatch',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  severity: 'high',
};
const finding = (name, via) => ({
  name,
  severity: 'high',
  via,
  nodes: [`node_modules/${name}`],
});
const report = () => ({
  metadata: { vulnerabilities: { low: 0, moderate: 0, high: 3, critical: 0 } },
  vulnerabilities: {
    picomatch: finding('picomatch', [advisory]),
    tinyglobby: finding('tinyglobby', ['picomatch']),
    vite: finding('vite', ['tinyglobby', 'picomatch']),
  },
});
const lockfile = () => ({
  packages: {
    'node_modules/picomatch': { version: '4.0.7', dev: true },
    'node_modules/tinyglobby': { version: '0.2.17', dev: true },
    'node_modules/vite': { version: '6.4.6', dev: true },
  },
});
const now = new Date('2026-11-17T22:00:00Z');

test('accepts only the exact dev-only picomatch advisory before expiration', () => {
  assert.deepEqual(checkAuditReport(report(), lockfile(), now).ok, true);
  assert.equal(checkAuditReport(report(), lockfile(), now).exception, true);
});

test('passes a clean audit without relying on the temporary exception', () => {
  const clean = report();
  clean.metadata.vulnerabilities.high = 0;
  clean.vulnerabilities = {};
  assert.deepEqual(checkAuditReport(clean, lockfile(), now), {
    ok: true,
    exception: false,
    reason: 'No high or critical findings',
  });
});

test('rejects production dependencies and unverified paths', () => {
  const lock = lockfile();
  lock.packages['node_modules/vite'].dev = false;
  assert.equal(checkAuditReport(report(), lock, now).ok, false);
  delete lock.packages['node_modules/vite'];
  assert.equal(checkAuditReport(report(), lock, now).ok, false);
});

test('rejects a new high-severity advisory even in a dev dependency', () => {
  const audit = report();
  audit.vulnerabilities.vite.via.push({
    name: 'vite',
    url: 'https://github.com/advisories/GHSA-another-advisory',
    severity: 'high',
  });
  assert.equal(checkAuditReport(audit, lockfile(), now).ok, false);
});

test('rejects a new vulnerable package even if the old advisory remains', () => {
  const audit = report();
  audit.metadata.vulnerabilities.high = 4;
  audit.vulnerabilities.other = finding('other', ['unknown']);
  assert.equal(checkAuditReport(audit, lockfile(), now).ok, false);
});

test('rejects a changed version and exceptions beyond the expiration date', () => {
  const lock = lockfile();
  lock.packages['node_modules/picomatch'].version = '4.0.8';
  assert.equal(checkAuditReport(report(), lock, now).ok, false);
  assert.equal(checkAuditReport(report(), lockfile(), new Date('2026-12-18T00:00:00Z')).ok, false);
});

test('rejects incomplete or failed audit reports and critical findings', () => {
  assert.equal(checkAuditReport({ error: 'offline' }, lockfile(), now).ok, false);
  const audit = report();
  audit.metadata.vulnerabilities.critical = 1;
  assert.equal(checkAuditReport(audit, lockfile(), now).ok, false);
  assert.equal(checkAuditReport({ ...report(), metadata: {} }, lockfile(), now).ok, false);
});

test('rejects cyclic and missing transitive dependency findings', () => {
  const audit = report();
  audit.vulnerabilities.tinyglobby.via = ['vite'];
  audit.vulnerabilities.vite.via = ['tinyglobby'];
  assert.equal(checkAuditReport(audit, lockfile(), now).ok, false);
  audit.vulnerabilities.tinyglobby.via = ['missing'];
  assert.equal(checkAuditReport(audit, lockfile(), now).ok, false);
});

test('checks the full eleven-item dev-tooling propagation chain', () => {
  const chain = {
    picomatch: [advisory],
    fdir: ['picomatch'],
    vite: ['picomatch', 'fdir', 'tinyglobby'],
    vitest: ['picomatch', 'vite', 'tinyglobby'],
    tinyglobby: ['picomatch', 'fdir'],
    '@typescript-eslint/typescript-estree': ['tinyglobby'],
    '@typescript-eslint/parser': ['@typescript-eslint/typescript-estree'],
    '@typescript-eslint/utils': ['@typescript-eslint/typescript-estree'],
    '@typescript-eslint/type-utils': ['@typescript-eslint/typescript-estree', '@typescript-eslint/utils'],
    '@typescript-eslint/eslint-plugin': ['@typescript-eslint/parser', '@typescript-eslint/type-utils'],
    'typescript-eslint': ['@typescript-eslint/eslint-plugin', '@typescript-eslint/parser'],
  };
  const findings = Object.fromEntries(Object.entries(chain).map(([name, via]) => [name, finding(name, via)]));
  const lock = {
    packages: Object.fromEntries(
      Object.keys(chain).map((name) => ['node_modules/' + name, { version: '4.0.7', dev: true }]),
    ),
  };
  const audit = {
    metadata: { vulnerabilities: { high: Object.keys(chain).length, critical: 0 } },
    vulnerabilities: findings,
  };
  assert.equal(checkAuditReport(audit, lock, now).ok, true);
});
