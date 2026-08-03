import React, { useState, useEffect } from 'react';
import { supabaseService } from '../utils/supabaseService';

export default function BackupHistoryModal({ isOpen, onClose, onDownloadBackup }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await supabaseService.getBackupLogs();
      setLogs(data || []);
    } catch (err) {
      console.error('Error loading backup logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualBackup = async () => {
    setIsGenerating(true);
    try {
      await onDownloadBackup('manual');
      await fetchLogs(); // Refresh list after backup
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in text-left">
      <div className="bg-surface border border-outline-variant/30 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden glass-card flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-primary text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary-container/20 border border-secondary-container/30 flex items-center justify-center text-secondary-fixed">
              <span className="material-symbols-outlined text-2xl">history</span>
            </div>
            <div>
              <h3 className="text-lg font-bold font-heading text-white">Historial y Gestión de Respaldos</h3>
              <p className="text-xs text-slate-300">Registro de descargas consolidadas y backups a demanda</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Action Bar */}
        <div className="bg-surface-container-low px-6 py-4 border-b border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-xs font-semibold text-slate-700">Respaldos Diarios y Manuales</p>
            <p className="text-[11px] text-slate-500">Puedes generar una nueva copia de seguridad en cualquier momento.</p>
          </div>

          <button
            type="button"
            onClick={handleManualBackup}
            disabled={isGenerating}
            className="px-4 py-2 text-xs font-bold text-white bg-secondary hover:bg-secondary/90 rounded-xl shadow transition-all hover-scale active-scale flex items-center gap-2 disabled:opacity-50 shrink-0"
          >
            {isGenerating ? (
              <>
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                <span>Generando...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">cloud_upload</span>
                <span>Generar Respaldo</span>
              </>
            )}
          </button>
        </div>

        {/* Table Content */}
        <div className="p-6 overflow-y-auto grow space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
              <p className="text-xs font-medium">Cargando historial de respaldos...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">folder_off</span>
              <p className="text-sm font-semibold text-slate-700">No hay respaldos registrados aún</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Los respaldos diarios y manuales generados por los administradores aparecerán en esta lista.
              </p>
            </div>
          ) : (
            <div className="border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-outline-variant/30">
                  <tr>
                    <th className="p-3">Fecha Respaldo</th>
                    <th className="p-3">Hora</th>
                    <th className="p-3">Usuario Responsable</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Nombre Archivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {logs.map((log) => {
                    const dateObj = new Date(log.created_at || log.backup_date);
                    const formattedDate = log.backup_date
                      ? log.backup_date.split('-').reverse().join('/')
                      : dateObj.toLocaleDateString('es-CL');
                    const formattedTime = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-medium text-slate-900">{formattedDate}</td>
                        <td className="p-3 text-slate-500">{formattedTime} hrs</td>
                        <td className="p-3 font-semibold text-primary">{log.user_name || 'Administrador'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.backup_type === 'manual'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                            }`}>
                            {log.backup_type === 'manual' ? 'Manual' : 'Diario'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 font-mono text-[11px] truncate max-w-[200px]" title={log.file_name}>
                          {log.file_name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-surface-container-low px-6 py-3 border-t border-outline-variant/20 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
