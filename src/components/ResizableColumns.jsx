import React, { useState, useEffect, useCallback, useRef } from 'react';

const MIN_COLUMN_WIDTH = 48;

/**
 * Anchos de columna ajustables por el usuario, guardados en el navegador.
 * `defaults` es un objeto { claveColumna: anchoPx }. Una columna sin ancho
 * (valor null) ocupa el espacio sobrante de la tabla hasta que el usuario la ajusta.
 */
export function useColumnWidths(storageKey, defaults) {
  const [customWidths, setCustomWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const clean = {};
        Object.entries(saved).forEach(([key, value]) => {
          if (key in defaults && Number.isFinite(value) && value >= MIN_COLUMN_WIDTH) clean[key] = value;
        });
        return clean;
      }
    } catch { /* valor inválido: usar los anchos por defecto */ }
    return {};
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(customWidths)); } catch { /* sin almacenamiento */ }
  }, [storageKey, customWidths]);

  const getWidth = useCallback((key) => customWidths[key] ?? defaults[key] ?? null, [customWidths, defaults]);

  const setWidth = useCallback((key, width) => {
    setCustomWidths(prev => ({ ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) }));
  }, []);

  const resetWidth = useCallback((key) => {
    setCustomWidths(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => setCustomWidths({}), []);

  return { getWidth, setWidth, resetWidth, resetAll, hasCustomWidths: Object.keys(customWidths).length > 0 };
}

/**
 * Asa para arrastrar el borde derecho de un encabezado <th> (que debe tener `position: relative`).
 * Doble clic restablece el ancho por defecto de la columna.
 */
export function ColumnResizeHandle({ columnKey, label, onResize, onReset }) {
  const dragRef = useRef(null);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.parentElement;
    dragRef.current = { startX: e.clientX, startWidth: th.getBoundingClientRect().width };

    const handleMove = (ev) => {
      if (!dragRef.current) return;
      onResize(columnKey, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX));
    };
    const handleUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleKeyDown = (e) => {
    const th = e.currentTarget.parentElement;
    const current = th.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onResize(columnKey, current - 16); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onResize(columnKey, current + 16); }
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ajustar ancho de la columna ${label}`}
      tabIndex={0}
      title="Arrastra para ajustar el ancho · doble clic para restablecer"
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onReset(columnKey); }}
      onKeyDown={handleKeyDown}
      className="absolute top-0 right-0 h-full w-3 cursor-col-resize select-none flex justify-center group/resize focus:outline-none"
    >
      <span className="w-px h-full bg-transparent group-hover/resize:bg-secondary group-focus/resize:bg-secondary transition-colors"></span>
    </span>
  );
}
