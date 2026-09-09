import React, { useState, useEffect } from 'react';
import { supabaseService } from '../utils/supabaseService';

// Helper: Sumar meses de forma segura considerando el fin de mes y años bisiestos
function addMonths(dateStr, monthsToAdd) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const tempDate = new Date(year, month - 1 + monthsToAdd, 1);
  const targetYear = tempDate.getFullYear();
  const targetMonth = tempDate.getMonth() + 1; // 1-indexed
  
  const maxDays = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(day, maxDays);
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;
}

// Helper: Calcular metadatos de los grupos (master, miembros y orden)
const getGroupMetadata = (installments) => {
  const groups = {};
  installments.forEach((inst, index) => {
    if (inst.grupo) {
      if (!groups[inst.grupo]) {
        groups[inst.grupo] = [];
      }
      groups[inst.grupo].push({ inst, index });
    }
  });

  const metadata = {};
  Object.entries(groups).forEach(([groupName, members]) => {
    // Ordenar miembros por orden en el arreglo (index)
    members.sort((a, b) => a.index - b.index);

    const master = members[0];
    metadata[groupName] = {
      masterId: master.inst.id,
      members: members.map(m => m.inst.id),
      orderedMembers: members.map(m => m.inst)
    };
  });
  return metadata;
};

// Helper: Obtener el siguiente ID de grupo disponible (G1, G2, etc.)
const getNextGroupId = (installments) => {
  const existingGroups = new Set(installments.map(inst => inst.grupo).filter(Boolean));
  let counter = 1;
  while (existingGroups.has(`G${counter}`)) {
    counter++;
  }
  return `G${counter}`;
};

