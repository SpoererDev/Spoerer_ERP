import React, { useState, useEffect } from 'react';
import { supabaseService } from '../utils/supabaseService';
import { pickBackupDirectory, getBackupDirHandleFromIDB } from '../utils/exportHelper';

export default function BackupHistoryModal({ isOpen, onClose, onDownloadBackup, latestBackupLog }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Backup path configuration states (persisted in Supabase DB + IndexedDB handle)
  const [configuredPath, setConfiguredPath] = useState('');
  const [savedDbPath, setSavedDbPath] = useState('');
  const [linkedFolderName, setLinkedFolderName] = useState('');
  const [isSavingPath, setIsSavingPath] = useState(false);
  const [pathSavedMessage, setPathSavedMessage] = useState('');
  const [showPathConfig, setShowPathConfig] = useState(false);

  const effectiveLatestLog = latestBackupLog || (logs && logs.length > 0 ? logs[0] : null);

  const daysSinceBackup = React.useMemo(() => {
    if (!effectiveLatestLog) return null;
    const dateStr = effectiveLatestLog.backup_date || (effectiveLatestLog.created_at ? effectiveLatestLog.created_at.substring(0, 10) : null);
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return null;
    const backupDate = new Date(year, month - 1, day);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = today.getTime() - backupDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [effectiveLatestLog]);

  const hasWarning = daysSinceBackup === null || daysSinceBackup > 2;

  const subtitleText = React.useMemo(() => {
    if (daysSinceBackup === null) {
      return 'Sin respaldos registrados';
    }
    return `Último respaldo hace ${daysSinceBackup} ${daysSinceBackup === 1 ? 'día' : 'días'}`;
  }, [daysSinceBackup]);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      fetchBackupConfiguration();
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

  const fetchBackupConfiguration = async () => {
    try {
      const [dbConfig, idbHandle] = await Promise.all([
        supabaseService.getBackupConfig(),
        getBackupDirHandleFromIDB()
      ]);
      const dbPath = dbConfig?.path || '';
      const folderName = idbHandle?.name || dbConfig?.folderName || '';
      setConfiguredPath(dbPath || folderName);
      setSavedDbPath(dbPath || folderName);
      setLinkedFolderName(folderName);
    } catch (err) {
      console.warn('Error loading backup configuration:', err);
    }
  };

  const handleSaveBackupPath = async (customPath = configuredPath, customFolder = linkedFolderName) => {
    setIsSavingPath(true);
    setPathSavedMessage('');
    try {
      const saved = await supabaseService.saveBackupConfig({
        path: customPath,
        folderName: customFolder
      });
      setSavedDbPath(saved.path || saved.folderName);
      setConfiguredPath(saved.path || saved.folderName);
      if (saved.folderName && !linkedFolderName) {
        setLinkedFolderName(saved.folderName);
      }
      setPathSavedMessage('Ruta guardada en base de datos');
      setTimeout(() => setPathSavedMessage(''), 3500);
    } catch (err) {
      console.error('Error saving backup path:', err);
      alert('No se pudo guardar la ruta en la base de datos.');
    } finally {
      setIsSavingPath(false);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const picked = await pickBackupDirectory();
      if (!picked) return;
      setLinkedFolderName(picked.folderName);
      const nextPath = configuredPath && configuredPath.includes('\\')
        ? configuredPath
        : picked.folderName;
      setConfiguredPath(nextPath);
      await handleSaveBackupPath(nextPath, picked.folderName);
    } catch (err) {
      console.error('Error selecting directory:', err);
      alert(err.message || 'No se pudo seleccionar la carpeta.');
    }
  };

  const handleManualBackup = async () => {
    setIsGenerating(true);
    try {
      const res = await onDownloadBackup('manual', configuredPath);
      if (res?.folderName) {
        setLinkedFolderName(res.folderName);
        if (!configuredPath) {
          setConfiguredPath(res.folderName);
          setSavedDbPath(res.folderName);
        }
      }
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
      <div className="bg-surface border border-outline-variant/30 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden glass-card flex flex-col max-h-[88vh]">
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
        <div className="bg-surface-container-low px-6 py-4 border-b border-outline-variant/20 flex flex-col gap-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <p className="text-xs font-semibold text-slate-700">Respaldos Diarios y Manuales</p>
                {subtitleText && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    hasWarning
                      ? 'text-amber-800 bg-amber-100/90 border-amber-300'
                      : 'text-emerald-800 bg-emerald-100/90 border-emerald-300'
                  }`}>
                    {hasWarning && <span className="material-symbols-outlined text-[13px] text-amber-700">warning</span>}
                    <span>{subtitleText}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Guarda simultáneamente <span className="font-semibold text-slate-700">Respaldo ERP Spoerer.xlsx</span> en la raíz y la copia con fecha en <span className="font-semibold text-slate-700">Respaldos de ERP/</span>.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPathConfig(prev => !prev)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 ${
                  showPathConfig
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-700 border-outline-variant/50 hover:bg-slate-50'
                }`}
                title="Configurar ruta predeterminada de respaldo"
              >
                <span className="material-symbols-outlined text-sm">folder_managed</span>
                <span>Configurar Ruta</span>
              </button>

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
          </div>

          {/* Barra resumen de ruta actual o panel desplegable de configuración */}
          <div className="bg-white/90 border border-outline-variant/30 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-secondary shrink-0">folder_special</span>
                <span className="font-semibold text-slate-700 shrink-0">Ruta configurada:</span>
                {savedDbPath ? (
                  <span className="font-mono text-[11px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[320px]" title={savedDbPath}>
                    {savedDbPath}
                  </span>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Sin ruta predeterminada configurada</span>
                )}
                {linkedFolderName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                    Carpeta vinculada: {linkedFolderName}
                  </span>
                )}
              </div>

              {!showPathConfig && (
                <button
                  type="button"
                  onClick={() => setShowPathConfig(true)}
                  className="text-[11px] font-semibold text-secondary hover:underline"
                >
                  Cambiar ruta
                </button>
              )}
            </div>

            {showPathConfig && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Ruta de carpeta raíz para respaldos (persistente en Base de Datos):
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={configuredPath}
                    onChange={(e) => setConfiguredPath(e.target.value)}
                    placeholder="Ej: C:\Users\Usuario\OneDrive\Respaldos Spoerer"
                    className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-outline-variant/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handlePickDirectory}
                    className="px-3 py-1.5 text-xs font-semibold text-primary bg-surface-container-low hover:bg-slate-200/70 border border-outline-variant/40 rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0"
                    title="Seleccionar la carpeta en el explorador para que la ventana siempre se abra directamente allí"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    <span>Vincular Carpeta...</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveBackupPath(configuredPath, linkedFolderName)}
                    disabled={isSavingPath}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-primary hover:bg-primary-container rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    <span>{isSavingPath ? 'Guardando...' : 'Guardar Ruta'}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    Al usar <strong>Vincular Carpeta...</strong>, la ventana del sistema se abrirá directamente en esa ubicación al generar respaldos.
                  </span>
                  {pathSavedMessage && (
                    <span className="text-emerald-600 font-semibold shrink-0 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">done</span>
                      {pathSavedMessage}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
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
