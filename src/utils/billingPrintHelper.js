import { formatRut } from './validation';

/**
 * Resolves the appropriate legal entity (Razón Social) for an installment,
 * checking installment-level assignment first, then budget-level assignment.
 */
const getInstallmentRazonSocial = (installment, budget, clients) => {
  if (!clients || !Array.isArray(clients)) return null;
  const targetLegalId = installment?.legalEntityId || budget?.legalEntityId || budget?.clientId;
  if (targetLegalId) {
    const found = clients.find(c => c.id === targetLegalId && c.company);
    if (found) return found;
  }
  if (budget?.company) {
    const foundByName = clients.find(c => c.company && c.company.trim().toLowerCase() === budget.company.trim().toLowerCase());
    if (foundByName) return foundByName;
  }
  return null;
};

/**
 * Formats a date string to dd/mm/yyyy.
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const clean = String(dateStr).trim();
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
  }
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return clean;
    }
  }
  return clean;
};

/**
 * Formats currency amount.
 */
const formatAmount = (val, currency = 'UF') => {
  const num = parseFloat(val);
  if (isNaN(num)) return '-';
  const curr = (currency || 'UF').toUpperCase();
  if (curr === 'CLP') {
    return Math.round(num).toLocaleString('es-CL');
  }
  return num.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Escapes HTML characters to prevent XSS in print output.
 */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Groups and prints the filtered billing installments.
 * Generates an isolated HTML document in a hidden iframe and triggers window.print().
 */
export const printFilteredBillingInstallments = ({
  filteredInstallments = [],
  projects = [],
  budgets = [],
  clients = [],
  activeFilters = {}
}) => {
  if (!filteredInstallments || filteredInstallments.length === 0) {
    alert('No hay cuotas que coincidan con los filtros seleccionados para imprimir.');
    return;
  }

  // 1. Group installments by project
  // Map projectId -> { project, installments: [] }
  const projectMap = new Map();
  const orphanInstallments = [];

  filteredInstallments.forEach(inst => {
    const pId = inst.project_id;
    if (pId) {
      if (!projectMap.has(pId)) {
        const proj = projects.find(p => p.id === pId) || { id: pId, projectNumber: '', rawProjectName: 'Proyecto no encontrado' };
        projectMap.set(pId, {
          project: proj,
          installments: []
        });
      }
      projectMap.get(pId).installments.push(inst);
    } else {
      orphanInstallments.push(inst);
    }
  });

  // Convert map to sorted array (sorted by projectNumber)
  const projectGroups = Array.from(projectMap.values()).sort((a, b) => {
    const numA = a.project?.projectNumber || '';
    const numB = b.project?.projectNumber || '';
    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // If there are orphan installments, group them at the end
  if (orphanInstallments.length > 0) {
    projectGroups.push({
      project: { id: 'sin-proyecto', projectNumber: '', rawProjectName: 'Sin Proyecto Asociado' },
      installments: orphanInstallments
    });
  }

  // Sort installments within each project by Budget Quote ID and Quota Number
  projectGroups.forEach(group => {
    group.installments.sort((a, b) => {
      const budgetA = budgets.find(bg => bg.id === a.origin_budget_id);
      const budgetB = budgets.find(bg => bg.id === b.origin_budget_id);
      const quoteA = String(budgetA?.quoteId || '');
      const quoteB = String(budgetB?.quoteId || '');
      const quoteComp = quoteA.localeCompare(quoteB, undefined, { numeric: true, sensitivity: 'base' });
      if (quoteComp !== 0) return quoteComp;
      return (a.numQuota || 0) - (b.numQuota || 0);
    });
  });

  // 2. Global totals
  const globalTotalsByCurrency = {};
  filteredInstallments.forEach(inst => {
    const curr = (inst.currency || 'UF').toUpperCase();
    const amt = parseFloat(inst.uf) || 0;
    globalTotalsByCurrency[curr] = (globalTotalsByCurrency[curr] || 0) + amt;
  });

  // 3. Current date/time for report header
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 4. Build Filter Summary tags
  const filterTags = [];
  if (activeFilters.temporal && activeFilters.temporal !== 'Todos') {
    filterTags.push(`<strong>Período:</strong> ${escapeHtml(activeFilters.temporal)}`);
  }
  if (activeFilters.status && activeFilters.status !== 'Todos') {
    filterTags.push(`<strong>Estado:</strong> ${escapeHtml(activeFilters.status)}`);
  }
  if (activeFilters.client && activeFilters.client !== 'Todos') {
    filterTags.push(`<strong>Cliente:</strong> ${escapeHtml(activeFilters.client)}`);
  }
  if (activeFilters.encargado && activeFilters.encargado !== 'Todos') {
    filterTags.push(`<strong>Encargado:</strong> ${escapeHtml(activeFilters.encargado)}`);
  }
  if (activeFilters.company && activeFilters.company !== 'Todos') {
    filterTags.push(`<strong>Empresa Emisora:</strong> ${escapeHtml(activeFilters.company)}`);
  }
  if (activeFilters.search && activeFilters.search.trim()) {
    filterTags.push(`<strong>Búsqueda:</strong> "${escapeHtml(activeFilters.search.trim())}"`);
  }

  // 5. Build HTML content
  let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Facturación - SPOERER ERP</title>
  <style>
    @page {
      size: landscape;
      margin: 8mm 8mm 10mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 8pt;
      line-height: 1.25;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #091426;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .report-title-box h1 {
      margin: 0;
      font-size: 13pt;
      font-weight: 800;
      color: #091426;
      letter-spacing: -0.01em;
    }
    .report-title-box p {
      margin: 2px 0 0 0;
      font-size: 8pt;
      color: #475569;
    }
    .report-meta-box {
      text-align: right;
      font-size: 7.5pt;
      color: #64748b;
    }
    .filter-bar {
      background: #f8fafc;
      border: 0.5pt solid #cbd5e1;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 7pt;
      color: #334155;
      margin-bottom: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .project-section {
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .project-title-bar {
      background: #091426;
      color: #ffffff;
      padding: 4px 8px;
      font-size: 9pt;
      font-weight: 700;
      border-radius: 3px 3px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .project-title-left {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .project-title-main {
      font-size: 9.5pt;
      font-weight: 800;
      letter-spacing: 0.01em;
    }
    .project-subtitle {
      font-size: 7.5pt;
      color: #94a3b8;
      font-weight: normal;
    }
    .project-count {
      font-size: 7.5pt;
      background: rgba(255, 255, 255, 0.15);
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 0.5pt solid #cbd5e1;
      border-top: none;
      margin-bottom: 4px;
    }
    thead {
      display: table-header-group;
    }
    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      padding: 4px 4px;
      border: 0.5pt solid #cbd5e1;
      vertical-align: middle;
      line-height: 1.15;
    }
    td {
      padding: 3.5px 4px;
      border: 0.5pt solid #e2e8f0;
      font-size: 7.5pt;
      word-break: break-word;
      overflow-wrap: break-word;
      vertical-align: top;
      line-height: 1.2;
    }
    tr:nth-child(even) td {
      background-color: #fafbfd;
    }
    .subtotal-row td {
      background-color: #f1f5f9 !important;
      font-weight: 700;
      border-top: 1pt solid #94a3b8;
      font-size: 7.5pt;
      padding: 4px 5px;
    }
    .global-summary {
      margin-top: 14px;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1pt solid #091426;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .global-summary-title {
      font-size: 8.5pt;
      font-weight: 800;
      color: #091426;
      text-transform: uppercase;
    }
    .global-summary-values {
      display: flex;
      gap: 16px;
      font-size: 8.5pt;
      font-weight: 700;
      color: #006a61;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .nowrap { white-space: nowrap; }
    tr { page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="report-header">
    <div class="report-title-box">
      <h1>SPOERER &bull; Reporte de Facturación</h1>
      <p>Centro de Cobranzas &bull; Listado Consolidado de Cuotas Filtradas</p>
    </div>
    <div class="report-meta-box">
      <div><strong>Fecha de emisión:</strong> ${dateFormatted} a las ${timeFormatted}</div>
      <div><strong>Total proyectos:</strong> ${projectGroups.length} | <strong>Total cuotas:</strong> ${filteredInstallments.length}</div>
    </div>
  </div>
`;

  // Filters summary
  if (filterTags.length > 0) {
    html += `
  <div class="filter-bar">
    <span><strong>Filtros aplicados:</strong></span>
    ${filterTags.join(' &bull; ')}
  </div>`;
  }

  // 6. Iterate through each Project
  projectGroups.forEach(group => {
    const proj = group.project;
    const projTitle = proj.projectNumber
      ? `${escapeHtml(proj.projectNumber)} - ${escapeHtml(proj.rawProjectName || proj.projectName || 'Sin nombre')}`
      : escapeHtml(proj.rawProjectName || proj.projectName || 'Sin Proyecto');

    const projClient = proj.cliente && proj.cliente !== 'Cliente no definido' ? proj.cliente : '';
    const projEncargado = proj.encargado ? `Encargado: ${proj.encargado}` : '';
    const projSubParts = [projClient, projEncargado].filter(Boolean).join(' | ');

    // Calculate project subtotal by currency
    const projTotals = {};
    group.installments.forEach(inst => {
      const curr = (inst.currency || 'UF').toUpperCase();
      const amt = parseFloat(inst.uf) || 0;
      projTotals[curr] = (projTotals[curr] || 0) + amt;
    });
    const projTotalsStr = Object.entries(projTotals)
      .map(([curr, amt]) => `${formatAmount(amt, curr)} ${curr}`)
      .join(' | ');

    html += `
  <div class="project-section">
    <!-- Project Title as requested in Requirement 1 -->
    <div class="project-title-bar">
      <div class="project-title-left">
        <span class="project-title-main">${projTitle}</span>
        ${projSubParts ? `<span class="project-subtitle">(${escapeHtml(projSubParts)})</span>` : ''}
      </div>
      <span class="project-count">${group.installments.length} ${group.installments.length === 1 ? 'cuota' : 'cuotas'}</span>
    </div>

    <!-- Unified Table for All Budgets of this Project (Requirements 1, 2, 3) -->
    <table>
      <colgroup>
        <col style="width: 8.5%;">  <!-- N° Presupuesto -->
        <col style="width: 4.5%;">  <!-- N° Cuota -->
        <col style="width: 7.5%;">  <!-- Fecha -->
        <col style="width: 8.5%;">  <!-- RUT -->
        <col style="width: 16%;">   <!-- Razón Social -->
        <col style="width: 16%;">   <!-- Dirección -->
        <col style="width: 10%;">   <!-- Contacto -->
        <col style="width: 12.5%;"> <!-- Comentario Cuota -->
        <col style="width: 6.5%;">  <!-- OC -->
        <col style="width: 4%;">    <!-- Moneda -->
        <col style="width: 6%;">    <!-- Monto Cuota -->
      </colgroup>
      <thead>
        <tr>
          <th class="text-center">N° Presupuesto</th>
          <th class="text-center">N° Cuota</th>
          <th class="text-center">Fecha</th>
          <th class="text-left">RUT</th>
          <th class="text-left">Razón Social</th>
          <th class="text-left">Dirección</th>
          <th class="text-left">Contacto</th>
          <th class="text-left">Comentario Cuota</th>
          <th class="text-center">OC</th>
          <th class="text-center">Moneda</th>
          <th class="text-right">Monto Cuota</th>
        </tr>
      </thead>
      <tbody>`;

    group.installments.forEach(inst => {
      const budget = budgets.find(bg => bg.id === inst.origin_budget_id);
      const razonSocial = getInstallmentRazonSocial(inst, budget, clients);

      const quoteNum = budget?.quoteId || '-';
      const quotaNum = inst.numQuota ? String(inst.numQuota) : '-';
      const quotaDate = formatDate(inst.date);
      const rutStr = razonSocial?.rut ? formatRut(razonSocial.rut) : '-';
      const rsCompany = razonSocial?.company || '-';
      const rsAddress = [razonSocial?.address, razonSocial?.comuna].filter(Boolean).join(', ') || '-';
      const rsContact = razonSocial?.name || razonSocial?.contactName || '-';
      const quotaComment = inst.comment || '-';
      const quotaOc = inst.oc || '-';
      const quotaCurrency = (inst.currency || budget?.currency || 'UF').toUpperCase();
      const quotaAmount = formatAmount(inst.uf, quotaCurrency);

      html += `
        <tr>
          <td class="text-center nowrap font-semibold">${escapeHtml(quoteNum)}</td>
          <td class="text-center nowrap font-semibold">${escapeHtml(quotaNum)}</td>
          <td class="text-center nowrap">${escapeHtml(quotaDate)}</td>
          <td class="text-left nowrap">${escapeHtml(rutStr)}</td>
          <td class="text-left">${escapeHtml(rsCompany)}</td>
          <td class="text-left">${escapeHtml(rsAddress)}</td>
          <td class="text-left">${escapeHtml(rsContact)}</td>
          <td class="text-left">${escapeHtml(quotaComment)}</td>
          <td class="text-center">${escapeHtml(quotaOc)}</td>
          <td class="text-center nowrap font-semibold">${escapeHtml(quotaCurrency)}</td>
          <td class="text-right nowrap font-semibold">${escapeHtml(quotaAmount)}</td>
        </tr>`;
    });

    // Subtotal row for this project
    html += `
        <tr class="subtotal-row">
          <td colspan="9" class="text-right">Total Proyecto (${escapeHtml(proj.projectNumber || 'Ref')}):</td>
          <td colspan="2" class="text-right nowrap">${escapeHtml(projTotalsStr || '-')}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
  });

  // Global Summary Footer
  const globalTotalsStr = Object.entries(globalTotalsByCurrency)
    .map(([curr, amt]) => `${formatAmount(amt, curr)} ${curr}`)
    .join('  |  ');

  html += `
  <div class="global-summary">
    <span class="global-summary-title">Resumen General Filtrado (${projectGroups.length} Proyectos, ${filteredInstallments.length} Cuotas)</span>
    <span class="global-summary-values">${escapeHtml(globalTotalsStr)}</span>
  </div>
</body>
</html>`;

  // 7. Mount hidden iframe and trigger print
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.title = 'Imprimir Facturacion Spoerer';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Allow browser time to parse CSS and fonts before triggering print dialog
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Error al invocar impresión en iframe:', e);
    } finally {
      // Remove iframe after print dialog is closed or cancelled
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 350);
};
