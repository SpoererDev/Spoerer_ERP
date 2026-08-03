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
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled the file save dialog
        return;
      }
      console.warn('showSaveFilePicker error, falling back to XLSX.writeFile:', err);
    }
  }

  // Fallback for environments without File System Access API
  XLSX.writeFile(workbook, fileName);
}
