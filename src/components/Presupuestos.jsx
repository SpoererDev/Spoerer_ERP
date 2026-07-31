import React, { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import InstallmentsModal from './InstallmentsModal';

const PROJECT_TYPES = [
  "Edificio",
  "Casas y Colegios",
  "Otros proyectos",
  "Revision",
  "BTD",
  "Recuperacion de gastos",
  "Industrial",
  "Perú",
  "Mind & Lean"
];

const COMMENT_OPTIONS = [
  "Anticipo",
  "Entrega Municipal",
  "Integración Temprana",
  "Entrega de Espesores",
  "Entrega al Revisor",
  "Entrega APC",
  "Aumento de Superficie",
  "Modificación/Adicional",
  "Elementos Secundarios/OOEE",
  "Cuotas Sucesivas"
];

// Helper to parse date strings of format DD/MM/YYYY or YYYY-MM-DD to Date object
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  const fallbackParts = dateStr.split('-');
  if (fallbackParts.length === 3) {
    const year = parseInt(fallbackParts[0], 10);
    const month = parseInt(fallbackParts[1], 10) - 1;
    const day = parseInt(fallbackParts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
};

const getTodayDDMMYYYY = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const ensureDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // YYYY-MM-DD -> DD/MM/YYYY
    } else {
      return `${parts[0]}/${parts[1]}/${parts[2]}`; // DD-MM-YYYY -> DD/MM/YYYY
    }
  }
  return dateStr;
};

// Helper to check if a quote falls within the selected period of months
const isQuoteInPeriod = (quote, period) => {
  if (period === 'all') return true;
  const quoteDate = parseDate(quote.date);
  if (!quoteDate) return false;

  const today = new Date();
  const cutoffDate = new Date();
  cutoffDate.setMonth(today.getMonth() - parseInt(period, 10));

  return quoteDate >= cutoffDate;
};

