/**
 * Utility functions for billing installments (quotas).
 */

/**
 * Natural comparison function for installment numbers (numQuota).
 * Correctly sorts: 01, 02, 03, 04, 04a, 04b, 05, 10
 */
export const compareNumQuota = (a, b) => {
  const parse = (val) => {
    const str = String(val || '').trim();
    const match = str.match(/^(\d+)([a-zA-Z]*)$/);
    if (match) {
      return { num: parseInt(match[1], 10), suffix: match[2].toLowerCase() };
    }
    return { num: parseInt(str, 10) || 0, suffix: str.toLowerCase() };
  };
  const parsedA = parse(a);
  const parsedB = parse(b);
  if (parsedA.num !== parsedB.num) {
    return parsedA.num - parsedB.num;
  }
  return parsedA.suffix.localeCompare(parsedB.suffix);
};

/**
 * Calculates the next sub-quota number when a quota is annulled.
 * Example:
 * - base "04" -> "04a"
 * - base "04a" -> "04b"
 * - base "04b" -> "04c"
 */
export const getNextSubQuotaNumber = (baseNumQuota, installmentsList) => {
  const match = String(baseNumQuota || '').trim().match(/^(\d+)([a-zA-Z]*)$/);
  if (!match) return `${baseNumQuota}a`;

  const baseInt = parseInt(match[1], 10);
  const padLength = Math.max(2, match[1].length);

  const existingSuffixes = new Set();
  (installmentsList || []).forEach(inst => {
    const m = String(inst.numQuota || '').trim().match(/^(\d+)([a-zA-Z]*)$/);
    if (m && parseInt(m[1], 10) === baseInt) {
      existingSuffixes.add(m[2].toLowerCase());
    }
  });

  let charCode = 97; // 'a'
  while (existingSuffixes.has(String.fromCharCode(charCode))) {
    charCode++;
  }
  const nextSuffix = String.fromCharCode(charCode);
  return `${String(baseInt).padStart(padLength, '0')}${nextSuffix}`;
};
