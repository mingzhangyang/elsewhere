import axe from 'axe-core';

export async function auditInterface(): Promise<string> {
  const result = await axe.run({ exclude: ['.dev-diagnostics'] });
  return result.violations.length
    ? result.violations
        .map((v) => `${v.id}: ${v.help}\n${v.nodes.map((n) => n.target.join(' ')).join('\n')}`)
        .join('\n\n')
    : 'No automated accessibility violations detected. Manual screen-reader and touch checks remain required.';
}
