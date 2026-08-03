import React, { useState } from 'react';

export default function DailyBackupBanner({ onDownloadBackup, onDismiss }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await onDownloadBackup();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2.5 shadow-md flex items-center justify-between gap-4 text-xs font-medium z-40 relative animate-fade-in border-b border-amber-600/30">
      <div className="flex items-center gap-2.5">
        <span className="material-symbols-outlined text-base font-bold text-amber-950 animate-pulse">warning</span>
        <span>
          <strong className="font-bold">Respaldo Diario Pendiente:</strong> Aún no se ha realizado el respaldo de información correspondiente al día de hoy.
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isGenerating}
          className="px-3 py-1.5 bg-slate-900 text-amber-300 font-bold hover:bg-slate-800 rounded-lg shadow-sm transition-all hover-scale active-scale flex items-center gap-1.5 text-xs disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <span className="material-symbols-outlined animate-spin text-xs">progress_activity</span>
              <span>Generando...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xs">download</span>
              <span>Descargar Respaldo</span>
            </>
          )}
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-950 hover:text-slate-900 p-1 rounded-md hover:bg-amber-400/50 transition-colors"
            title="Ocultar aviso por esta sesión"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>
    </div>
  );
}
