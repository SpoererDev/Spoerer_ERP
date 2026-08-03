import React, { useState } from 'react';

export default function DailyBackupModal({ isOpen, onClose, onDownloadBackup, userName }) {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in text-left">
      <div className="bg-surface border border-outline-variant/30 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden glass-card">
        {/* Header */}
        <div className="bg-primary text-white p-6 relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
            <span className="material-symbols-outlined text-3xl">cloud_download</span>
          </div>
          <div>
            <h3 className="text-xl font-bold font-heading text-white">Respaldo Diario Pendiente</h3>
            <p className="text-xs text-slate-300 mt-1">SPOERER ERP Suite - Seguridad de Datos</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-on-surface">
          <p className="text-sm leading-relaxed text-slate-700">
            Hola <strong className="text-primary">{userName || 'Administrador'}</strong>. Como medida de seguridad diaria, se requiere descargar la copia de respaldo consolidada del sistema.
          </p>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs">
              <span className="material-symbols-outlined text-sm">info</span>
              <span>El respaldo consolidado incluye:</span>
            </div>
            <ul className="text-xs text-amber-900 space-y-1 pl-6 list-disc">
              <li>Reportes de Facturación y Presupuestos (compatibles con PowerBI)</li>
              <li>Base de Datos completa para reconstrucción en caso de pérdida</li>
            </ul>
          </div>

          <p className="text-xs text-slate-500">
            Si decides posponerlo ahora, se mantendrá un aviso superior visible hasta completar la descarga del día.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="bg-surface-container-low px-6 py-4 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-all hover-scale active-scale text-center"
          >
            Posponer / Continuar
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isGenerating}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-primary hover:bg-primary-container rounded-xl shadow-md transition-all hover-scale active-scale flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                <span>Generando Excel...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">download</span>
                <span>Descargar Respaldo Ahora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
