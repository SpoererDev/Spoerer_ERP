import { useEffect, useRef, useState } from 'react';

/**
 * Campo de fecha para filtros: se puede escribir a mano en formato dd/mm/aaaa
 * o elegir desde el calendario (botón con ícono).
 *
 * Props:
 *  - value: fecha canónica 'YYYY-MM-DD' o '' (sin límite).
 *  - onChange(iso): entrega 'YYYY-MM-DD' o '' al confirmar (blur / Enter / calendario).
 *  - invalid: marca el campo con borde de error.
 */
const isoToDisplay = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

const displayToIso = (text) => {
  const clean = String(text || '').trim();
  if (clean === '') return '';
  const match = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export default function DateFilterInput({ value, onChange, invalid = false, ariaLabel, placeholder = 'dd/mm/aaaa' }) {
  const [text, setText] = useState(isoToDisplay(value));
  const [hasError, setHasError] = useState(false);
  const pickerRef = useRef(null);

  // Sincroniza el texto cuando el valor cambia desde afuera (ej. al elegir un período)
  useEffect(() => {
    setText(isoToDisplay(value));
    setHasError(false);
  }, [value]);

  const commit = () => {
    const iso = displayToIso(text);
    if (iso === null) {
      setHasError(true);
      return;
    }
    setHasError(false);
    if (iso !== (value || '')) onChange(iso);
    else setText(isoToDisplay(value));
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        title={hasError ? 'Fecha no válida: usa el formato dd/mm/aaaa' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (hasError) setHasError(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setText(isoToDisplay(value));
            setHasError(false);
          }
        }}
        className={`w-[124px] pl-3 pr-8 py-1.5 bg-slate-50 border rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:ring-2 outline-none transition-all ${
          hasError || invalid
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
            : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
        }`}
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-secondary hover:bg-slate-200/60 transition-all cursor-pointer"
        title="Elegir en el calendario"
        aria-label="Abrir calendario"
      >
        <span className="material-symbols-outlined text-[16px]">calendar_month</span>
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || '')}
        className="absolute right-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
      />
    </div>
  );
}