export default function InstallmentsModal({
  isOpen,
  onClose,
  projectName,
  budgetNumber,
  budgetAmount,
  budgetBackupFiles = [],
  initialInstallments = [],
  onSave,
  projectNumber = 'SPR',
  isDeferredSave = false,
  currency = 'UF',
  billingCompany = 'Spoerer'
}) {
  const [localInstallments, setLocalInstallments] = useState([]);
  const [editingFileIdx, setEditingFileIdx] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (isOpen) {
      setLocalInstallments(
        initialInstallments.map(inst => ({
          ...inst,
          currency: inst.currency || currency || 'UF',
          billingCompany: inst.billingCompany || billingCompany || 'Spoerer',
          // Newly added local files in memory
          invoiceFileObject: null,
          paymentBackupFileObject: null,
          // Mark files for deletion
          deleteInvoiceFile: false,
          deletePaymentBackup: false,
        }))
      );
      setValidationError('');
      setIsSaving(false);
      setSelectedIds(new Set());
    }
  }, [isOpen, initialInstallments, currency, billingCompany]);

  if (!isOpen) return null;

  const handleFieldChange = (index, field, value) => {
    setLocalInstallments(prev => {
      const metadata = getGroupMetadata(prev);
      const instToChange = prev[index];
      const groupId = instToChange.grupo;
      const isMaster = groupId && metadata[groupId]?.masterId === instToChange.id;

      return prev.map((inst, idx) => {
        let newVal = value;
        if (field === 'uf' || field === 'total_clp') {
          newVal = parseFloat(value) || 0;
        }

        if (idx === index) {
          return {
            ...inst,
            [field]: newVal
          };
        }

        // Propagate to slaves if editing the master row
        if (isMaster && inst.grupo === groupId) {
          const orderedMembers = metadata[groupId].orderedMembers;
          const slaveIndex = orderedMembers.findIndex(m => m.id === inst.id);
          
          if (slaveIndex > 0) { // It's a slave
            if (field === 'date') {
              return {
                ...inst,
                date: addMonths(value, slaveIndex)
              };
            }
            if (field === 'dateConfirmed' || field === 'uf' || field === 'comment') {
              return {
                ...inst,
                [field]: newVal
              };
            }
          }
        }

        return inst;
      });
    });
  };

  const handleAddRow = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    let nextDate = '';
    let nextNum = 1;

    if (localInstallments.length === 0) {
      // First installment: 1 month after today
      const dateObj = new Date(todayStr + 'T00:00:00');
      dateObj.setMonth(dateObj.getMonth() + 1);
      nextDate = dateObj.toISOString().split('T')[0];
      nextNum = 1;
    } else {
      // Subsequent installments: 1 month after the previous installment's date
      const lastInst = localInstallments[localInstallments.length - 1];
      const prevDateStr = lastInst.date || todayStr;
      const dateObj = new Date(prevDateStr + 'T00:00:00');
      dateObj.setMonth(dateObj.getMonth() + 1);
      nextDate = dateObj.toISOString().split('T')[0];
      nextNum = localInstallments.length + 1;
    }

    const newInst = {
      id: `temp-${Date.now()}-${nextNum}`,
      project_id: initialInstallments[0]?.project_id || null,
      origin_budget_id: initialInstallments[0]?.origin_budget_id || null,
      numQuota: String(nextNum).padStart(2, '0'),
      date: nextDate,
      uf: 0,
      status: 'Por facturar',
      comment: '',
      dateConfirmed: false,
      currency: currency || 'UF',
      billingCompany: initialInstallments[0]?.billingCompany || billingCompany || 'Spoerer',
      invoiceNumber: '',
      invoiceFileUrl: '',
      paymentBackupUrl: '',
      invoiceFileObject: null,
      paymentBackupFileObject: null,
      deleteInvoiceFile: false,
      deletePaymentBackup: false
    };

    setLocalInstallments(prev => [...prev, newInst]);
  };

  const handleDeleteRow = (index) => {
    const deletedInst = localInstallments[index];
    if (deletedInst) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deletedInst.id);
        return next;
      });
    }
    setLocalInstallments(prev => {
      const filtered = prev.filter((_, idx) => idx !== index);
      // Recalculate sequential installment numbers
      let count = 1;
      return filtered.map(inst => ({
        ...inst,
        numQuota: String(count++).padStart(2, '0')
      }));
    });
  };

  const toggleSelectRow = (id, isSlave) => {
    if (isSlave) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGroup = () => {
    if (selectedIds.size < 2) return;

    setLocalInstallments(prev => {
      // 1. Identify which groups are affected by the selection
      const affectedGroups = new Set();
      prev.forEach(inst => {
        if (selectedIds.has(inst.id) && inst.grupo) {
          affectedGroups.add(inst.grupo);
        }
      });

      // 2. Clear grupo for any installment that belongs to an affected group
      let baseInstallments = prev.map(inst => {
        if (inst.grupo && affectedGroups.has(inst.grupo)) {
          const { grupo: _, ...rest } = inst;
          return rest;
        }
        return inst;
      });

      // 3. Assign the new group to the selected ones
      const nextGroupId = getNextGroupId(baseInstallments);
      let updated = baseInstallments.map(inst => {
        if (selectedIds.has(inst.id)) {
          return {
            ...inst,
            grupo: nextGroupId
          };
        }
        return inst;
      });

      // 4. Propagate master's values in the new group
      const groupMetadata = getGroupMetadata(updated);
      const newGroupMeta = groupMetadata[nextGroupId];
      if (!newGroupMeta) return updated;

      const masterId = newGroupMeta.masterId;
      const masterInst = updated.find(i => i.id === masterId);
      if (!masterInst) return updated;

      const orderedMembers = newGroupMeta.orderedMembers;
      updated = updated.map(inst => {
        if (inst.grupo === nextGroupId) {
          const slaveIndex = orderedMembers.findIndex(m => m.id === inst.id);
          if (slaveIndex === 0) {
            return inst;
          } else if (slaveIndex > 0) {
            return {
              ...inst,
              date: addMonths(masterInst.date, slaveIndex),
              uf: masterInst.uf,
              dateConfirmed: masterInst.dateConfirmed,
              comment: masterInst.comment
            };
          }
        }
        return inst;
      });

      return updated;
    });

    setSelectedIds(new Set());
  };

  const handleUngroup = () => {
    setLocalInstallments(prev => {
      const metadata = getGroupMetadata(prev);
      const groupsToUngroup = new Set();
      
      selectedIds.forEach(id => {
        const inst = prev.find(i => i.id === id);
        if (inst && inst.grupo) {
          const isMaster = metadata[inst.grupo]?.masterId === inst.id;
          if (isMaster) {
            groupsToUngroup.add(inst.grupo);
          }
        }
      });

      if (groupsToUngroup.size === 0) return prev;

      return prev.map(inst => {
        if (inst.grupo && groupsToUngroup.has(inst.grupo)) {
          const { grupo: _, ...rest } = inst;
          return rest;
        }
        return inst;
      });
    });
    setSelectedIds(new Set());
  };

  const groupMetadata = getGroupMetadata(localInstallments);
  const canGroup = selectedIds.size >= 2;
  const canUngroup = Array.from(selectedIds).some(id => {
    const inst = localInstallments.find(i => i.id === id);
    if (!inst || !inst.grupo) return false;
    return groupMetadata[inst.grupo]?.masterId === inst.id;
  });

  // Execute actual uploads and deletes
  const processFilesAndGetUrls = async (inst) => {
    let invoiceFileUrl = inst.invoiceFileUrl;
    let paymentBackupUrl = inst.paymentBackupUrl;

    // 1. Handle invoice file deletion if marked
    if (inst.deleteInvoiceFile && inst.invoiceFileUrl) {
      await supabaseService.deleteInstallmentFile(inst.invoiceFileUrl);
      invoiceFileUrl = '';
    }

    // 2. Handle invoice file upload
    if (inst.invoiceFileObject) {
      invoiceFileUrl = await supabaseService.uploadInstallmentFile(
        'facturas',
        projectNumber,
        inst.invoiceFileObject
      );
    }

    // 3. Handle payment file deletion if marked
    if (inst.deletePaymentBackup && inst.paymentBackupUrl) {
      await supabaseService.deleteInstallmentFile(inst.paymentBackupUrl);
      paymentBackupUrl = '';
    }

    // 4. Handle payment file upload
    if (inst.paymentBackupFileObject) {
      paymentBackupUrl = await supabaseService.uploadInstallmentFile(
        'respaldos_pagos',
        projectNumber,
        inst.paymentBackupFileObject
      );
    }

    return {
      ...inst,
      invoiceFileUrl,
      paymentBackupUrl
    };
  };

  const handleSave = async () => {
    setValidationError('');

    // Verification 7: total sum of planned UF must equal budget amount
    const totalUF = localInstallments.reduce((sum, inst) => sum + (parseFloat(inst.uf) || 0), 0);
    const roundedTotal = Math.round(totalUF * 100) / 100;
    const expectedTotal = Math.round((parseFloat(budgetAmount) || 0) * 100) / 100;

    if (Math.abs(roundedTotal - expectedTotal) >= 0.02) {
      setValidationError(
        `La suma de las cuotas (${roundedTotal.toFixed(2)} ${currency}) no coincide con el total del presupuesto (${expectedTotal.toFixed(2)} ${currency}). Diferencia: ${(expectedTotal - roundedTotal).toFixed(2)} ${currency}.`
      );
      return;
    }

    // Verificar que todas las cuotas tengan fecha planificada asignada
    for (let i = 0; i < localInstallments.length; i++) {
      const curr = localInstallments[i];
      if (!curr.date) {
        setValidationError(`La cuota ${curr.numQuota} no tiene una fecha planificada asignada.`);
        return;
      }
    }

    try {
      setIsSaving(true);

      // Process file uploads first (regardless of deferred status)
      const processedInstallments = [];
      for (const inst of localInstallments) {
        const updatedInst = await processFilesAndGetUrls(inst);
        // Remove file objects before returning
        delete updatedInst.invoiceFileObject;
        delete updatedInst.paymentBackupFileObject;
        delete updatedInst.deleteInvoiceFile;
        delete updatedInst.deletePaymentBackup;
        // Strip group property before saving
        delete updatedInst.grupo;
        processedInstallments.push(updatedInst);
      }

      // Execute main save callback
      await onSave(processedInstallments);
      onClose();
    } catch (err) {
      console.error('Error saving installments:', err);
      setValidationError(err.message || 'Error al procesar los respaldos y guardar la facturación.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentEditingRow = editingFileIdx !== null ? localInstallments[editingFileIdx] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4 text-slate-800">
      <div className="relative bg-white w-full rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up max-w-7xl max-h-[90vh]">

        {/* Cabecera */}
        <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10 rounded-t-xl">
          <div className="text-left">
            <h3 className="font-headline-md text-headline-md text-primary font-bold">
              Cronograma de Facturación
            </h3>
            <p className="text-body-sm text-on-surface-variant font-medium mt-1.5 flex items-center gap-2 flex-wrap">
              <span>Proyecto: <span className="font-bold text-slate-700">{projectName || 'No especificado'}</span></span>
              <span>|</span>
              <span>Presupuesto N°: <span className="font-bold text-slate-700">{budgetNumber}</span></span>
              {budgetBackupFiles && budgetBackupFiles.length > 0 && (
                <>
                  <span>|</span>
                  <div className="flex items-center gap-1.5">
                    {budgetBackupFiles.map((file, idx) => {
                      const isPdf = file.name.toLowerCase().endsWith('.pdf');
                      return (
                        <a
                          key={idx}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center p-1 rounded-md border hover:bg-slate-50 transition-all ${isPdf ? 'text-red-600 border-red-250 bg-red-50/10' : 'text-blue-600 border-blue-250 bg-blue-50/10'
                            }`}
                          title={`Ver respaldo: ${file.name}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {isPdf ? 'picture_as_pdf' : 'description'}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-md">
            {/* Botón Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all active:scale-95"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-lg space-y-md overflow-y-auto flex-grow text-left">
          {validationError && (
            <div className="p-md bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-error font-medium text-body-sm">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{validationError}</span>
            </div>
          )}

          {/* Tabla de cuotas */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-[550px] overflow-y-auto custom-scrollbar flex-grow">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="bg-slate-100 text-slate-700 text-label-sm uppercase font-bold sticky top-0 border-b border-slate-200 z-20">
                <tr className="text-body-sm font-semibold">
                  <th className="p-2 border-b border-slate-200 text-center w-14">Nº Cuota</th>
                  <th className="p-2 border-b border-slate-200 text-center w-36">Fecha Planificada</th>
                  <th className="p-2 border-b border-slate-200 text-center w-16">Conf.</th>
                  <th className="p-2 border-b border-slate-200 text-center w-28">Monto ({currency})</th>
                  <th className="p-2 border-b border-slate-200 text-center w-28">Estado</th>
                  <th className="p-2 border-b border-slate-200 text-center w-28">Folio Factura</th>
                  <th className="p-2 border-b border-slate-200 text-center w-36">Detalle Pesos (CLP)</th>
                  <th className="p-2 border-b border-slate-200 text-center w-36">Fecha Pago</th>
                  <th className="p-2 border-b text-center">Comentario</th>
                  <th className="p-2 border-b text-center w-40">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-body-sm text-slate-700">
                {localInstallments.length > 0 ? (
                   localInstallments.map((row, idx) => {
                    const isMaster = row.grupo && groupMetadata[row.grupo]?.masterId === row.id;
                    const isSlave = row.grupo && groupMetadata[row.grupo]?.masterId !== row.id;

                    return (
                      <tr
                        key={row.id || idx}
                        className={`transition-colors ${
                          isSlave
                            ? 'bg-slate-100/40 text-slate-400 opacity-70'
                            : isMaster
                              ? 'bg-emerald-50/10 hover:bg-emerald-50/20'
                              : 'hover:bg-slate-50/50'
                        }`}
                      >
                        {/* Nº Cuota */}
                        <td
                          onClick={() => toggleSelectRow(row.id, isSlave)}
                          className={`p-2 text-center font-bold text-slate-500 text-body-sm select-none transition-all ${
                            isSlave
                              ? 'bg-slate-100/40 cursor-not-allowed'
                              : 'cursor-pointer hover:bg-slate-200 bg-slate-50/50'
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className={`text-[13px] px-2 py-0.5 rounded-md font-bold transition-all ${
                              selectedIds.has(row.id)
                                ? 'bg-secondary text-white ring-2 ring-secondary/20 scale-105'
                                : 'text-slate-700 hover:text-slate-900'
                            }`}>
                              {row.numQuota}
                            </span>
                            {row.grupo && (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isMaster
                                  ? 'bg-secondary-container text-secondary ring-1 ring-secondary/30'
                                  : 'bg-slate-250 text-slate-600 ring-1 ring-slate-350'
                              }`}>
                                <span className="material-symbols-outlined text-[11px]">
                                  {isMaster ? 'link' : 'link_off'}
                                </span>
                                {row.grupo}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Fecha Planificada */}
                        <td className="p-1">
                          <div className="relative flex items-center w-full">
                            <input
                              type="text"
                              readOnly
                              value={row.date ? row.date.split('-').reverse().join('/') : ''}
                              className={`w-full border-0 bg-transparent p-1 focus:bg-white rounded outline-none text-body-sm pr-6 text-center ${
                                row.dateConfirmed ? 'text-emerald-700 font-semibold' : ''
                              } ${isSlave ? 'text-slate-400 font-normal' : ''}`}
                              placeholder="dd/mm/yyyy"
                            />
                            <input
                              type="date"
                              value={row.date || ''}
                              disabled={isSlave}
                              onChange={(e) => handleFieldChange(idx, 'date', e.target.value)}
                              className={`absolute inset-0 w-full h-full opacity-0 z-10 ${
                                isSlave ? 'cursor-not-allowed' : 'cursor-pointer'
                              }`}
                            />
                            <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[16px]">
                              calendar_month
                            </span>
                          </div>
                        </td>

                        {/* Confirmada (Checkbox) */}
                        <td className="p-1 text-center">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={row.dateConfirmed || false}
                              disabled={isSlave}
                              onChange={(e) => handleFieldChange(idx, 'dateConfirmed', e.target.checked)}
                              className={`w-4 h-4 text-secondary border-slate-350 rounded focus:ring-secondary/20 focus:ring-1 ${
                                isSlave ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                              }`}
                              title={isSlave ? "Deshabilitado en cuota esclava" : "Confirmar fecha planificada"}
                            />
                          </div>
                        </td>

                        {/* Monto UF */}
                        <td className="p-1 w-28">
                          <input
                            type="number"
                            value={row.uf || ''}
                            disabled={isSlave}
                            onChange={(e) => handleFieldChange(idx, 'uf', e.target.value)}
                            className={`w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm font-semibold text-center ${
                              isSlave ? 'text-slate-400 cursor-not-allowed' : ''
                            }`}
                            step="0.01"
                            placeholder="0.00"
                          />
                        </td>

                        {/* Estado */}
                        <td className="p-1 text-center w-28">
                          <div className="flex items-center justify-center">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              row.status === 'Pagada'
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
                                : row.status === 'Factura emitida'
                                  ? 'bg-sky-50 text-sky-700 ring-sky-600/10'
                                  : 'bg-amber-50 text-amber-800 ring-amber-600/20'
                            }`}>
                              {row.status || 'Por facturar'}
                            </span>
                          </div>
                        </td>

                        {/* Folio Factura */}
                        <td className="p-1 w-28">
                          <input
                            type="text"
                            value={row.invoiceNumber || ''}
                            disabled={isSlave || isMaster}
                            onChange={(e) => handleFieldChange(idx, 'invoiceNumber', e.target.value)}
                            className={`w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm text-center ${
                              isSlave || isMaster ? 'text-slate-400 cursor-not-allowed' : ''
                            }`}
                            placeholder={isSlave || isMaster ? "Bloqueado" : "..."}
                          />
                        </td>

                        {/* Detalle Pesos (CLP) - EDITABLE */}
                        <td className="p-1 w-36">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className={`font-bold text-body-sm ${isSlave || isMaster ? 'text-slate-400' : 'text-slate-500'}`}>$</span>
                            <input
                              type="text"
                              value={row.total_clp !== null && row.total_clp !== undefined ? Math.round(row.total_clp).toLocaleString('es-CL') : ''}
                              disabled={isSlave || isMaster}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '');
                                handleFieldChange(idx, 'total_clp', raw);
                              }}
                              className={`w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm font-semibold text-center ${
                                isSlave || isMaster ? 'text-slate-400 cursor-not-allowed' : ''
                              }`}
                              placeholder={isSlave || isMaster ? "Bloqueado" : "0"}
                            />
                          </div>
                        </td>

                        {/* Fecha Pago */}
                        <td className="p-1">
                          <div className="relative flex items-center w-full">
                            <input
                              type="text"
                              readOnly
                              value={row.actualPaymentDate ? row.actualPaymentDate.split('-').reverse().join('/') : ''}
                              className={`w-full border-0 bg-transparent p-1 focus:bg-white rounded outline-none text-body-sm pr-6 text-center ${
                                isSlave || isMaster ? 'text-slate-400 cursor-not-allowed' : ''
                              }`}
                              placeholder={isSlave || isMaster ? "Bloqueado" : "dd/mm/yyyy"}
                            />
                            <input
                              type="date"
                              value={row.actualPaymentDate || ''}
                              disabled={isSlave || isMaster}
                              onChange={(e) => handleFieldChange(idx, 'actualPaymentDate', e.target.value)}
                              className={`absolute inset-0 w-full h-full opacity-0 z-10 ${
                                isSlave || isMaster ? 'cursor-not-allowed' : 'cursor-pointer'
                              }`}
                            />
                            <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[16px]">
                              calendar_month
                            </span>
                          </div>
                        </td>

                        {/* Comentario con datalist */}
                        <td className="p-1">
                          <input
                            type="text"
                            list={`comments-options-${idx}`}
                            value={row.comment || ''}
                            disabled={isSlave}
                            onChange={(e) => handleFieldChange(idx, 'comment', e.target.value)}
                            className={`w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm text-center ${
                              isSlave ? 'text-slate-400 cursor-not-allowed' : ''
                            }`}
                            placeholder={isSlave ? "Bloqueado" : "..."}
                          />
                          <datalist id={`comments-options-${idx}`}>
                            <option value="Anticipo" />
                            <option value="Entrega Municipal" />
                            <option value="Integración Temprana" />
                            <option value="Entrega de Espesores" />
                            <option value="Entrega al Revisor" />
                            <option value="Entrega APC" />
                            <option value="Aumento de Superficie" />
                            <option value="Modificación/Adicional" />
                            <option value="Elementos Secundarios/OOEE" />
                            <option value="Cuotas Sucesivas" />
                          </datalist>
                        </td>

                        {/* Acciones */}
                        <td className="p-1 text-center w-40">
                          <div className="flex items-center justify-center gap-2">

                            {/* Editar Respaldos */}
                            <button
                              type="button"
                              onClick={() => setEditingFileIdx(idx)}
                              disabled={isSlave || isMaster}
                              className={`p-1.5 rounded transition-all flex items-center justify-center relative ${
                                isSlave || isMaster
                                  ? 'text-slate-300 cursor-not-allowed bg-transparent'
                                  : (row.invoiceFileUrl || row.invoiceFileObject || row.paymentBackupUrl || row.paymentBackupFileObject)
                                    ? 'text-emerald-600 hover:bg-slate-105'
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-105'
                              }`}
                              title={isSlave || isMaster ? "Acciones no disponibles en cuotas agrupadas" : "Editar respaldos de la cuota"}
                            >
                              <span className="material-symbols-outlined text-[18px]">attach_file</span>
                              {(row.invoiceFileUrl || row.invoiceFileObject || row.paymentBackupUrl || row.paymentBackupFileObject) && (
                                <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-white"></span>
                              )}
                            </button>

                            {/* Eliminar Cuota */}
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(idx)}
                              disabled={isSlave || isMaster}
                              className={`p-1.5 rounded transition-all flex items-center justify-center ${
                                isSlave || isMaster
                                  ? 'text-slate-300 cursor-not-allowed bg-transparent'
                                  : 'hover:bg-red-50 text-error hover:text-red-700'
                              }`}
                              title={isSlave || isMaster ? "Desagrupe para poder eliminar la cuota" : "Eliminar cuota"}
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>

                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="10" className="p-lg text-center text-on-surface-variant italic bg-slate-50/50">
                      No hay cuotas definidas. Haz clic en "Agregar Cuota" para registrar cobros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pie de modal */}
        <div className="p-lg border-t border-outline-variant/30 sticky bottom-0 bg-white z-10 rounded-b-xl flex flex-col gap-md">

          {/* Fila 1: Acciones de cuotas (Agregar, Agrupar, Desagrupar) */}
          <div className="flex flex-wrap items-center gap-md">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-350 hover:bg-slate-50 text-slate-700 rounded-lg text-body-sm font-bold transition-all active:scale-95 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Agregar Cuota</span>
            </button>

            <button
              type="button"
              onClick={handleGroup}
              disabled={!canGroup}
              className={`flex items-center gap-1.5 px-4 py-2 border rounded-lg text-body-sm font-bold transition-all active:scale-95 shadow-xs ${
                canGroup
                  ? 'bg-secondary text-white border-secondary hover:brightness-110'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              }`}
              title="Agrupa las cuotas seleccionadas (asigna un grupo común y propaga fecha master)"
            >
              <span className="material-symbols-outlined text-[18px]">link</span>
              <span>Agrupar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={handleUngroup}
              disabled={!canUngroup}
              className={`flex items-center gap-1.5 px-4 py-2 border rounded-lg text-body-sm font-bold transition-all active:scale-95 shadow-xs ${
                canUngroup
                  ? 'bg-white border-red-300 text-red-600 hover:bg-red-50/50'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              }`}
              title="Desagrupa las cuotas seleccionadas si incluye la cuota master del grupo"
            >
              <span className="material-symbols-outlined text-[18px]">link_off</span>
              <span>Desagrupar</span>
            </button>
            
            {selectedIds.size > 0 && (
              <span className="text-[12px] text-slate-500 font-medium ml-2">
                Haz clic en el número de cuota para cambiar la selección.
              </span>
            )}
          </div>

          {/* Fila 2: Contenedor de validación y botones de guardado */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-md">

            {/* Contenedor de validación de suma */}
            {(() => {
              const totalUF = localInstallments.reduce((sum, inst) => sum + (parseFloat(inst.uf) || 0), 0);
              const roundedTotal = Math.round(totalUF * 100) / 100;
              const expectedTotal = Math.round((parseFloat(budgetAmount) || 0) * 100) / 100;
              const isMatch = Math.abs(roundedTotal - expectedTotal) < 0.02;

              return (
                <div className={`px-md py-sm rounded-lg flex items-center gap-sm font-bold text-body-sm border w-full sm:w-auto text-left justify-between sm:justify-start ${isMatch
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                  <div className="flex flex-wrap gap-x-base items-center text-slate-700">
                    <span>Cuotas: {localInstallments.length}</span>
                    <span className="text-slate-350">|</span>
                    <span>Suma Planificada: {roundedTotal.toFixed(2)} {currency}</span>
                    <span className="text-slate-350">/</span>
                    <span>Requerido: {expectedTotal.toFixed(2)} {currency}</span>
                  </div>
                  <div className="flex items-center">
                    {isMatch ? (
                      <span className="flex items-center gap-0.5 text-emerald-600">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        <span>Coincide</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-amber-600">
                        <span className="material-symbols-outlined text-[18px]">warning</span>
                        <span>Diferencia: {(expectedTotal - roundedTotal).toFixed(2)} {currency}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Cancelar y Guardar */}
            <div className="flex justify-end gap-md w-full sm:w-auto items-center">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-lg py-2 border border-outline-variant rounded-lg text-on-surface hover:bg-slate-50 transition-all font-semibold active:scale-95 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-secondary text-white px-xl py-2 rounded-lg font-semibold shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Guardar</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* Sub-modal: Editar Respaldos (z-[60]) */}
      {editingFileIdx !== null && currentEditingRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/60 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col border border-outline-variant p-lg space-y-md text-left animate-scale-up text-slate-800">

            <div className="flex justify-between items-center border-b border-outline-variant/15 pb-2">
              <h4 className="font-bold text-primary text-headline-sm flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary">attach_file</span>
                <span>Respaldos - Cuota {currentEditingRow.numQuota}</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingFileIdx(null)}
                className="p-1 hover:bg-slate-100 rounded-full text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-lg py-sm">

              {/* Sección Factura (PDF) */}
              <div className="space-y-sm">
                <span className="block text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
                  Documento de Factura (PDF)
                </span>

                {/* Visualizar archivo existente */}
                {currentEditingRow.invoiceFileUrl && !currentEditingRow.deleteInvoiceFile ? (
                  <div className="flex items-center justify-between p-sm bg-slate-50 border rounded-lg">
                    <a
                      href={currentEditingRow.invoiceFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-secondary font-semibold text-body-sm hover:underline truncate pr-4"
                    >
                      <span className="material-symbols-outlined text-[18px] flex-shrink-0">picture_as_pdf</span>
                      <span className="truncate">Ver Factura Guardada</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleFieldChange(editingFileIdx, 'deleteInvoiceFile', true)}
                      className="text-error hover:bg-red-50 p-1 rounded transition-all"
                      title="Eliminar archivo"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ) : currentEditingRow.invoiceFileObject ? (
                  // Archivo temporal recién seleccionado
                  <div className="flex items-center justify-between p-sm bg-emerald-50/20 border border-emerald-100 rounded-lg">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-body-sm truncate pr-4">
                      <span className="material-symbols-outlined text-[18px] text-emerald-600 flex-shrink-0">draft</span>
                      <span className="truncate">{currentEditingRow.invoiceFileObject.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFieldChange(editingFileIdx, 'invoiceFileObject', null)}
                      className="text-error hover:bg-red-50 p-1 rounded transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ) : (
                  // Botón de carga
                  <div>
                    <label className="flex items-center justify-center gap-1.5 w-full px-4 py-2 bg-white hover:bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer text-body-sm font-semibold text-slate-600 hover:text-slate-800 transition-all">
                      <span className="material-symbols-outlined text-[18px]">upload</span>
                      <span>Subir PDF Factura</span>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFieldChange(editingFileIdx, 'invoiceFileObject', e.target.files[0]);
                            handleFieldChange(editingFileIdx, 'deleteInvoiceFile', true);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Sección Comprobante de Pago */}
              <div className="space-y-sm">
                <span className="block text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
                  Comprobante de Pago
                </span>

                {/* Visualizar comprobante existente */}
                {currentEditingRow.paymentBackupUrl && !currentEditingRow.deletePaymentBackup ? (
                  <div className="flex items-center justify-between p-sm bg-slate-50 border rounded-lg">
                    <a
                      href={currentEditingRow.paymentBackupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-secondary font-semibold text-body-sm hover:underline truncate pr-4"
                    >
                      <span className="material-symbols-outlined text-[18px] flex-shrink-0">receipt</span>
                      <span className="truncate">Ver Comprobante Guardado</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleFieldChange(editingFileIdx, 'deletePaymentBackup', true)}
                      className="text-error hover:bg-red-50 p-1 rounded transition-all"
                      title="Eliminar archivo"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ) : currentEditingRow.paymentBackupFileObject ? (
                  // Archivo temporal recién seleccionado
                  <div className="flex items-center justify-between p-sm bg-emerald-50/20 border border-emerald-100 rounded-lg">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-body-sm truncate pr-4">
                      <span className="material-symbols-outlined text-[18px] text-emerald-600 flex-shrink-0">draft</span>
                      <span className="truncate">{currentEditingRow.paymentBackupFileObject.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFieldChange(editingFileIdx, 'paymentBackupFileObject', null)}
                      className="text-error hover:bg-red-50 p-1 rounded transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ) : (
                  // Botón de carga
                  <div>
                    <label className="flex items-center justify-center gap-1.5 w-full px-4 py-2 bg-white hover:bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer text-body-sm font-semibold text-slate-600 hover:text-slate-800 transition-all">
                      <span className="material-symbols-outlined text-[18px]">upload</span>
                      <span>Subir Comprobante</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFieldChange(editingFileIdx, 'paymentBackupFileObject', e.target.files[0]);
                            handleFieldChange(editingFileIdx, 'deletePaymentBackup', true);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

            </div>

            <div className="pt-md border-t border-outline-variant/15 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingFileIdx(null)}
                className="bg-primary text-white px-lg py-2 rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-colors"
              >
                Listo
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
