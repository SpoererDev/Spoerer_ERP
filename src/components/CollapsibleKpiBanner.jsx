import React, { useState } from 'react';

const COLOR_MAP = {
  emerald: { text: 'text-emerald-600', unit: 'text-emerald-700', bg: 'bg-emerald-50' },
  blue: { text: 'text-blue-600', unit: 'text-blue-700', bg: 'bg-blue-50' },
  rose: { text: 'text-rose-600', unit: 'text-rose-700', bg: 'bg-rose-50' },
  indigo: { text: 'text-indigo-600', unit: 'text-indigo-700', bg: 'bg-indigo-50' },
  teal: { text: 'text-teal-600', unit: 'text-teal-700', bg: 'bg-teal-50' },
  amber: { text: 'text-amber-600', unit: 'text-amber-700', bg: 'bg-amber-50' },
  slate: { text: 'text-slate-600', unit: 'text-slate-700', bg: 'bg-slate-100' }
};

export default function CollapsibleKpiBanner({
  items = [],
  children,
  defaultExpanded = false
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="w-full space-y-2">
      {/* Banner horizontal compacto */}
      <div className="w-full bg-white rounded-xl border border-slate-200/80 shadow-xs px-3.5 py-1.5 flex items-center justify-between gap-3 transition-all">
        {/* Métricas clave inline */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
          {items.map((item, idx) => {
            const colors = COLOR_MAP[item.color] || COLOR_MAP.slate;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <span className="h-3.5 w-px bg-slate-200 hidden sm:inline-block flex-shrink-0" />
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  {item.icon && (
                    <span className={`material-symbols-outlined text-[15px] ${colors.text} flex-shrink-0`}>
                      {item.icon}
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                    {item.label}:
                  </span>
                  <span className="font-extrabold text-slate-900 font-mono text-xs sm:text-sm">
                    {item.value}
                  </span>
                  {item.unit && (
                    <span className={`text-[10px] font-bold ${colors.unit}`}>
                      {item.unit}
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Botón expandir/contraer */}
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-all active:scale-95 cursor-pointer flex-shrink-0 ml-auto border border-slate-200/60"
          title={isExpanded ? 'Contraer tarjetas a vista resumen' : 'Ver tarjetas completas en detalle'}
        >
          <span>{isExpanded ? 'Menos' : 'Detalles'}</span>
          <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>
      </div>

      {/* Vista expandida: grilla de tarjetas completa */}
      {isExpanded && (
        <div className="animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
