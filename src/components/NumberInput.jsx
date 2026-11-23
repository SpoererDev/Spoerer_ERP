import { useEffect, useRef, useState } from 'react';

/**
 * Campo numérico con separador de miles (formato es-CL).
 *
 * Criterio del ERP: mientras el usuario escribe (campo con foco) el número se
 * muestra SIN separadores de miles; al perder el foco se muestra formateado
 * (ej. "1.234.567,89"). Coma = decimal, punto = miles.
 *
 * Es un reemplazo directo de <input type="number">:
 *  - `value`: número o string canónico con punto decimal ("1234.5") o ''.
 *  - `onChange(valor)`: recibe el string canónico ("1234.5") o '' — NO un evento.
 *  - `decimals`: máximo de decimales permitidos (0 = sólo enteros, ej. CLP).
 *  - `minDecimals`: decimales mínimos mostrados al perder el foco (ej. 2 para UF).
 */
const toCanonical = (num) => (num === null || num === undefined || num === '' ? '' : String(num));

const parseCanonical = (val) => {
  if (val === null || val === undefined || val === '') return NaN;
  return typeof val === 'number' ? val : parseFloat(String(val));
};

export const formatNumberDisplay = (val, decimals = 2, minDecimals = 0) => {
  const num = parseCanonical(val);
  if (isNaN(num)) return '';
  return num.toLocaleString('es-CL', {
    minimumFractionDigits: Math.min(minDecimals, decimals),
    maximumFractionDigits: decimals
  });
};

// Valor canónico -> texto editable (sin miles, coma decimal)
const toEditText = (val, decimals) => {
  const num = parseCanonical(val);
  if (isNaN(num)) return '';
  return num.toLocaleString('es-CL', { useGrouping: false, maximumFractionDigits: decimals });
};

// Limpia lo que el usuario escribe/pega y devuelve { text, canonical }
const sanitizeInput = (raw, decimals) => {
  let str = String(raw ?? '');
  if (decimals === 0) {
    const digits = str.replace(/\D/g, '');
    return { text: digits, canonical: digits };
  }
  const dotCount = (str.match(/\./g) || []).length;
  if (str.includes(',')) {
    // "1.234,56" pegado: los puntos son miles
    str = str.replace(/\./g, '');
  } else if (dotCount > 1) {
    // "1.234.567" pegado: los puntos son miles
    str = str.replace(/\./g, '');
  } else if (dotCount === 1) {
    // Punto del teclado numérico: se interpreta como decimal
    str = str.replace('.', ',');
  }
  str = str.replace(/[^0-9,]/g, '');
  const parts = str.split(',');
  let text = parts[0];
  if (parts.length > 1) {
    text += ',' + parts.slice(1).join('').slice(0, decimals);
  }
  let canonical = text.replace(',', '.');
  if (canonical.endsWith('.')) canonical = canonical.slice(0, -1);
  if (canonical.startsWith('.')) canonical = '0' + canonical;
  return { text, canonical };
};

export default function NumberInput({
  value,
  onChange,
  decimals = 2,
  minDecimals = 0,
  onFocus,
  onBlur,
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const lastEmitted = useRef(toCanonical(value));

  // Si el valor cambia desde fuera mientras hay foco (ej. carga automática), sincronizar
  useEffect(() => {
    if (!isFocused) return;
    const incoming = toCanonical(value);
    if (parseCanonical(incoming) !== parseCanonical(lastEmitted.current) && !(isNaN(parseCanonical(incoming)) && isNaN(parseCanonical(lastEmitted.current)))) {
      lastEmitted.current = incoming;
      setDraft(toEditText(incoming, decimals));
    }
  }, [value, isFocused, decimals]);

  const handleFocus = (e) => {
    lastEmitted.current = toCanonical(value);
    setDraft(toEditText(value, decimals));
    setIsFocused(true);
    const target = e.target;
    setTimeout(() => target.select(), 0);
    if (onFocus) onFocus(e);
  };

  const handleChange = (e) => {
    const { text, canonical } = sanitizeInput(e.target.value, decimals);
    setDraft(text);
    lastEmitted.current = canonical;
    if (onChange) onChange(canonical);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      value={isFocused ? draft : formatNumberDisplay(value, decimals, minDecimals)}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
