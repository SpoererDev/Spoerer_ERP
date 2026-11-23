/**
 * Icono de información con tooltip (al pasar el mouse) que muestra los valores
 * del día usados para convertir un monto a UF: valor de la UF en CLP y, si el
 * monto está en dólares, el valor del dólar en CLP.
 *
 * Props:
 *  - currency: moneda de origen ('CLP' | 'USD' | 'UF').
 *  - rates: { date: 'YYYY-MM-DD', uf, usd } o null.
 *  - status: 'loading' | 'ok' | 'error'.
 */
const formatClp = (value) =>
  `$${Number(value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export default function ConversionRateInfo({ currency, rates, status }) {
  const curr = (currency || 'UF').toUpperCase();

  let lines;
  if (curr === 'UF') {
    lines = ['El monto ya está en UF: no requiere conversión.'];
  } else if (status === 'loading') {
    lines = ['Cargando valores del día…'];
  } else if (status === 'error' || !rates?.uf || (curr === 'USD' && !rates?.usd)) {
    lines = [
      'No se pudieron cargar los valores del día para la conversión.',
      'Ingresa el monto en UF manualmente.'
    ];
  } else {
    lines = [`Valores al ${formatDate(rates.date)}:`, `UF: ${formatClp(rates.uf)}`];
    if (curr === 'USD') lines.push(`Dólar: ${formatClp(rates.usd)}`);
    lines.push(
      curr === 'USD'
        ? 'Monto UF = Monto USD × Dólar ÷ UF'
        : 'Monto UF = Monto CLP ÷ UF'
    );
  }

  return (
    <span className="relative inline-flex group align-middle">
      <span
        className="material-symbols-outlined text-[16px] text-slate-400 hover:text-secondary cursor-help normal-case"
        tabIndex={0}
        aria-label={lines.join(' ')}
      >
        info
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 hidden group-hover:block group-focus-within:block w-max max-w-[260px] rounded-lg bg-primary text-white text-[11px] font-medium normal-case tracking-normal leading-snug px-2.5 py-1.5 shadow-lg text-left"
      >
        {lines.map((line, i) => (
          <span key={i} className={`block ${i === 0 && lines.length > 1 ? 'font-bold' : ''}`}>{line}</span>
        ))}
      </span>
    </span>
  );
}
