import React, { useEffect } from 'react';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

// Extension from the file name, falling back to the URL path (signed URLs carry a query string).
const getExtension = (name, url) => {
  const source = name || (url || '').split('?')[0];
  const match = /\.([a-z0-9]+)$/i.exec(source || '');
  return match ? match[1].toLowerCase() : '';
};

/**
 * Muestra un respaldo (PDF o imagen) dentro de la aplicación.
 * `file`: { url, title, name? } o null para ocultarlo.
 */
export default function FilePreviewModal({ file, onClose }) {
  useEffect(() => {
    if (!file) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [file, onClose]);

  if (!file) return null;

  const extension = getExtension(file.name, file.url);
  const isPdf = extension === 'pdf';
  const isImage = IMAGE_EXTENSIONS.includes(extension);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative bg-white w-full max-w-5xl h-[90vh] rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface gap-md">
          <div className="min-w-0 text-left">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold truncate">{file.title}</h3>
            {file.name && <p className="text-xs text-on-surface-variant truncate">{file.name}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-surface-container-low">
          {isPdf ? (
            <iframe title={file.title} src={file.url} className="w-full h-full border-0" />
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-md overflow-auto">
              <img src={file.url} alt={file.title} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-sm p-lg text-center">
              <span className="material-symbols-outlined text-[48px] text-outline">description</span>
              <p className="text-body-md text-on-surface-variant">Este tipo de archivo no se puede previsualizar. Descárgalo para abrirlo.</p>
            </div>
          )}
        </div>

        <div className="px-lg py-md flex justify-end gap-md border-t border-outline-variant/30 bg-white">
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-lg py-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            Abrir en pestaña nueva
          </a>
          <button
            type="button"
            onClick={onClose}
            className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
