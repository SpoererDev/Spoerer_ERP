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
 * Fetches the UF or USD value for a date (YYYY-MM-DD) from mindicador.cl.
 * Throws when the service is unavailable or has no data for that date.
 */
export const fetchIndicatorRate = async (dateStr, currency = 'UF') => {
  const parts = String(dateStr || '').split('-');
  if (parts.length !== 3) throw new Error('Formato de fecha no válido');
  const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD to DD-MM-YYYY
  const endpoint = currency === 'USD'
    ? `https://mindicador.cl/api/dolar/${formattedDate}`
    : `https://mindicador.cl/api/uf/${formattedDate}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Error al conectar con el servidor de ${currency}`);
  const data = await res.json();
  if (!data.serie || data.serie.length === 0) throw new Error('Sin datos para esa fecha');
  return data.serie[0].valor;
};

/**
 * Default invoice line description:
 * "Pago Cuota N° X de YY - Proyecto [Nombre] según Presupuesto [N°]. XX UF: $YYYYYY pesos"
 */
export const buildInvoiceDescription = ({ numQuota, totalQuotas, projectName, budgetNumber, plannedAmount, currency, netClp }) => {
  const curr = (currency || 'UF').toUpperCase();
  const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(netClp || 0));
  const amountPart = curr === 'CLP'
    ? `$${clp} pesos`
    : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(plannedAmount || 0)} ${curr}: $${clp} pesos`;
  return [
    `Pago Cuota N° ${numQuota} de ${totalQuotas}`,
    projectName ? ` - Proyecto ${projectName}` : '',
    budgetNumber ? ` según Presupuesto ${budgetNumber}` : '',
    `. ${amountPart}`
  ].join('');
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