export default function Presupuestos({
  quotes,
  mainClients = [],
  clients,
  onAddQuote,
  onDeleteQuote,
  projects,
  onApproveBudgetAndCreateProject,
  installments,
  users = [],
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  calcPeriod,
  setCalcPeriod,
  onSaveProject
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', title: string, message: string }
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingQuote, setViewingQuote] = useState(null);

  const handleViewQuote = (quote) => {
    setViewingQuote(quote);
    setIsViewModalOpen(true);
  };

  const findQuoteBillingTable = (budgetId) => {
    if (!installments) return null;
    const filtered = installments.filter(i => i.origin_budget_id === budgetId);
    return filtered.length > 0 ? filtered : null;
  };

  const [editBillingTable, setEditBillingTable] = useState([]);

  const handleEditRowChange = (index, field, value) => {
    setEditBillingTable(prev => prev.map((row, idx) => {
      if (idx === index) {
        return {
          ...row,
          [field]: field === 'uf' ? (parseFloat(value) || 0) : value
        };
      }
      return row;
    }));
  };

  const handleAddEditRow = () => {
    const lastRow = editBillingTable[editBillingTable.length - 1];
    let nextDate = new Date().toISOString().split('T')[0];
    if (lastRow && lastRow.date) {
      nextDate = addMonthsToDateString(lastRow.date, 1);
    }
    const nextNum = String(editBillingTable.length + 1).padStart(2, '0');
    setEditBillingTable(prev => [
      ...prev,
      {
        numQuota: nextNum,
        date: nextDate,
        uf: 0,
        comment: '',
        status: 'Por facturar'
      }
    ]);
  };

  const handleRemoveEditRow = (index) => {
    setEditBillingTable(prev => {
      const filtered = prev.filter((_, idx) => idx !== index);
      return filtered.map((row, idx) => ({
        ...row,
        numQuota: String(idx + 1).padStart(2, '0')
      }));
    });
  };

  // Project Approval modal states
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [approvingQuote, setApprovingQuote] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [superficie, setSuperficie] = useState('');
  const [rentabilidad, setRentabilidad] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [anio, setAnio] = useState('');
  const [valorProyecto, setValorProyecto] = useState(0);
  const [cliente, setCliente] = useState('');
  const [billingTable, setBillingTable] = useState([]);
  const [validationError, setValidationError] = useState('');
  const [approvingQuoteBackupFiles, setApprovingQuoteBackupFiles] = useState([]);
  const [matchedProjectId, setMatchedProjectId] = useState(null);
  const [prefilledFromProjectId, setPrefilledFromProjectId] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tipo, setTipo] = useState('');
  const [isCustomTipo, setIsCustomTipo] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const suggestionsRef = useRef(null);

  // Reviewers modal states
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewingQuote, setReviewingQuote] = useState(null);
  const [selectedReviewers, setSelectedReviewers] = useState([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState('');

  const handleAddReviewer = () => {
    if (!selectedReviewerId) return;
    const reviewer = users.find(u => u.id === selectedReviewerId);
    if (reviewer && !selectedReviewers.some(r => r.id === reviewer.id)) {
      setSelectedReviewers(prev => [...prev, reviewer]);
      setSelectedReviewerId('');
    }
  };

  const handleRemoveReviewer = (id) => {
    setSelectedReviewers(prev => prev.filter(r => r.id !== id));
  };

  const handleCloseReviewModal = () => {
    setIsReviewModalOpen(false);
    setReviewingQuote(null);
    setSelectedReviewers([]);
    setSelectedReviewerId('');
  };

  const handleConfirmReview = async () => {
    if (!reviewingQuote) return;
    try {
      await onAddQuote({
        ...reviewingQuote,
        status: 'En revisión'
      });
      handleCloseReviewModal();
    } catch (error) {
      console.error("Error al pasar presupuesto a revisión:", error);
    }
  };

  const filteredProjects = projects && projectName
    ? projects.filter(p => p.projectName.toLowerCase().includes(projectName.toLowerCase()))
    : [];

  // New quote form state
  const [quoteId, setQuoteId] = useState('');
  const [currentBudgetUuid, setCurrentBudgetUuid] = useState(null);
  const [selectedMainClient, setSelectedMainClient] = useState('');
  const [selectedLegalEntity, setSelectedLegalEntity] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayDDMMYYYY());
  const [validity, setValidity] = useState(30);
  const [quoteTitle, setQuoteTitle] = useState('Servicios ERP');
  const [backupFiles, setBackupFiles] = useState([]);
  const [isExistingQuote, setIsExistingQuote] = useState(false);
  const [isAiExtracting, setIsAiExtracting] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [docxHtml, setDocxHtml] = useState('');
  const [showAiSuccessModal, setShowAiSuccessModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);

  // Calculate totals
  useEffect(() => {
    const roundedSub = Math.round((parseFloat(subtotal) || 0) * 100) / 100;
    const tx = Math.round((roundedSub * 0.19) * 100) / 100; // 19% tax (IVA)
    const roundedTotal = Math.round((roundedSub + tx) * 100) / 100;

    setTax(tx);
    setTotal(roundedTotal);
  }, [subtotal]);

  // Handle DOCX preview loading and conversion
  useEffect(() => {
    if (!previewFile) {
      setDocxHtml('');
      return;
    }

    if (previewFile.name.toLowerCase().endsWith('.docx')) {
      if (previewFile.fileObject) {
        const reader = new FileReader();
        reader.readAsArrayBuffer(previewFile.fileObject);
        reader.onload = async (event) => {
          const arrayBuffer = event.target.result;
          try {
            const result = await mammoth.convertToHtml({ arrayBuffer });
            setDocxHtml(result.value || '<p class="text-on-surface-variant italic text-center">Documento vacío.</p>');
          } catch (error) {
            console.error('Error al convertir docx a html:', error);
            setDocxHtml('<p class="text-error font-bold text-center py-4">Error al generar la vista previa de Word.</p>');
          }
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
          setDocxHtml('<p class="text-error font-bold text-center py-4">Error al leer el archivo de Word.</p>');
        };
      } else if (previewFile.url) {
        // Fetch from Supabase Storage and convert
        fetch(previewFile.url)
          .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.arrayBuffer();
          })
          .then(async (arrayBuffer) => {
            try {
              const result = await mammoth.convertToHtml({ arrayBuffer });
              setDocxHtml(result.value || '<p class="text-on-surface-variant italic text-center">Documento vacío.</p>');
            } catch (error) {
              console.error('Error al convertir docx a html:', error);
              setDocxHtml('<p class="text-error font-bold text-center py-4">Error al generar la vista previa de Word.</p>');
            }
          })
          .catch(error => {
            console.error('Error fetching docx:', error);
            setDocxHtml('<p class="text-error font-bold text-center py-4">Error al descargar el archivo de Word para la vista previa.</p>');
          });
      } else {
        // Fallback for mocked files in initial state
        setDocxHtml('<div class="text-center py-10"><span class="material-symbols-outlined text-[48px] text-amber-500">warning</span><p class="font-bold text-body-md mt-2 text-on-surface">Vista previa no disponible para archivos simulados.</p><p class="text-label-md text-on-surface-variant mt-1">Por favor descarga el archivo para poder visualizarlo.</p></div>');
      }
    }
  }, [previewFile]);

  // Close project suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Helper to suggest next quote ID
  const getNextQuoteId = () => {
    const numericIds = quotes
      .map(q => parseInt((q.quoteId || '').replace(/\D/g, '')))
      .filter(id => !isNaN(id));
    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    return String(maxId + 1).padStart(4, '0');
  };

  const handleDeleteQuote = (id) => {
    setDeleteConfirmId(id);
  };

  const validateProjectNameFormat = (name) => {
    const regex = /^\d+[\s\S]*?-[\s\S]*?\s+-\s+[\s\S]+$/;
    return regex.test(name);
  };

  const checkAndPrefillExistingProject = (name) => {
    if (!projects) return;
    const existing = projects.find(p => p.projectName.toLowerCase() === name.toLowerCase());
    if (existing) {
      setMatchedProjectId(existing.id);
      if (existing.id !== prefilledFromProjectId) {
        setSuperficie(existing.superficie || '');
        setRentabilidad(existing.rentabilidad || '');
        setAnio(existing.anio || new Date().getFullYear());
        setCliente(existing.cliente || '');
        setPrefilledFromProjectId(existing.id);
        const existingTipo = existing.tipo || '';
        setTipo(existingTipo);
        setIsCustomTipo(existingTipo ? !PROJECT_TYPES.includes(existingTipo) : false);
      }
    } else {
      setMatchedProjectId(null);
      setPrefilledFromProjectId(null);
    }
  };

  const handleFolderSearch = async () => {
    try {
      setValidationError('');
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        const folderName = dirHandle.name;
        if (validateProjectNameFormat(folderName)) {
          setProjectName(folderName);
          checkAndPrefillExistingProject(folderName);
        } else {
          setValidationError(`La carpeta seleccionada "${folderName}" no cumple con el formato requerido: Nº Proyecto-Nombre - Cliente (Ej: 0280-Edificio Ciudad - TechNova Solutions).`);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.directory = true;
        input.onchange = (e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const path = files[0].webkitRelativePath;
            const folderName = path.split('/')[0];
            if (validateProjectNameFormat(folderName)) {
              setProjectName(folderName);
              checkAndPrefillExistingProject(folderName);
            } else {
              setValidationError(`La carpeta seleccionada "${folderName}" no cumple con el formato requerido: Nº Proyecto-Nombre - Cliente (Ej: 0280-Edificio Ciudad - TechNova Solutions).`);
            }
          }
        };
        input.click();
      }
    } catch (err) {
      console.warn("Folder picker error or cancelled:", err);
    }
  };

  const addMonthsToDateString = (dateStr, monthsToAdd) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    date.setMonth(date.getMonth() + monthsToAdd);
    return date.toISOString().split('T')[0];
  };

  const regenerateGroupedBillingTable = (startDate, totalVal) => {
    const parsedTotalVal = parseFloat(totalVal) || 0;
    if (!startDate) {
      setBillingTable([]);
      return;
    }

    const firstRowUf = parseFloat((parsedTotalVal * 0.25).toFixed(2));
    const secondRowUf = parseFloat(((parsedTotalVal * 0.75) / 10).toFixed(2));
    const secondRowDate = addMonthsToDateString(startDate, 1);

    const initialTable = [
      {
        cuotas: 1,
        date: startDate,
        uf: firstRowUf,
        comment: 'Anticipo'
      },
      {
        cuotas: 10,
        date: secondRowDate,
        uf: secondRowUf,
        comment: 'Mensualidades'
      }
    ];
    setBillingTable(initialTable);
  };

  const handleFechaInicioChange = (val) => {
    setFechaInicio(val);
    regenerateGroupedBillingTable(val, valorProyecto);
  };

  const handleValorProyectoChange = (val) => {
    setValorProyecto(val);
    regenerateGroupedBillingTable(fechaInicio, val);
  };

  const handleRowChange = (index, field, value) => {
    setBillingTable(prev => prev.map((row, idx) => {
      if (idx === index) {
        return {
          ...row,
          [field]: field === 'uf'
            ? (parseFloat(value) || 0)
            : field === 'cuotas'
              ? (parseInt(value) || 1)
              : value
        };
      }
      return row;
    }));
  };

  const handleAddRow = () => {
    const lastRow = billingTable[billingTable.length - 1];
    let nextDate = new Date().toISOString().split('T')[0];
    if (lastRow && lastRow.date) {
      nextDate = addMonthsToDateString(lastRow.date, 1);
    }
    setBillingTable(prev => [
      ...prev,
      {
        cuotas: 1,
        date: nextDate,
        uf: 0,
        comment: ''
      }
    ]);
  };

  const handleRemoveRow = (index) => {
    setBillingTable(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleApproveModalFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const invalidFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ext !== 'pdf' && ext !== 'docx';
    });

    if (invalidFiles.length > 0) {
      alert('Solo se permiten archivos PDF y DOCX.');
      return;
    }

    const newFiles = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
      fileObject: file
    }));

    setApprovingQuoteBackupFiles(prev => [...prev, ...newFiles]);
  };

  const handleApproveModalRemoveFile = (index) => {
    setApprovingQuoteBackupFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!projectName) {
      setValidationError("Por favor ingrese el Nº y Nombre del proyecto.");
      return;
    }
    if (!validateProjectNameFormat(projectName)) {
      setValidationError("El nombre del proyecto no cumple con el formato requerido. Debe ser: Nº Proyecto-Nombre - Cliente (Ej: 0280-Edificio Ciudad - TechNova Solutions).");
      return;
    }
    if (!tipo || !tipo.trim()) {
      setValidationError("Por favor seleccione o ingrese el tipo de proyecto.");
      return;
    }
    if (!fechaInicio) {
      setValidationError("Por favor seleccione la fecha de inicio de facturación.");
      return;
    }

    // Validate that sum of cuotas equals valorProyecto
    const currentSum = billingTable.reduce((acc, row) => acc + ((parseInt(row.cuotas) || 1) * (parseFloat(row.uf) || 0)), 0);
    const roundedSum = Math.round(currentSum * 100) / 100;
    const expectedTotal = Math.round((parseFloat(valorProyecto) || 0) * 100) / 100;
    if (Math.abs(roundedSum - expectedTotal) >= 0.02) {
      setValidationError(`La suma de las cuotas (${roundedSum.toFixed(2)} UF) no coincide con el valor total del presupuesto (${expectedTotal.toFixed(2)} UF). Diferencia: ${(expectedTotal - roundedSum).toFixed(2)} UF.`);
      return;
    }

    // Expand the grouped table into single installments for storing
    let expandedTable = [];
    let counter = 1;
    billingTable.forEach(row => {
      const C = parseInt(row.cuotas) || 1;
      const U = parseFloat(row.uf) || 0;
      const V = row.comment || '';
      for (let i = 0; i < C; i++) {
        const numStr = String(counter).padStart(2, '0');
        const dateVal = addMonthsToDateString(row.date, i);
        expandedTable.push({
          numQuota: numStr,
          date: dateVal,
          uf: U,
          comment: V,
          status: 'Por facturar'
        });
        counter++;
      }
    });

    // Parse project number and name from semantic string
    const nameParts = projectName.split('-');
    const projectNumber = nameParts[0]?.trim() || '';
    const rawProjectName = nameParts.slice(1).join('-').split(' - ')[0]?.trim() || projectName;

    const projectForm = {
      id: matchedProjectId,
      projectNumber: projectNumber,
      rawProjectName: rawProjectName,
      clientId: approvingQuote.clientId || approvingQuote.legalEntityId || null,
      mainClientId: approvingQuote.mainClientId || null,
      legalEntityId: approvingQuote.legalEntityId || approvingQuote.clientId || null,
      superficie: parseFloat(superficie) || 0,
      rentabilidad: parseFloat(rentabilidad) || 0,
      anio: parseInt(anio) || new Date().getFullYear(),
      tipo: tipo || null
    };

    const budgetForm = {
      amount: parseFloat(valorProyecto) || 0,
      title: descripcion || '',
      backupFiles: approvingQuoteBackupFiles
    };

    try {
      setIsApproving(true);
      await onApproveBudgetAndCreateProject(projectForm, approvingQuote.id, expandedTable, budgetForm);
      setNotification({
        type: 'success',
        title: 'Presupuesto Aprobado',
        message: 'El presupuesto ha sido aprobado y el proyecto se ha creado con éxito.'
      });
      // Reset approval modal states
      setIsApproveModalOpen(false);
      setApprovingQuote(null);
      setApprovingQuoteBackupFiles([]);
      setValidationError('');
      setMatchedProjectId(null);
      setPrefilledFromProjectId(null);
      setShowSuggestions(false);
      setTipo('');
      setIsCustomTipo(false);
    } catch (err) {
      setValidationError(err.message || 'Error al aprobar presupuesto.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleStatusChange = (id, newStatus) => {
    const quote = quotes.find(q => q.id === id);
    if (quote) {
      if (quote.status === 'Aprobado' || quote.status === 'Aprovado') {
        alert('Por razones de seguridad, no se puede cambiar el estado de un presupuesto que ya está aprobado.');
        return;
      }
      if (newStatus === 'En revisión') {
        if (quote.status === 'Borrador') {
          setReviewingQuote(quote);
          setSelectedReviewers([]);
          setSelectedReviewerId('');
          setIsReviewModalOpen(true);
          return;
        }
      }
      if (newStatus === 'Aprobado') {
        setApprovingQuote(quote);
        setApprovingQuoteBackupFiles(quote.backupFiles || []);
        setProjectName('');
        setSuperficie('');
        setRentabilidad('');
        setDescripcion(quote.title || '');
        setValidationError('');
        setMatchedProjectId(null);
        setPrefilledFromProjectId(null);
        setShowSuggestions(false);

        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        const nextMonthDate = d.toISOString().split('T')[0];
        setFechaInicio(nextMonthDate);

        const currentYear = new Date().getFullYear();
        setAnio(currentYear);
        setTipo('');
        setIsCustomTipo(false);

        setValorProyecto(quote.amount || 0);

        const clientNameVal = quote.company || quote.clientName || '';
        setCliente(clientNameVal);

        // Regenerate billing table with default 2 rows: 1 cuota with 25%, 10 cuotas with 75%
        const budgetAmount = quote.amount || 0;
        const firstRowUf = parseFloat((budgetAmount * 0.25).toFixed(2));
        const secondRowUf = parseFloat(((budgetAmount * 0.75) / 10).toFixed(2));
        const secondRowDate = addMonthsToDateString(nextMonthDate, 1);

        const initialTable = [
          {
            cuotas: 1,
            date: nextMonthDate,
            uf: firstRowUf,
            comment: 'Anticipo'
          },
          {
            cuotas: 10,
            date: secondRowDate,
            uf: secondRowUf,
            comment: 'Mensualidades'
          }
        ];
        setBillingTable(initialTable);
        setIsApproveModalOpen(true);
      } else {
        onAddQuote({
          ...quote,
          status: newStatus
        });
      }
    }
  };

  // Open modal for a new quote
  const handleOpenNewQuoteModal = () => {
    setQuoteId(getNextQuoteId());
    setCurrentBudgetUuid(null);
    setSelectedMainClient('');
    setSelectedLegalEntity('');
    setSelectedClient('');
    setIssueDate(getTodayDDMMYYYY());
    setValidity(30);
    setQuoteTitle('Servicios ERP');
    setSubtotal(1200.00); // default value
    setBackupFiles([]);
    setEditBillingTable([]);
    setIsExistingQuote(false);
    setIsModalOpen(true);
  };

  // Open modal to edit an existing quote
  const handleEditQuote = (quote) => {
    setQuoteId(quote.quoteId);
    setCurrentBudgetUuid(quote.id);
    
    const matchedMC = mainClients.find(mc =>
      (quote.mainClientId && mc.id === quote.mainClientId) ||
      (quote.mainClientName && mc.name.toLowerCase() === quote.mainClientName.toLowerCase()) ||
      (quote.clientName && mc.name.toLowerCase() === quote.clientName.toLowerCase())
    );
    const targetMainId = matchedMC ? matchedMC.id : (quote.mainClientId || quote.clientName || '');
    setSelectedMainClient(targetMainId);

    const matchedLE = clients.find(c =>
      (quote.legalEntityId && c.id === quote.legalEntityId) ||
      (quote.clientId && c.id === quote.clientId)
    );
    const targetLegalId = matchedLE ? matchedLE.id : (quote.legalEntityId || quote.clientId || '');
    setSelectedLegalEntity(targetLegalId);
    setSelectedClient(targetMainId || targetLegalId);

    setIssueDate(ensureDDMMYYYY(quote.date) || getTodayDDMMYYYY());

    const valDays = quote.validity ? parseInt(quote.validity) || 30 : 30;
    setValidity(valDays);
    setQuoteTitle(quote.title || '');

    // Calculate initial subtotal
    const initialSubtotal = quote.items && quote.items.length > 0
      ? quote.items.reduce((sum, item) => sum + (item.qty * item.price), 0)
      : quote.amount;
    setSubtotal(Math.round(initialSubtotal * 100) / 100);

    setBackupFiles(quote.backupFiles || []);

    if (quote.status === 'Aprobado' || quote.status === 'Aprovado') {
      const pTable = findQuoteBillingTable(quote.id);
      if (pTable) {
        setEditBillingTable(pTable);
      } else {
        setEditBillingTable([]);
      }
    } else {
      setEditBillingTable([]);
    }

    setIsExistingQuote(true);
    setIsModalOpen(true);
  };

  // Auto-detect if quoteId exists and load it
  useEffect(() => {
    if (!isModalOpen || !quoteId) return;

    // Check if the padded quoteId matches an existing quote
    const paddedId = quoteId.padStart(4, '0');
    const existing = quotes.find(q => q.quoteId === quoteId || q.quoteId === paddedId);

    if (existing) {
      setIsExistingQuote(true);
      setCurrentBudgetUuid(existing.id);

      const matchedMC = mainClients.find(mc =>
        (existing.mainClientId && mc.id === existing.mainClientId) ||
        (existing.mainClientName && mc.name.toLowerCase() === existing.mainClientName.toLowerCase()) ||
        (existing.clientName && mc.name.toLowerCase() === existing.clientName.toLowerCase())
      );
      const targetMainId = matchedMC ? matchedMC.id : (existing.mainClientId || existing.clientName || '');
      setSelectedMainClient(targetMainId);

      const matchedLE = clients.find(c =>
        (existing.legalEntityId && c.id === existing.legalEntityId) ||
        (existing.clientId && c.id === existing.clientId)
      );
      const targetLegalId = matchedLE ? matchedLE.id : (existing.legalEntityId || existing.clientId || '');
      setSelectedLegalEntity(targetLegalId);
      setSelectedClient(targetMainId || targetLegalId);

      setIssueDate(ensureDDMMYYYY(existing.date) || getTodayDDMMYYYY());

      const valDays = existing.validity ? parseInt(existing.validity) || 30 : 30;
      setValidity(valDays);
      setQuoteTitle(existing.title || '');

      const initialSubtotal = existing.items && existing.items.length > 0
        ? existing.items.reduce((sum, item) => sum + (item.qty * item.price), 0)
        : existing.amount;
      setSubtotal(Math.round(initialSubtotal * 100) / 100);

      setBackupFiles(existing.backupFiles || []);

      if (existing.status === 'Aprobado' || existing.status === 'Aprovado') {
        const pTable = findQuoteBillingTable(existing.id);
        if (pTable) {
          setEditBillingTable(pTable);
        } else {
          setEditBillingTable([]);
        }
      } else {
        setEditBillingTable([]);
      }
    } else {
      setIsExistingQuote(false);
      setCurrentBudgetUuid(null);
      setEditBillingTable([]);
    }
  }, [quoteId, isModalOpen, quotes, clients, mainClients]);

  // Helper to convert file to Base64 (needed for Gemini PDF upload)
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper to extract raw text from DOCX using Mammoth
  const parseDocxText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Get API key from env
  const getApiKey = () => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey && envKey !== 'ingresa_tu_api_key_aqui' && envKey.trim() !== '') {
      return envKey;
    }
    return '';
  };
  // Process file with Gemini AI
  const extractDataWithAi = async (file) => {
    const key = getApiKey();
    if (!key) {
      alert('Por favor configure su API Key de Gemini agregando VITE_GEMINI_API_KEY en su archivo .env en la raíz del proyecto.');
      return;
    }

    setIsAiExtracting(true);
    try {
      let payload = null;

      if (file.name.toLowerCase().endsWith('.pdf')) {
        const base64Data = await fileToBase64(file);
        payload = {
          contents: [
            {
              parts: [
                {
                  text: `Extrae los datos de esta cotización / presupuesto en formato JSON estructurado. 
                  Identifica los siguientes campos:
                  - quoteId (número de presupuesto o cotización, ej: 0685 o 8992. Si no se indica o no se encuentra en el documento, devolver vacío)
                  - clientName (nombre del cliente)
                  - title (título o proyecto)
                  - date (fecha de emisión en formato YYYY-MM-DD)
                  - validity (validez en días, solo el número, ej: si dice 30 días o validez 30, devuelve 30. Por defecto 30)
                  - subtotal (monto total neto antes de impuestos. Si en el documento solo viene el total con IVA/impuestos incluidos, calcula el subtotal neto dividiendo el total por 1.19. Si ya viene el subtotal o valor neto, úsalo directamente como número)
                  
                  Busca mapear el nombre del cliente lo mejor posible con alguno de los siguientes clientes si se parecen:
                  ${clients.map(c => `- ${c.name ? `${c.name} (${c.company})` : c.company}`).join('\n')}`
                },
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Data
                  }
                }
              ]
            }
          ]
        };
      } else if (file.name.toLowerCase().endsWith('.docx')) {
        const textContent = await parseDocxText(file);
        payload = {
          contents: [
            {
              parts: [
                {
                  text: `Extrae los datos de esta cotización / presupuesto en formato JSON estructurado a partir del siguiente texto extraído de un archivo Word DOCX:
                  
                  TEXTO DEL DOCUMENTO:
                  """
                  ${textContent}
                  """
                  
                  Identifica los siguientes campos:
                  - quoteId (número de presupuesto o cotización, ej: 0685 o 8992. Si no se indica o no se encuentra en el documento, devolver vacío)
                  - clientName (nombre del cliente)
                  - title (título o proyecto)
                  - date (fecha de emisión en formato YYYY-MM-DD)
                  - validity (validez en días, solo el número, ej: si dice 30 días o validez 30, devuelve 30. Por defecto 30)
                  - subtotal (monto total neto antes de impuestos. Si en el documento solo viene el total con IVA/impuestos incluidos, calcula el subtotal neto dividiendo el total por 1.19. Si ya viene el subtotal o valor neto, úsalo directamente como número)
                  
                  Busca mapear el nombre del cliente lo mejor posible con alguno de los siguientes clientes si se parecen:
                  ${clients.map(c => `- ${c.name ? `${c.name} (${c.company})` : c.company}`).join('\n')}`
                }
              ]
            }
          ]
        };
      } else {
        alert('Formato de archivo no soportado. Por favor use PDF o DOCX.');
        setIsAiExtracting(false);
        return;
      }

      // Using gemini-3.5-flash as the standard model
      const model = "gemini-3.5-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                quoteId: { type: "STRING", description: "Número de presupuesto o cotización (ej: 0685). Devolver vacío si no se encuentra o no se puede obtener." },
                clientName: { type: "STRING" },
                title: { type: "STRING" },
                date: { type: "STRING", description: "Formato YYYY-MM-DD" },
                validity: { type: "INTEGER", description: "Validez en días (número)" },
                subtotal: { type: "NUMBER", description: "Monto total neto antes de impuestos (subtotal). Si el documento sólo tiene el total bruto, divídelo por 1.19 para obtener el neto." }
              },
              required: ["clientName", "title", "subtotal"]
            }
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('No se recibió respuesta estructurada de Gemini');
      }

      const data = JSON.parse(rawText);

      // Fill form values:

      // 1. Budget ID (Quote Number)
      if (data.quoteId) {
        const digits = data.quoteId.replace(/\D/g, '');
        if (digits) {
          setQuoteId(digits.padStart(4, '0'));
        }
      }

      // 2. Client Name (Only map if it matches a pre-existing client in the DB)
      if (data.clientName) {
        const matched = clients.find(c =>
          (c.name && c.name.toLowerCase().includes(data.clientName.toLowerCase())) ||
          (c.name && data.clientName.toLowerCase().includes(c.name.toLowerCase())) ||
          (c.company && c.company.toLowerCase().includes(data.clientName.toLowerCase()))
        );
        if (matched) {
          setSelectedClient(matched.id);
        }
      }

      // 3. Project Title
      if (data.title) setQuoteTitle(data.title);

      // 4. Dates
      if (data.date) setIssueDate(ensureDDMMYYYY(data.date));
      if (data.validity) setValidity(data.validity);

      // 5. Subtotal
      if (typeof data.subtotal === 'number' || data.subtotal) {
        setSubtotal(parseFloat(data.subtotal) || 0);
      }

      setShowAiSuccessModal(true);
    } catch (error) {
      console.error('Error al extraer datos con IA:', error);
      alert(`Error al procesar el archivo con la IA: ${error.message}. Por favor verifique su API Key o la conexión.`);
    } finally {
      setIsAiExtracting(false);
    }
  };

  // File Upload Handlers
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const invalidFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ext !== 'pdf' && ext !== 'docx';
    });

    if (invalidFiles.length > 0) {
      alert('Solo se permiten archivos PDF y DOCX.');
      return;
    }

    const newFiles = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
      fileObject: file // Keep the original File object for AI extraction
    }));

    setBackupFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index) => {
    setBackupFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMainClient) {
      setNotification({
        type: 'error',
        title: 'Error de Validación',
        message: 'Por favor seleccione un Cliente Principal.'
      });
      return;
    }

    const mainClientObj = mainClients.find(mc => mc.id === selectedMainClient) || { name: selectedMainClient, id: null };
    const legalEntityObj = clients.find(c => c.id === selectedLegalEntity) || null;

    const mainClientName = mainClientObj.name || selectedMainClient;
    const companyName = legalEntityObj ? legalEntityObj.company : mainClientName;
    const targetClientId = legalEntityObj ? legalEntityObj.id : null;

    const formattedId = quoteId.replace(/\D/g, '').padStart(4, '0');
    if (!formattedId) {
      setNotification({
        type: 'error',
        title: 'Error de Validación',
        message: 'Por favor ingrese un número de presupuesto válido.'
      });
      return;
    }

    // Determine status (preserve existing quote status, or default to Borrador)
    const existingQuote = quotes.find(q => q.quoteId === formattedId || q.id === currentBudgetUuid);
    const finalStatus = existingQuote ? existingQuote.status : 'Borrador';

    // If approved, validate sum of installments
    if (finalStatus === 'Aprobado' || finalStatus === 'Aprovado') {
      const currentSum = editBillingTable.reduce((acc, row) => acc + (parseFloat(row.uf) || 0), 0);
      const roundedSum = Math.round(currentSum * 100) / 100;
      const expectedTotal = Math.round((parseFloat(subtotal) || 0) * 100) / 100;
      if (Math.abs(roundedSum - expectedTotal) >= 0.02) {
        setNotification({
          type: 'error',
          title: 'Error de Cuotas',
          message: `La suma de las cuotas (${roundedSum.toFixed(2)} UF) no coincide con el subtotal del presupuesto (${expectedTotal.toFixed(2)} UF).`
        });
        return;
      }
    }

    let projectIdToLink = existingQuote ? existingQuote.projectId : null;

    if (validateProjectNameFormat(quoteTitle)) {
      const nameParts = quoteTitle.split('-');
      const projectNumber = nameParts[0]?.trim() || '';
      const rawProjectName = nameParts.slice(1).join('-').split(' - ')[0]?.trim() || quoteTitle;

      const existingProj = projects.find(p => p.projectNumber === projectNumber);
      if (existingProj) {
        projectIdToLink = existingProj.id;
      } else if (onSaveProject) {
        try {
          const newProj = await onSaveProject({
            projectNumber: projectNumber,
            rawProjectName: rawProjectName,
            clientId: targetClientId,
            superficie: 0,
            rentabilidad: 0,
            anio: new Date().getFullYear(),
            status: 'Activo'
          });
          projectIdToLink = newProj.id;
        } catch (err) {
          console.error("Error al crear proyecto desde presupuesto:", err);
        }
      }
    } else {
      projectIdToLink = null;
    }

    const newQuote = {
      id: currentBudgetUuid || formattedId,
      quoteId: formattedId,
      mainClientId: mainClientObj.id || null,
      mainClientName: mainClientName,
      legalEntityId: targetClientId,
      clientId: targetClientId,
      clientName: mainClientName, // Display main client name in budget list as requested
      company: companyName,
      title: quoteTitle,
      date: ensureDDMMYYYY(issueDate),
      amount: parseFloat(subtotal) || 0,
      validity: `${validity} días`,
      status: finalStatus,
      items: [
        { id: 1, description: quoteTitle || 'Servicios ERP', qty: 1, price: parseFloat(subtotal) || 0 }
      ],
      backupFiles: backupFiles,
      projectId: projectIdToLink
    };

    try {
      setIsSaving(true);
      await onAddQuote(newQuote, newQuote.items, editBillingTable);
      setNotification({
        type: 'success',
        title: 'Presupuesto Guardado',
        message: 'El presupuesto ha sido registrado/actualizado exitosamente.'
      });
      // Reset form
      setSelectedMainClient('');
      setSelectedLegalEntity('');
      setSelectedClient('');
      setValidity(30);
      setQuoteTitle('Servicios ERP');
      setSubtotal(0);
      setBackupFiles([]);
      setEditBillingTable([]);
      setQuoteId('');
      setCurrentBudgetUuid(null);
      setIsExistingQuote(false);
      setIsModalOpen(false);
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Guardar',
        message: err.message || 'Ocurrió un error al guardar el presupuesto.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Filter quotes
  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch =
      quote.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quoteId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.title.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'Todos' ||
      quote.status === statusFilter;

    const matchesPeriod = isQuoteInPeriod(quote, calcPeriod);

    return matchesSearch && matchesStatus && matchesPeriod;
  });

  // Calculate totals based on filtered quotes
  const totalApproved = filteredQuotes
    .filter(q => q.status === 'Aprobado' || q.status === 'Aprovado')
    .reduce((sum, q) => sum + (parseFloat(q.amount) || 0), 0);

  const totalSent = filteredQuotes
    .filter(q => q.status === 'Enviado')
    .reduce((sum, q) => sum + (parseFloat(q.amount) || 0), 0);

  const totalRejected = filteredQuotes
    .filter(q => q.status === 'Rechazado')
    .reduce((sum, q) => sum + (parseFloat(q.amount) || 0), 0);

  const approvedQuotesCount = filteredQuotes
    .filter(q => q.status === 'Aprobado' || q.status === 'Aprovado').length;

  const sentQuotesCount = filteredQuotes
    .filter(q => q.status === 'Enviado').length;

  const rejectedQuotesCount = filteredQuotes
    .filter(q => q.status === 'Rechazado').length;

  const existingQuoteObj = quotes.find(q => q.quoteId === quoteId || q.quoteId === quoteId.padStart(4, '0') || q.id === currentBudgetUuid);

  const availableUsersToSelect = (users || [])
    .filter(u => u.status === 'Active')
    .filter(u => !selectedReviewers.some(r => r.id === u.id));

  return (
    <div className="space-y-xl animate-fade-in text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary font-bold">Gestión de Presupuestos</h2>
          <p className="text-on-surface-variant font-body-md mt-1">Crea, edita y haz seguimiento de cotizaciones para tus clientes.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleOpenNewQuoteModal}
            className="flex items-center gap-2 px-md py-2 bg-secondary text-white rounded hover:brightness-105 transition-all font-label-md font-bold active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Nuevo Presupuesto</span>
          </button>
        </div>
      </div>

      {/* Tarjetas KPI sin contenedor externo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {/* Tarjeta Aprobados */}
        <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-emerald-800 uppercase font-bold tracking-wider">Aprobados ({approvedQuotesCount})</span>
            <div className="font-display-lg text-[34px] text-emerald-950 font-extrabold">
              {totalApproved.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-body-md font-semibold text-emerald-800">UF</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-100 rounded-full text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">check_circle</span>
          </div>
        </div>

        {/* Tarjeta Enviados */}
        <div className="bg-blue-50/40 border border-blue-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-blue-800 uppercase font-bold tracking-wider">Enviados ({sentQuotesCount})</span>
            <div className="font-display-lg text-[34px] text-blue-950 font-extrabold">
              {totalSent.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-body-md font-semibold text-blue-800">UF</span>
            </div>
          </div>
          <div className="p-3 bg-blue-100 rounded-full text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">send</span>
          </div>
        </div>

        {/* Tarjeta Rechazados */}
        <div className="bg-red-50/40 border border-red-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-red-800 uppercase font-bold tracking-wider">Rechazados ({rejectedQuotesCount})</span>
            <div className="font-display-lg text-[34px] text-red-950 font-extrabold">
              {totalRejected.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-body-md font-semibold text-red-800">UF</span>
            </div>
          </div>
          <div className="p-3 bg-red-100 rounded-full text-red-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">cancel</span>
          </div>
        </div>
      </div>

      {/* Filter and Summary Bar */}
      <section className="glass-card rounded-xl p-md flex flex-col lg:flex-row items-stretch lg:items-end gap-md justify-between shadow-sm">
        {/* Left Side: Buscar and Limpiar */}
        <div className="flex flex-wrap items-end gap-md w-full lg:w-auto">
          <div className="flex-grow max-w-5xl min-w-[240px]">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">Buscar Presupuesto</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
              <input
                className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:outline-none"
                placeholder="Buscar por ID, cliente o descripción..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={() => { setSearchTerm(''); setStatusFilter('Todos'); setCalcPeriod('all'); }}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant rounded bg-white text-on-surface hover:bg-slate-50 transition-all font-label-md active:scale-95 h-[38px]"
          >
            <span className="material-symbols-outlined text-[16px]">clear_all</span>
            <span>Limpiar</span>
          </button>
        </div>

        {/* Right Side: Period and Status groups */}
        <div className="flex flex-wrap items-end gap-md justify-end w-full lg:w-auto">
          {/* Period Filter Button Group */}
          <div className="flex flex-col gap-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Período de cálculo</span>
            <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant">
              {[
                { value: '1', label: '1M' },
                { value: '6', label: '6M' },
                { value: '12', label: '12M' },
                { value: '24', label: '24M' },
                { value: '36', label: '36M' },
                { value: 'all', label: 'Todos' }
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setCalcPeriod(p.value)}
                  className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${calcPeriod === p.value
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filter Button Group */}
          <div className="flex flex-col gap-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Estado</span>
            <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant">
              {['Todos', 'Borrador', 'En revisión', 'Enviado', 'Aprobado', 'Rechazado'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${statusFilter === status
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Data Table Section */}
      {filteredQuotes.length > 0 ? (
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">ID Presupuesto</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Cliente</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Título / Proyecto</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Fecha de Emisión</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Monto Total (UF)</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Validez</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center">Respaldo</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Estado</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-md font-body-md font-bold text-primary">{quote.quoteId}</td>
                    <td className="p-md">
                      <div className="flex flex-col">
                        <span className="font-body-md font-bold text-on-surface">{quote.clientName}</span>
                      </div>
                    </td>
                    <td className="p-md font-body-md text-on-surface">
                      <div className="flex items-center gap-1.5">
                        <span>{quote.title}</span>
                        {(quote.status === 'Aprobado' || quote.status === 'Aprovado') && !quote.projectId && (
                          <span 
                            className="material-symbols-outlined text-amber-500 text-[18px] cursor-help select-none flex-shrink-0"
                            title="Este presupuesto está aprobado pero no está asociado a ningún proyecto"
                          >
                            warning
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-md font-body-md text-on-surface">{quote.date}</td>
                    <td className="p-md font-body-md font-bold text-on-surface text-right">
                      ${quote.amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-md font-body-md text-on-surface">{quote.validity}</td>
                    <td className="p-md text-center">
                      {quote.backupFiles && quote.backupFiles.length > 0 ? (
                        <div className="flex justify-center items-center gap-1.5">
                          {quote.backupFiles.map((file, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPreviewFile(file);
                              }}
                              className="text-secondary hover:text-primary transition-colors flex items-center"
                              title={`Previsualizar ${file.name}`}
                            >
                              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>
                                {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/30 text-label-sm italic">-</span>
                      )}
                    </td>
                    <td className="p-md">
                      <select
                        value={quote.status}
                        onChange={(e) => handleStatusChange(quote.id, e.target.value)}
                        disabled={quote.status === 'Aprobado' || quote.status === 'Aprovado'}
                        className={`px-2 py-0.5 rounded-full text-label-sm font-bold border outline-none transition-all ${quote.status === 'Aprobado' || quote.status === 'Aprovado' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                          } ${quote.status === 'Borrador'
                            ? 'bg-slate-100 text-slate-700 border-slate-300'
                            : quote.status === 'En revisión'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : quote.status === 'Enviado'
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : quote.status === 'Aprobado' || quote.status === 'Aprovado'
                                  ? 'bg-secondary-container text-on-secondary-container border-secondary/20'
                                  : quote.status === 'Rechazado'
                                    ? 'bg-red-100 text-red-800 border-red-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                      >
                        <option value="Borrador">Borrador</option>
                        <option value="En revisión">En revisión</option>
                        <option value="Enviado">Enviado</option>
                        <option value="Aprobado">Aprobado</option>
                        <option value="Rechazado">Rechazado</option>
                      </select>
                    </td>
                    <td className="p-md text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewQuote(quote)}
                          className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all"
                          title="Visualizar Presupuesto"
                        >
                          <span className="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                        <button
                          onClick={() => handleEditQuote(quote)}
                          className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all"
                          title="Editar Presupuesto"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(quote.id)}
                          className="p-1 hover:bg-red-50 rounded text-error hover:text-red-700 transition-all"
                          title="Eliminar Presupuesto"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="px-lg py-md bg-surface-container-low border-t border-outline-variant flex items-center justify-between">
            <p className="text-body-sm text-on-surface-variant italic">
              Mostrando {filteredQuotes.length} de {quotes.length} presupuestos registrados
            </p>
            <div className="flex items-center gap-base">
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-white text-on-surface-variant disabled:opacity-30" disabled>
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded bg-secondary text-white font-bold text-xs">1</button>
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-white text-on-surface-variant disabled:opacity-30" disabled>
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-outline-variant rounded-xl p-12 text-center text-on-surface-variant italic">
          No se encontraron presupuestos que coincidan.
        </div>
      )}

      {/* Modal Backdrop: View Quote */}
      {isViewModalOpen && viewingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Visualizar Presupuesto #{viewingQuote.quoteId}</h2>
                <p className="text-body-sm text-on-surface-variant font-bold">Detalle completo de la cotización y facturación asociada.</p>
              </div>
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  setViewingQuote(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-lg space-y-lg text-left">
              {/* Grid principal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
                {/* Información General */}
                <div className="space-y-md">
                  <h3 className="text-title-md font-bold text-primary border-b pb-1">Información General</h3>
                  <div className="grid grid-cols-2 gap-md text-body-md">
                    <div>
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Cliente</span>
                      <span className="font-bold text-on-surface">{viewingQuote.clientName}</span>
                    </div>
                    <div>
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Empresa</span>
                      <span className="text-on-surface">{viewingQuote.company || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Título / Proyecto</span>
                      <span className="text-on-surface">{viewingQuote.title}</span>
                    </div>
                    <div>
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Fecha Emisión</span>
                      <span className="text-on-surface">{viewingQuote.date}</span>
                    </div>
                    <div>
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Validez</span>
                      <span className="text-on-surface">{viewingQuote.validity}</span>
                    </div>
                    <div>
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Monto Total</span>
                      <span className="font-extrabold text-primary text-headline-sm">
                        {viewingQuote.amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                      </span>
                    </div>
                    <div>
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold">Estado</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-label-sm font-bold border ${viewingQuote.status === 'Borrador'
                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                          : viewingQuote.status === 'En revisión'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : viewingQuote.status === 'Enviado'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : viewingQuote.status === 'Aprobado' || viewingQuote.status === 'Aprovado'
                                ? 'bg-secondary-container text-on-secondary-container border-secondary/20'
                                : 'bg-red-100 text-red-800 border-red-200'
                        }`}>
                        {viewingQuote.status}
                      </span>
                    </div>
                  </div>

                  {/* Documentos de respaldo */}
                  {viewingQuote.backupFiles && viewingQuote.backupFiles.length > 0 && (
                    <div className="mt-md">
                      <span className="block text-label-md text-on-surface-variant uppercase font-semibold mb-2">Respaldos</span>
                      <div className="flex flex-wrap gap-2">
                        {viewingQuote.backupFiles.map((file, idx) => (
                          <a
                            key={idx}
                            href={file.url}
                            download={file.name}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border rounded text-body-sm text-secondary transition-all"
                            title={`Descargar ${file.name}`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                            </span>
                            <span className="truncate max-w-[150px]">{file.name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ítems del Presupuesto */}
                <div className="space-y-md">
                  <h3 className="text-title-md font-bold text-primary border-b pb-1">Ítems Detalle</h3>
                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-body-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="p-2 font-semibold text-on-surface-variant">Descripción</th>
                          <th className="p-2 font-semibold text-on-surface-variant text-center">Cant.</th>
                          <th className="p-2 font-semibold text-on-surface-variant text-right">Unitario (UF)</th>
                          <th className="p-2 font-semibold text-on-surface-variant text-right">Total (UF)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {viewingQuote.items && viewingQuote.items.length > 0 ? (
                          viewingQuote.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2 text-on-surface">{item.description}</td>
                              <td className="p-2 text-center text-on-surface">{item.qty}</td>
                              <td className="p-2 text-right text-on-surface">
                                {item.price.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="p-2 text-right font-bold text-on-surface">
                                {(item.qty * item.price).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" className="p-4 text-center text-on-surface-variant italic">Sin ítems detallados.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Lista de Cuotas para presupuestos Aprobados */}
              {(viewingQuote.status === 'Aprobado' || viewingQuote.status === 'Aprovado') && (
                <div className="space-y-md pt-lg border-t border-outline-variant">
                  <h3 className="text-title-md font-bold text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">payments</span>
                    <span>Plan de Cuotas y Facturación</span>
                  </h3>

                  {(() => {
                    const billingTable = findQuoteBillingTable(viewingQuote.id);
                    if (billingTable && billingTable.length > 0) {
                      return (
                        <div className="border rounded-xl overflow-hidden shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
                          <table className="w-full text-left text-body-sm">
                            <thead className="bg-surface-container-low border-b sticky top-0 z-10">
                              <tr>
                                <th className="p-md font-semibold text-on-surface-variant">N° Cuota</th>
                                <th className="p-md font-semibold text-on-surface-variant">Fecha de Cobro</th>
                                <th className="p-md font-semibold text-on-surface-variant">Estado</th>
                                <th className="p-md font-semibold text-on-surface-variant text-right">Monto (UF)</th>
                                <th className="p-md font-semibold text-on-surface-variant">Comentario</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {billingTable.map((cuota, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="p-md font-bold text-primary">Cuota {cuota.numQuota}</td>
                                  <td className="p-md text-on-surface">
                                    <div className="flex items-center gap-1">
                                      <span>{cuota.date ? cuota.date.split('-').reverse().join('/') : '-'}</span>
                                      {cuota.dateConfirmed && (
                                        <span className="material-symbols-outlined text-[16px] text-emerald-600 font-bold" title="Fecha Confirmada">
                                          verified
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-md">
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-label-sm font-bold border ${cuota.status === 'Pagada'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : cuota.status === 'Factura emitida'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-slate-100 text-slate-700 border-slate-350'
                                      }`}>
                                      {cuota.status || 'Por facturar'}
                                    </span>
                                  </td>
                                  <td className="p-md text-right font-bold text-on-surface">
                                    {cuota.uf.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                                  </td>
                                  <td className="p-md text-on-surface-variant italic">
                                    {cuota.comment || 'Facturación ordinaria'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    } else {
                      return (
                        <div className="p-md bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-body-md">
                          <span className="material-symbols-outlined text-[20px]">warning</span>
                          <span>Este presupuesto está aprobado pero no se encontró un plan de cuotas registrado en el sistema.</span>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>

            <div className="p-lg border-t border-outline-variant flex justify-end bg-surface sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => {
                  setIsViewModalOpen(false);
                  setViewingQuote(null);
                }}
                className="px-md py-2 bg-primary text-white rounded-lg text-body-md hover:bg-opacity-90 active:scale-95 transition-all font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Backdrop: New Quote Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm">
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Detalle del Presupuesto</h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  {isExistingQuote ? (
                    <>
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-bold text-emerald-600">Editando Presupuesto Existente #{quoteId.padStart(4, '0')}</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <span>Creando Nuevo Presupuesto #{quoteId.padStart(4, '0')}</span>
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {/* Modal Content (Form) */}
            <form onSubmit={handleSubmit} className="p-lg space-y-lg text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">

                {/* Columna Izquierda: Información General, Fechas y Finanzas */}
                <div className="space-y-lg">
                  {/* Tarjeta de Información de la Cotización */}
                  <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md animate-fade-in">
                    <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                      <span className="material-symbols-outlined text-[20px] text-secondary">info</span>
                      Información de la Cotización
                    </h3>

                    {/* Fila 1: N° Presupuesto y Cliente */}
                    <div className="grid grid-cols-2 gap-md">
                      <div className="flex flex-col gap-xs col-span-1">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">N° Presupuesto</label>
                        <input
                          className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                          type="text"
                          value={quoteId}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setQuoteId(val);
                          }}
                          onBlur={() => {
                            if (quoteId) {
                              setQuoteId(quoteId.padStart(4, '0'));
                            }
                          }}
                          placeholder="Ej: 0685"
                          required
                        />
                      </div>
                      {/* Cliente Principal */}
                      <div className="flex flex-col gap-xs col-span-1">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold flex items-center justify-between">
                          <span>Cliente *</span>
                        </label>
                        <select
                          className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-medium"
                          value={selectedMainClient}
                          onChange={(e) => {
                            setSelectedMainClient(e.target.value);
                            setSelectedClient(e.target.value);
                            setSelectedLegalEntity('');
                          }}
                          required
                        >
                          <option value="">Seleccionar Cliente Principal...</option>
                          {mainClients.map(mc => (
                            <option key={mc.id} value={mc.id}>{mc.name}</option>
                          ))}
                          {selectedMainClient && !mainClients.some(mc => mc.id === selectedMainClient) && (
                            <option value={selectedMainClient}>{selectedMainClient}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Fila 2: Razón Social (Asociada al cliente principal - Opcional) */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold flex items-center justify-between">
                        <span>Razón Social</span>
                        <span className="text-[11px] text-on-surface-variant font-normal">Opcional</span>
                      </label>
                      <select
                        className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-medium"
                        value={selectedLegalEntity}
                        onChange={(e) => setSelectedLegalEntity(e.target.value)}
                      >
                        <option value="">-- Sin Razón Social --</option>
                        {clients
                          .filter(c => {
                            if (!selectedMainClient) return true;
                            const mcObj = mainClients.find(mc => mc.id === selectedMainClient);
                            const mcName = mcObj ? mcObj.name : selectedMainClient;
                            return (
                              c.mainClientId === selectedMainClient ||
                              (c.realClient && c.realClient.toLowerCase() === mcName.toLowerCase()) ||
                              (c.mainClientName && c.mainClientName.toLowerCase() === mcName.toLowerCase())
                            );
                          })
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.company} ({c.rut})</option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Fila 2: Título / Proyecto */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Título / Proyecto</label>
                      <input
                        className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                        type="text"
                        value={quoteTitle}
                        onChange={(e) => setQuoteTitle(e.target.value)}
                        placeholder="Ej: Licencias e Implementación de Servidores"
                        required
                      />
                    </div>

                    {/* Fila 3: Fecha de Emisión y Validez */}
                    <div className="grid grid-cols-2 gap-md">
                      <div className="flex flex-col gap-xs">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Fecha de Emisión</label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={issueDate}
                            className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 outline-none transition-all bg-white pr-10"
                            placeholder="dd/mm/yyyy"
                          />
                          <input
                            type="date"
                            value={issueDate ? issueDate.split('/').reverse().join('-') : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                setIssueDate(val.split('-').reverse().join('/'));
                              } else {
                                setIssueDate('');
                              }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            required
                          />
                          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[20px]">
                            calendar_month
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Validez (Días)</label>
                        <input
                          className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                          type="number"
                          value={validity}
                          onChange={(e) => setValidity(e.target.value)}
                          min="1"
                          required
                        />
                      </div>
                    </div>

                    {/* Separador de Valores Financieros */}
                    <h4 className="text-body-sm font-bold text-primary flex items-center gap-2 pt-sm border-t border-slate-200/60">
                      <span className="material-symbols-outlined text-[18px] text-secondary">payments</span>
                      Valores Financieros (Neto)
                    </h4>

                    {/* Fila 4: Subtotal Neto */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Subtotal (Neto)</label>
                      <div className="relative rounded-lg shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <span className="text-slate-500 text-body-md">$</span>
                        </div>
                        <input
                          type="number"
                          className="w-full pl-7 border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all font-bold bg-white"
                          value={subtotal}
                          onChange={(e) => setSubtotal(e.target.value)}
                          onBlur={(e) => {
                            const rounded = Math.round((parseFloat(e.target.value) || 0) * 100) / 100;
                            setSubtotal(rounded);
                          }}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                    </div>

                    {/* Fila 5: Impuestos y Totales */}
                    <div className="space-y-sm pt-sm border-t border-slate-200/60">
                      <div className="flex justify-between text-body-sm text-on-surface-variant px-1">
                        <span>Impuesto (19% IVA)</span>
                        <span className="font-medium">${tax.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center bg-secondary/5 px-md py-2.5 rounded-lg border border-secondary/10">
                        <span className="text-body-md font-bold text-secondary">Total (IVA Incluido)</span>
                        <span className="text-title-lg font-black text-secondary">
                          ${total.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Documentos de Respaldo */}
                <div className="space-y-lg">
                  {/* Tarjeta de Documentos de Respaldo y Extracción IA */}
                  <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md">
                    <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                      <span className="material-symbols-outlined text-[20px] text-secondary">cloud_upload</span>
                      Documentos de Respaldo
                    </h3>

                    <div className="flex items-center gap-md flex-wrap pt-xs">
                      <label className="flex items-center gap-2 px-md py-2.5 border border-dashed border-outline-variant hover:border-secondary rounded-lg bg-white hover:bg-slate-50 text-on-surface hover:text-primary transition-all cursor-pointer text-body-sm font-bold shadow-sm">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">upload_file</span>
                        <span>Subir Respaldo</span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </label>

                      {backupFiles.some(f => f.fileObject) && (
                        <button
                          type="button"
                          onClick={() => {
                            const recentFile = [...backupFiles].reverse().find(f => f.fileObject);
                            if (recentFile) {
                              extractDataWithAi(recentFile.fileObject);
                            }
                          }}
                          disabled={isAiExtracting}
                          className={`flex items-center gap-2 px-md py-2.5 rounded-lg text-white font-bold text-body-sm shadow-md transition-all active:scale-95 ${isAiExtracting
                            ? 'bg-slate-400 cursor-not-allowed animate-pulse'
                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-600/20'
                            }`}
                        >
                          {isAiExtracting ? (
                            <>
                              <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                              <span>Procesando...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[20px]">psychology</span>
                              <span>Extracción IA</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <span className="text-label-sm text-on-surface-variant italic block">Formatos permitidos: PDF y DOCX</span>

                    {backupFiles.length > 0 ? (
                      <div className="space-y-sm mt-md max-h-[300px] overflow-y-auto pr-xs custom-scrollbar">
                        {backupFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-outline-variant/30 shadow-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-secondary flex-shrink-0">
                                {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-body-sm font-bold truncate max-w-[140px]" title={file.name}>{file.name}</span>
                                <span className="text-label-sm text-on-surface-variant">{(file.size / 1024).toFixed(1)} KB</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewFile(file)}
                                className="p-1 hover:bg-slate-200 rounded text-secondary hover:text-primary transition-all"
                                title="Visualizar respaldo"
                              >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </button>
                              {file.url && (
                                <a
                                  href={file.url}
                                  download={file.name}
                                  className="p-1 hover:bg-slate-200 rounded text-secondary transition-all"
                                  title="Descargar"
                                >
                                  <span className="material-symbols-outlined text-[18px]">download</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(idx)}
                                className="p-1 hover:bg-slate-200 rounded text-error hover:text-red-600 transition-all"
                                title="Eliminar"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-body-sm text-on-surface-variant italic pt-sm">No hay archivos de respaldo adjuntos.</p>
                    )}
                  </div>
                </div>

              </div>

              {/* Sección de Edición de Cuotas (solo si el presupuesto está Aprobado) */}
              {isExistingQuote && (existingQuoteObj?.status === 'Aprobado' || existingQuoteObj?.status === 'Aprovado') && (
                <div className="space-y-md pt-lg border-t border-outline-variant">
                  <div className="flex justify-between items-center">
                    <h3 className="text-body-md font-bold text-primary flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary">payments</span>
                      <span>Plan de Cuotas y Facturación</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsInstallmentsModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded text-body-sm hover:bg-primary-container transition-all font-semibold active:scale-95 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                      <span>Editar Cuotas</span>
                    </button>
                  </div>

                  {/* Advertencia si la suma no coincide con el total */}
                  {(() => {
                    const currentSum = editBillingTable.reduce((acc, row) => acc + (parseFloat(row.uf) || 0), 0);
                    const roundedSum = Math.round(currentSum * 100) / 100;
                    const expectedTotal = Math.round((parseFloat(subtotal) || 0) * 100) / 100;
                    const diff = expectedTotal - roundedSum;

                    if (Math.abs(diff) >= 0.02) {
                      return (
                        <div className="p-md bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-body-sm">
                          <span className="material-symbols-outlined text-[20px]">warning</span>
                          <span>
                            La suma de las cuotas ({roundedSum.toFixed(2)} UF) no coincide con el subtotal del presupuesto (antes de impuestos) ({expectedTotal.toFixed(2)} UF). Diferencia: {diff.toFixed(2)} UF.
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {editBillingTable.length > 0 ? (
                    <div className="border rounded-xl overflow-hidden shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b sticky top-0 z-10 font-semibold text-on-surface-variant">
                          <tr>
                            <th className="p-2 border-b border-slate-200 text-center w-24">N° Cuota</th>
                            <th className="p-2 border-b border-slate-200 w-40">Fecha de Cobro</th>
                            <th className="p-2 border-b border-slate-200 w-40">Estado</th>
                            <th className="p-2 border-b border-slate-200 text-right w-32 font-semibold text-on-surface-variant">Monto (UF)</th>
                            <th className="p-2 border-b border-slate-200 font-semibold text-on-surface-variant">Comentario / Descripción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-body-sm text-slate-700">
                          {editBillingTable.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 text-slate-700">
                              <td className="p-2 text-center font-bold text-primary bg-slate-50/50">
                                Cuota {row.numQuota}
                              </td>
                              <td className="p-2 text-on-surface">
                                <div className="flex items-center gap-1">
                                  <span>{row.date ? row.date.split('-').reverse().join('/') : '-'}</span>
                                  {row.dateConfirmed && (
                                    <span className="material-symbols-outlined text-[16px] text-emerald-600 font-bold" title="Fecha Confirmada">
                                      verified
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2 text-center">
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${(row.status || 'Por facturar') === 'Pagada'
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
                                    : (row.status || 'Por facturar') === 'Factura emitida'
                                      ? 'bg-sky-50 text-sky-700 ring-sky-600/10'
                                      : 'bg-amber-50 text-amber-800 ring-amber-600/20'
                                  }`}>
                                  {row.status || 'Por facturar'}
                                </span>
                              </td>
                              <td className="p-2 text-right font-semibold text-primary">
                                {row.uf.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                              </td>
                              <td className="p-2 text-on-surface-variant italic">
                                {row.comment || 'Facturación ordinaria'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-md text-center text-on-surface-variant italic bg-slate-50 border border-dashed rounded-lg">
                      No hay cuotas definidas. Haz clic en "Editar Cuotas" para registrar cobros.
                    </div>
                  )}
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant">
                <button
                  className={`px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  type="button"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95 flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">save</span>
                  )}
                  <span>{isSaving ? 'Guardando...' : 'Guardar Presupuesto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal Overlay */}
      {previewFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-lg bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-up text-left border border-outline-variant/30">
            {/* Header */}
            <div className="p-md border-b border-outline-variant bg-surface flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  {previewFile.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                </span>
                <span className="font-bold text-body-md text-primary truncate max-w-md">{previewFile.name}</span>
              </div>
              <button
                onClick={() => {
                  setPreviewFile(null);
                  setDocxHtml('');
                }}
                className="p-1.5 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {/* Content Preview Frame */}
            <div className="flex-grow overflow-auto p-lg bg-slate-100/50 flex justify-center items-stretch">
              {previewFile.name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-full rounded border border-outline-variant/40 bg-white"
                  title="Vista previa PDF"
                />
              ) : previewFile.name.toLowerCase().endsWith('.docx') ? (
                docxHtml ? (
                  <div className="w-full bg-white p-lg rounded shadow border border-outline-variant/30 overflow-y-auto">
                    <div className="prose prose-slate max-w-none text-body-md" dangerouslySetInnerHTML={{ __html: docxHtml }} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant w-full h-full">
                    <span className="material-symbols-outlined text-[48px] animate-spin text-secondary">sync</span>
                    <span className="text-body-md font-medium mt-4">Procesando y generando vista previa de Word...</span>
                  </div>
                )
              ) : (
                <div className="text-center py-20 text-on-surface-variant italic">
                  Vista previa no soportada para este formato de archivo.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Success Notification Modal */}
      {showAiSuccessModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl p-lg max-w-sm w-full text-center border border-outline-variant/30 animate-scale-up space-y-md">
            <div className="mx-auto w-14 h-14 bg-secondary-container/40 rounded-full flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[32px] animate-bounce" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
            </div>
            <div className="space-y-xs">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¡Procesamiento Exitoso!</h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed">
                La inteligencia artificial ha analizado el archivo y cargado los campos del presupuesto correctamente en el formulario.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAiSuccessModal(false)}
              className="w-full py-2.5 bg-secondary text-white rounded-lg hover:brightness-105 transition-all font-bold text-label-md active:scale-95 shadow-md shadow-secondary/15"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmId !== null && (() => {
        const quoteToDelete = quotes.find(q => q.id === deleteConfirmId);
        const quoteDisplayId = quoteToDelete ? (quoteToDelete.quoteId || deleteConfirmId) : deleteConfirmId;
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl p-lg max-w-sm w-full text-center border border-outline-variant/30 animate-scale-up space-y-md animate-fade-in">
              <div className="mx-auto w-14 h-14 bg-red-50 rounded-full flex items-center justify-center text-red-600">
                <span className="material-symbols-outlined text-[32px] text-error animate-pulse" style={{ fontVariationSettings: "'FILL' 0" }}>
                  warning
                </span>
              </div>
              <div className="space-y-xs text-center">
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Presupuesto?</h3>
                <p className="text-body-md text-on-surface-variant leading-relaxed">
                  ¿Está seguro de que desea eliminar el presupuesto <strong>#{quoteDisplayId}</strong>? Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all font-bold text-label-md active:scale-95 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = deleteConfirmId;
                    setDeleteConfirmId(null);
                    if (onDeleteQuote) {
                      try {
                        await onDeleteQuote(id);
                        setNotification({
                          type: 'success',
                          title: 'Presupuesto Eliminado',
                          message: 'El presupuesto ha sido eliminado exitosamente del sistema.'
                        });
                      } catch (err) {
                        setNotification({
                          type: 'error',
                          title: 'Error al Eliminar',
                          message: err.message || 'Ocurrió un error al eliminar el presupuesto.'
                        });
                      }
                    }
                  }}
                  className="flex-1 py-2 bg-error text-white rounded-lg hover:brightness-105 transition-all font-bold text-label-md active:scale-95 shadow-md shadow-error/15"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Modal: Aprobar Presupuesto y Crear Proyecto */}
      {isApproveModalOpen && approvingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up border border-outline-variant/30">
            {/* Header */}
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Aprobar Presupuesto y Crear Proyecto</h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
                  <span>Configurando proyecto para el Presupuesto <strong>#{approvingQuote.quoteId}</strong></span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsApproveModalOpen(false);
                  setApprovingQuote(null);
                  setMatchedProjectId(null);
                  setPrefilledFromProjectId(null);
                  setShowSuggestions(false);
                  setTipo('');
                  setIsCustomTipo(false);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content (Form) */}
            <form onSubmit={handleApproveSubmit} className="p-lg space-y-lg text-left">
              {validationError && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-md text-body-sm flex items-start gap-2 animate-fade-in mb-md">
                  <span className="material-symbols-outlined text-[18px] text-red-600 flex-shrink-0">warning</span>
                  <div>
                    <span className="font-bold">Aviso del Sistema: </span>
                    {validationError}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">

                {/* Columna Izquierda: Información del Proyecto y del Presupuesto */}
                <div className="lg:col-span-5 space-y-lg">
                  {/* Grupo 1: Datos del Proyecto */}
                  <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md">
                    <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                      <span className="material-symbols-outlined text-[20px] text-secondary">folder</span>
                      Datos del Proyecto
                    </h3>

                    {/* Campo: Nº y Nombre del proyecto */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                        Nº y Nombre del Proyecto
                      </label>
                      <div className="flex gap-2 relative">
                        <div className="relative flex-grow" ref={suggestionsRef}>
                          <input
                            className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                            type="text"
                            value={projectName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProjectName(val);
                              checkAndPrefillExistingProject(val);
                              setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            placeholder="Ej: 0280-NombreProyecto - Cliente"
                            required
                          />
                          {showSuggestions && filteredProjects.length > 0 && (
                            <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar border-outline-variant/30 py-1">
                              {filteredProjects.map((proj) => (
                                <div
                                  key={proj.id}
                                  onClick={() => {
                                    setProjectName(proj.projectName);
                                    checkAndPrefillExistingProject(proj.projectName);
                                    setShowSuggestions(false);
                                  }}
                                  className="px-4 py-2.5 text-body-md text-on-surface hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0 font-medium"
                                >
                                  {proj.projectName}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleFolderSearch}
                          className="px-3 bg-secondary text-white rounded-lg hover:brightness-105 transition-all flex items-center justify-center shadow-sm"
                          title="Buscar carpeta en PC"
                        >
                          <span className="material-symbols-outlined text-[20px]">search</span>
                        </button>
                      </div>
                      <span className="text-[11px] text-on-surface-variant/80">
                        Formato requerido: <strong>Nº Proyecto-Nombre - Cliente</strong>
                      </span>
                    </div>

                    {/* Fila: Superficie y Rentabilidad */}
                    <div className="grid grid-cols-2 gap-md">
                      <div className="flex flex-col gap-xs">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Superficie (m2)</label>
                        <input
                          className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                          type="number"
                          value={superficie}
                          onChange={(e) => setSuperficie(e.target.value)}
                          placeholder="Ej: 150"
                          min="0"
                          step="0.1"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Rentabilidad Esperada (%)</label>
                        <div className="relative rounded-lg shadow-sm">
                          <input
                            className="w-full pr-7 border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-bold"
                            type="number"
                            value={rentabilidad}
                            onChange={(e) => setRentabilidad(e.target.value)}
                            placeholder="Ej: 25"
                            min="0"
                            max="100"
                            step="0.1"
                            required
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-slate-500 text-body-md">%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fila: Año del Proyecto */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Año del Proyecto</label>
                      <input
                        className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                        type="number"
                        value={anio}
                        onChange={(e) => setAnio(e.target.value)}
                        placeholder="Ej: 2026"
                        required
                      />
                    </div>

                    {/* Fila: Tipo de Proyecto */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                        Tipo de Proyecto <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-medium text-primary"
                        value={isCustomTipo ? 'custom' : tipo}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setIsCustomTipo(true);
                            setTipo('');
                          } else {
                            setIsCustomTipo(false);
                            setTipo(val);
                          }
                        }}
                        required
                      >
                        <option value="">Seleccione un tipo...</option>
                        {PROJECT_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="custom">Otro (Ingresar manualmente)...</option>
                      </select>

                      {isCustomTipo && (
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white animate-fade-in mt-1 font-medium text-primary"
                          placeholder="Escriba el tipo de proyecto..."
                          value={tipo}
                          onChange={(e) => setTipo(e.target.value)}
                          required
                        />
                      )}
                    </div>
                  </div>

                  {/* Grupo 2: Datos del Presupuesto */}
                  <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md">
                    <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                      <span className="material-symbols-outlined text-[20px] text-secondary">request_quote</span>
                      Datos del Presupuesto
                    </h3>

                    {/* Fila: Nº Presupuesto y Cliente (Solo lectura) */}
                    <div className="grid grid-cols-2 gap-md">
                      <div className="flex flex-col gap-xs">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Nº de Presupuesto</label>
                        <input
                          className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 bg-slate-100/80 text-on-surface-variant/80 cursor-not-allowed outline-none"
                          type="text"
                          value={approvingQuote.quoteId}
                          readOnly
                        />
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Cliente</label>
                        <input
                          className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 bg-slate-100/80 text-on-surface-variant/80 cursor-not-allowed outline-none"
                          type="text"
                          value={cliente}
                          readOnly
                        />
                      </div>
                    </div>

                    {/* Fila: Valor Presupuesto (UF) */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Valor del Presupuesto (UF)</label>
                      <input
                        className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-bold text-secondary"
                        type="number"
                        value={valorProyecto}
                        onChange={(e) => handleValorProyectoChange(e.target.value)}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>

                    {/* Fila: Inicio Facturación */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Inicio Facturación</label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          readOnly
                          value={fechaInicio ? fechaInicio.split('-').reverse().join('/') : ''}
                          className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 outline-none transition-all bg-white font-medium pr-10"
                          placeholder="dd/mm/yyyy"
                        />
                        <input
                          type="date"
                          value={fechaInicio}
                          onChange={(e) => handleFechaInicioChange(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          required
                        />
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[20px]">
                          calendar_month
                        </span>
                      </div>
                    </div>

                    {/* Descripción del Presupuesto */}
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Descripción</label>
                      <textarea
                        className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                        rows="2"
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="Ingrese comentarios sobre los alcances del presupuesto..."
                      />
                    </div>

                    {/* Sección Respaldo */}
                    <div className="space-y-sm pt-sm border-t border-slate-200/60">
                      <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">
                        Respaldo (Documentos asociados)
                      </label>
                      <div className="flex items-center gap-base">
                        <label className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-outline-variant hover:border-secondary rounded bg-white hover:bg-slate-50 text-on-surface hover:text-primary transition-all cursor-pointer text-body-sm font-bold shadow-sm">
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">upload_file</span>
                          <span>Subir Respaldo</span>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={handleApproveModalFileUpload}
                          />
                        </label>
                        <span className="text-[11px] text-on-surface-variant/70 italic">PDF o DOCX</span>
                      </div>

                      {approvingQuoteBackupFiles.length > 0 ? (
                        <div className="space-y-xs mt-sm max-h-[140px] overflow-y-auto pr-xs custom-scrollbar">
                          {approvingQuoteBackupFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border border-outline-variant/30 shadow-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-secondary flex-shrink-0 text-[18px]">
                                  {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                                </span>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-body-sm font-bold truncate max-w-[150px]" title={file.name}>{file.name}</span>
                                  <span className="text-[10px] text-on-surface-variant">{(file.size / 1024).toFixed(1)} KB</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile(file)}
                                  className="p-1 hover:bg-slate-100 rounded text-secondary transition-all"
                                  title="Ver archivo"
                                >
                                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                                </button>
                                {file.url && (
                                  <a
                                    href={file.url}
                                    download={file.name}
                                    className="p-1 hover:bg-slate-100 rounded text-secondary transition-all"
                                    title="Descargar"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleApproveModalRemoveFile(idx)}
                                  className="p-1 hover:bg-slate-100 rounded text-error hover:text-red-600 transition-all"
                                  title="Eliminar"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-body-sm text-on-surface-variant italic pt-xs">No hay archivos de respaldo adjuntos.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Tabla de Facturación */}
                <div className="lg:col-span-7 space-y-lg flex flex-col h-full">
                  <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md flex-grow flex flex-col">
                    <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                      <span className="material-symbols-outlined text-[20px] text-secondary">calendar_month</span>
                      Cronograma de Facturación
                    </h3>

                    {billingTable.length > 0 ? (
                      <>
                        <div className="flex-grow overflow-y-auto max-h-[380px] custom-scrollbar border border-slate-200/60 rounded-lg bg-white">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-100 text-slate-700 text-label-sm uppercase font-bold sticky top-0">
                              <tr>
                                <th className="p-2 border-b border-slate-200 text-center w-20">N° Cuotas</th>
                                <th className="p-2 border-b border-slate-200">Fecha</th>
                                <th className="p-2 border-b border-slate-200 text-right w-36">Valor Cuota (UF)</th>
                                <th className="p-2 border-b border-slate-200">Comentario</th>
                                <th className="p-2 border-b border-slate-200 text-center w-12">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="text-body-sm divide-y divide-slate-100">
                              {billingTable.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  <td className="p-1 w-20 text-center">
                                    <input
                                      type="number"
                                      min="1"
                                      value={row.cuotas}
                                      onChange={(e) => handleRowChange(idx, 'cuotas', e.target.value)}
                                      className="w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm text-center font-bold"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <div className="relative flex items-center w-full">
                                      <input
                                        type="text"
                                        readOnly
                                        value={row.date ? row.date.split('-').reverse().join('/') : ''}
                                        className="w-full border-0 bg-transparent p-1 focus:bg-white rounded outline-none text-body-sm pr-6"
                                        placeholder="dd/mm/yyyy"
                                      />
                                      <input
                                        type="date"
                                        value={row.date || ''}
                                        onChange={(e) => handleRowChange(idx, 'date', e.target.value)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                      />
                                      <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[16px]">
                                        calendar_month
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-1 w-28">
                                    <input
                                      type="number"
                                      value={row.uf}
                                      onChange={(e) => handleRowChange(idx, 'uf', e.target.value)}
                                      className="w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm font-semibold text-right"
                                      step="0.01"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      list={`approve-comments-options-${idx}`}
                                      value={row.comment || ''}
                                      onChange={(e) => handleRowChange(idx, 'comment', e.target.value)}
                                      placeholder="Seleccionar o escribir..."
                                      className="w-full border-0 bg-transparent p-1 focus:ring-1 focus:ring-secondary focus:bg-white rounded outline-none text-body-sm"
                                    />
                                    <datalist id={`approve-comments-options-${idx}`}>
                                      {COMMENT_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt} />
                                      ))}
                                    </datalist>
                                  </td>
                                  <td className="p-1 w-12 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRow(idx)}
                                      className="p-1 hover:bg-red-50 rounded text-error hover:text-red-600 transition-all flex items-center justify-center mx-auto"
                                      title="Eliminar fila"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Add Row Button */}
                        <div className="flex justify-start mt-2">
                          <button
                            type="button"
                            onClick={handleAddRow}
                            className="px-3 py-1.5 bg-secondary/10 hover:bg-secondary/20 text-secondary text-body-sm font-bold rounded-lg transition-all flex items-center gap-1 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            <span>Agregar Fila</span>
                          </button>
                        </div>

                        {/* Verification Total Bar */}
                        {(() => {
                          const currentSum = billingTable.reduce((acc, r) => acc + ((parseInt(r.cuotas) || 1) * (parseFloat(r.uf) || 0)), 0);
                          const roundedSum = Math.round(currentSum * 100) / 100;
                          const expectedTotal = Math.round((parseFloat(valorProyecto) || 0) * 100) / 100;
                          const isMatch = Math.abs(roundedSum - expectedTotal) < 0.02;
                          const totalCuotas = billingTable.reduce((acc, r) => acc + (parseInt(r.cuotas) || 1), 0);
                          return (
                            <div className={`mt-3 p-3 rounded-lg flex flex-col gap-2 font-bold text-body-sm border ${isMatch
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}>
                              <div className="flex flex-wrap justify-between items-center gap-2">
                                <div className="flex flex-wrap gap-x-md gap-y-1">
                                  <span>Suma Planificada: {roundedSum.toFixed(2)} UF</span>
                                  <span className="text-slate-350">/</span>
                                  <span>Monto Requerido: {expectedTotal.toFixed(2)} UF</span>
                                </div>
                                <div>
                                  {isMatch ? (
                                    <span className="flex items-center gap-1 text-emerald-600">
                                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                      Montos coinciden
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-amber-600">
                                      <span className="material-symbols-outlined text-[18px]">warning</span>
                                      Diferencia: {(expectedTotal - roundedSum).toFixed(2)} UF
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[11px] text-on-surface-variant/80">
                                <span>Total de cuotas (resultante):</span>
                                <span className="font-extrabold text-primary">{totalCuotas} {totalCuotas === 1 ? 'cuota' : 'cuotas'}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="flex-grow flex flex-col items-center justify-center p-xl border border-dashed border-outline-variant/60 rounded-lg text-on-surface-variant italic text-body-sm">
                        <span className="material-symbols-outlined text-[36px] text-slate-300 mb-2">calendar_today</span>
                        Ingrese Fecha Inicio y Nº Cuotas para generar la tabla.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant">
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={() => {
                    setIsApproveModalOpen(false);
                    setApprovingQuote(null);
                    setMatchedProjectId(null);
                    setPrefilledFromProjectId(null);
                    setShowSuggestions(false);
                  }}
                  className={`px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold ${isApproving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Cancelar Aprobación
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className={`px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95 flex items-center gap-2 ${isApproving ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isApproving ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  )}
                  <span>{isApproving ? 'Aprobando...' : 'Aprobar Presupuesto y Crear Proyecto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Backdrop: Review Selection */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm">
          <div className="relative bg-white w-full max-w-md overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">

            {/* Header */}
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Asignar Revisores</h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-1 mt-0.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Presupuesto #{reviewingQuote?.quoteId?.padStart(4, '0')}</span>
                </p>
              </div>
              <button
                onClick={handleCloseReviewModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-lg space-y-lg text-left">

              {/* Dropdown Select + Add Button */}
              <div className="flex flex-col gap-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Seleccionar Revisor
                </label>
                <div className="flex gap-sm items-end">
                  <div className="flex-grow">
                    <select
                      value={selectedReviewerId}
                      onChange={(e) => setSelectedReviewerId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                    >
                      <option value="">-- Seleccionar usuario --</option>
                      {availableUsersToSelect.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddReviewer}
                    disabled={!selectedReviewerId}
                    className="px-md py-2 bg-primary text-white font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 shadow-md shadow-primary/10 h-[42px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span>Agregar</span>
                  </button>
                </div>
              </div>

              {/* Selected Reviewers List */}
              <div className="flex flex-col gap-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Revisores Seleccionados
                </label>
                {selectedReviewers.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg p-md bg-slate-50/50 max-h-[220px] overflow-y-auto space-y-2">
                    {selectedReviewers.map(reviewer => (
                      <div key={reviewer.id} className="flex justify-between items-center bg-white border border-slate-200/60 rounded-lg p-sm shadow-sm animate-scale-up">
                        <div className="flex items-center gap-sm">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-body-sm">
                            {reviewer.initials || reviewer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-body-md block text-slate-800 leading-tight">{reviewer.name}</span>
                            <span className="text-[12px] text-on-surface-variant/80">{reviewer.email}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveReviewer(reviewer.id)}
                          className="p-1.5 hover:bg-red-50 rounded-full text-error hover:text-red-600 transition-all flex items-center justify-center border border-transparent"
                          title="Eliminar revisor"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-lg text-center text-on-surface-variant italic bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    No hay revisores seleccionados. Debe agregar al menos un usuario para poder enviar a revisión.
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-lg border-t border-outline-variant flex justify-end gap-md bg-surface sticky bottom-0">
              <button
                type="button"
                onClick={handleCloseReviewModal}
                className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReview}
                disabled={selectedReviewers.length === 0}
                className={`px-lg py-2 bg-secondary text-white rounded font-bold shadow-lg shadow-secondary/20 transition-all flex items-center gap-2 ${selectedReviewers.length === 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:brightness-110 active:scale-95'
                  }`}
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span>Enviar</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Reusable Notification Modal (Success / Error) */}
      {notification && (
        <div className="fixed inset-0 z-[100] bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-sm mb-2 ${notification.type === 'error' ? 'bg-error-container/20 text-error' : 'bg-secondary-container/20 text-secondary'
              }`}>
              <span className="material-symbols-outlined text-[36px]">
                {notification.type === 'error' ? 'error' : 'check_circle'}
              </span>
            </div>

            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">{notification.title}</h3>
              <p className="text-body-md text-on-surface-variant">{notification.message}</p>
            </div>

            <div className="pt-sm">
              <button
                onClick={() => setNotification(null)}
                className="w-full bg-primary text-white py-sm rounded-lg font-bold shadow-md hover:brightness-105 active:scale-95 transition-all text-body-md"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Installments Modal */}
      {isInstallmentsModalOpen && (
        <InstallmentsModal
          isOpen={isInstallmentsModalOpen}
          onClose={() => setIsInstallmentsModalOpen(false)}
          projectName={existingQuoteObj?.projectId ? (() => {
            const assoc = projects.find(p => p.id === existingQuoteObj.projectId);
            return assoc ? `${assoc.projectNumber} - ${assoc.rawProjectName}` : quoteTitle;
          })() : quoteTitle}
          budgetNumber={quoteId}
          budgetAmount={parseFloat(subtotal) || 0}
          budgetBackupFiles={backupFiles}
          initialInstallments={editBillingTable}
          onSave={async (updated) => {
            setEditBillingTable(updated);
          }}
          projectNumber={existingQuoteObj?.projectId ? projects.find(p => p.id === existingQuoteObj.projectId)?.projectNumber || 'SPR' : 'SPR'}
          isDeferredSave={true}
        />
      )}
    </div>
  );
}
