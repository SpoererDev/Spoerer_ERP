import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import * as XLSX from 'xlsx';
import { exportExcelFile } from '../utils/exportHelper';
import InstallmentsModal from './InstallmentsModal';
import CollapsibleKpiBanner from './CollapsibleKpiBanner';
import { validateRut, formatRut } from '../utils/validation';
import { formatAmountWithCurrency } from '../utils/supabaseService';
import { printFilteredBillingInstallments } from '../utils/billingPrintHelper';

export default function Facturacion({
  projects,
  budgets,
  installments,
  clients,
  mainClients = [],
  onUpdateInstallment,
  onSaveInstallments,
  onSaveProject,
  onAddClient,
  onUpdateBudgetLegalEntity,
  temporalFilter,
  setTemporalFilter,
  statusFilter,
  setStatusFilter,
  clientFilter,
  setClientFilter,
  encargadoFilter = 'Todos',
  setEncargadoFilter,
  users = [],
  searchTerm,
  setSearchTerm
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // --- EXPANSION STATE ---
  const [expandedProjects, setExpandedProjects] = useState({});

  // Sticky filter header offset measurement
  const filterHeaderRef = useRef(null);
  const [stickyHeaderOffset, setStickyHeaderOffset] = useState(0);

  useEffect(() => {
    const updateOffset = () => {
      if (filterHeaderRef.current) {
        // 64px is top navbar height (top-16)
        setStickyHeaderOffset(64 + filterHeaderRef.current.offsetHeight);
      }
    };
    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    if (filterHeaderRef.current) {
      observer.observe(filterHeaderRef.current);
    }
    window.addEventListener('resize', updateOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, []);

  // Auto-promote "Aprobada" installments to "Por facturar" when scheduled date arrives (date <= todayStr)
  useEffect(() => {
    if (!installments || installments.length === 0 || !onUpdateInstallment) return;
    const dueInstallments = installments.filter(
      inst => inst.status === 'Aprobada' && inst.date && inst.date <= todayStr
    );
    if (dueInstallments.length > 0) {
      dueInstallments.forEach(inst => {
        onUpdateInstallment(inst.id, { status: 'Por facturar' });
      });
    }
  }, [installments, todayStr, onUpdateInstallment]);

  // --- MODALS STATE ---
  const [isEmitModalOpen, setIsEmitModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [isNoRazonSocialModalOpen, setIsNoRazonSocialModalOpen] = useState(false);
  const [isDateUnconfirmedModalOpen, setIsDateUnconfirmedModalOpen] = useState(false);

  // Installments unified modal state
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [activeBudgetForInstallments, setActiveBudgetForInstallments] = useState(null);

  // Assign Razón Social Modal State
  const [isAssignRazonSocialModalOpen, setIsAssignRazonSocialModalOpen] = useState(false);
  const [targetProjectForRazonSocial, setTargetProjectForRazonSocial] = useState(null);
  const [targetBudgetForRazonSocial, setTargetBudgetForRazonSocial] = useState(null);
  const [assignMode, setAssignMode] = useState('select'); // 'select' | 'create'
  const [selectedRazonSocialId, setSelectedRazonSocialId] = useState('');
  const [razonSocialSearch, setRazonSocialSearch] = useState('');
  const [isSavingRazonSocial, setIsSavingRazonSocial] = useState(false);
  const [assignError, setAssignError] = useState('');

  // Form state for creating new Razón Social on the fly
  const [newRazonSocialCompany, setNewRazonSocialCompany] = useState('');
  const [newRazonSocialRut, setNewRazonSocialRut] = useState('');
  const [newRazonSocialGiro, setNewRazonSocialGiro] = useState('');
  const [newRazonSocialAddress, setNewRazonSocialAddress] = useState('');
  const [newRazonSocialComuna, setNewRazonSocialComuna] = useState('');
  const [newRazonSocialCiudad, setNewRazonSocialCiudad] = useState('');
  const [newRazonSocialContactName, setNewRazonSocialContactName] = useState('');
  const [newRazonSocialContactEmail, setNewRazonSocialContactEmail] = useState('');
  const [newRazonSocialContactPhone, setNewRazonSocialContactPhone] = useState('');

  // --- FILTER STATE ---
  const [billingCompanyFilter, setBillingCompanyFilter] = useState('Todos');

  // --- FORM STATES ---
  const [isSaving, setIsSaving] = useState(false);

  // --- ENCARGADOS COMPUTATION ---
  const adminUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    return users.filter(u => {
      const roleLower = (u.role || '').toLowerCase();
      return roleLower === 'admin' || roleLower === 'administrador' || roleLower === 'system administrator' || roleLower.includes('admin');
    });
  }, [users]);

  const availableEncargados = useMemo(() => {
    const set = new Set();
    if (projects && Array.isArray(projects)) {
      projects.forEach(p => {
        if (p.encargado && p.encargado.trim() !== '') {
          set.add(p.encargado.trim());
        }
      });
    }
    if (adminUsers && Array.isArray(adminUsers)) {
      adminUsers.forEach(u => {
        if (u.name && u.name.trim() !== '') {
          set.add(u.name.trim());
        }
      });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects, adminUsers]);

  // --- CLIENTS COMPUTATION (Clientes Principales & Asignados a Proyectos/Presupuestos, no Razones Sociales) ---
  const availableClients = useMemo(() => {
    const clientMap = new Map(); // lowercase -> original display name

    const addClientName = (name) => {
      if (!name || typeof name !== 'string') return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (lower === 'cliente' || lower === 'cliente no definido' || lower === 'sin asignar' || lower === 'todos') return;
      if (!clientMap.has(lower)) {
        clientMap.set(lower, trimmed);
      }
    };

    // 1. From mainClients (Clientes Principales en CRM)
    if (Array.isArray(mainClients)) {
      mainClients.forEach(mc => addClientName(mc?.name));
    }

    // 2. From projects (campo cliente del proyecto)
    if (Array.isArray(projects)) {
      projects.forEach(p => {
        addClientName(p?.cliente);
      });
    }

    // 3. From budgets (campo mainClientName o clientName del presupuesto)
    if (Array.isArray(budgets)) {
      budgets.forEach(b => {
        addClientName(b?.mainClientName);
        addClientName(b?.clientName);
      });
    }

    // 4. From clients (razones sociales que tienen cliente principal / cliente real configurado)
    if (Array.isArray(clients)) {
      clients.forEach(c => {
        addClientName(c?.mainClientName);
        addClientName(c?.realClient);
      });
    }

    return Array.from(clientMap.values()).sort((a, b) => 
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }, [mainClients, projects, budgets, clients]);

  // --- HELPER: RESOLVE CLIENT NAME FOR AN INSTALLMENT ---
  const getInstallmentClientName = useCallback((inst) => {
    if (!inst) return 'Sin asignar';
    const project = projects.find(p => p.id === inst.project_id);
    const budget = inst.origin_budget_id ? budgets.find(b => b.id === inst.origin_budget_id) : null;

    let realClientName = '';

    // 1. Budget main client
    if (budget) {
      if (budget.mainClientId) {
        const matchedMC = mainClients.find(mc => mc.id === budget.mainClientId);
        if (matchedMC?.name) realClientName = matchedMC.name;
      }
      if (!realClientName && budget.mainClientName && budget.mainClientName !== 'Cliente') {
        realClientName = budget.mainClientName;
      }
    }

    // 2. Installment or Budget legal entity's main client
    if (!realClientName) {
      const targetLegalId = inst?.legalEntityId || budget?.legalEntityId || budget?.clientId;
      const razonSocial = (targetLegalId ? clients.find(c => c.id === targetLegalId && c.company) : null) ||
        (budget?.company ? clients.find(c => c.company && c.company.trim().toLowerCase() === budget.company.trim().toLowerCase()) : null);

      if (razonSocial) {
        if (razonSocial.mainClientId) {
          const matchedMC = mainClients.find(mc => mc.id === razonSocial.mainClientId);
          if (matchedMC?.name) realClientName = matchedMC.name;
        }
        if (!realClientName && (razonSocial.mainClientName || razonSocial.realClient)) {
          realClientName = razonSocial.mainClientName || razonSocial.realClient;
        }
      }
    }

    // 3. Project main client or client
    if (!realClientName && project) {
      if (project.mainClientId) {
        const matchedMC = mainClients.find(mc => mc.id === project.mainClientId);
        if (matchedMC?.name) realClientName = matchedMC.name;
      } else if (project.clientId) {
        const projClient = clients.find(c => c.id === project.clientId);
        if (projClient) {
          if (projClient.mainClientId) {
            const matchedMC = mainClients.find(mc => mc.id === projClient.mainClientId);
            if (matchedMC?.name) realClientName = matchedMC.name;
          } else if (projClient.mainClientName || projClient.realClient) {
            realClientName = projClient.mainClientName || projClient.realClient;
          }
        }
      }
      if (!realClientName && project.cliente && project.cliente !== 'Cliente no definido' && project.cliente !== 'Cliente') {
        realClientName = project.cliente;
      }
    }

    // 4. Budget clientName fallback
    if (!realClientName && budget?.clientName && budget.clientName !== 'Cliente') {
      realClientName = budget.clientName;
    }

    // 5. Project display client fallback
    if (!realClientName && project?.cliente && project.cliente !== 'Cliente no definido' && project.cliente !== 'Cliente') {
      realClientName = project.cliente;
    }

    return realClientName ? realClientName.trim() : (project?.cliente || budget?.clientName || 'Sin asignar');
  }, [projects, budgets, clients, mainClients]);

  // Emit Invoice Form
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [actualInvoiceDate, setActualInvoiceDate] = useState('');
  const [ufRate, setUfRate] = useState('');
  const [isFetchingUf, setIsFetchingUf] = useState(false);
  const [ufFetchError, setUfFetchError] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [emitComment, setEmitComment] = useState('');

  // Register Payment Form
  const [actualPaymentDate, setActualPaymentDate] = useState('');
  const [totalClpReceived, setTotalClpReceived] = useState('');
  const [paymentFile, setPaymentFile] = useState(null);
  const [paymentComment, setPaymentComment] = useState('');

  // --- UTILS & FORMATTERS ---
  const formatCLP = (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '-';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(amount));
  };

  const formatUF = (uf, decimals = 2) => {
    if (uf === null || uf === undefined || isNaN(uf)) return '0 UF';
    return `${new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(uf)} UF`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // YYYY-MM-DD to DD/MM/YYYY
  };

  // --- DATE FILTER HELPER ---
  const filterPeriod = (dateStr, period) => {
    if (period === 'Todos' || !period) return true;
    if (!dateStr) return false;

    let targetDate = null;
    if (typeof dateStr === 'string') {
      const cleanStr = dateStr.trim();
      if (cleanStr.includes('-')) {
        const parts = cleanStr.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD
            targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
          } else {
            // DD-MM-YYYY
            targetDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 12, 0, 0);
          }
        }
      } else if (cleanStr.includes('/')) {
        const parts = cleanStr.split('/');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY/MM/DD
            targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
          } else {
            // DD/MM/YYYY
            targetDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 12, 0, 0);
          }
        }
      }
    } else if (dateStr instanceof Date) {
      targetDate = new Date(dateStr);
    }

    if (!targetDate || isNaN(targetDate.getTime())) {
      targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) return false;
    }

    let monthsToAdd = 0;
    if (period === '1_mes') monthsToAdd = 1;
    else if (period === '2_meses') monthsToAdd = 2;
    else if (period === '3_meses') monthsToAdd = 3;
    else if (period === '6_meses') monthsToAdd = 6;
    else if (period === '12_meses') monthsToAdd = 12;
    else return true;

    const now = new Date();
    // Maximum future date allowed (end of day)
    const maxDate = new Date(now.getFullYear(), now.getMonth() + monthsToAdd, now.getDate(), 23, 59, 59, 999);
    // Handle days overflow if target month has fewer days (e.g., Aug 31 + 1 month -> Sep 30)
    const expectedMonth = (now.getMonth() + monthsToAdd) % 12;
    if (maxDate.getMonth() !== expectedMonth) {
      maxDate.setDate(0);
      maxDate.setHours(23, 59, 59, 999);
    }

    // Include all installments from past dates up to maxDate in the future
    return targetDate <= maxDate;
  };

  // --- SUPABASE STORAGE FILE UPLOAD HELPER ---
  const uploadFile = async (folder, projectNumber, file) => {
    if (!file) return '';
    // Clean file name to remove spaces and special characters
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${folder}/${projectNumber}_${Date.now()}_${cleanName}`;

    const { data, error } = await supabase.storage
      .from('budgets')
      .upload(path, file, {
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('budgets')
      .getPublicUrl(path);

    return publicUrl;
  };

  // --- RATE AUTO-FETCHING FOR A GIVEN DATE (UF / USD) ---
  const fetchRateForDate = async (dateStr, currency = 'UF') => {
    if (!dateStr || currency === 'CLP') {
      setUfRate('');
      return;
    }
    setIsFetchingUf(true);
    setUfFetchError(false);
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) throw new Error('Formato de fecha no válido');
      const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD to DD-MM-YYYY
      const endpoint = currency === 'USD' 
        ? `https://mindicador.cl/api/dolar/${formattedDate}` 
        : `https://mindicador.cl/api/uf/${formattedDate}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Error al conectar con el servidor de ${currency}`);
      const data = await res.json();
      if (data.serie && data.serie.length > 0) {
        const rate = data.serie[0].valor;
        setUfRate(rate.toString());
      } else {
        throw new Error('Sin datos para esa fecha');
      }
    } catch (err) {
      console.error(`Error fetching rate for date (${currency}):`, err);
      setUfFetchError(true);
      setUfRate('');
    } finally {
      setIsFetchingUf(false);
    }
  };

  // Fetch rate automatically when Emit Invoice Modal is open or selected emission date changes
  useEffect(() => {
    if (isEmitModalOpen && selectedInstallment && actualInvoiceDate) {
      const instCurr = (selectedInstallment.currency || 'UF').toUpperCase();
      if (instCurr !== 'CLP') {
        fetchRateForDate(actualInvoiceDate, instCurr);
      } else {
        setUfRate('');
      }
    }
  }, [isEmitModalOpen, selectedInstallment, actualInvoiceDate]);

  // --- DYNAMIC CALCULATIONS FOR EMIT MODAL ---
  const plannedAmount = selectedInstallment ? parseFloat(selectedInstallment.uf) || 0 : 0;
  const instCurrency = (selectedInstallment?.currency || 'UF').toUpperCase();
  const instBillingCompany = selectedInstallment?.billingCompany || (budgets.find(b => b.id === selectedInstallment?.origin_budget_id)?.billingCompany) || (projects.find(p => p.id === selectedInstallment?.project_id)?.billingCompany) || 'Spoerer';
  const isExempt = instBillingCompany === 'FPF';
  const parsedUfRate = parseFloat(ufRate) || 0;
  const calculatedNet = instCurrency === 'CLP'
    ? Math.round(plannedAmount)
    : Math.round(plannedAmount * parsedUfRate);
  const calculatedTax = isExempt ? 0 : Math.round(calculatedNet * 0.19);
  const calculatedTotal = calculatedNet + calculatedTax;

  const instRazonSocial = useMemo(() => {
    if (!selectedInstallment) return null;
    const b = budgets.find(b => b.id === selectedInstallment.origin_budget_id);
    const targetLegalId = selectedInstallment.legalEntityId || b?.legalEntityId || b?.clientId;
    if (targetLegalId) {
      const found = clients.find(c => c.id === targetLegalId && c.company);
      if (found) return found;
    }
    if (b?.company) {
      const foundByName = clients.find(c => c.company && c.company.trim().toLowerCase() === b.company.trim().toLowerCase());
      if (foundByName) return foundByName;
    }
    return null;
  }, [selectedInstallment, budgets, clients]);

  // --- FILTERED INSTALLMENTS ---
  const filteredInstallments = useMemo(() => {
    return installments.filter(inst => {
      // 1. Temporal Filter
      if (!filterPeriod(inst.date, temporalFilter)) return false;

      // 2. Status Filter
      if (statusFilter !== 'Todos') {
        if (statusFilter === 'Facturada' || statusFilter === 'Factura emitida') {
          if (inst.status !== 'Facturada' && inst.status !== 'Factura emitida') return false;
        } else if (statusFilter === 'Vencida') {
          const isOverdue = inst.status === 'Por facturar' && inst.date && inst.date < todayStr;
          if (!isOverdue) return false;
        } else if (inst.status !== statusFilter) {
          return false;
        }
      }

      // Find associated project
      const project = projects.find(p => p.id === inst.project_id);

      // 3. Client Filter (Filtro por Cliente / Cliente Principal, no Razón Social)
      if (clientFilter !== 'Todos') {
        const instClient = getInstallmentClientName(inst);
        const projClient = project?.cliente?.trim() || '';
        const target = clientFilter.trim().toLowerCase();

        const matches = (instClient && instClient.toLowerCase() === target) ||
                        (projClient && projClient.toLowerCase() === target);

        if (!matches) return false;
      }

      // 4. Encargado Filter
      if (encargadoFilter && encargadoFilter !== 'Todos' && project?.encargado !== encargadoFilter) return false;

      // 5. Empresa Emisora Filter
      const instCompany = inst.billingCompany || (inst.origin_budget_id && budgets.find(b => b.id === inst.origin_budget_id)?.billingCompany) || project?.billingCompany || 'Spoerer';
      if (billingCompanyFilter !== 'Todos' && instCompany !== billingCompanyFilter) return false;

      // 6. Text Search
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();

        const projectCode = project?.projectNumber?.toLowerCase() || '';
        const projectName = project?.rawProjectName?.toLowerCase() || '';
        const projectEncargado = project?.encargado?.toLowerCase() || '';

        const client = clients.find(c => c.id === (project?.clientId || null));
        const clientCompany = client?.company?.toLowerCase() || '';
        const clientName = client?.name?.toLowerCase() || '';
        const projectClient = project?.cliente?.toLowerCase() || '';
        const instClientName = getInstallmentClientName(inst).toLowerCase();

        const invNum = inst.invoiceNumber?.toLowerCase() || '';
        const instOc = inst.oc?.toLowerCase() || '';
        const instDesc = inst.description?.toLowerCase() || '';
        const instComment = inst.comment?.toLowerCase() || '';

        // Find associated budget
        const budget = inst.origin_budget_id && Array.isArray(budgets) ? budgets.find(b => b.id === inst.origin_budget_id) : null;
        const budgetNum = budget?.quoteId?.toLowerCase() || '';
        const budgetTitle = budget?.title?.toLowerCase() || '';
        const rawDigitsTerm = term.replace(/\D/g, '');

        const matchesProject = projectCode.includes(term) || projectName.includes(term) || projectEncargado.includes(term);
        const matchesClient = clientCompany.includes(term) || clientName.includes(term) || projectClient.includes(term) || instClientName.includes(term);
        const matchesInstallment = invNum.includes(term) || instOc.includes(term) || instDesc.includes(term) || instComment.includes(term);
        const matchesBudget = budgetNum.includes(term) || 
                              budgetTitle.includes(term) || 
                              (rawDigitsTerm !== '' && budgetNum.replace(/\D/g, '').includes(rawDigitsTerm));

        if (!matchesProject && !matchesClient && !matchesInstallment && !matchesBudget) return false;
      }

      return true;
    });
  }, [installments, projects, clients, budgets, temporalFilter, statusFilter, clientFilter, encargadoFilter, billingCompanyFilter, searchTerm, todayStr, getInstallmentClientName]);

  // --- DYNAMIC KPIs (Adjust to all selected filters) ---
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    const porFacturar = { UF: 0, USD: 0, CLP: 0, count: 0 };
    const facturadoPendiente = { UF: 0, USD: 0, CLP: 0, totalClp: 0, count: 0 };
    const recaudado = { UF: 0, USD: 0, CLP: 0, totalClp: 0, count: 0 };

    const isEligibleForPorFacturar = (status) => {
      if (statusFilter === 'Todos') {
        return status === 'Por aprobar' || status === 'Aprobada' || status === 'Por facturar';
      }
      if (statusFilter === 'Por aprobar' || statusFilter === 'Aprobada' || statusFilter === 'Por facturar') {
        return status === statusFilter;
      }
      return false;
    };

    filteredInstallments.forEach(inst => {
      if (inst.status === 'Anulada') return;
      const curr = (inst.currency || 'UF').toUpperCase();
      const amt = parseFloat(inst.uf) || 0;
      const clpVal = parseFloat(inst.total_clp) || 0;
      const st = inst.status || (inst.dateConfirmed ? (inst.date && inst.date <= todayStr ? 'Por facturar' : 'Aprobada') : 'Por aprobar');

      if (isEligibleForPorFacturar(st)) {
        porFacturar.count++;
        if (curr === 'USD') porFacturar.USD += amt;
        else if (curr === 'CLP') porFacturar.CLP += amt;
        else porFacturar.UF += amt;
      } else if (st === 'Facturada' || st === 'Factura emitida') {
        facturadoPendiente.count++;
        facturadoPendiente.totalClp += clpVal;
        if (curr === 'USD') facturadoPendiente.USD += amt;
        else if (curr === 'CLP') facturadoPendiente.CLP += (clpVal || amt);
        else facturadoPendiente.UF += amt;
      } else if (st === 'Pagada') {
        recaudado.count++;
        recaudado.totalClp += clpVal;
        if (curr === 'USD') recaudado.USD += amt;
        else if (curr === 'CLP') recaudado.CLP += (clpVal || amt);
        else recaudado.UF += amt;
      }
    });

    return {
      porFacturar,
      facturadoPendiente,
      recaudado
    };
  }, [filteredInstallments, statusFilter]);

  // --- HIERARCHICAL DATA GROUPING (Project > Budget > Installments) ---
  const groupedData = useMemo(() => {
    const groups = {}; // projectId -> budgetId -> Array of installments

    filteredInstallments.forEach(inst => {
      const pId = inst.project_id;
      const bId = inst.origin_budget_id;
      if (!pId || !bId) return;

      if (!groups[pId]) {
        groups[pId] = {};
      }
      if (!groups[pId][bId]) {
        groups[pId][bId] = [];
      }
      groups[pId][bId].push(inst);
    });

    const result = [];

    Object.keys(groups).forEach(pId => {
      const project = projects.find(p => p.id === pId);
      if (!project) return;

      const budgetGroups = groups[pId];
      const projectBudgets = [];
      const projectTotalsByCurrency = {};

      Object.keys(budgetGroups).forEach(bId => {
        const budget = budgets.find(b => b.id === bId);
        // Display Quote Number + Title
        const budgetTitle = budget
          ? `${budget.quoteId} - ${budget.title}`
          : `Presupuesto Ref: ${bId.substring(0, 8)}`;
        const budgetAmount = budget ? budget.amount : 0;
        const budgetInstallments = budgetGroups[bId];

        // Sort installments by numQuota or date
        budgetInstallments.sort((a, b) => (a.numQuota || 0) - (b.numQuota || 0));

        budgetInstallments.forEach(inst => {
          if (inst.status === 'Anulada') return;
          const curr = (inst.currency || budget?.currency || 'UF').toUpperCase();
          projectTotalsByCurrency[curr] = (projectTotalsByCurrency[curr] || 0) + (parseFloat(inst.uf) || 0);
        });

        projectBudgets.push({
          id: bId,
          budget,
          title: budgetTitle,
          amount: budgetAmount,
          installments: budgetInstallments
        });
      });

      projectBudgets.sort((a, b) => a.title.localeCompare(b.title));

      result.push({
        id: pId,
        project,
        plannedTotalsByCurrency: projectTotalsByCurrency,
        budgets: projectBudgets
      });
    });

    result.sort((a, b) => (a.project?.projectNumber || '').localeCompare(b.project?.projectNumber || ''));

    return result;
  }, [filteredInstallments, projects, budgets]);

  // --- COLLAPSE / EXPAND ACTIONS ---
  const toggleProject = (pId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [pId]: !prev[pId]
    }));
  };

  const expandAll = () => {
    const expansions = {};
    groupedData.forEach(item => {
      expansions[item.id] = true;
    });
    setExpandedProjects(expansions);
  };

  const collapseAll = () => {
    setExpandedProjects({});
  };

  // Print Filtered Billing Installments
  const handlePrintBilling = () => {
    printFilteredBillingInstallments({
      filteredInstallments,
      projects,
      budgets,
      clients,
      activeFilters: {
        temporal: temporalFilter,
        status: statusFilter,
        client: clientFilter,
        encargado: encargadoFilter,
        company: billingCompanyFilter,
        search: searchTerm
      }
    });
  };

  // Export Billing Installments to Excel
  const handleExportBilling = async () => {
    const rows = [];

    const formatDateExcel = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    filteredInstallments.forEach(installment => {
      // Find associated project
      const project = projects.find(p => p.id === installment.project_id);
      // Find associated budget
      const budget = installment.origin_budget_id ? budgets.find(b => b.id === installment.origin_budget_id) : null;
      // Find associated Razón Social for the installment (or fallback to budget)
      const targetLegalId = installment.legalEntityId || budget?.legalEntityId || budget?.clientId;
      const razonSocial = (targetLegalId ? clients.find(c => c.id === targetLegalId && c.company) : null) ||
        (budget?.company ? clients.find(c => c.company && c.company.trim().toLowerCase() === budget.company.trim().toLowerCase()) : null);

      // Find the Real Client Name (Cliente Real)
      const realClientName = getInstallmentClientName(installment);

      // Calculate total installments for this budget
      const budgetInstallments = budget ? installments.filter(i => i.origin_budget_id === budget.id) : [];
      const totCuotas = budgetInstallments.length;

      // Format date fields
      let yearVal = '';
      if (installment.date) {
        yearVal = installment.date.split('-')[0];
      }

      // Check if invoiced (Facturada): status is 'Facturada' or 'Factura emitida' or 'Pagada'
      const isInvoiced = installment.status === 'Facturada' || installment.status === 'Factura emitida' || installment.status === 'Pagada';
      const isPaid = installment.status === 'Pagada';

      rows.push({
        "Presupuesto #": budget ? budget.quoteId || '' : '',
        "Factura #": installment.invoiceNumber || '',
        "Fecha": formatDateExcel(installment.date),
        "Año": yearVal,
        "Año Proy": project ? project.anio || '' : '',
        "RUT": razonSocial ? razonSocial.rut || '' : '',
        "Razón Social": razonSocial ? razonSocial.company || '' : '',
        "Giro": razonSocial ? razonSocial.giro || '' : '',
        "Dirección": razonSocial ? razonSocial.address || '' : '',
        "Comuna": razonSocial ? razonSocial.comuna || '' : '',
        "Ciudad": razonSocial ? razonSocial.ciudad || '' : '',
        "Contacto": razonSocial ? razonSocial.name || '' : '',
        "Obra": project ? project.rawProjectName || '' : '',
        "OC": installment.oc || '',
        "Descripción": installment.description || '',
        "Comentario": installment.comment || '',
        "Cuota": installment.numQuota || '',
        "TotCuota": totCuotas || '',
        "Moneda": installment.currency || budget?.currency || 'UF',
        "Monto": parseFloat(installment.uf) || 0,
        "UF": parseFloat(installment.uf) || 0,
        "$": isInvoiced ? parseFloat(installment.total_clp) || 0 : '',
        "F-Pago": isPaid ? formatDateExcel(installment.actualPaymentDate) : '',
        "Estado F#": installment.status || '',
        "Tipo": '',
        "Cliente": realClientName,
        "N° Proyecto": project ? project.projectNumber || '' : '',
        "Revisor": '',
        "Firma": '',
        "Gerente Proyecto": '',
        "Ingeniero": '',
        "Dibujante": '',
        "M2": project ? parseFloat(project.superficie) || 0 : 0,
        "Total Presupuesto": budget ? parseFloat(budget.amount) || 0 : 0,
        "Total UF": budget ? parseFloat(budget.amount) || 0 : 0,
        "Empresa Emisora": installment.billingCompany || budget?.billingCompany || project?.billingCompany || 'Spoerer'
      });
    });

    // Sort rows: first by project number, then by budget code, then by quota number
    rows.sort((a, b) => {
      const projA = String(a["N° Proyecto"] || '');
      const projB = String(b["N° Proyecto"] || '');
      const projCompare = projA.localeCompare(projB, undefined, { numeric: true, sensitivity: 'base' });
      if (projCompare !== 0) return projCompare;

      const budgetA = String(a["Presupuesto #"] || '');
      const budgetB = String(b["Presupuesto #"] || '');
      const budgetCompare = budgetA.localeCompare(budgetB, undefined, { numeric: true, sensitivity: 'base' });
      if (budgetCompare !== 0) return budgetCompare;

      const quotaA = String(a["Cuota"] || '');
      const quotaB = String(b["Cuota"] || '');
      return quotaA.localeCompare(quotaB, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Create Sheet
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        "Presupuesto #",
        "Factura #",
        "Fecha",
        "Año",
        "Año Proy",
        "RUT",
        "Razón Social",
        "Giro",
        "Dirección",
        "Comuna",
        "Ciudad",
        "Contacto",
        "Obra",
        "OC",
        "Descripción",
        "Comentario",
        "Cuota",
        "TotCuota",
        "Moneda",
        "Monto",
        "UF",
        "$",
        "F-Pago",
        "Estado F#",
        "Tipo",
        "Cliente",
        "N° Proyecto",
        "Revisor",
        "Firma",
        "Gerente Proyecto",
        "Ingeniero",
        "Dibujante",
        "M2",
        "Total Presupuesto",
        "Total UF",
        "Empresa Emisora"
      ]
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Facturación");

    // Auto-fit columns
    const max_len = {};
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        const val = String(row[key]);
        max_len[key] = Math.max(max_len[key] || key.length, val.length);
      });
    });
    worksheet["!cols"] = Object.keys(max_len).map(key => ({
      wch: Math.min(max_len[key] + 3, 50)
    }));

    // Download Workbook
    await exportExcelFile(workbook, "DTE Spoerer.xlsx", "dte_spoerer_facturacion");
  };

  // --- RAZÓN SOCIAL HELPERS & HANDLERS ---
  const getBudgetRazonSocial = (budget) => {
    if (!budget) return null;

    const targetId = budget.legalEntityId || budget.clientId;
    if (targetId) {
      const found = clients.find(c => c.id === targetId && c.company);
      if (found) return found;
    }

    if (budget.company) {
      const foundByName = clients.find(c => c.company && c.company.trim().toLowerCase() === budget.company.trim().toLowerCase());
      if (foundByName) return foundByName;
    }

    return null;
  };

  const handleOpenAssignRazonSocialModal = (budget, project = null) => {
    const targetBudget = budget || null;
    const targetProj = project || (budget?.projectId ? projects.find(p => p.id === budget.projectId) : null);
    const currentRazonSocial = getBudgetRazonSocial(targetBudget);

    setTargetBudgetForRazonSocial(targetBudget);
    setTargetProjectForRazonSocial(targetProj);
    setSelectedRazonSocialId(currentRazonSocial ? currentRazonSocial.id : '');
    setAssignMode('select');
    setRazonSocialSearch('');
    setAssignError('');

    setNewRazonSocialCompany('');
    setNewRazonSocialRut('');
    setNewRazonSocialGiro('');
    setNewRazonSocialAddress('');
    setNewRazonSocialComuna('');
    setNewRazonSocialCiudad('');
    setNewRazonSocialContactName('');
    setNewRazonSocialContactEmail('');
    setNewRazonSocialContactPhone('');

    setIsAssignRazonSocialModalOpen(true);
  };

  const handleSaveAssignRazonSocial = async () => {
    if (!targetBudgetForRazonSocial && !targetProjectForRazonSocial) return;
    setAssignError('');
    setIsSavingRazonSocial(true);

    try {
      let clientToAssignId = selectedRazonSocialId;

      if (assignMode === 'create') {
        if (!newRazonSocialCompany.trim()) {
          setAssignError('Por favor, ingrese el nombre de la Razón Social.');
          setIsSavingRazonSocial(false);
          return;
        }
        if (newRazonSocialRut.trim() && !validateRut(newRazonSocialRut)) {
          setAssignError('El RUT ingresado no es válido.');
          setIsSavingRazonSocial(false);
          return;
        }

        const mainClientId = targetBudgetForRazonSocial?.mainClientId || targetProjectForRazonSocial?.mainClientId || null;
        const realClientName = targetBudgetForRazonSocial?.clientName || targetProjectForRazonSocial?.cliente || '';

        const newClientData = {
          company: newRazonSocialCompany.trim(),
          rut: formatRut(newRazonSocialRut),
          giro: newRazonSocialGiro.trim(),
          address: newRazonSocialAddress.trim(),
          comuna: newRazonSocialComuna.trim(),
          ciudad: newRazonSocialCiudad.trim(),
          name: newRazonSocialContactName.trim(),
          email: newRazonSocialContactEmail.trim(),
          phone: newRazonSocialContactPhone.trim(),
          mainClientId: mainClientId,
          realClient: realClientName
        };

        if (onAddClient) {
          const savedClient = await onAddClient(newClientData);
          clientToAssignId = savedClient.id;
        }
      } else {
        if (!clientToAssignId) {
          setAssignError('Por favor, seleccione una Razón Social de la lista.');
          setIsSavingRazonSocial(false);
          return;
        }
      }

      // Update the budget's legal entity (Razon Social)
      if (targetBudgetForRazonSocial && onUpdateBudgetLegalEntity) {
        await onUpdateBudgetLegalEntity(targetBudgetForRazonSocial.id, clientToAssignId);
      } else if (targetProjectForRazonSocial && onUpdateBudgetLegalEntity) {
        const pBudgets = budgets.filter(b => b.projectId === targetProjectForRazonSocial.id);
        for (const b of pBudgets) {
          await onUpdateBudgetLegalEntity(b.id, clientToAssignId);
        }
      }

      setIsAssignRazonSocialModalOpen(false);
      setTargetBudgetForRazonSocial(null);
      setTargetProjectForRazonSocial(null);
    } catch (err) {
      console.error('Error al asignar Razón Social:', err);
      setAssignError('Ocurrió un error al intentar asignar la Razón Social.');
    } finally {
      setIsSavingRazonSocial(false);
    }
  };

  // --- MODAL TRIGGERS ---
  const openEmitModal = (installment) => {
    const project = projects.find(p => p.id === installment.project_id);
    const budget = budgets.find(b => b.id === installment.origin_budget_id);
    const targetLegalId = installment.legalEntityId || budget?.legalEntityId || budget?.clientId;
    const razonSocial = (targetLegalId ? clients.find(c => c.id === targetLegalId && c.company) : null) || getBudgetRazonSocial(budget);

    if (!razonSocial) {
      setTargetBudgetForRazonSocial(budget || null);
      if (project) setTargetProjectForRazonSocial(project);
      setIsNoRazonSocialModalOpen(true);
      return;
    }

    if (!installment.dateConfirmed) {
      setIsDateUnconfirmedModalOpen(true);
      return;
    }

    setSelectedInstallment(installment);
    setInvoiceNumber(installment.invoiceNumber || '');
    setActualInvoiceDate(installment.actualInvoiceDate || new Date().toISOString().split('T')[0]);
    setUfRate('');
    setInvoiceFile(null);
    setEmitComment(installment.comment || '');
    setIsEmitModalOpen(true);
  };

  const openPaymentModal = (installment) => {
    setSelectedInstallment(installment);
    setActualPaymentDate(installment.actualPaymentDate || new Date().toISOString().split('T')[0]);
    setTotalClpReceived(installment.total_clp !== null && installment.total_clp !== undefined ? Math.round(installment.total_clp).toLocaleString('es-CL') : '');
    setPaymentFile(null);
    setPaymentComment(installment.comment || '');
    setIsPaymentModalOpen(true);
  };

  const openDetailsModal = (installment) => {
    setSelectedInstallment(installment);
    setIsDetailsModalOpen(true);
  };

  // --- SAVE ACTIONS ---
  const handleSaveEmit = async (e) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      alert("Por favor, ingrese el número de factura.");
      return;
    }
    const curr = (selectedInstallment?.currency || 'UF').toUpperCase();
    if (curr !== 'CLP' && (!ufRate || isNaN(parseFloat(ufRate)))) {
      alert(`Por favor, ingrese un valor de ${curr === 'USD' ? 'Dólar' : 'UF'} válido.`);
      return;
    }

    setIsSaving(true);
    try {
      const project = projects.find(p => p.id === selectedInstallment.project_id);
      const pNumber = project ? project.projectNumber : 'SIN_PROYECTO';

      let fileUrl = selectedInstallment.invoiceFileUrl || '';
      if (invoiceFile) {
        fileUrl = await uploadFile('facturas', pNumber, invoiceFile);
      }

      const updates = {
        status: 'Facturada',
        invoiceNumber: invoiceNumber.trim(),
        actualInvoiceDate,
        net_clp: calculatedNet,
        tax_clp: calculatedTax,
        total_clp: calculatedTotal,
        invoiceFileUrl: fileUrl,
        comment: emitComment.trim()
      };

      await onUpdateInstallment(selectedInstallment.id, updates);
      setIsEmitModalOpen(false);
    } catch (err) {
      console.error("Error al emitir factura:", err);
      alert("Error al emitir la factura: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    const rawClp = totalClpReceived ? totalClpReceived.toString().replace(/\D/g, '') : '';
    const numericClp = parseFloat(rawClp);

    if (!rawClp || isNaN(numericClp)) {
      alert("Por favor, ingrese un monto en pesos válido.");
      return;
    }

    setIsSaving(true);
    try {
      const project = projects.find(p => p.id === selectedInstallment.project_id);
      const pNumber = project ? project.projectNumber : 'SIN_PROYECTO';

      let fileUrl = selectedInstallment.paymentBackupUrl || '';
      if (paymentFile) {
        fileUrl = await uploadFile('respaldos_pagos', pNumber, paymentFile);
      }

      const updates = {
        status: 'Pagada',
        actualPaymentDate,
        total_clp: numericClp,
        paymentBackupUrl: fileUrl,
        comment: paymentComment.trim()
      };
      await onUpdateInstallment(selectedInstallment.id, updates);
      setIsPaymentModalOpen(false);
    } catch (err) {
      console.error("Error al registrar pago:", err);
      alert("Error al registrar el pago: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDateConfirmed = async (inst) => {
    if (!onUpdateInstallment || !inst) return;
    try {
      const nextConfirmed = !inst.dateConfirmed;
      const updates = { dateConfirmed: nextConfirmed };
      if (nextConfirmed) {
        if (inst.status === 'Por aprobar' || !inst.status) {
          updates.status = (inst.date && inst.date <= todayStr) ? 'Por facturar' : 'Aprobada';
        }
      } else {
        if (inst.status === 'Aprobada' || inst.status === 'Por facturar') {
          updates.status = 'Por aprobar';
        }
      }
      await onUpdateInstallment(inst.id, updates);
    } catch (err) {
      console.error("Error al actualizar confirmación de fecha:", err);
    }
  };

  return (
    <div className="space-y-3 text-left">
      {/* Sticky Header Section: Title, KPIs, and Filters */}
      <div ref={filterHeaderRef} className="sticky top-16 z-30 bg-[#f8fafc]/95 backdrop-blur-md -mx-6 px-6 -mt-3 pt-3 pb-2 space-y-2 border-b border-slate-200/80 shadow-xs">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-0.5">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-sans tracking-tight">Centro de Cobranzas</h2>
            <p className="text-xs text-slate-500 mt-0.5">Gestión de cuotas de facturación y conciliación de pagos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">unfold_more</span>
              <span>Expandir Todo</span>
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">unfold_less</span>
              <span>Colapsar Todo</span>
            </button>
            <button
              onClick={handlePrintBilling}
              className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-2xs"
              title="Imprimir lista filtrada de cuotas"
            >
              <span className="material-symbols-outlined text-[18px] text-slate-600">print</span>
              <span>Imprimir</span>
            </button>
            <button
              onClick={handleExportBilling}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">file_download</span>
              <span>Exportar Facturación</span>
            </button>
          </div>
        </div>

        {/* SECTION A: Dashboard de KPIs Financieros */}
        <CollapsibleKpiBanner
          storageKey="spr_erp_kpi_facturacion"
          items={[
            {
              title: 'Por Facturar',
              value: `${stats.porFacturar.UF.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} UF`,
              color: 'slate',
              icon: 'calendar_today',
            },
            {
              title: 'Facturado Pendiente',
              value: `${stats.facturadoPendiente.UF.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} UF`,
              color: 'amber',
              icon: 'pending_actions',
            },
            {
              title: 'Total Recaudado',
              value: `${stats.recaudado.UF.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} UF`,
              color: 'emerald',
              icon: 'payments',
            },
          ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 1: Por Facturar */}
            <div className="stat-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Por Facturar</span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                </div>
              </div>
              <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">UF:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.porFacturar.UF.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] font-bold text-emerald-700">UF</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">USD:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.porFacturar.USD.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] font-bold text-blue-700">USD</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">CLP:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    ${stats.porFacturar.CLP.toLocaleString('es-CL', { maximumFractionDigits: 0 })} <span className="text-[10px] font-bold text-teal-700">CLP</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Registros:</span>
                <span className="font-semibold text-slate-600">{stats.porFacturar.count} {stats.porFacturar.count === 1 ? 'cuota' : 'cuotas'}</span>
              </div>
            </div>

            {/* KPI 2: Total Facturado Pendiente de Pago */}
            <div className="stat-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Facturado Pendiente de Pago</span>
                <div className="w-8 h-8 rounded-lg bg-amber-100/60 text-amber-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                </div>
              </div>
              <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">UF:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.facturadoPendiente.UF.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] font-bold text-emerald-700">UF</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">USD:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.facturadoPendiente.USD.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] font-bold text-blue-700">USD</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">CLP:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    ${stats.facturadoPendiente.CLP.toLocaleString('es-CL', { maximumFractionDigits: 0 })} <span className="text-[10px] font-bold text-teal-700">CLP</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>{stats.facturadoPendiente.count} {stats.facturadoPendiente.count === 1 ? 'cuota' : 'cuotas'}</span>
                <span className="font-bold text-amber-700 font-mono">{formatCLP(stats.facturadoPendiente.totalClp)}</span>
              </div>
            </div>

            {/* KPI 3: Total Recaudado */}
            <div className="stat-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Recaudado</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-100/60 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                </div>
              </div>
              <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">UF:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.recaudado.UF.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] font-bold text-emerald-700">UF</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">USD:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.recaudado.USD.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] font-bold text-blue-700">USD</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-slate-500">CLP:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    ${stats.recaudado.CLP.toLocaleString('es-CL', { maximumFractionDigits: 0 })} <span className="text-[10px] font-bold text-teal-700">CLP</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>{stats.recaudado.count} {stats.recaudado.count === 1 ? 'cuota' : 'cuotas'}</span>
                <span className="font-bold text-emerald-700 font-mono">{formatCLP(stats.recaudado.totalClp)}</span>
              </div>
            </div>
          </div>
        </CollapsibleKpiBanner>

        {/* SECTION B: Barra de Filtros y Búsqueda */}
        <div className="card-modern py-2.5 px-4 flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 justify-between">
          {/* Left Side: Buscar and Limpiar */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex flex-col flex-grow max-w-lg min-w-[240px]">
              <div className="relative w-full">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                <input
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all placeholder:text-slate-400"
                  placeholder="N° Presupuesto, Factura, Proyecto o Cliente..."
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            {(searchTerm || temporalFilter !== 'Todos' || statusFilter !== 'Todos' || clientFilter !== 'Todos' || encargadoFilter !== 'Todos' || billingCompanyFilter !== 'Todos') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTemporalFilter('Todos');
                  setStatusFilter('Todos');
                  setClientFilter('Todos');
                  setEncargadoFilter('Todos');
                  setBillingCompanyFilter('Todos');
                }}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-700 hover:bg-slate-50 transition-all text-xs font-semibold cursor-pointer active:scale-95"
                title="Limpiar Filtros"
              >
                <span className="material-symbols-outlined text-[16px]">clear_all</span>
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {/* Right Side: Filters */}
          <div className="flex flex-wrap items-center gap-4 justify-end w-full lg:w-auto">
            {/* Empresa Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Empresa:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                {[
                  { value: 'Todos', label: 'Todas' },
                  { value: 'Spoerer', label: 'Spoerer' },
                  { value: 'FPF', label: 'FPF' }
                ].map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setBillingCompanyFilter(c.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${billingCompanyFilter === c.value
                      ? 'bg-[#091426] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Temporal Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Vencimiento:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                {[
                  { value: '1_mes', label: '1 Mes' },
                  { value: '2_meses', label: '2 Meses' },
                  { value: '3_meses', label: '3 Meses' },
                  { value: 'Todos', label: 'Histórico' }
                ].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setTemporalFilter(p.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${temporalFilter === p.value
                      ? 'bg-[#091426] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Estado Cuota:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                {[
                  { value: 'Todos', label: 'Todos' },
                  { value: 'Por aprobar', label: 'Por aprobar' },
                  { value: 'Aprobada', label: 'Aprobada' },
                  { value: 'Por facturar', label: 'Por facturar' },
                  { value: 'Facturada', label: 'Facturada' },
                  { value: 'Pagada', label: 'Pagada' },
                  { value: 'Anulada', label: 'Anulada' }
                ].map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatusFilter(s.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${statusFilter === s.value
                      ? 'bg-[#091426] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Cliente:</span>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all cursor-pointer max-w-[200px] truncate"
              >
                <option value="Todos">Todos los clientes</option>
                {availableClients.map(clientName => (
                  <option key={clientName} value={clientName}>
                    {clientName}
                  </option>
                ))}
              </select>
            </div>

            {/* Encargado Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Encargado:</span>
              <select
                value={encargadoFilter}
                onChange={(e) => setEncargadoFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all cursor-pointer max-w-[180px] truncate"
              >
                <option value="Todos">Todos los encargados</option>
                {availableEncargados.map(enc => (
                  <option key={enc} value={enc}>
                    {enc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION C: Lista de Facturación Agrupada (Jerárquica) */}
      <div className="space-y-md">
        {groupedData.length > 0 ? (
          groupedData.map(({ id: pId, project, plannedTotalsByCurrency, budgets: projectBudgets }) => {
            const isExpanded = expandedProjects[pId];

            return (
              <div
                key={pId}
                className="bg-white rounded-xl border border-outline-variant/40 shadow-sm transition-all hover:shadow text-left"
              >
                {/* Nivel 1: Tarjeta de Proyecto */}
                <div
                  onClick={() => toggleProject(pId)}
                  className={`p-md sm:p-lg flex flex-col md:flex-row md:items-center justify-between gap-md bg-slate-50 cursor-pointer hover:bg-slate-100/80 transition-colors ${
                    isExpanded ? 'sticky z-20 rounded-t-xl border-b border-slate-200/80 shadow-xs' : 'rounded-xl'
                  }`}
                  style={isExpanded ? { top: `${stickyHeaderOffset}px` } : undefined}
                >
                  <div className="flex items-start gap-md min-w-0">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-1">
                      <span className="material-symbols-outlined text-[20px]">attach_money</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-title-lg text-title-lg text-primary font-bold truncate max-w-lg" title={project.projectName || `${project.projectNumber || ''}-${project.rawProjectName || ''}${project.cliente ? ` - ${project.cliente}` : ''}`}>
                          {project.projectName || `${project.projectNumber || ''}-${project.rawProjectName || ''}${project.cliente ? ` - ${project.cliente}` : ''}`}
                        </h3>
                        {(!budgets || budgets.filter(b => b.projectId === project.id).length === 0) && (
                          <span
                            className="material-symbols-outlined text-amber-500 text-[20px] flex-shrink-0 cursor-help"
                            title="Este proyecto no tiene ningún presupuesto asociado"
                          >
                            warning
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-base gap-y-1 text-body-sm text-on-surface-variant mt-1 items-center font-medium">
                        <span className="font-semibold text-on-surface-variant">
                          {project.cliente || 'Cliente no definido'}
                        </span>
                        <span className="text-outline-variant">•</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1 ${
                          project.billingCompany === 'FPF'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}>
                          <span className="material-symbols-outlined text-[13px]">
                            {project.billingCompany === 'FPF' ? 'account_balance' : 'domain'}
                          </span>
                          {project.billingCompany || 'Spoerer'}
                        </span>
                        {project.anio && (
                          <>
                            <span className="text-outline-variant">•</span>
                            <span>Año {project.anio}</span>
                          </>
                        )}
                        {project.tipo && (
                          <>
                            <span className="text-outline-variant">•</span>
                            <span className="bg-secondary-container text-primary text-[11px] font-bold px-2 py-0.5 rounded-full border border-secondary/20 uppercase tracking-wider">
                              {project.tipo}
                            </span>
                          </>
                        )}
                        {project.encargado && (
                          <>
                            <span className="text-outline-variant">•</span>
                            <span className="bg-slate-100 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px] text-secondary">person</span>
                              Encargado: {project.encargado}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-lg self-end md:self-auto pl-12 md:pl-0">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-outline-variant block uppercase tracking-wider">Total Planificado</span>
                      <div className="text-body-md font-bold text-primary flex flex-wrap justify-end gap-x-2">
                        {plannedTotalsByCurrency && Object.keys(plannedTotalsByCurrency).length > 0 ? (
                          Object.entries(plannedTotalsByCurrency).map(([curr, amt]) => (
                            <span key={curr}>{formatAmountWithCurrency(amt, curr)}</span>
                          ))
                        ) : (
                          <span>0,00 UF</span>
                        )}
                      </div>
                    </div>
                    <div className={`p-2 hover:bg-slate-200/60 rounded text-secondary transition-all flex items-center gap-1 font-bold text-body-sm ${isExpanded ? 'bg-slate-200/60' : ''}`}>
                      <span>{isExpanded ? 'Colapsar' : 'Detalle'}</span>
                      <span className={`material-symbols-outlined transition-all ${isExpanded ? 'rotate-180' : ''}`}>
                        keyboard_arrow_down
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nivel 2: Presupuestos del Proyecto */}
                {isExpanded && (
                  <div className="border-t border-outline-variant/20 p-lg bg-surface-container-lowest divide-y divide-outline-variant/20 space-y-lg rounded-b-xl">
                    {projectBudgets.map(({ id: bId, budget, title, amount, installments: budgetInstallments }) => {
                      const budgetRazonSocial = getBudgetRazonSocial(budget);

                      return (
                        <div key={bId} className="pt-md first:pt-0 space-y-sm">
                          {/* Presupuesto Header */}
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-xs border-b border-outline-variant/10 pb-2 text-slate-800">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                              <span className="text-body-md text-primary font-bold flex items-center gap-xs">
                                <span className="material-symbols-outlined text-[18px] text-outline">description</span>
                                {title}
                              </span>
                              {budgetRazonSocial ? (
                                <div className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant font-medium bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/70">
                                  <span>R. Social: <strong className="font-semibold text-slate-700">{budgetRazonSocial.company}</strong>{budgetRazonSocial.rut ? ` (${budgetRazonSocial.rut})` : ''}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAssignRazonSocialModal(budget, project)}
                                    className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-0.5 rounded transition-all"
                                    title="Cambiar Razón Social del Presupuesto"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">edit</span>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignRazonSocialModal(budget, project)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded text-[11px] font-bold transition-all active:scale-95 shadow-2xs"
                                  title="Este presupuesto no tiene una Razón Social asignada para facturación"
                                >
                                  <span className="material-symbols-outlined text-[14px] text-amber-600 font-bold">warning</span>
                                  <span>Asignar razón social</span>
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-sm flex-wrap">
                              <span className="text-body-sm text-on-surface-variant font-medium">
                                Monto Presupuestado: <strong className="font-semibold text-slate-700">{formatAmountWithCurrency(amount, budget?.currency || 'UF')}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const allBudgetInstallments = installments
                                    .filter(i => i.origin_budget_id === bId)
                                    .sort((a, b) => (a.numQuota || 0) - (b.numQuota || 0));

                                  setActiveBudgetForInstallments({
                                    budget: budget || { id: bId, quoteId: title, amount: amount },
                                    installments: allBudgetInstallments,
                                    project: project
                                  });
                                  setIsInstallmentsModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 border border-primary text-primary hover:bg-primary hover:text-white rounded text-xs font-semibold transition-all active:scale-95 shadow-xs"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit_calendar</span>
                                <span>Editar Cuotas</span>
                              </button>
                            </div>
                          </div>

                          {/* Nivel 3: Tabla de Cuotas */}
                          <div className="overflow-x-auto rounded-lg border border-outline-variant/30">
                            <table className="w-full text-left border-collapse min-w-[1250px]">
                              <thead>
                                <tr className="bg-surface-container-low">
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 w-20">Nº Cuota</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-center w-36">Fecha Confirmada</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30">Fecha Planificada</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-center w-28">OC</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30">Descripción</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30">Comentario</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-right">Monto</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-center">Estado</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30">Folio Factura</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-right">Detalle Pesos (CLP)</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30">Fecha Pago</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-center">Respaldos</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-right">Acciones</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/10 bg-white">
                                {budgetInstallments.map((inst) => {
                                  const totalQuotas = installments.filter(i => i.origin_budget_id === bId && i.status !== 'Anulada').length;
                                  const isOverdue = inst.status === 'Por facturar' && inst.date && inst.date < todayStr;
                                  return (
                                    <tr key={inst.id} className="hover:bg-surface-container-lowest transition-colors text-body-sm">
                                      <td className={`px-md py-md font-semibold ${isOverdue ? 'text-red-600' : 'text-primary'}`}>
                                        <div className="flex flex-col items-start gap-0.5">
                                          <span>{inst.numQuota ? `${inst.numQuota.toString().padStart(2, '0')}/${totalQuotas.toString().padStart(2, '0')}` : '-'}</span>
                                          <span className={`text-[9px] font-bold px-1 rounded uppercase tracking-wider ${
                                            (inst.billingCompany || budget?.billingCompany || project?.billingCompany) === 'FPF'
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                              : 'bg-slate-100 text-slate-700 border border-slate-300'
                                          }`}>
                                            {inst.billingCompany || budget?.billingCompany || project?.billingCompany || 'Spoerer'}
                                          </span>
                                          {inst.legalEntityId && inst.legalEntityId !== (budget?.legalEntityId || budget?.clientId) && (
                                            <span 
                                              className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 max-w-[130px] truncate block"
                                              title={`Razón Social específica: ${clients.find(c => c.id === inst.legalEntityId)?.company || 'N/A'}`}
                                            >
                                              {clients.find(c => c.id === inst.legalEntityId)?.company || 'R.S. Específica'}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td
                                        className="px-md py-md text-center select-none cursor-pointer"
                                        onDoubleClick={() => handleToggleDateConfirmed(inst)}
                                        title="Doble clic para confirmar o desconfirmar fecha"
                                      >
                                        <div className="flex justify-center items-center">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(inst.dateConfirmed)}
                                            readOnly
                                            tabIndex={-1}
                                            className="w-4 h-4 text-secondary accent-secondary rounded border-slate-350 focus:ring-secondary/30 pointer-events-none cursor-pointer"
                                          />
                                        </div>
                                      </td>
                                      <td className={`px-md py-md ${isOverdue ? 'text-red-600 font-semibold' : 'text-on-surface-variant'}`}>
                                        {formatDate(inst.date)}
                                      </td>
                                      <td className="px-md py-md text-on-surface-variant text-body-sm text-center font-medium">
                                        {inst.oc || '-'}
                                      </td>
                                      <td className="px-md py-md text-on-surface-variant text-body-sm max-w-[200px] truncate" title={inst.description || ''}>
                                        {inst.description || '-'}
                                      </td>
                                      <td className="px-md py-md text-on-surface-variant text-body-sm max-w-[200px] truncate" title={inst.comment || ''}>
                                        {inst.comment || '-'}
                                      </td>
                                      <td className={`px-md py-md text-right font-semibold ${isOverdue ? 'text-red-600' : 'text-primary'}`}>
                                        {formatAmountWithCurrency(inst.uf, inst.currency || budget?.currency || 'UF')}
                                      </td>
                                      <td className="px-md py-md text-center">
                                        <span className={`inline-flex items-center px-sm py-xs rounded-full text-[10px] font-bold uppercase border ${
                                          inst.status === 'Pagada'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : (inst.status === 'Facturada' || inst.status === 'Factura emitida')
                                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                                              : inst.status === 'Por facturar'
                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                : inst.status === 'Aprobada'
                                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                  : inst.status === 'Anulada'
                                                    ? 'bg-red-50 text-red-700 border-red-200'
                                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}>
                                          {inst.status}
                                        </span>
                                      </td>
                                      <td className="px-md py-md font-medium text-on-surface-variant">
                                        {inst.invoiceNumber || '-'}
                                      </td>
                                      <td className="px-md py-md text-right">
                                        {(inst.status !== 'Facturada' && inst.status !== 'Factura emitida' && inst.status !== 'Pagada') && (inst.total_clp === null || inst.total_clp === undefined) ? (
                                          <span className="text-outline">-</span>
                                        ) : (
                                          <div className="relative group/tooltip inline-block">
                                            <span className="font-semibold underline decoration-dotted text-primary cursor-help">
                                              {formatCLP(inst.total_clp)}
                                            </span>
                                            {/* Tooltip con desglose */}
                                            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/tooltip:block bg-slate-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl z-50 whitespace-nowrap text-left border border-slate-800">
                                              <div className="font-semibold text-slate-400 border-b border-slate-800 pb-1 mb-1">Cálculo de Pesos ({(inst.billingCompany || project?.billingCompany) === 'FPF' ? 'FPF 0% IVA' : 'Spoerer 19% IVA'})</div>
                                              <p className="flex justify-between gap-4"><span>Neto:</span> <span className="font-mono">{formatCLP(inst.net_clp)}</span></p>
                                              <p className="flex justify-between gap-4"><span>{(inst.billingCompany || project?.billingCompany) === 'FPF' ? 'IVA (0% Exento):' : 'IVA (19%):'}</span> <span className="font-mono">{formatCLP(inst.tax_clp)}</span></p>
                                              <p className="flex justify-between gap-4 border-t border-slate-800 pt-1 mt-1 font-bold text-secondary-fixed-dim"><span>Total:</span> <span className="font-mono">{formatCLP(inst.total_clp)}</span></p>
                                            </div>
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-md py-md text-on-surface-variant">
                                        {formatDate(inst.actualPaymentDate)}
                                      </td>
                                      <td className="px-md py-md text-center">
                                        <div className="flex justify-center items-center gap-xs">
                                          {inst.invoiceFileUrl ? (
                                            <a
                                              href={inst.invoiceFileUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center text-primary hover:text-primary-container p-1 bg-surface-container-high rounded transition-colors"
                                              title="Descargar Factura (PDF)"
                                            >
                                              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                                            </a>
                                          ) : null}
                                          {inst.paymentBackupUrl ? (
                                            <a
                                              href={inst.paymentBackupUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center text-secondary hover:text-secondary-fixed p-1 bg-surface-container-high rounded transition-colors"
                                              title="Ver Comprobante de Pago"
                                            >
                                              <span className="material-symbols-outlined text-[16px]">receipt</span>
                                            </a>
                                          ) : null}
                                          {inst.ocFileUrl ? (
                                            <a
                                              href={inst.ocFileUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center text-amber-700 hover:text-amber-800 p-1 bg-amber-50 rounded transition-colors"
                                              title="Ver Orden de Compra"
                                            >
                                              <span className="material-symbols-outlined text-[16px]">assignment</span>
                                            </a>
                                          ) : null}
                                          {inst.otherFiles && inst.otherFiles.length > 0 && (
                                            inst.otherFiles.map((file, fIdx) => (
                                              <a
                                                key={file.url || fIdx}
                                                href={file.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center text-purple-700 hover:text-purple-800 p-1 bg-purple-50 rounded transition-colors"
                                                title={`Ver otro documento: ${file.name || 'Documento'}`}
                                              >
                                                <span className="material-symbols-outlined text-[16px]">
                                                  {file.name?.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                                                </span>
                                              </a>
                                            ))
                                          )}
                                          {!inst.invoiceFileUrl && !inst.paymentBackupUrl && !inst.ocFileUrl && (!inst.otherFiles || inst.otherFiles.length === 0) ? (
                                            <span className="text-outline">-</span>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="px-md py-md text-right">
                                        {(inst.status === 'Por facturar' || inst.status === 'Aprobada' || inst.status === 'Por aprobar') && (
                                          (() => {
                                            const instRazon = inst.legalEntityId 
                                              ? clients.find(c => c.id === inst.legalEntityId && c.company) 
                                              : budgetRazonSocial;
                                            const isDateConfirmed = Boolean(inst.dateConfirmed);
                                            const hasRazonSocial = Boolean(instRazon);
                                            const isReady = hasRazonSocial && isDateConfirmed;
                                            return (
                                              <button
                                                onClick={() => {
                                                  if (!hasRazonSocial) {
                                                    setTargetBudgetForRazonSocial(budget);
                                                    setTargetProjectForRazonSocial(project);
                                                    setIsNoRazonSocialModalOpen(true);
                                                  } else if (!isDateConfirmed) {
                                                    setIsDateUnconfirmedModalOpen(true);
                                                  } else {
                                                    openEmitModal(inst);
                                                  }
                                                }}
                                                title={
                                                  !hasRazonSocial
                                                    ? "No se puede facturar sin Razón Social asignada. Haga clic para asignar una."
                                                    : !isDateConfirmed
                                                      ? "No se puede facturar sin confirmar la fecha de la cuota."
                                                      : "Emitir Factura"
                                                }
                                                className={`inline-flex items-center gap-xs px-2 py-1 rounded font-semibold transition-all text-[11px] active:scale-95 ${isReady
                                                  ? 'bg-primary text-white hover:bg-primary-container shadow-xs'
                                                  : 'bg-slate-200 text-slate-500 border border-slate-300 hover:bg-slate-300 cursor-pointer'
                                                  }`}
                                              >
                                                <span className="material-symbols-outlined text-[14px]">send</span>
                                                <span>Emitir Factura</span>
                                              </button>
                                            );
                                          })()
                                        )}
                                        {(inst.status === 'Facturada' || inst.status === 'Factura emitida') && (
                                          <button
                                            onClick={() => openPaymentModal(inst)}
                                            className="inline-flex items-center gap-xs px-2 py-1 bg-secondary text-white rounded hover:bg-secondary/90 font-semibold transition-all active:scale-95 text-[11px]"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">price_check</span>
                                            <span>Registrar Pago</span>
                                          </button>
                                        )}
                                        {(inst.status === 'Pagada' || inst.status === 'Anulada') && (
                                          <button
                                            onClick={() => openDetailsModal(inst)}
                                            className="inline-flex items-center gap-xs px-2 py-1 border border-outline text-on-surface-variant rounded hover:bg-surface-container-low font-semibold transition-all active:scale-95 text-[11px]"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">visibility</span>
                                            <span>Detalles</span>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="bg-white border border-outline-variant rounded-xl p-12 text-center text-on-surface-variant italic">
            No se encontraron cuotas de facturación para el filtro seleccionado.
          </div>
        )}
      </div>

      {/* --- MODAL A: Emitir Factura --- */}
      {isEmitModalOpen && selectedInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up text-left border border-outline-variant/30">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">send</span>
                  Emitir Factura
                </h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span>Registrar folio y emisión de factura para la cuota</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEmitModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-on-surface-variant"
                disabled={isSaving}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEmit} className="p-lg space-y-lg text-left">
              <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-xs animate-fade-in text-body-md text-primary">
                <p className="flex justify-between items-center">
                  <span className="text-on-surface-variant font-medium">Cuota Nº:</span>
                  <span className="font-bold">{selectedInstallment.numQuota}</span>
                </p>
                <p className="flex justify-between items-center border-t border-slate-200/40 pt-1 mt-1">
                  <span className="text-on-surface-variant font-medium">Monto Pactado:</span>
                  <span className="font-bold text-secondary">{formatAmountWithCurrency(selectedInstallment.uf, selectedInstallment.currency || 'UF')}</span>
                </p>
                <p className="flex justify-between items-center border-t border-slate-200/40 pt-1 mt-1">
                  <span className="text-on-surface-variant font-medium">Empresa Emisora:</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                    instBillingCompany === 'FPF' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {instBillingCompany} {isExempt ? '(0% IVA)' : '(19% IVA)'}
                  </span>
                </p>
                <p className="flex justify-between items-center border-t border-slate-200/40 pt-1 mt-1">
                  <span className="text-on-surface-variant font-medium">Razón Social:</span>
                  <span className="font-bold text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-800 text-right max-w-[220px] truncate" title={instRazonSocial?.company || 'Sin Razón Social'}>
                    {instRazonSocial?.company || 'Sin Razón Social'} {instRazonSocial?.rut ? `(${instRazonSocial.rut})` : ''}
                  </span>
                </p>
              </div>

              {/* Folio Factura */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Número de Factura (Folio)</label>
                <input
                  type="text"
                  className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-semibold text-primary"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ej: 1482"
                  required
                  disabled={isSaving}
                />
              </div>

              {/* Fecha Emisión */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Fecha de Emisión Real</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={actualInvoiceDate ? actualInvoiceDate.split('-').reverse().join('/') : ''}
                    className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 outline-none transition-all bg-white text-primary font-semibold pr-10"
                    placeholder="dd/mm/yyyy"
                  />
                  <input
                    type="date"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    value={actualInvoiceDate}
                    onChange={(e) => setActualInvoiceDate(e.target.value)}
                    required
                    disabled={isSaving}
                  />
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[20px]">
                    calendar_month
                  </span>
                </div>
              </div>

              {/* Valor UF / Dólar del día */}
              {instCurrency !== 'CLP' ? (
                <div className="space-y-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">
                    {instCurrency === 'USD' ? 'Valor del Dólar del día ($)' : 'Valor de la UF del día ($)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 pl-3 pr-10 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-semibold text-primary"
                      value={ufRate}
                      onChange={(e) => setUfRate(e.target.value)}
                      placeholder={instCurrency === 'USD' ? 'Ej: 950' : 'Ej: 38250'}
                      required
                      disabled={isSaving}
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-xs">
                      {isFetchingUf ? (
                        <span className="animate-spin text-outline-variant text-[18px] material-symbols-outlined">sync</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fetchRateForDate(actualInvoiceDate, instCurrency)}
                          className="text-outline hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-slate-50"
                          title={`Recargar ${instCurrency === 'USD' ? 'Dólar' : 'UF'} de la fecha seleccionada`}
                          disabled={isSaving}
                        >
                          <span className="material-symbols-outlined text-[18px]">sync</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {ufFetchError ? (
                    <p className="text-[10px] text-amber-600 mt-1">
                      No se pudo cargar {instCurrency === 'USD' ? 'el Dólar' : 'la UF'} automáticamente para la fecha seleccionada. Ingrésela manualmente.
                    </p>
                  ) : (
                    !isFetchingUf && ufRate && (
                      <p className="text-[10px] text-secondary font-semibold mt-1">
                        {instCurrency === 'USD' ? 'Dólar cargado' : 'UF cargada'} automáticamente para la fecha de emisión
                      </p>
                    )
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-lg flex items-center gap-2 text-xs text-slate-600">
                  <span className="material-symbols-outlined text-[18px] text-secondary">info</span>
                  <span>La cuota está pactada en Pesos Chilenos (CLP). No requiere tipo de cambio.</span>
                </div>
              )}

              {/* Reactive calculated fields */}
              {(instCurrency === 'CLP' || parsedUfRate > 0) && (
                <div className="bg-slate-50/50 border border-slate-200/60 p-md rounded-xl text-body-sm space-y-1.5">
                  <div className="font-bold text-primary mb-2 text-[11px] uppercase tracking-wider border-b border-slate-200/40 pb-1">
                    Cálculo Estimado CLP {isExempt ? '(0% IVA - FPF)' : '(19% IVA - Spoerer)'}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">Neto:</span>
                    <span className="font-mono font-semibold text-primary">{formatCLP(calculatedNet)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">
                      {isExempt ? 'IVA (0% Exento):' : 'IVA (19%):'}
                    </span>
                    <span className="font-mono font-semibold text-primary">{formatCLP(calculatedTax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1.5 font-bold">
                    <span className="text-primary">{isExempt ? 'Total Factura:' : 'Total Bruto:'}</span>
                    <span className="font-mono text-primary">{formatCLP(calculatedTotal)}</span>
                  </div>
                </div>
              )}

              {/* Local File Upload for Invoice PDF */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Archivo Respaldo Factura (PDF / Imagen)</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:border-secondary focus:ring-1 focus:ring-secondary outline-none text-body-sm file:mr-md file:py-1 file:px-sm file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-secondary file:text-white hover:file:bg-secondary/90 cursor-pointer transition-all"
                  onChange={(e) => setInvoiceFile(e.target.files[0])}
                  disabled={isSaving}
                />
                {selectedInstallment.invoiceFileUrl && (
                  <p className="text-[10px] text-on-surface-variant italic mt-1">
                    Ya existe un archivo cargado. Seleccione uno nuevo solo si desea reemplazarlo.
                  </p>
                )}
              </div>

              {/* Comentarios */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Comentario</label>
                <textarea
                  rows="2"
                  className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                  value={emitComment}
                  onChange={(e) => setEmitComment(e.target.value)}
                  placeholder="Observaciones..."
                  disabled={isSaving}
                />
              </div>

              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant mt-sm">
                <button
                  type="button"
                  onClick={() => setIsEmitModalOpen(false)}
                  className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold active:scale-95"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95 flex items-center gap-xs"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="animate-spin text-[16px] material-symbols-outlined">sync</span>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Registrar Facturación</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL B: Registrar Pago --- */}
      {isPaymentModalOpen && selectedInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up text-left border border-outline-variant/30">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">price_check</span>
                  Registrar Pago de Factura
                </h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Conciliar pago de cuota facturada</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-on-surface-variant"
                disabled={isSaving}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-lg space-y-lg text-left">
              <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-xs animate-fade-in text-body-md text-primary">
                <p className="flex justify-between items-center">
                  <span className="text-on-surface-variant font-medium">Factura Folio:</span>
                  <span className="font-bold">{selectedInstallment.invoiceNumber}</span>
                </p>
                <p className="flex justify-between items-center border-t border-slate-200/40 pt-1 mt-1">
                  <span className="text-on-surface-variant font-medium">Monto Planificado CLP:</span>
                  <span className="font-bold text-secondary">{formatCLP(selectedInstallment.total_clp)}</span>
                </p>
              </div>

              {/* Fecha Pago */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Fecha de Pago Real</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={actualPaymentDate ? actualPaymentDate.split('-').reverse().join('/') : ''}
                    className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 outline-none transition-all bg-white text-primary font-semibold pr-10"
                    placeholder="dd/mm/yyyy"
                  />
                  <input
                    type="date"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    value={actualPaymentDate}
                    onChange={(e) => setActualPaymentDate(e.target.value)}
                    required
                    disabled={isSaving}
                  />
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[20px]">
                    calendar_month
                  </span>
                </div>
              </div>

              {/* Monto Recibido */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Monto Recibido en CLP ($)</label>
                <input
                  type="text"
                  className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-bold text-secondary"
                  value={totalClpReceived}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setTotalClpReceived(raw ? Number(raw).toLocaleString('es-CL') : '');
                  }}
                  placeholder="0"
                  required
                  disabled={isSaving}
                />
                <p className="text-[10px] text-on-surface-variant mt-1">Pre-cargado con el Bruto. Modifique en caso de abonos o reajustes.</p>
              </div>

              {/* Local File Upload for Payment Backup */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Comprobante de Pago (PDF / Imagen)</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:border-secondary focus:ring-1 focus:ring-secondary outline-none text-body-sm file:mr-md file:py-1 file:px-sm file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-secondary file:text-white hover:file:bg-secondary/90 cursor-pointer transition-all"
                  onChange={(e) => setPaymentFile(e.target.files[0])}
                  disabled={isSaving}
                />
                {selectedInstallment.paymentBackupUrl && (
                  <p className="text-[10px] text-on-surface-variant italic mt-1">
                    Ya existe un archivo cargado. Seleccione uno nuevo solo si desea reemplazarlo.
                  </p>
                )}
              </div>

              {/* Comentarios de Cobranza */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Comentario de Cobranza</label>
                <textarea
                  rows="2"
                  className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                  value={paymentComment}
                  onChange={(e) => setPaymentComment(e.target.value)}
                  placeholder="Detalles del depósito o notas..."
                  disabled={isSaving}
                />
              </div>

              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant mt-sm">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold active:scale-95"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95 flex items-center gap-xs"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="animate-spin text-[16px] material-symbols-outlined">sync</span>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Registrar Conciliación</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL C: Ver Detalles (Solo lectura) --- */}
      {isDetailsModalOpen && selectedInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up text-left border border-outline-variant/30">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">visibility</span>
                  Detalles de Cuota Conciliada
                </h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Ver información de cobro y pago</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-on-surface-variant"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-lg space-y-lg text-left text-body-sm">
              <div className="grid grid-cols-2 gap-md border-b border-slate-200/40 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Nº Cuota</span>
                  <span className="text-primary font-bold text-body-md">{selectedInstallment.numQuota || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Estado</span>
                  <div>
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">{selectedInstallment.status}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-md border-b border-slate-200/40 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Monto Planificado</span>
                  <span className="font-semibold text-primary">{formatAmountWithCurrency(selectedInstallment.uf, selectedInstallment.currency || 'UF')}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Empresa</span>
                  <div>
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      (selectedInstallment.billingCompany || 'Spoerer') === 'FPF'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      {selectedInstallment.billingCompany || 'Spoerer'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Folio Factura</span>
                  <span className="font-semibold text-primary">{selectedInstallment.invoiceNumber || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Orden de Compra (OC)</span>
                  <span className="font-semibold text-primary">{selectedInstallment.oc || '-'}</span>
                </div>
              </div>

              {/* Razón Social */}
              <div className="border-b border-slate-200/40 pb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Razón Social Facturada</span>
                <span className="font-semibold text-primary">
                  {(() => {
                    const b = budgets.find(b => b.id === selectedInstallment.origin_budget_id);
                    const targetLegalId = selectedInstallment.legalEntityId || b?.legalEntityId || b?.clientId;
                    const rs = targetLegalId ? clients.find(c => c.id === targetLegalId) : null;
                    return rs ? `${rs.company} (${rs.rut || 'Sin RUT'})` : (b?.company || 'No especificada');
                  })()}
                </span>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 p-md rounded-xl space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-1 border-b border-slate-200/40 pb-1">Desglose Monetario (CLP)</span>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Neto:</span>
                  <span className="font-mono font-medium text-primary">{formatCLP(selectedInstallment.net_clp)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">
                    {selectedInstallment.billingCompany === 'FPF' ? 'IVA (0% Exento):' : 'IVA (19%):'}
                  </span>
                  <span className="font-mono font-medium text-primary">{formatCLP(selectedInstallment.tax_clp)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-200/60 pt-1.5 mt-1.5">
                  <span className="text-primary">Total Recibido:</span>
                  <span className="font-mono text-primary">{formatCLP(selectedInstallment.total_clp)}</span>
                </div>
                {selectedInstallment.currency !== 'CLP' && selectedInstallment.uf > 0 && selectedInstallment.net_clp && (
                  <div className="flex justify-between text-[10px] text-on-surface-variant border-t border-slate-200/20 pt-1 mt-1">
                    <span>{selectedInstallment.currency === 'USD' ? 'Dólar Referencial Aplicado:' : 'UF Referencial Aplicada:'}</span>
                    <span className="font-bold">${Math.round(selectedInstallment.net_clp / selectedInstallment.uf).toLocaleString('es-CL')}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-md border-b border-slate-200/40 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Fecha Emisión Factura</span>
                  <span className="text-on-surface-variant font-semibold">{formatDate(selectedInstallment.actualInvoiceDate)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Fecha Pago Realizado</span>
                  <span className="text-on-surface-variant font-semibold">{formatDate(selectedInstallment.actualPaymentDate)}</span>
                </div>
              </div>

              <div className="space-y-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block">Documentos de Respaldo</span>
                <div className="flex flex-wrap gap-sm">
                  {selectedInstallment.invoiceFileUrl ? (
                    <a
                      href={selectedInstallment.invoiceFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-xs px-md py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-primary font-bold transition-all text-body-sm active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                      <span>Descargar Factura</span>
                    </a>
                  ) : null}
                  {selectedInstallment.paymentBackupUrl ? (
                    <a
                      href={selectedInstallment.paymentBackupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-xs px-md py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-secondary font-bold transition-all text-body-sm active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">receipt</span>
                      <span>Comprobante Pago</span>
                    </a>
                  ) : null}
                  {selectedInstallment.ocFileUrl ? (
                    <a
                      href={selectedInstallment.ocFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-xs px-md py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-amber-700 font-bold transition-all text-body-sm active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">assignment</span>
                      <span>Orden de Compra</span>
                    </a>
                  ) : null}
                  {selectedInstallment.otherFiles && selectedInstallment.otherFiles.length > 0 ? (
                    selectedInstallment.otherFiles.map((file, fIdx) => (
                      <a
                        key={file.url || fIdx}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-xs px-md py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-purple-700 font-bold transition-all text-body-sm active:scale-95"
                        title={file.name || 'Otro Documento'}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {file.name?.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                        </span>
                        <span className="truncate max-w-[170px]">{file.name || 'Otro Documento'}</span>
                      </a>
                    ))
                  ) : null}
                  {!selectedInstallment.invoiceFileUrl && !selectedInstallment.paymentBackupUrl && !selectedInstallment.ocFileUrl && (!selectedInstallment.otherFiles || selectedInstallment.otherFiles.length === 0) ? (
                    <span className="text-on-surface-variant italic text-body-sm">No se subieron respaldos para esta cuota.</span>
                  ) : null}
                </div>
              </div>

              {(selectedInstallment.description || selectedInstallment.comment) && (
                <div className="space-y-xs border-t border-slate-200/40 pt-3">
                  {selectedInstallment.description && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-1">Descripción de Hito</span>
                      <p className="bg-slate-50/50 p-sm rounded-lg border border-slate-200/40 text-on-surface-variant font-medium">
                        {selectedInstallment.description}
                      </p>
                    </div>
                  )}
                  {selectedInstallment.comment && (
                    <div className="mt-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-1">Notas / Observaciones</span>
                      <p className="bg-slate-50/50 p-sm rounded-lg border border-slate-200/40 text-on-surface-variant italic">
                        {selectedInstallment.comment}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-lg border-t border-outline-variant mt-sm">
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold active:scale-95"
                >
                  Cerrar Detalles
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Installments Modal */}
      {isInstallmentsModalOpen && activeBudgetForInstallments && (
        <InstallmentsModal
          isOpen={isInstallmentsModalOpen}
          onClose={() => {
            setIsInstallmentsModalOpen(false);
            setActiveBudgetForInstallments(null);
          }}
          projectName={activeBudgetForInstallments.project.projectName || `${activeBudgetForInstallments.project.projectNumber} - ${activeBudgetForInstallments.project.rawProjectName} - ${activeBudgetForInstallments.project.cliente}`}
          budgetNumber={activeBudgetForInstallments.budget.quoteId}
          budgetAmount={activeBudgetForInstallments.budget.amount}
          currency={activeBudgetForInstallments?.budget?.currency || 'UF'}
          billingCompany={activeBudgetForInstallments?.project?.billingCompany || activeBudgetForInstallments?.budget?.billingCompany || 'Spoerer'}
          budgetBackupFiles={activeBudgetForInstallments.budget.backupFiles}
          initialInstallments={activeBudgetForInstallments.installments}
          clients={clients}
          legalEntityId={activeBudgetForInstallments?.budget?.legalEntityId || activeBudgetForInstallments?.budget?.clientId || null}
          onSave={async (updated) => {
            await onSaveInstallments(activeBudgetForInstallments.budget.id, updated);
          }}
          projectNumber={activeBudgetForInstallments.project.projectNumber}
          isDeferredSave={false}
        />
      )}

      {/* Modal Advertencia: Falta Razón Social */}
      {isNoRazonSocialModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up text-left overflow-hidden">
            <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                Razón Social Requerida
              </h3>
              <button
                type="button"
                onClick={() => setIsNoRazonSocialModalOpen(false)}
                className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-lg space-y-md text-left">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto shadow-xs mb-2">
                <span className="material-symbols-outlined text-[32px]">domain_disabled</span>
              </div>
              <p className="text-body-md text-on-surface font-medium text-center">
                Para poder emitir una factura, primero debe asignar una <strong>Razón Social</strong> con RUT al presupuesto correspondiente.
              </p>
              {(targetBudgetForRazonSocial || targetProjectForRazonSocial) && (
                <div className="bg-slate-50 p-sm rounded-lg border border-slate-200 text-xs text-slate-600 font-medium text-center space-y-0.5">
                  {targetProjectForRazonSocial && (
                    <div>Proyecto: <span className="font-bold text-slate-800">{targetProjectForRazonSocial.projectName || `${targetProjectForRazonSocial.projectNumber}-${targetProjectForRazonSocial.rawProjectName} - ${targetProjectForRazonSocial.cliente}`}</span></div>
                  )}
                  {targetBudgetForRazonSocial && (
                    <div>Presupuesto: <span className="font-bold text-slate-800">#{targetBudgetForRazonSocial.quoteId} - {targetBudgetForRazonSocial.title}</span></div>
                  )}
                </div>
              )}
            </div>

            <div className="px-lg py-md bg-slate-50 border-t border-outline-variant/30 flex justify-end gap-md">
              <button
                type="button"
                onClick={() => setIsNoRazonSocialModalOpen(false)}
                className="px-lg py-2 border border-outline-variant rounded-lg font-semibold text-on-surface-variant hover:bg-white transition-all text-xs active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNoRazonSocialModalOpen(false);
                  handleOpenAssignRazonSocialModal(targetBudgetForRazonSocial, targetProjectForRazonSocial);
                }}
                className="px-lg py-2 bg-primary text-white rounded-lg font-bold shadow-xs hover:bg-primary-container active:scale-95 transition-all text-xs flex items-center gap-xs"
              >
                <span className="material-symbols-outlined text-[16px]">domain_add</span>
                <span>Asignar Razón Social</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Advertencia: Fecha No Confirmada */}
      {isDateUnconfirmedModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up text-left overflow-hidden">
            <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">event_busy</span>
                Fecha No Confirmada
              </h3>
              <button
                type="button"
                onClick={() => setIsDateUnconfirmedModalOpen(false)}
                className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-lg space-y-md text-left">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto shadow-xs mb-2">
                <span className="material-symbols-outlined text-[32px]">calendar_month</span>
              </div>
              <p className="text-body-md text-on-surface font-medium text-center">
                Esta cuota no tiene su fecha confirmada. Debe confirmar la fecha de la cuota antes de poder emitir la factura.
              </p>
            </div>

            <div className="px-lg py-md bg-slate-50 border-t border-outline-variant/30 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDateUnconfirmedModalOpen(false)}
                className="px-xl py-2 bg-primary text-white rounded-lg font-bold shadow-xs hover:bg-primary-container active:scale-95 transition-all text-xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Asignar Razón Social */}
      {isAssignRazonSocialModalOpen && (targetBudgetForRazonSocial || targetProjectForRazonSocial) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Header */}
            <div className="bg-primary text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center text-amber-400 font-bold">
                  <span className="material-symbols-outlined text-[22px]">domain_add</span>
                </div>
                <div>
                  <h3 className="font-title-md text-title-md font-bold text-white">Asignar Razón Social para Facturación</h3>
                  <p className="text-xs text-slate-300">
                    {targetBudgetForRazonSocial 
                      ? `Presupuesto #${targetBudgetForRazonSocial.quoteId} - ${targetBudgetForRazonSocial.title}` 
                      : `Proyecto: ${targetProjectForRazonSocial?.projectName || `${targetProjectForRazonSocial?.projectNumber}-${targetProjectForRazonSocial?.rawProjectName} - ${targetProjectForRazonSocial?.cliente}`}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignRazonSocialModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {assignError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{assignError}</span>
                </div>
              )}

              {/* Tabs Mode */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => { setAssignMode('select'); setAssignError(''); }}
                  className={`pb-2.5 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 ${assignMode === 'select'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                  <span className="material-symbols-outlined text-[16px]">list</span>
                  <span>Seleccionar Existente</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setAssignMode('create'); setAssignError(''); }}
                  className={`pb-2.5 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 ${assignMode === 'create'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                  <span className="material-symbols-outlined text-[16px]">add_business</span>
                  <span>+ Registrar Nueva Razón Social</span>
                </button>
              </div>

              {/* Mode: Select Existing */}
              {assignMode === 'select' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Buscar Razón Social o RUT
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={razonSocialSearch}
                        onChange={(e) => setRazonSocialSearch(e.target.value)}
                        placeholder="Ej: Constructora Spoerer, 76.123.456-7..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      />
                      <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-[18px]">
                        search
                      </span>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                    {(() => {
                      const term = razonSocialSearch.toLowerCase().trim();
                      const filtered = clients.filter(c => {
                        if (!c.company) return false;
                        if (!term) return true;
                        return (
                          (c.company && c.company.toLowerCase().includes(term)) ||
                          (c.rut && c.rut.toLowerCase().includes(term)) ||
                          (c.realClient && c.realClient.toLowerCase().includes(term))
                        );
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="p-4 text-center text-slate-500 text-xs italic">
                            No se encontraron razones sociales. Puede registrar una nueva en la pestaña "+ Registrar Nueva Razón Social".
                          </div>
                        );
                      }

                      return filtered.map(client => {
                        const isSelected = selectedRazonSocialId === client.id;
                        const currentMainClientId = targetBudgetForRazonSocial?.mainClientId || targetProjectForRazonSocial?.mainClientId;
                        const isSameMainClient = currentMainClientId && client.mainClientId === currentMainClientId;

                        return (
                          <div
                            key={client.id}
                            onClick={() => setSelectedRazonSocialId(client.id)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${isSelected
                              ? 'bg-primary/5 border-primary shadow-2xs ring-1 ring-primary/20'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-primary">{client.company}</span>
                                {client.rut && (
                                  <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                                    {client.rut}
                                  </span>
                                )}
                                {isSameMainClient && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">
                                    Sugerido
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                                {client.giro && <span>Giro: {client.giro}</span>}
                                {client.address && <span>Dirección: {client.address} {client.comuna ? `, ${client.comuna}` : ''}</span>}
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300'
                              }`}>
                              {isSelected && <span className="material-symbols-outlined text-[14px]">check</span>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Mode: Create New */}
              {assignMode === 'create' && (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Razón Social / Nombre Empresa <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newRazonSocialCompany}
                        onChange={(e) => setNewRazonSocialCompany(e.target.value)}
                        placeholder="Ej: Constructora Spoerer S.A."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        RUT Empresa
                      </label>
                      <input
                        type="text"
                        value={newRazonSocialRut}
                        onChange={(e) => setNewRazonSocialRut(formatRut(e.target.value))}
                        placeholder="76.123.456-7"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Giro Comercial
                      </label>
                      <input
                        type="text"
                        value={newRazonSocialGiro}
                        onChange={(e) => setNewRazonSocialGiro(e.target.value)}
                        placeholder="Ej: Construcción e Ingeniería"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Dirección Comercial
                      </label>
                      <input
                        type="text"
                        value={newRazonSocialAddress}
                        onChange={(e) => setNewRazonSocialAddress(e.target.value)}
                        placeholder="Ej: Av. Providencia 1234, Of. 501"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Comuna
                      </label>
                      <input
                        type="text"
                        value={newRazonSocialComuna}
                        onChange={(e) => setNewRazonSocialComuna(e.target.value)}
                        placeholder="Ej: Providencia"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Ciudad
                      </label>
                      <input
                        type="text"
                        value={newRazonSocialCiudad}
                        onChange={(e) => setNewRazonSocialCiudad(e.target.value)}
                        placeholder="Ej: Santiago"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAssignRazonSocialModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingRazonSocial}
                onClick={handleSaveAssignRazonSocial}
                className="px-5 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 active:scale-95 shadow-sm disabled:opacity-50"
              >
                {isSavingRazonSocial ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Guardar y Asignar Razón Social</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
