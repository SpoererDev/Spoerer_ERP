import React, { useState, useEffect, useRef, useMemo } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { exportExcelFile } from '../utils/exportHelper';
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

export default function Proyectos({
  projects,
  setProjects,
  clients,
  budgets,
  installments,
  extraCosts,
  users = [],
  onUpdateInstallment,
  onDisassociateBudget,
  onAssociateBudget,
  onAddExtraCost,
  onDeleteExtraCost,
  onSaveProject,
  onDeleteProject,
  onSaveInstallments,
  searchTerm,
  setSearchTerm,
  tipoFilter,
  setTipoFilter,
  encargadoFilter = 'Todos',
  setEncargadoFilter
}) {
  const [expandedProjectId, setExpandedProjectId] = useState(null);

  // Installments unified modal state
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [activeBudgetForInstallments, setActiveBudgetForInstallments] = useState(null);

  // Associate Budget modal states
  const [associatingBudgetProject, setAssociatingBudgetProject] = useState(null);
  const [selectedOrphanBudgetId, setSelectedOrphanBudgetId] = useState('');

  // Document preview state
  const [previewFile, setPreviewFile] = useState(null);
  const [docxHtml, setDocxHtml] = useState('');

  // Extra cost modal state
  const [extraCostProject, setExtraCostProject] = useState(null);
  const [extraCostUF, setExtraCostUF] = useState('');
  const [extraCostSuperficie, setExtraCostSuperficie] = useState('');
  const [extraCostComment, setExtraCostComment] = useState('');

  // Local state for billing installments to allow inline typing before clicking Save
  const [localInstallments, setLocalInstallments] = useState([]);

  useEffect(() => {
    setLocalInstallments(installments);
  }, [installments]);

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
        setDocxHtml('<div class="text-center py-10"><span class="material-symbols-outlined text-[48px] text-amber-500">warning</span><p class="font-bold text-body-md mt-2 text-on-surface">Vista previa no disponible para archivos simulados.</p><p class="text-label-md text-on-surface-variant mt-1">Por favor descarga el archivo para poder visualizarlo.</p></div>');
      }
    }
  }, [previewFile]);

  // Edit project modal state
  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSuperficie, setEditSuperficie] = useState('');
  const [editRentabilidad, setEditRentabilidad] = useState('');
  const [editAnio, setEditAnio] = useState('');
  const [editCliente, setEditCliente] = useState('');
  const [editTipo, setEditTipo] = useState('');
  const [isCustomEditTipo, setIsCustomEditTipo] = useState(false);
  const [editEncargado, setEditEncargado] = useState('');
  const [disassociatingBudgetId, setDisassociatingBudgetId] = useState(null);

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

  // Custom modal / alert states
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', title: string, message: string }
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [extraCostToDelete, setExtraCostToDelete] = useState(null);

  // Dropdown filter state and click-outside
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const multiselectRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (multiselectRef.current && !multiselectRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Universe of project types (predefined + any custom ones in projects)
  const uniqueProjectTypes = useMemo(() => {
    return [...new Set([
      ...PROJECT_TYPES,
      ...projects.map(p => p.tipo).filter(Boolean)
    ])];
  }, [projects]);

  // Handlers for multiselect
  const handleToggleTipoOption = (tipoOpt) => {
    let currentSelected = tipoFilter === null ? [...uniqueProjectTypes] : [...tipoFilter];
    if (currentSelected.includes(tipoOpt)) {
      currentSelected = currentSelected.filter(t => t !== tipoOpt);
    } else {
      currentSelected.push(tipoOpt);
    }
    
    if (currentSelected.length === uniqueProjectTypes.length) {
      setTipoFilter(null);
    } else {
      setTipoFilter(currentSelected);
    }
  };

  const handleSelectAllTipos = () => {
    setTipoFilter(null);
  };

  const handleDeselectAllTipos = () => {
    setTipoFilter([]);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setTipoFilter(null);
    setEncargadoFilter('Todos');
  };

  // Search and Project Type filter
  const filteredProjects = projects.filter(project => {
    // 1. Encargado filter
    if (encargadoFilter && encargadoFilter !== 'Todos') {
      if (project.encargado !== encargadoFilter) {
        return false;
      }
    }
    // 2. Tipo filter
    if (tipoFilter !== null) {
      const pTipo = project.tipo || '';
      if (!tipoFilter.includes(pTipo)) {
        return false;
      }
    }
    // 3. Search query filter
    const term = searchTerm.toLowerCase();
    return (
      project.projectName.toLowerCase().includes(term) ||
      project.cliente.toLowerCase().includes(term) ||
      (project.encargado && project.encargado.toLowerCase().includes(term)) ||
      project.anio.toString().includes(term)
    );
  });

  // Calculate KPIs using filteredProjects
  const totalProjects = filteredProjects.length;

  const totalUF = filteredProjects.reduce((acc, p) => {
    const projectBudgets = budgets.filter(b => b.projectId === p.id);
    const budgetSum = projectBudgets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
    return acc + budgetSum;
  }, 0);

  const avgProfitability = filteredProjects.length > 0
    ? (filteredProjects.reduce((acc, p) => acc + (parseFloat(p.rentabilidad) || 0), 0) / filteredProjects.length).toFixed(1)
    : 0;

  const totalSurface = filteredProjects.reduce((acc, p) => acc + (parseFloat(p.superficie) || 0), 0);

  const toggleExpand = (id) => {
    if (expandedProjectId === id) {
      setExpandedProjectId(null);
    } else {
      setExpandedProjectId(id);
    }
  };

  // Open edit modal
  const handleOpenEditModal = (project) => {
    setEditingProject(project);
    setEditName(project.projectName);
    setEditSuperficie(project.superficie || '');
    setEditRentabilidad(project.rentabilidad || '');
    setEditAnio(project.anio || new Date().getFullYear());
    setEditCliente(project.cliente || '');
    
    const existingTipo = project.tipo || '';
    setEditTipo(existingTipo);
    setIsCustomEditTipo(existingTipo ? !PROJECT_TYPES.includes(existingTipo) : false);
    setEditEncargado(project.encargado || '');
  };

  // Save project general parameters edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editName) {
      setNotification({
        type: 'error',
        title: 'Error de Validación',
        message: 'Por favor ingrese el Nº y Nombre del proyecto.'
      });
      return;
    }

    // Parse project number and name from semantic string
    const nameParts = editName.split('-');
    const projectNumber = nameParts[0]?.trim() || '';
    const rawProjectName = nameParts.slice(1).join('-').split(' - ')[0]?.trim() || editName;

    // Resolve client
    const selectedCli = clients.find(c => c.company === editCliente);

    try {
      await onSaveProject({
        id: editingProject.id,
        projectNumber: projectNumber,
        rawProjectName: rawProjectName,
        superficie: parseFloat(editSuperficie) || 0,
        rentabilidad: parseFloat(editRentabilidad) || 0,
        anio: parseInt(editAnio) || new Date().getFullYear(),
        clientId: selectedCli ? selectedCli.id : editingProject.clientId,
        mainClientId: selectedCli ? selectedCli.mainClientId : editingProject.mainClientId,
        legalEntityId: selectedCli ? selectedCli.id : editingProject.legalEntityId,
        status: editingProject.status,
        tipo: editTipo || null,
        encargado: editEncargado || null
      });
      setNotification({
        type: 'success',
        title: 'Proyecto Guardado',
        message: 'Los parámetros generales del proyecto han sido actualizados exitosamente.'
      });
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Guardar',
        message: err.message || 'Ocurrió un error al actualizar el proyecto.'
      });
    }

    setEditingProject(null);
  };

  // Save billing table edits (batch saving)
  const handleSaveBillingTable = async (budgetId, budgetAmount) => {
    const budgetInsts = localInstallments.filter(i => i.origin_budget_id === budgetId);
    const currentSum = budgetInsts.reduce((acc, row) => acc + (parseFloat(row.uf) || 0), 0);
    const roundedSum = Math.round(currentSum * 100) / 100;
    const expectedTotal = Math.round((parseFloat(budgetAmount) || 0) * 100) / 100;

    if (Math.abs(roundedSum - expectedTotal) >= 0.02) {
      setNotification({
        type: 'error',
        title: 'Error al Guardar',
        message: `La suma de las cuotas (${roundedSum.toFixed(2)} UF) no es igual al total requerido del presupuesto (${expectedTotal.toFixed(2)} UF). Diferencia: ${(expectedTotal - roundedSum).toFixed(2)} UF.`
      });
      return;
    }

    try {
      await onSaveInstallments(budgetId, budgetInsts);
      setNotification({
        type: 'success',
        title: 'Facturación Guardada',
        message: 'La tabla de facturación ha sido guardada exitosamente.'
      });
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Guardar',
        message: err.message || 'Ocurrió un error al guardar la tabla de facturación.'
      });
    }
  };

  const handleDeleteRowLocal = (installmentId, budgetId) => {
    setLocalInstallments(prev => {
      const filtered = prev.filter(inst => inst.id !== installmentId);
      // Auto-recalculate numQuota sequentially
      let count = 1;
      return filtered.map(inst => {
        if (inst.origin_budget_id === budgetId) {
          const updated = {
            ...inst,
            numQuota: String(count).padStart(2, '0')
          };
          count++;
          return updated;
        }
        return inst;
      });
    });
  };

  const handleAddRowLocal = (projectId, budgetId) => {
    const budgetInsts = localInstallments.filter(i => i.origin_budget_id === budgetId);
    const nextNum = budgetInsts.length + 1;
    const numStr = String(nextNum).padStart(2, '0');

    const newInst = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      project_id: projectId,
      origin_budget_id: budgetId,
      numQuota: numStr,
      date: new Date().toISOString().split('T')[0],
      uf: 0,
      status: 'Por facturar',
      comment: '',
      isNew: true
    };

    setLocalInstallments(prev => [...prev, newInst]);
  };

  const handleRowFieldChange = (installmentId, field, value) => {
    setLocalInstallments(prev => prev.map(inst => {
      if (inst.id === installmentId) {
        return {
          ...inst,
          [field]: field === 'uf' ? (parseFloat(value) || 0) : value
        };
      }
      return inst;
    }));
  };

  // Disassociate budget
  const handleDisassociateBudgetLocal = (budgetId) => {
    const hasInvoicedOrPaid = localInstallments.some(
      i => i.origin_budget_id === budgetId && (i.status === 'Factura emitida' || i.status === 'Pagada' || i.status === 'Facturado' || i.status === 'Pagado')
    );
    if (hasInvoicedOrPaid) {
      setNotification({
        type: 'error',
        title: 'Acción No Permitida',
        message: 'No se puede desasociar el presupuesto porque posee cuotas que ya han sido facturadas o pagadas.'
      });
      return;
    }
    setDisassociatingBudgetId(budgetId);
  };

  // Extra cost modal handlers
  const handleOpenExtraCostModal = (project) => {
    setExtraCostProject(project);
    setExtraCostUF('');
    setExtraCostSuperficie('');
    setExtraCostComment('');
  };

  const handleAddExtraCostLocal = async (e) => {
    e.preventDefault();
    if (!extraCostUF) {
      setNotification({
        type: 'error',
        title: 'Error de Validación',
        message: 'Por favor ingrese el Costo Extra (UF).'
      });
      return;
    }

    try {
      await onAddExtraCost({
        project_id: extraCostProject.id,
        amount: parseFloat(extraCostUF) || 0,
        superficie: parseFloat(extraCostSuperficie) || 0,
        comment: extraCostComment || ''
      });
      setNotification({
        type: 'success',
        title: 'Costo Extra Registrado',
        message: 'El costo extra ha sido registrado exitosamente.'
      });
      // Reset fields to allow adding another cost extra
      setExtraCostUF('');
      setExtraCostSuperficie('');
      setExtraCostComment('');
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Registrar',
        message: err.message || 'Ocurrió un error al registrar el costo extra.'
      });
    }
  };

  const handleDeleteExtraCostLocal = (costId) => {
    setExtraCostToDelete(costId);
  };

  // Delete project
  const handleDeleteProjectLocal = (id, name) => {
    // Verificar si el proyecto tiene cuotas facturadas o pagadas
    const projectInstallments = (installments || []).filter(inst => inst.project_id === id);
    const hasInvoicedInstallments = projectInstallments.some(
      inst => inst.status === 'Factura emitida' || inst.status === 'Pagada'
    );

    if (hasInvoicedInstallments) {
      setNotification({
        type: 'error',
        title: 'No se puede eliminar',
        message: 'No es posible eliminar un proyecto que tiene cuotas facturadas o pagadas.'
      });
      return;
    }

    const proj = projects.find(p => p.id === id);
    if (proj) {
      setProjectToDelete(proj);
    } else {
      setProjectToDelete({ id, projectName: name });
    }
  };

  // Export Budgets and Extra Costs to Excel
  const handleExportBudgets = async () => {
    const rows = [];

    filteredProjects.forEach(project => {
      const projectBudgets = budgets.filter(b => b.projectId === project.id);
      const projectExtraCosts = extraCosts.filter(c => c.project_id === project.id);

      // 1. Budget rows
      projectBudgets.forEach(budget => {
        rows.push({
          "Código de presupuesto": budget.quoteId || '',
          "Proyecto": `${project.projectNumber || ''}-${project.rawProjectName || ''}${project.cliente ? ` - ${project.cliente}` : ''}`,
          "Presupuesto (UF)": parseFloat(budget.amount) || 0,
          "Costo Extra (UF)": '',
          "Descripción": budget.title || '',
          "Comentario": '',
          "m2": parseFloat(project.superficie) || 0,
          "Rentabilidad esperada": (project.rentabilidad !== undefined && project.rentabilidad !== null) ? `${project.rentabilidad}%` : '',
          "Factura": '',
          "Facturado": ''
        });
      });

      // 2. Extra cost rows
      projectExtraCosts.forEach(cost => {
        rows.push({
          "Código de presupuesto": '',
          "Proyecto": `${project.projectNumber || ''}-${project.rawProjectName || ''}${project.cliente ? ` - ${project.cliente}` : ''}`,
          "Presupuesto (UF)": '',
          "Costo Extra (UF)": parseFloat(cost.amount) || 0,
          "Descripción": cost.comment || '',
          "Comentario": '',
          "m2": parseFloat(cost.superficie) || 0,
          "Rentabilidad esperada": '',
          "Factura": '',
          "Facturado": ''
        });
      });
    });

    // Create Worksheet and Workbook
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        "Código de presupuesto",
        "Proyecto",
        "Presupuesto (UF)",
        "Costo Extra (UF)",
        "Descripción",
        "Comentario",
        "m2",
        "Rentabilidad esperada",
        "Factura",
        "Facturado"
      ]
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Presupuestos y Costos");

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

    // Trigger download
    await exportExcelFile(workbook, "PresupuestosSPR.xlsx", "presupuestos_spr_proyectos");
  };

  return (
    <div className="space-y-xl animate-fade-in text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary font-bold">Gestión de Proyectos</h2>
          <p className="text-on-surface-variant font-body-md mt-1">
            Supervisa el estado físico, rentabilidad y cronograma de facturación de los proyectos activos.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportBudgets}
            className="flex items-center gap-2 px-md py-2 bg-secondary text-white rounded hover:brightness-105 transition-all font-label-md font-bold active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            <span>Exportar Presupuestos</span>
          </button>
        </div>
      </div>

      {/* KPI Dashboard */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        {/* KPI 1: Proyectos Activos */}
        <div className="bg-blue-50/40 border border-blue-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-blue-800 uppercase font-bold tracking-wider">Proyectos Activos</span>
            <div className="font-display-lg text-[34px] text-blue-950 font-extrabold">
              {totalProjects}
            </div>
          </div>
          <div className="p-3 bg-blue-100 rounded-full text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">folder</span>
          </div>
        </div>

        {/* KPI 2: Monto Total Presupuestos */}
        <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-emerald-800 uppercase font-bold tracking-wider">Monto Total Presupuestos</span>
            <div className="font-display-lg text-[34px] text-emerald-950 font-extrabold">
              {totalUF.toLocaleString('es-CL', { maximumFractionDigits: 1 })} <span className="text-body-md font-semibold text-emerald-800">UF</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-100 rounded-full text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">payments</span>
          </div>
        </div>

        {/* KPI 3: Rentabilidad Promedio */}
        <div className="bg-indigo-50/40 border border-indigo-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-indigo-800 uppercase font-bold tracking-wider">Rentabilidad Promedio</span>
            <div className="font-display-lg text-[34px] text-indigo-950 font-extrabold">
              {avgProfitability}<span className="text-body-md font-semibold text-indigo-800">%</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-100 rounded-full text-indigo-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">monitoring</span>
          </div>
        </div>

        {/* KPI 4: Superficie Total */}
        <div className="bg-teal-50/40 border border-teal-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-teal-800 uppercase font-bold tracking-wider">Superficie Total</span>
            <div className="font-display-lg text-[34px] text-teal-950 font-extrabold">
              {totalSurface.toLocaleString('es-CL')} <span className="text-body-md font-semibold text-teal-800">m²</span>
            </div>
          </div>
          <div className="p-3 bg-teal-100 rounded-full text-teal-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">architecture</span>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="glass-card rounded-xl p-md flex flex-col lg:flex-row items-stretch lg:items-end gap-md justify-between shadow-sm">
        {/* Left Side: Buscar and Limpiar */}
        <div className="flex flex-wrap items-end gap-md w-full lg:w-auto">
          <div className="flex flex-col flex-grow max-w-lg min-w-[240px]">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold text-left">Buscar Proyecto</label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
              <input
                className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:outline-none h-[38px]"
                placeholder="Buscar por código, nombre o cliente..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant rounded bg-white text-on-surface hover:bg-slate-50 transition-all font-label-md active:scale-95 h-[38px]"
          >
            <span className="material-symbols-outlined text-[16px]">clear_all</span>
            <span>Limpiar</span>
          </button>
        </div>

        {/* Right Side: Filters */}
        <div className="flex flex-wrap items-end gap-md justify-end w-full lg:w-auto">
          {/* Tipo de Proyecto Multiselect */}
          <div className="flex flex-col relative w-full sm:w-[220px]" ref={multiselectRef}>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold text-left">Tipo de Proyecto</label>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between w-full px-md py-2 bg-white border border-outline-variant rounded-lg text-body-md text-primary font-medium hover:bg-slate-50 transition-all h-[38px] text-left outline-none"
            >
              <span className="truncate">
                {tipoFilter === null || tipoFilter.length === uniqueProjectTypes.length
                  ? "Todos los tipos"
                  : tipoFilter.length === 0
                  ? "Ninguno seleccionado"
                  : `${tipoFilter.length} seleccionado(s)`}
              </span>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant ml-2 select-none">
                {isDropdownOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
              </span>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-[105%] bg-white border border-outline-variant rounded-lg shadow-xl z-50 w-full min-w-[220px] max-h-64 overflow-y-auto py-2 flex flex-col gap-1 border-outline-variant/30 animate-fade-in text-left">
                <button
                  type="button"
                  onClick={handleSelectAllTipos}
                  className="px-4 py-1.5 text-left text-body-sm text-secondary hover:bg-slate-50 font-bold transition-all border-b border-slate-100 last:border-b-0 flex items-center justify-between"
                >
                  <span>[ Seleccionar Todos ]</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllTipos}
                  className="px-4 py-1.5 text-left text-body-sm text-red-600 hover:bg-slate-50 font-bold transition-all border-b border-slate-100 last:border-b-0 flex items-center justify-between"
                >
                  <span>[ Limpiar Selección ]</span>
                </button>
                {uniqueProjectTypes.map((tipoOpt) => {
                  const isChecked = tipoFilter === null || tipoFilter.includes(tipoOpt);
                  return (
                    <label
                      key={tipoOpt}
                      className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-3 text-body-md font-medium text-primary select-none transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleTipoOption(tipoOpt)}
                        className="rounded border-slate-300 text-secondary focus:ring-secondary focus:ring-offset-0 focus:ring-1"
                      />
                      <span className="truncate">{tipoOpt}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Encargado Filter */}
          <div className="flex flex-col w-full sm:w-[220px]">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold text-left">Encargado</label>
            <select
              value={encargadoFilter}
              onChange={(e) => setEncargadoFilter(e.target.value)}
              className="w-full px-md py-2 bg-white border border-outline-variant rounded-lg text-body-md text-primary font-medium hover:bg-slate-50 transition-all h-[38px] text-left outline-none"
            >
              <option value="Todos">Todos los encargados</option>
              {availableEncargados.map(enc => (
                <option key={enc} value={enc}>{enc}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Projects List */}
      <div className="space-y-md">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((project) => {
            const isExpanded = expandedProjectId === project.id;

            // Filter budgets associated with this project
            const projectBudgets = budgets.filter(b => b.projectId === project.id);
            const projectTotalUF = projectBudgets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

            // Filter extra costs associated with this project
            const projectExtraCosts = extraCosts.filter(ec => ec.project_id === project.id);
            const projectExtraCostsUF = projectExtraCosts.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

            return (
              <div
                key={project.id}
                className="bg-white rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden transition-all hover:shadow"
              >
                {/* Project Summary Header */}
                <div
                  onClick={() => toggleExpand(project.id)}
                  className="p-md sm:p-lg flex flex-col md:flex-row md:items-center justify-between gap-md bg-slate-50/50 cursor-pointer hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-start gap-md min-w-0">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-1">
                      <span className="material-symbols-outlined text-[20px]">folder_special</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-title-lg text-title-lg text-primary font-bold truncate max-w-lg" title={project.projectName}>
                          {project.projectName}
                        </h3>
                        {projectBudgets.length === 0 && (
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
                          {project.cliente}
                        </span>
                        <span className="text-outline-variant">•</span>
                        <span>Año {project.anio}</span>
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

                  {/* General parameters metrics */}
                  <div className="flex flex-wrap items-center gap-md sm:gap-lg md:text-right">
                    <div className="flex flex-col">
                      <span className="text-label-sm text-on-surface-variant/80 uppercase">Superficie</span>
                      <span className="font-bold text-body-md text-on-surface">{project.superficie} m²</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-label-sm text-on-surface-variant/80 uppercase">Rentabilidad</span>
                      <span className="font-bold text-body-md text-indigo-600">{project.rentabilidad}%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-label-sm text-on-surface-variant/80 uppercase">Monto Total</span>
                      <span className="font-bold text-body-md text-secondary">{projectTotalUF.toLocaleString('es-CL')} UF</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-label-sm text-on-surface-variant/80 uppercase">Costos Extras</span>
                      <span className="font-bold text-body-md text-amber-600">{projectExtraCostsUF.toLocaleString('es-CL')} UF</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pl-sm border-l border-outline-variant/40">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenExtraCostModal(project);
                        }}
                        className="p-2 hover:bg-slate-100 rounded text-emerald-600 hover:text-emerald-700 transition-all font-bold flex items-center justify-center animate-pulse-subtle"
                        title="Agregar costo extra"
                      >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(project);
                        }}
                        className="p-2 hover:bg-slate-100 rounded text-slate-700 hover:text-primary transition-all"
                        title="Editar parámetros generales del proyecto"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProjectLocal(project.id, project.projectName);
                        }}
                        className="p-2 hover:bg-red-50 rounded text-error hover:text-red-700 transition-all"
                        title="Eliminar proyecto por completo"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(project.id);
                        }}
                        className={`p-2 hover:bg-slate-100 rounded text-secondary transition-all flex items-center gap-1 font-bold text-body-sm ${isExpanded ? 'bg-slate-100' : ''
                          }`}
                      >
                        <span>{isExpanded ? 'Colapsar' : 'Facturación'}</span>
                        <span className={`material-symbols-outlined transition-all ${isExpanded ? 'rotate-180' : ''}`}>
                          keyboard_arrow_down
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Details: Associated Budgets and Billing Tables */}
                {isExpanded && (
                  <div className="border-t border-outline-variant/20 p-md sm:p-lg space-y-lg bg-white">
                    {/* Costos Extras Detallados */}
                    {projectExtraCosts.length > 0 && (
                      <div className="border border-amber-200 rounded-xl p-md bg-amber-50/10 space-y-sm">
                        <h4 className="font-label-md text-label-md text-amber-700 uppercase tracking-widest font-bold flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px]">add_circle</span>
                          Costos Adicionales Registrados
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-md">
                          {projectExtraCosts.map((cost) => (
                            <div key={cost.id} className="p-md bg-white border border-slate-200 rounded-lg flex justify-between items-start gap-md shadow-xs">
                              <div>
                                <p className="text-body-sm font-semibold text-slate-800">{cost.comment || 'Sin descripción'}</p>
                                <div className="mt-1.5 flex flex-col">
                                  <span className="font-bold text-amber-600 text-body-md">{cost.amount.toLocaleString('es-CL', { minimumFractionDigits: 1 })} UF</span>
                                  <span className="text-[11px] text-on-surface-variant/70 mt-0.5">Superficie: {(cost.superficie || 0).toLocaleString('es-CL')} m²</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteExtraCostLocal(cost.id)}
                                className="p-1 hover:bg-red-50 text-error hover:text-red-700 rounded transition-all flex items-center justify-center flex-shrink-0"
                                title="Eliminar costo extra"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2 gap-sm">
                      <h4 className="font-label-md text-label-md text-primary uppercase tracking-widest font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        Presupuestos y Planificación de Cuotas Asociadas
                      </h4>
                      <button
                        type="button"
                        onClick={() => setAssociatingBudgetProject(project)}
                        className="text-secondary hover:bg-secondary/5 px-2.5 py-1.5 rounded-lg text-body-sm transition-all flex items-center gap-1 font-bold border border-secondary/20 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">link</span>
                        <span>Asociar Presupuesto</span>
                      </button>
                    </div>

                    {projectBudgets.length === 0 && (
                      <div className="p-md text-center text-on-surface-variant italic border border-dashed border-outline-variant/60 rounded-xl bg-slate-50/40">
                        No hay presupuestos asociados a este proyecto.
                      </div>
                    )}

                    {projectBudgets.map((budget) => {
                      const budgetInstallments = localInstallments.filter(
                        i => i.project_id === project.id && i.origin_budget_id === budget.id
                      );

                      return (
                        <div key={budget.id} className="border border-slate-200 rounded-xl p-md space-y-md shadow-sm bg-slate-50/20">
                          {/* Budget Info Header */}
                          <div className="flex justify-between items-start gap-md pb-md border-b border-slate-100">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-body-md text-primary">
                                  Presupuesto #{budget.quoteId} - {budget.title}
                                </span>
                                {(() => {
                                  if (!budget.backupFiles || budget.backupFiles.length === 0) return null;
                                  const pdfFile = budget.backupFiles.find(f => f.name.toLowerCase().endsWith('.pdf'));
                                  const docxFile = budget.backupFiles.find(f => f.name.toLowerCase().endsWith('.docx') || f.name.toLowerCase().endsWith('.doc'));
                                  const fileToPreview = pdfFile || docxFile;
                                  if (!fileToPreview) return null;
                                  
                                  const isPdf = fileToPreview.name.toLowerCase().endsWith('.pdf');
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setPreviewFile(fileToPreview);
                                      }}
                                      className="text-secondary hover:text-primary transition-colors flex items-center p-0.5 hover:bg-slate-100 rounded active:scale-95"
                                      title={`Visualizar respaldo: ${fileToPreview.name}`}
                                    >
                                      <span className="material-symbols-outlined text-[18px]">
                                        {isPdf ? 'picture_as_pdf' : 'description'}
                                      </span>
                                    </button>
                                  );
                                })()}
                                <span className="text-xs bg-secondary/10 text-secondary font-bold px-2 py-0.5 rounded-full">
                                  {budget.amount} UF
                                </span>
                              </div>
                              <p className="text-body-sm text-on-surface-variant leading-relaxed">
                                <strong>Monto total:</strong> {budget.amount} UF ({budget.validity})
                              </p>
                            </div>

                            {(() => {
                              const hasInvoicedOrPaid = localInstallments.some(
                                i => i.origin_budget_id === budget.id && (i.status === 'Factura emitida' || i.status === 'Pagada' || i.status === 'Facturado' || i.status === 'Pagado')
                              );
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleDisassociateBudgetLocal(budget.id)}
                                  className={`px-2 py-1 rounded text-body-sm transition-all flex items-center gap-1 font-semibold ${
                                    hasInvoicedOrPaid 
                                      ? 'text-slate-400 cursor-not-allowed opacity-60' 
                                      : 'text-error hover:bg-red-50'
                                  }`}
                                  title={hasInvoicedOrPaid ? "No se puede desasociar: posee cuotas facturadas o pagadas" : "Desasociar presupuesto"}
                                >
                                  <span className="material-symbols-outlined text-[16px]">link_off</span>
                                  <span>Desasociar</span>
                                </button>
                              );
                            })()}
                          </div>
                            {/* Billing Table */}
                           <div className="space-y-sm text-slate-800">
                             <h5 className="text-body-sm font-bold text-slate-700 flex items-center gap-1.5">
                               <span className="material-symbols-outlined text-[16px] text-slate-500">list_alt</span>
                               Detalle de Cuotas ({budgetInstallments.length} cuotas)
                             </h5>
 
                             {budgetInstallments.length > 0 ? (
                               <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                                 <table className="w-full text-left border-collapse">
                                   <thead className="bg-slate-100 text-slate-700 text-label-sm font-bold uppercase sticky top-0">
                                     <tr>
                                       <th className="p-2.5 border-b border-slate-200 text-center w-12">Cuota</th>
                                       <th className="p-2.5 border-b border-slate-200">Fecha Planificada</th>
                                       <th className="p-2.5 border-b border-slate-200 w-36 text-center">Estado</th>
                                       <th className="p-2.5 border-b border-slate-200 text-right w-28">UF</th>
                                       <th className="p-2.5 border-b border-slate-200">Comentario / Estado de Hito</th>
                                     </tr>
                                   </thead>
                                   <tbody className="text-body-sm divide-y divide-slate-100">
                                     {budgetInstallments.map((row) => (
                                       <tr key={row.id} className="hover:bg-slate-50/40 text-slate-700">
                                         <td className="p-2.5 font-bold text-slate-500 text-center bg-slate-50/50">
                                           {row.numQuota}
                                         </td>
                                         <td className="p-2.5 text-on-surface">
                                           <div className="flex items-center gap-1">
                                             <span>{row.date ? row.date.split('-').reverse().join('/') : ''}</span>
                                             {row.dateConfirmed && (
                                               <span className="material-symbols-outlined text-[16px] text-emerald-600 font-bold" title="Fecha Confirmada">
                                                 verified
                                               </span>
                                             )}
                                           </div>
                                         </td>
                                         <td className="p-2.5 w-36 text-center">
                                           <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${(row.status || 'Por facturar') === 'Pagada'
                                             ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
                                             : (row.status || 'Por facturar') === 'Factura emitida'
                                               ? 'bg-sky-50 text-sky-700 ring-sky-600/10'
                                               : 'bg-amber-50 text-amber-800 ring-amber-600/20'
                                             }`}>
                                             {row.status || 'Por facturar'}
                                           </span>
                                         </td>
                                         <td className="p-2.5 w-28 text-right font-bold text-primary">
                                           {row.uf.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                                         </td>
                                         <td className="p-2.5 text-on-surface-variant italic">
                                           {row.comment || '-'}
                                         </td>
                                       </tr>
                                     ))}
                                   </tbody>
                                 </table>
                               </div>
                             ) : (
                               <p className="text-body-sm text-slate-500 italic py-2">No hay cuotas registradas para este presupuesto.</p>
                             )}
 
                             {/* Edit Installments Trigger Button */}
                             <div className="flex justify-end pt-xs">
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
                                 className="px-4 py-1.5 bg-primary text-white text-body-sm font-bold rounded-lg hover:bg-primary-container transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                               >
                                 <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                                 <span>Editar Cuotas</span>
                               </button>
                             </div>
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
            No se encontraron proyectos activos.
          </div>
        )}
      </div>

      {/* Modal: Edit Project */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm">
          <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Editar Parámetros</h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-bold text-emerald-600">Proyecto: {editingProject.projectName}</span>
                </p>
              </div>
              <button
                onClick={() => setEditingProject(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-lg space-y-lg text-left">
              <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md animate-fade-in">
                <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                  <span className="material-symbols-outlined text-[20px] text-secondary">info</span>
                  Información del Proyecto
                </h3>

                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider font-bold">Nombre / Código Proyecto</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                    placeholder="Ej: 0280-Mantenimiento Anual"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider font-bold">Superficie (m²)</label>
                    <input
                      type="number"
                      value={editSuperficie}
                      onChange={(e) => setEditSuperficie(e.target.value)}
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                      placeholder="Superficie total"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider font-bold">Rentabilidad Esperada (%)</label>
                    <input
                      type="number"
                      value={editRentabilidad}
                      onChange={(e) => setEditRentabilidad(e.target.value)}
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                      placeholder="Margen de ganancia"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-md">
                  <div className="flex flex-col gap-xs col-span-1">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider font-bold">Año</label>
                    <input
                      type="number"
                      value={editAnio}
                      onChange={(e) => setEditAnio(e.target.value)}
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                      placeholder="Año contable"
                    />
                  </div>
                  <div className="flex flex-col gap-xs col-span-2">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider font-bold">Cliente</label>
                    <select
                      value={editCliente}
                      onChange={(e) => setEditCliente(e.target.value)}
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                    >
                      <option value="">Seleccione un cliente</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.company}>{c.company}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Campo: Tipo de Proyecto */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Tipo de Proyecto</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-medium text-primary"
                    value={isCustomEditTipo ? 'custom' : editTipo}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setIsCustomEditTipo(true);
                        setEditTipo('');
                      } else {
                        setIsCustomEditTipo(false);
                        setEditTipo(val);
                      }
                    }}
                  >
                    <option value="">Seleccione un tipo...</option>
                    {PROJECT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="custom">Otro (Ingresar manualmente)...</option>
                  </select>

                  {isCustomEditTipo && (
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white animate-fade-in mt-1 font-medium text-primary"
                      placeholder="Escriba el tipo de proyecto..."
                      value={editTipo}
                      onChange={(e) => setEditTipo(e.target.value)}
                      required
                    />
                  )}
                </div>

                {/* Campo: Encargado del Proyecto */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Encargado del Proyecto</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-medium text-primary"
                    value={editEncargado}
                    onChange={(e) => setEditEncargado(e.target.value)}
                  >
                    <option value="">Seleccione un encargado (Solo Admins)...</option>
                    {adminUsers.map(u => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                    {editEncargado && !adminUsers.some(u => u.name === editEncargado) && (
                      <option value={editEncargado}>{editEncargado}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  className="px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Costos Extras */}
      {extraCostProject && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-md z-50 animate-fade-in text-left">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-lg shadow-xl border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-md flex-shrink-0">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Gestión de Costos Extras</h2>
                <p className="text-on-surface-variant font-body-sm mt-1 truncate max-w-md">
                  Proyecto: <strong>{extraCostProject.projectName}</strong>
                </p>
              </div>
              <button
                onClick={() => setExtraCostProject(null)}
                className="p-1 hover:bg-slate-100 rounded-full transition-all text-secondary"
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-lg pr-sm">
              {/* Form to add Costo Extra */}
              <form onSubmit={handleAddExtraCostLocal} className="p-md border rounded-xl bg-slate-50/50 space-y-md">
                <h4 className="font-title-sm text-title-sm text-primary font-bold uppercase tracking-wider text-xs">Agregar Nuevo Costo Extra</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                  <div className="flex flex-col">
                    <label className="text-label-sm text-on-surface-variant font-bold mb-1 uppercase tracking-wider">Monto (UF)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Ej: 45.50"
                      value={extraCostUF}
                      onChange={(e) => setExtraCostUF(e.target.value)}
                      className="p-sm bg-white border border-outline-variant/50 focus:border-primary outline-none rounded-lg text-body-sm"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-label-sm text-on-surface-variant font-bold mb-1 uppercase tracking-wider">Superficie asociada (m²)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej: 15.00 (Opcional)"
                      value={extraCostSuperficie}
                      onChange={(e) => setExtraCostSuperficie(e.target.value)}
                      className="p-sm bg-white border border-outline-variant/50 focus:border-primary outline-none rounded-lg text-body-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-label-sm text-on-surface-variant font-bold mb-1 uppercase tracking-wider">Comentario / Justificación</label>
                  <input
                    type="text"
                    placeholder="Ej: Modificaciones estructurales solicitadas por el cliente"
                    value={extraCostComment}
                    onChange={(e) => setExtraCostComment(e.target.value)}
                    className="p-sm bg-white border border-outline-variant/50 focus:border-primary outline-none rounded-lg text-body-sm"
                  />
                </div>
                <div className="flex justify-end pt-sm">
                  <button
                    type="submit"
                    className="px-lg py-1.5 bg-primary text-white text-body-sm font-bold rounded-lg hover:brightness-105 transition-all shadow-sm flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Registrar Costo</span>
                  </button>
                </div>
              </form>

              {/* List of current Costos Extras */}
              <div className="space-y-md">
                <h4 className="font-title-sm text-title-sm text-primary font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[20px]">list_alt</span>
                  Costos Extras Registrados
                </h4>

                {(() => {
                  const projectModalExtraCosts = extraCosts.filter(ec => ec.project_id === extraCostProject.id);
                  return projectModalExtraCosts.length > 0 ? (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-xs max-h-[30vh]">
                      <table className="w-full text-left border-collapse text-body-sm">
                        <thead className="bg-slate-100 text-slate-700 text-label-xs font-bold uppercase sticky top-0">
                          <tr>
                            <th className="p-2.5 border-b border-slate-200">Comentario</th>
                            <th className="p-2.5 border-b border-slate-200 text-right w-28">Superficie</th>
                            <th className="p-2.5 border-b border-slate-200 text-right w-28">Monto (UF)</th>
                            <th className="p-2.5 border-b border-slate-200 text-center w-16">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {projectModalExtraCosts.map((cost) => (
                            <tr key={cost.id} className="hover:bg-slate-50/40">
                              <td className="p-2.5 text-on-surface truncate max-w-[200px]" title={cost.comment}>
                                {cost.comment}
                              </td>
                              <td className="p-2.5 text-right text-on-surface">
                                {cost.superficie ? `${cost.superficie.toLocaleString('es-CL')} m²` : '0 m²'}
                              </td>
                              <td className="p-2.5 text-right font-bold text-secondary">
                                {cost.amount.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExtraCostLocal(cost.id)}
                                  className="p-1 hover:bg-red-50 text-error hover:text-red-700 rounded transition-all flex items-center justify-center mx-auto"
                                  title="Eliminar este costo"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-slate-50 border-t font-bold">
                          <tr>
                            <td className="p-2.5 text-on-surface text-label-xs font-bold uppercase">Total</td>
                            <td className="p-2.5 text-right text-on-surface">
                              {projectModalExtraCosts.reduce((sum, c) => sum + (c.superficie || 0), 0).toLocaleString('es-CL')} m²
                            </td>
                            <td className="p-2.5 text-right text-secondary">
                              {projectModalExtraCosts.reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="p-md text-center text-on-surface-variant italic border border-dashed rounded-lg bg-slate-50/20">
                      No hay costos extras registrados para este proyecto.
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex justify-end pt-sm border-t flex-shrink-0">
              <button
                onClick={() => setExtraCostProject(null)}
                className="px-lg py-sm bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-all text-body-md shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Document Preview */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-md z-55 animate-fade-in text-left">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-lg shadow-xl border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-md flex-shrink-0">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold truncate max-w-xl" title={previewFile.name}>
                  Vista Previa: {previewFile.name}
                </h3>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 hover:bg-slate-100 rounded-full transition-all text-secondary"
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border border-outline-variant/20 rounded-xl bg-slate-50/30 p-md min-h-[40vh]">
              {previewFile.name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-[550px] rounded border border-outline-variant/40 bg-white"
                  title="Vista previa PDF"
                />
              ) : previewFile.name.toLowerCase().endsWith('.docx') ? (
                docxHtml ? (
                  <div
                    className="prose prose-slate max-w-none text-body-md text-on-surface bg-white p-lg rounded-lg border shadow-xs"
                    dangerouslySetInnerHTML={{ __html: docxHtml }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-md">
                    <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-body-sm text-on-surface-variant font-bold">Convirtiendo documento a HTML...</span>
                  </div>
                )
              ) : (
                <div className="text-center py-20">
                  <span className="material-symbols-outlined text-[64px] text-amber-500">warning</span>
                  <h4 className="font-bold text-title-md mt-4 text-on-surface">Formato de archivo no soportado para vista previa</h4>
                  <p className="text-body-md text-on-surface-variant mt-2">
                    Solo los archivos PDF (.pdf) y Word (.docx) se pueden previsualizar directamente en el ERP.
                  </p>
                  {previewFile.url && (
                    <a
                      href={previewFile.url}
                      download={previewFile.name}
                      className="inline-flex items-center gap-1.5 mt-md px-lg py-sm bg-primary text-white font-bold rounded-lg hover:brightness-105 transition-all shadow-sm text-body-md"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      <span>Descargar Archivo</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-sm border-t mt-md flex-shrink-0">
              <button
                onClick={() => setPreviewFile(null)}
                className="px-lg py-sm bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-all text-body-md shadow-xs"
              >
                Cerrar Vista Previa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Notification Modal (Success / Error) */}
      {notification && (
        <div className="fixed inset-0 z-[100] bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-sm mb-2 ${
              notification.type === 'error' ? 'bg-error-container/20 text-error' : 'bg-secondary-container/20 text-secondary'
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

      {/* Custom Confirmation Modal for Deletion */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Proyecto?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea eliminar por completo el proyecto <strong>{projectToDelete.projectName}</strong>? Se perderán todas sus tablas de facturación y costos extras. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="pt-sm flex gap-md">
              <button 
                onClick={() => setProjectToDelete(null)}
                className="flex-1 bg-white border border-outline-variant text-on-surface py-sm rounded-lg font-bold hover:bg-surface-container transition-all active:scale-95 text-body-md"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const id = projectToDelete.id;
                  setProjectToDelete(null);
                  try {
                    await onDeleteProject(id);
                    setNotification({
                      type: 'success',
                      title: 'Proyecto Eliminado',
                      message: 'El proyecto ha sido eliminado exitosamente del sistema.'
                    });
                  } catch (err) {
                    setNotification({
                      type: 'error',
                      title: 'Error al Eliminar',
                      message: err.message || 'Ocurrió un error al eliminar el proyecto.'
                    });
                  }
                }}
                className="flex-1 bg-error text-white py-sm rounded-lg font-bold shadow-md hover:brightness-105 active:scale-95 transition-all text-body-md"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Extra Cost Deletion */}
      {extraCostToDelete && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Costo Extra?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea eliminar este costo extra? Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="pt-sm flex gap-md">
              <button 
                onClick={() => setExtraCostToDelete(null)}
                className="flex-1 bg-white border border-outline-variant text-on-surface py-sm rounded-lg font-bold hover:bg-surface-container transition-all active:scale-95 text-body-md"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const id = extraCostToDelete;
                  setExtraCostToDelete(null);
                  try {
                    await onDeleteExtraCost(id);
                    setNotification({
                      type: 'success',
                      title: 'Costo Extra Eliminado',
                      message: 'El costo extra ha sido eliminado exitosamente.'
                    });
                  } catch (err) {
                    setNotification({
                      type: 'error',
                      title: 'Error al Eliminar',
                      message: err.message || 'Ocurrió un error al eliminar el costo extra.'
                    });
                  }
                }}
                className="flex-1 bg-error text-white py-sm rounded-lg font-bold shadow-md hover:brightness-105 active:scale-95 transition-all text-body-md"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Confirmation Modal for Budget Disassociation */}
      {disassociatingBudgetId && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Desasociar Presupuesto?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea desasociar este presupuesto del proyecto? Esta acción removerá el vínculo pero no eliminará el presupuesto ni sus cuotas.
              </p>
            </div>

            <div className="pt-sm flex gap-md">
              <button 
                onClick={() => setDisassociatingBudgetId(null)}
                className="flex-1 bg-white border border-outline-variant text-on-surface py-sm rounded-lg font-bold hover:bg-surface-container transition-all active:scale-95 text-body-md"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const bId = disassociatingBudgetId;
                  setDisassociatingBudgetId(null);
                  try {
                    await onDisassociateBudget(bId);
                    setNotification({
                      type: 'success',
                      title: 'Presupuesto Desasociado',
                      message: 'El presupuesto ha sido desasociado del proyecto correctamente.'
                    });
                  } catch (err) {
                    setNotification({
                      type: 'error',
                      title: 'Error al Desasociar',
                      message: err.message || 'Ocurrió un error al desasociar el presupuesto.'
                    });
                  }
                }}
                className="flex-1 bg-error text-white py-sm rounded-lg font-bold shadow-md hover:brightness-105 active:scale-95 transition-all text-body-md"
              >
                Desasociar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Associate Budget */}
      {associatingBudgetProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm">
          <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up border border-outline-variant">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Asociar Presupuesto</h2>
                <p className="text-body-md text-on-surface-variant font-bold text-slate-600 mt-1">
                  Proyecto: {associatingBudgetProject.projectName}
                </p>
              </div>
              <button
                onClick={() => {
                  setAssociatingBudgetProject(null);
                  setSelectedOrphanBudgetId('');
                }}
                className="p-2 hover:bg-slate-100 rounded-full text-on-surface-variant transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-lg space-y-lg text-left">
              {budgets.filter(b => (b.status === 'Aprobado' || b.status === 'Aprovado') && !b.projectId).length > 0 ? (
                <div className="space-y-md">
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
                      Seleccione un presupuesto huérfano
                    </label>
                    <select
                      value={selectedOrphanBudgetId}
                      onChange={(e) => setSelectedOrphanBudgetId(e.target.value)}
                      className="w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md bg-white text-slate-800"
                    >
                      <option value="">-- Seleccionar presupuesto --</option>
                      {budgets
                        .filter(b => (b.status === 'Aprobado' || b.status === 'Aprovado') && !b.projectId)
                        .map(b => (
                          <option key={b.id} value={b.id}>
                            #{b.quoteId} - {b.title} ({b.amount} UF) - {b.clientName || b.company || 'Sin cliente'}
                          </option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="pt-lg flex justify-end gap-md border-t border-outline-variant/30 bg-white">
                    <button
                      type="button"
                      onClick={() => {
                        setAssociatingBudgetProject(null);
                        setSelectedOrphanBudgetId('');
                      }}
                      className="px-lg py-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!selectedOrphanBudgetId}
                      onClick={async () => {
                        const bId = selectedOrphanBudgetId;
                        const pId = associatingBudgetProject.id;
                        setAssociatingBudgetProject(null);
                        setSelectedOrphanBudgetId('');
                        try {
                          await onAssociateBudget(bId, pId);
                          setNotification({
                            type: 'success',
                            title: 'Presupuesto Asociado',
                            message: 'El presupuesto ha sido asociado al proyecto correctamente.'
                          });
                        } catch (err) {
                          setNotification({
                            type: 'error',
                            title: 'Error al Asociar',
                            message: err.message || 'Ocurrió un error al asociar el presupuesto.'
                          });
                        }
                      }}
                      className={`px-xl py-sm rounded-lg font-semibold shadow-sm active:scale-95 transition-all text-white ${
                        selectedOrphanBudgetId
                          ? 'bg-primary hover:bg-primary-container'
                          : 'bg-slate-300 cursor-not-allowed'
                      }`}
                    >
                      Asociar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-md">
                  <div className="text-center text-on-surface-variant italic py-lg">
                    No hay presupuestos aprobados huérfanos disponibles para asociar.
                  </div>
                  <div className="pt-lg flex justify-end border-t border-outline-variant/30">
                    <button
                      type="button"
                      onClick={() => setAssociatingBudgetProject(null)}
                      className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
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
