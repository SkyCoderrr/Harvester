/**
 * Minimal semver range matcher. Supports:
 *   ">=A <=B" (two-clause AND)
 *   ">=A" / ">A" / "<=B" / "<B" / "=A" / bare "A.B.C"
 * Does NOT support: prerelease, caret, tilde, |, X ranges.
 * Sufficient for the allowed-client check (qBt 4.0.0 .. 5.1.4).
 */

type Op = '>' | '>=' | '<' | '<=' | '=' | '==';

function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map((p) => parseInt(p.replace(/[^0-9]/g, ''), 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function applyOp(op: Op, v: string, bound: string): boolean {
  const c = cmp(parseVersion(v), parseVersion(bound));
  switch (op) {
    case '>':
      return c > 0;
    case '>=':
      return c >= 0;
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
    case '=':
    case '==':
      return c === 0;
  }
}

export function satisfies(version: string, range: string): boolean {
  const clauses = range.trim().split(/\s+/);
  return clauses.every((clause) => {
    const m = /^(>=|<=|==|=|>|<)?([0-9][0-9A-Za-z.+\-]*)$/.exec(clause);
    if (!m) return false;
    const op = (m[1] ?? '=') as Op;
    return applyOp(op, version, m[2]!);
  });
}
