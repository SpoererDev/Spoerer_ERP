import * as XLSX from 'xlsx';

/**
 * Exports a workbook to an Excel file (.xlsx).
 * Uses window.showSaveFilePicker if available to suggest the filename and remember target directory by ID.
 * Fallbacks to standard XLSX.writeFile if showSaveFilePicker is not supported or fails.
 * 
 * @param {import('xlsx').WorkBook} workbook - XLSX workbook instance
 * @param {string} fileName - Default file name with extension (e.g. "DTE Spoerer.xlsx")
 * @param {string} pickerId - Unique ID for browser to remember selected directory
 */
export async function exportExcelFile(workbook, fileName, pickerId) {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        id: pickerId,
        suggestedName: fileName,
        types: [{
          description: 'Libro de Excel (*.xlsx)',
          accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
          }
        }]
      });
      const writable = await handle.createWritable();
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      await writable.write(buffer);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled the file save dialog
        return false;
      }
      console.warn('showSaveFilePicker error, falling back to XLSX.writeFile:', err);
    }
  }

  // Fallback for environments without File System Access API
  XLSX.writeFile(workbook, fileName);
  return true;
}

const IDB_NAME = 'spoerer_backup_fs_db';
const IDB_STORE = 'dir_handles';
const IDB_KEY = 'backup_root_dir';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return resolve(null);
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function saveBackupDirHandleToIDB(dirHandle) {
  try {
    const db = await openHandleDB();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dirHandle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('No se pudo guardar la referencia de carpeta en IndexedDB:', err);
  }
}

export async function getBackupDirHandleFromIDB() {
  try {
    const db = await openHandleDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Abre el selector de carpetas en la ruta previamente vinculada (si existe)
 * para configurar y recordar la carpeta raíz de respaldos.
 */
export async function pickBackupDirectory() {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('Tu navegador no soporta la selección directa de carpetas (usa Chrome o Edge).');
  }

  const savedHandle = await getBackupDirHandleFromIDB();
  let dirHandle = null;

  try {
    const pickerOptions = {
      id: 'spoerer_backup_root',
      mode: 'readwrite',
      ...(savedHandle ? { startIn: savedHandle } : {})
    };
    dirHandle = await window.showDirectoryPicker(pickerOptions);
  } catch (err) {
    if (err.name === 'AbortError') {
      return null;
    }
    // Si startIn falló porque la carpeta anterior fue movida/eliminada, reintentar sin startIn
    const fallbackHandle = await window.showDirectoryPicker({
      id: 'spoerer_backup_root',
      mode: 'readwrite'
    });
    dirHandle = fallbackHandle;
  }

  if (dirHandle) {
    await saveBackupDirHandleToIDB(dirHandle);
    return {
      handle: dirHandle,
      folderName: dirHandle.name
    };
  }
  return null;
}

/**
 * Solicita al usuario confirmar/seleccionar la carpeta raíz de respaldo inmediatamente
 * (preservando el gesto del usuario en el navegador) abriendo en la carpeta configurada.
 */
export async function acquireBackupDirectoryHandle(configuredPath = '') {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    return { handle: null, cancelled: false, unsupported: true };
  }

  try {
    const savedHandle = await getBackupDirHandleFromIDB();

    if (!savedHandle && configuredPath && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(configuredPath).catch(() => {});
    }

    let rootDirHandle = null;
    try {
      rootDirHandle = await window.showDirectoryPicker({
        id: 'spoerer_backup_root',
        mode: 'readwrite',
        ...(savedHandle ? { startIn: savedHandle } : {})
      });
    } catch (innerErr) {
      if (innerErr.name === 'AbortError') {
        return { handle: null, cancelled: true };
      }
      rootDirHandle = await window.showDirectoryPicker({
        id: 'spoerer_backup_root',
        mode: 'readwrite'
      });
    }

    await saveBackupDirHandleToIDB(rootDirHandle);
    return { handle: rootDirHandle, cancelled: false, folderName: rootDirHandle.name };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { handle: null, cancelled: true };
    }
    console.warn('Error al abrir selector de carpeta de respaldo:', err);
    return { handle: null, cancelled: false, error: err };
  }
}

/**
 * Guarda el archivo de respaldo dos veces en una sola acción:
 * 1. En la carpeta raíz seleccionada con el nombre `rootFileName` ("Respaldo ERP Spoerer.xlsx"), reemplazando el existente.
 * 2. En la subcarpeta `subfolderName` ("Respaldos de ERP") con el nombre fechado `datedFileName` ("YYMMDD – Respaldo ERP Spoerer.xlsx").
 */
export async function exportBackupDualExcel(
  workbook,
  rootFileName = 'Respaldo ERP Spoerer.xlsx',
  subfolderName = 'Respaldos de ERP',
  datedFileName,
  configuredPath = '',
  preAcquiredDirHandle = null
) {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      let rootDirHandle = preAcquiredDirHandle;

      if (!rootDirHandle) {
        const res = await acquireBackupDirectoryHandle(configuredPath);
        if (res.cancelled) {
          return { saved: false, cancelled: true };
        }
        rootDirHandle = res.handle;
      }

      if (rootDirHandle) {
        // 1. Guardar / reemplazar en la carpeta raíz: "Respaldo ERP Spoerer.xlsx"
        const rootFileHandle = await rootDirHandle.getFileHandle(rootFileName, { create: true });
        const rootWritable = await rootFileHandle.createWritable();
        await rootWritable.write(buffer);
        await rootWritable.close();

        // 2. Guardar en la subcarpeta "Respaldos de ERP": "YYMMDD – Respaldo ERP Spoerer.xlsx"
        const subDirHandle = await rootDirHandle.getDirectoryHandle(subfolderName, { create: true });
        const datedFileHandle = await subDirHandle.getFileHandle(datedFileName, { create: true });
        const datedWritable = await datedFileHandle.createWritable();
        await datedWritable.write(buffer);
        await datedWritable.close();

        return {
          saved: true,
          cancelled: false,
          folderName: rootDirHandle.name
        };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return { saved: false, cancelled: true };
      }
      console.warn('Error en showDirectoryPicker, usando descarga estándar:', err);
    }
  }

  // Fallback para navegadores sin soporte de showDirectoryPicker: descarga ambos archivos
  XLSX.writeFile(workbook, rootFileName);
  XLSX.writeFile(workbook, datedFileName);
  return { saved: true, cancelled: false, folderName: '' };
}


