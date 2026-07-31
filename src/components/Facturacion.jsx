import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import * as XLSX from 'xlsx';
import InstallmentsModal from './InstallmentsModal';

export default function Facturacion({
  projects,
  budgets,
  installments,
  clients,
  onUpdateInstallment,
  onSaveInstallments,
  temporalFilter,
  setTemporalFilter,
  statusFilter,
  setStatusFilter,
  clientFilter,
  setClientFilter,
  searchTerm,
  setSearchTerm
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // --- EXPANSION STATE ---
  const [expandedProjects, setExpandedProjects] = useState({});

  // --- MODALS STATE ---
  const [isEmitModalOpen, setIsEmitModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState(null);

  // Installments unified modal state
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [activeBudgetForInstallments, setActiveBudgetForInstallments] = useState(null);

  // --- FORM STATES ---
  const [isSaving, setIsSaving] = useState(false);
  
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
    if (period === 'Todos') return true;
    if (!dateStr) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(dateStr + 'T12:00:00'); // avoid timezone shifts
    const diffTime = targetDate - today;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (period === '1_mes') {
      return Math.abs(diffDays) <= 30;
    }
    if (period === '6_meses') {
      return Math.abs(diffDays) <= 180;
    }
    if (period === '12_meses') {
      return Math.abs(diffDays) <= 365;
    }
    return true;
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

  // --- UF AUTO-FETCHING ---
  const fetchTodayUf = async () => {
    setIsFetchingUf(true);
    setUfFetchError(false);
    try {
      const res = await fetch('https://mindicador.cl/api/uf');
      if (!res.ok) throw new Error('Error al conectar con el servidor de UF');
      const data = await res.json();
      if (data.serie && data.serie.length > 0) {
        const rate = data.serie[0].valor;
        setUfRate(rate.toString());
      } else {
        throw new Error('Formato de datos no esperado');
      }
    } catch (err) {
      console.error("Error fetching UF:", err);
      setUfFetchError(true);
    } finally {
      setIsFetchingUf(false);
    }
  };

  // Fetch UF rate automatically when Emit Invoice Modal is opened
  useEffect(() => {
    if (isEmitModalOpen && selectedInstallment) {
      fetchTodayUf();
    }
  }, [isEmitModalOpen, selectedInstallment]);

  // --- DYNAMIC CALCULATIONS FOR EMIT MODAL ---
  const plannedUf = selectedInstallment ? parseFloat(selectedInstallment.uf) || 0 : 0;
  const parsedUfRate = parseFloat(ufRate) || 0;
  const calculatedNet = Math.round(plannedUf * parsedUfRate);
  const calculatedTax = Math.round(calculatedNet * 0.19);
  const calculatedTotal = calculatedNet + calculatedTax;

  // --- FILTERED INSTALLMENTS ---
  const filteredInstallments = useMemo(() => {
    return installments.filter(inst => {
      // 1. Temporal Filter
      if (!filterPeriod(inst.date, temporalFilter)) return false;

      // 2. Status Filter
      if (statusFilter === 'Vencida') {
        const isOverdue = inst.status === 'Por facturar' && inst.date && inst.date < todayStr;
        if (!isOverdue) return false;
      } else if (statusFilter !== 'Todos' && inst.status !== statusFilter) {
        return false;
      }

      // Find associated project to retrieve client ID
      const project = projects.find(p => p.id === inst.project_id);
      const clientId = project?.clientId || null;

      // 3. Client Filter
      if (clientFilter !== 'Todos' && clientId !== clientFilter) return false;

      // 4. Text Search
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        
        const projectCode = project?.projectNumber?.toLowerCase() || '';
        const projectName = project?.rawProjectName?.toLowerCase() || '';
        
        const client = clients.find(c => c.id === clientId);
        const clientCompany = client?.company?.toLowerCase() || '';
        const clientName = client?.name?.toLowerCase() || '';
        const projectClient = project?.cliente?.toLowerCase() || '';
        
        const invNum = inst.invoiceNumber?.toLowerCase() || '';

        const matchesProject = projectCode.includes(term) || projectName.includes(term);
        const matchesClient = clientCompany.includes(term) || clientName.includes(term) || projectClient.includes(term);
        const matchesInvoice = invNum.includes(term);

        if (!matchesProject && !matchesClient && !matchesInvoice) return false;
      }

      return true;
    });
  }, [installments, projects, clients, temporalFilter, statusFilter, clientFilter, searchTerm, todayStr]);

  // --- DYNAMIC KPIs (Adjust to all selected filters) ---
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    let totalPorFacturarUf = 0;
    let totalFacturadoPendienteClp = 0;
    let totalRecaudadoClp = 0;
    let totalVencidoUf = 0;

    filteredInstallments.forEach(inst => {
      const isUnpaid = inst.status === 'Por facturar' || inst.status === 'Factura emitida';
      const isExpired = inst.date && inst.date < todayStr;

      if (inst.status === 'Por facturar') {
        totalPorFacturarUf += parseFloat(inst.uf) || 0;
      } else if (inst.status === 'Factura emitida') {
        totalFacturadoPendienteClp += parseFloat(inst.total_clp) || 0;
      } else if (inst.status === 'Pagada') {
        totalRecaudadoClp += parseFloat(inst.total_clp) || 0;
      }

      if (isUnpaid && isExpired) {
        totalVencidoUf += parseFloat(inst.uf) || 0;
      }
    });

    return {
      totalPorFacturarUf,
      totalFacturadoPendienteClp,
      totalRecaudadoClp,
      totalVencidoUf
    };
  }, [filteredInstallments]);

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
      let projectPlannedTotalUf = 0;

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

        const budgetTotalUf = budgetInstallments.reduce((sum, inst) => sum + (inst.uf || 0), 0);
        projectPlannedTotalUf += budgetTotalUf;

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
        plannedTotalUf: projectPlannedTotalUf,
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

  // Export Billing Installments to Excel
  const handleExportBilling = () => {
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
      // Find associated client
      const client = project ? clients.find(c => c.id === project.clientId) : null;

      // Calculate total installments for this budget
      const budgetInstallments = budget ? installments.filter(i => i.origin_budget_id === budget.id) : [];
      const totCuotas = budgetInstallments.length;

      // Format date fields
      let yearVal = '';
      if (installment.date) {
        yearVal = installment.date.split('-')[0];
      }

      // Check if invoiced (Facturada): status is 'Factura emitida' or 'Pagada'
      const isInvoiced = installment.status === 'Factura emitida' || installment.status === 'Pagada';
      const isPaid = installment.status === 'Pagada';

      rows.push({
        "Presupuesto #": budget ? budget.quoteId || '' : '',
        "Factura #": installment.invoiceNumber || '',
        "Fecha": formatDateExcel(installment.date),
        "Año": yearVal,
        "Año Proy": project ? project.anio || '' : '',
        "RUT": client ? client.rut || '' : '',
        "Razón Social": client ? client.company || '' : '',
        "Giro": client ? client.giro || '' : '',
        "Dirección": client ? client.address || '' : '',
        "Comuna": client ? client.comuna || '' : '',
        "Ciudad": client ? client.ciudad || '' : '',
        "Contacto": client ? client.name || '' : '',
        "Obra": project ? project.rawProjectName || '' : '',
        "Comentario": installment.comment || '',
        "Cuota": installment.numQuota || '',
        "TotCuota": totCuotas || '',
        "UF": parseFloat(installment.uf) || 0,
        "$": isInvoiced ? parseFloat(installment.total_clp) || 0 : '',
        "F-Pago": isPaid ? formatDateExcel(installment.actualPaymentDate) : '',
        "Estado F#": installment.status || '',
        "Tipo": '',
        "Cliente": client ? (client.company || client.name || '') : (project ? project.cliente : ''),
        "N° Proyecto": project ? project.projectNumber || '' : '',
        "Revisor": '',
        "Firma": '',
        "Gerente Proyecto": '',
        "Ingeniero": '',
        "Dibujante": '',
        "M2": project ? parseFloat(project.superficie) || 0 : 0,
        "Total UF": budget ? parseFloat(budget.amount) || 0 : 0
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
        "Comentario",
        "Cuota",
        "TotCuota",
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
        "Total UF"
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
    XLSX.writeFile(workbook, "Reporte_Facturacion.xlsx");
  };

  // --- MODAL TRIGGERS ---
  const openEmitModal = (installment) => {
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
    if (!ufRate || isNaN(parseFloat(ufRate))) {
      alert("Por favor, ingrese un valor de UF válido.");
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
        status: 'Factura emitida',
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

  return (
    <div className="space-y-xl animate-fade-in text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary font-bold">Centro de Cobranzas</h2>
          <p className="text-on-surface-variant font-body-md mt-1">Gestión de cuotas de facturación y conciliación de pagos</p>
        </div>
        <div className="flex gap-sm">
          <button 
            onClick={expandAll}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant bg-white hover:bg-slate-50 text-on-surface font-semibold rounded transition-all active:scale-95 font-label-md"
          >
            <span className="material-symbols-outlined text-[18px]">unfold_more</span>
            <span>Expandir Todo</span>
          </button>
          <button 
            onClick={collapseAll}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant bg-white hover:bg-slate-50 text-on-surface font-semibold rounded transition-all active:scale-95 font-label-md"
          >
            <span className="material-symbols-outlined text-[18px]">unfold_less</span>
            <span>Colapsar Todo</span>
          </button>
          <button 
            onClick={handleExportBilling}
            className="flex items-center gap-2 px-md py-2 bg-secondary text-white font-bold rounded hover:brightness-105 transition-all font-label-md active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            <span>Exportar Facturación</span>
          </button>
        </div>
      </div>

      {/* SECTION A: Dashboard de KPIs Financieros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        {/* KPI 1: Total por Facturar (UF) */}
        <div className="bg-slate-50/40 border border-slate-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-slate-800 uppercase font-bold tracking-wider">Por Facturar (Planificado)</span>
            <div className="font-display-lg text-[34px] text-slate-950 font-extrabold">
              {formatUF(stats.totalPorFacturarUf, 0)}
            </div>
          </div>
          <div className="p-3 bg-slate-100 rounded-full text-slate-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">calendar_today</span>
          </div>
        </div>

        {/* KPI 2: Total Facturado Pendiente (CLP) */}
        <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-amber-800 uppercase font-bold tracking-wider font-semibold">Facturado Pendiente</span>
            <div className="font-display-lg text-[34px] text-amber-950 font-extrabold">
              {formatCLP(stats.totalFacturadoPendienteClp)}
            </div>
          </div>
          <div className="p-3 bg-amber-100 rounded-full text-amber-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">pending_actions</span>
          </div>
        </div>

        {/* KPI 3: Total Recaudado (CLP) */}
        <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-emerald-800 uppercase font-bold tracking-wider font-semibold">Total Recaudado</span>
            <div className="font-display-lg text-[34px] text-emerald-950 font-extrabold">
              {formatCLP(stats.totalRecaudadoClp)}
            </div>
          </div>
          <div className="p-3 bg-emerald-100 rounded-full text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">payments</span>
          </div>
        </div>

        {/* KPI 4: Vencimientos Atrasados (UF) */}
        <div className="bg-red-50/40 border border-red-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-red-800 uppercase font-bold tracking-wider font-bold">Vencido Atrasado</span>
            <div className="font-display-lg text-[34px] text-red-950 font-extrabold">
              {formatUF(stats.totalVencidoUf, 0)}
            </div>
          </div>
          <div className="p-3 bg-red-100 rounded-full text-red-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          </div>
        </div>
      </div>
      {/* SECTION B: Barra de Filtros y Búsqueda */}
      <section className="glass-card rounded-xl p-md flex flex-col lg:flex-row items-stretch lg:items-end gap-md justify-between shadow-sm">
        {/* Left Side: Buscar and Limpiar */}
        <div className="flex flex-wrap items-end gap-md w-full lg:w-auto">
          <div className="flex flex-col flex-grow max-w-5xl min-w-[240px]">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">Búsqueda General</label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
              <input 
                className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:border-outline-none h-[38px]" 
                placeholder="Factura, Proyecto o Cliente..." 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={() => { setSearchTerm(''); setTemporalFilter('Todos'); setStatusFilter('Todos'); setClientFilter('Todos'); }}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant rounded bg-white text-on-surface hover:bg-slate-50 transition-all font-label-md active:scale-95 h-[38px]"
            title="Limpiar Filtros"
          >
            <span className="material-symbols-outlined text-[16px]">clear_all</span>
            <span>Limpiar</span>
          </button>
        </div>

        {/* Right Side: Filters */}
        <div className="flex flex-wrap items-end gap-md justify-end w-full lg:w-auto">
          {/* Temporal Filter */}
          <div className="flex flex-col">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">Período de Vencimiento</label>
            <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant">
              {[
                { value: '1_mes', label: '1 Mes' },
                { value: '6_meses', label: '6 Meses' },
                { value: '12_meses', label: '12 Meses' },
                { value: 'Todos', label: 'Histórico' }
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setTemporalFilter(p.value)}
                  className={`px-sm py-1.5 rounded text-xs font-semibold transition-all ${
                    temporalFilter === p.value 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">Estado Cuota</label>
            <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant">
              {[
                { value: 'Todos', label: 'Todos' },
                { value: 'Por facturar', label: 'Por facturar' },
                { value: 'Vencida', label: 'Vencidas' },
                { value: 'Factura emitida', label: 'Factura emitida' },
                { value: 'Pagada', label: 'Pagada' }
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusFilter(s.value)}
                  className={`px-sm py-1.5 rounded text-xs font-semibold transition-all ${
                    statusFilter === s.value 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Client Filter */}
          <div className="flex flex-col">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">Cliente</label>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-md py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:border-outline-none h-[38px] max-w-[220px] font-medium text-on-surface"
            >
              <option value="Todos">Todos los clientes</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company || c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* SECTION C: Lista de Facturación Agrupada (Jerárquica) */}
      <div className="space-y-md">
        {groupedData.length > 0 ? (
          groupedData.map(({ id: pId, project, plannedTotalUf, budgets: projectBudgets }) => {
            const isExpanded = expandedProjects[pId];
            return (
              <div 
                key={pId} 
                className="bg-white rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden transition-all hover:shadow text-left"
              >
                {/* Nivel 1: Tarjeta de Proyecto */}
                <div 
                  onClick={() => toggleProject(pId)}
                  className="p-md sm:p-lg flex flex-col md:flex-row md:items-center justify-between gap-md bg-slate-50/50 cursor-pointer hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-start gap-md min-w-0">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-1">
                      <span className="material-symbols-outlined text-[20px]">attach_money</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <h3 className="font-title-lg text-title-lg text-primary font-bold truncate max-w-lg" title={`${project.projectNumber} - ${project.rawProjectName}`}>
                        {project.projectNumber} - {project.rawProjectName}
                      </h3>
                      <div className="flex flex-wrap gap-x-base gap-y-1 text-body-sm text-on-surface-variant mt-1 items-center font-medium">
                        <span className="font-semibold text-on-surface-variant">
                          {project.cliente || 'Cliente no definido'}
                        </span>
                        {project.anio && (
                          <>
                            <span className="text-outline-variant">•</span>
                            <span>Año {project.anio}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-lg self-end md:self-auto pl-12 md:pl-0">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-outline-variant block uppercase tracking-wider">Total UF Filtrado</span>
                      <span className="text-body-md font-bold text-primary">{formatUF(plannedTotalUf)}</span>
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
                  <div className="border-t border-outline-variant/20 p-lg bg-surface-container-lowest divide-y divide-outline-variant/20 space-y-lg">
                    {projectBudgets.map(({ id: bId, budget, title, amount, installments: budgetInstallments }) => {
                      return (
                        <div key={bId} className="pt-md first:pt-0 space-y-sm">
                          {/* Presupuesto Header */}
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-xs border-b border-outline-variant/10 pb-2 text-slate-800">
                            <span className="text-body-md text-primary font-bold flex items-center gap-xs">
                              <span className="material-symbols-outlined text-[18px] text-outline">description</span>
                              {title}
                            </span>
                            <div className="flex items-center gap-sm flex-wrap">
                              <span className="text-body-sm text-on-surface-variant font-medium">
                                Monto Presupuestado: <strong className="font-semibold text-slate-700">{formatCLP(amount)}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveBudgetForInstallments({
                                    budget: budget,
                                    installments: budgetInstallments,
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
                            <table className="w-full text-left border-collapse min-w-[850px]">
                              <thead>
                                <tr className="bg-surface-container-low">
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 w-24">Nº Cuota</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30">Fecha Planificada</th>
                                  <th className="px-md py-sm font-label-md text-label-md text-on-surface-variant border-b border-outline-variant/30 text-right">Monto (UF)</th>
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
                                  const totalQuotas = installments.filter(i => i.origin_budget_id === bId).length;
                                  const isOverdue = inst.status === 'Por facturar' && inst.date && inst.date < todayStr;
                                  return (
                                    <tr key={inst.id} className="hover:bg-surface-container-lowest transition-colors text-body-sm">
                                      <td className={`px-md py-md font-semibold ${isOverdue ? 'text-red-600' : 'text-primary'}`}>
                                        {inst.numQuota ? `${inst.numQuota.toString().padStart(2, '0')}/${totalQuotas.toString().padStart(2, '0')}` : '-'}
                                      </td>
                                      <td className={`px-md py-md ${isOverdue ? 'text-red-600 font-semibold' : 'text-on-surface-variant'}`}>
                                        <div className="flex items-center gap-1">
                                          <span>{formatDate(inst.date)}</span>
                                          {inst.dateConfirmed && (
                                            <span className="material-symbols-outlined text-[15px] text-emerald-600 font-bold" title="Fecha Confirmada">
                                              verified
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className={`px-md py-md text-right font-semibold ${isOverdue ? 'text-red-600' : 'text-primary'}`}>
                                        {formatUF(inst.uf)}
                                      </td>
                                      <td className="px-md py-md text-center">
                                        <span className={`inline-flex items-center px-sm py-xs rounded-full text-[10px] font-bold uppercase border ${
                                          inst.status === 'Pagada'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : inst.status === 'Factura emitida'
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}>
                                          {inst.status}
                                        </span>
                                      </td>
                                      <td className="px-md py-md font-medium text-on-surface-variant">
                                        {inst.invoiceNumber || '-'}
                                      </td>
                                      <td className="px-md py-md text-right">
                                        {inst.status === 'Por facturar' ? (
                                          <span className="text-outline">-</span>
                                        ) : (
                                          <div className="relative group/tooltip inline-block">
                                            <span className="font-semibold underline decoration-dotted text-primary cursor-help">
                                              {formatCLP(inst.total_clp)}
                                            </span>
                                            {/* Tooltip con desglose */}
                                            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/tooltip:block bg-slate-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl z-50 whitespace-nowrap text-left border border-slate-800">
                                              <div className="font-semibold text-slate-400 border-b border-slate-800 pb-1 mb-1">Cálculo de Pesos</div>
                                              <p className="flex justify-between gap-4"><span>Neto:</span> <span className="font-mono">{formatCLP(inst.net_clp)}</span></p>
                                              <p className="flex justify-between gap-4"><span>IVA (19%):</span> <span className="font-mono">{formatCLP(inst.tax_clp)}</span></p>
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
                                          {!inst.invoiceFileUrl && !inst.paymentBackupUrl ? (
                                            <span className="text-outline">-</span>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="px-md py-md text-right">
                                        {inst.status === 'Por facturar' && (
                                          <button
                                            onClick={() => openEmitModal(inst)}
                                            className="inline-flex items-center gap-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary-container font-semibold transition-all active:scale-95 text-[11px]"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">send</span>
                                            <span>Emitir Factura</span>
                                          </button>
                                        )}
                                        {inst.status === 'Factura emitida' && (
                                          <button
                                            onClick={() => openPaymentModal(inst)}
                                            className="inline-flex items-center gap-xs px-2 py-1 bg-secondary text-white rounded hover:bg-secondary/90 font-semibold transition-all active:scale-95 text-[11px]"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">price_check</span>
                                            <span>Registrar Pago</span>
                                          </button>
                                        )}
                                        {inst.status === 'Pagada' && (
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
                  <span className="font-bold text-secondary">{formatUF(selectedInstallment.uf)}</span>
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

              {/* Valor UF del dia (Fetch proposal) */}
              <div className="space-y-xs">
                <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold block">Valor de la UF del día ($)</label>
                <div className="relative">
                  <input 
                    type="number"
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 pl-3 pr-10 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-semibold text-primary"
                    value={ufRate}
                    onChange={(e) => setUfRate(e.target.value)}
                    placeholder="Ej: 38250"
                    required
                    disabled={isSaving}
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-xs">
                    {isFetchingUf ? (
                      <span className="animate-spin text-outline-variant text-[18px] material-symbols-outlined">sync</span>
                    ) : (
                      <button 
                        type="button"
                        onClick={fetchTodayUf}
                        className="text-outline hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-slate-50"
                        title="Recargar UF del día"
                        disabled={isSaving}
                      >
                        <span className="material-symbols-outlined text-[18px]">sync</span>
                      </button>
                    )}
                  </div>
                </div>
                {ufFetchError ? (
                  <p className="text-[10px] text-amber-600 mt-1">No se pudo cargar la UF automáticamente. Ingrésela manualmente.</p>
                ) : (
                  !isFetchingUf && ufRate && (
                    <p className="text-[10px] text-secondary font-semibold mt-1">UF cargada automáticamente para hoy</p>
                  )
                )}
              </div>

              {/* Reactive calculated fields */}
              {parsedUfRate > 0 && (
                <div className="bg-slate-50/50 border border-slate-200/60 p-md rounded-xl text-body-sm space-y-1.5">
                  <div className="font-bold text-primary mb-2 text-[11px] uppercase tracking-wider border-b border-slate-200/40 pb-1">Cálculo Estimado CLP (19% IVA)</div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">Neto:</span>
                    <span className="font-mono font-semibold text-primary">{formatCLP(calculatedNet)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">IVA (19%):</span>
                    <span className="font-mono font-semibold text-primary">{formatCLP(calculatedTax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1.5 font-bold">
                    <span className="text-primary">Total Bruto:</span>
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

              <div className="grid grid-cols-2 gap-md border-b border-slate-200/40 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Monto Planificado UF</span>
                  <span className="font-semibold text-primary">{formatUF(selectedInstallment.uf)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-0.5">Folio Factura</span>
                  <span className="font-semibold text-primary">{selectedInstallment.invoiceNumber || '-'}</span>
                </div>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 p-md rounded-xl space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-1 border-b border-slate-200/40 pb-1">Desglose Monetario (CLP)</span>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Neto:</span>
                  <span className="font-mono font-medium text-primary">{formatCLP(selectedInstallment.net_clp)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">IVA (19%):</span>
                  <span className="font-mono font-medium text-primary">{formatCLP(selectedInstallment.tax_clp)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-200/60 pt-1.5 mt-1.5">
                  <span className="text-primary">Total Recibido:</span>
                  <span className="font-mono text-primary">{formatCLP(selectedInstallment.total_clp)}</span>
                </div>
                {selectedInstallment.uf > 0 && selectedInstallment.net_clp && (
                  <div className="flex justify-between text-[10px] text-on-surface-variant border-t border-slate-200/20 pt-1 mt-1">
                    <span>UF Referencial Aplicada:</span>
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
                  {!selectedInstallment.invoiceFileUrl && !selectedInstallment.paymentBackupUrl ? (
                    <span className="text-on-surface-variant italic text-body-sm">No se subieron respaldos para esta cuota.</span>
                  ) : null}
                </div>
              </div>

              {selectedInstallment.comment && (
                <div className="space-y-xs border-t border-slate-200/40 pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant block mb-1">Notas / Comentarios</span>
                  <p className="bg-slate-50/50 p-sm rounded-lg border border-slate-200/40 text-on-surface-variant italic">
                    {selectedInstallment.comment}
                  </p>
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
          projectName={`${activeBudgetForInstallments.project.projectNumber} - ${activeBudgetForInstallments.project.rawProjectName}`}
          budgetNumber={activeBudgetForInstallments.budget.quoteId}
          budgetAmount={activeBudgetForInstallments.budget.amount}
          budgetBackupFiles={activeBudgetForInstallments.budget.backupFiles}
          initialInstallments={activeBudgetForInstallments.installments}
          onSave={async (updated) => {
            await onSaveInstallments(activeBudgetForInstallments.budget.id, updated);
          }}
          projectNumber={activeBudgetForInstallments.project.projectNumber}
          isDeferredSave={false}
        />
      )}
    </div>
  );
}
