import * as XLSX from 'xlsx';
import { supabaseService } from './supabaseService';

// Helper to format date in DD/MM/YYYY
const formatDateExcel = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export const generateConsolidatedBackup = async ({ userName = 'Administrador', backupType = 'daily' } = {}) => {
  try {
    // 1. Fetch raw data from Supabase
    const rawData = await supabaseService.getAllRawDataForBackup();

    const {
      mainClients = [],
      clients = [],
      budgets = [],
      budgetItems = [],
      projects = [],
      extraCosts = [],
      installments = [],
      profiles = []
    } = rawData;

    // Create lookup maps for relations
    const mainClientMap = new Map(mainClients.map(c => [c.id, c]));
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const budgetMap = new Map(budgets.map(b => [b.id, b]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // --- SHEET 1: Reporte_Facturacion (PowerBI Compatible) ---
    const facturacionRows = [];
    installments.forEach(inst => {
      const proj = projectMap.get(inst.project_id);
      const budg = inst.origin_budget_id ? budgetMap.get(inst.origin_budget_id) : null;
      const client = proj ? clientMap.get(proj.client_id || proj.legal_entity_id) : null;
      const mainClient = proj && proj.main_client_id ? mainClientMap.get(proj.main_client_id) : null;

      const totCuotas = budg ? installments.filter(i => i.origin_budget_id === budg.id).length : 0;
      const yearVal = inst.scheduled_date ? inst.scheduled_date.split('-')[0] : '';
      const isInvoiced = inst.status === 'Facturado' || inst.status === 'Pagado' || inst.status === 'Factura emitida' || inst.status === 'Pagada';
      const isPaid = inst.status === 'Pagado' || inst.status === 'Pagada';

      const statusUI = inst.status === 'Facturado' ? 'Factura emitida' : (inst.status === 'Pagado' ? 'Pagada' : (inst.status || ''));

      facturacionRows.push({
        "Presupuesto #": budg ? budg.budget_number || '' : '',
        "Factura #": inst.invoice_number || '',
        "Fecha": formatDateExcel(inst.scheduled_date),
        "Año": yearVal,
        "Año Proy": proj ? proj.year || '' : '',
        "RUT": client ? client.rut || '' : '',
        "Razón Social": client ? client.company_name || '' : '',
        "Giro": client ? client.giro || '' : '',
        "Dirección": client ? client.address || '' : '',
        "Comuna": client ? client.comuna || '' : '',
        "Ciudad": client ? client.ciudad || '' : '',
        "Contacto": client ? client.contact_name || '' : '',
        "Obra": proj ? proj.project_name || '' : '',
        "Comentario": inst.comment || '',
        "Cuota": inst.installment_number || '',
        "TotCuota": totCuotas || '',
        "UF": parseFloat(inst.planned_amount_uf) || 0,
        "$": isInvoiced ? parseFloat(inst.total_amount_clp) || 0 : '',
        "F-Pago": isPaid ? formatDateExcel(inst.actual_payment_date) : '',
        "Estado F#": statusUI,
        "Tipo": '',
        "Cliente": client ? (client.company_name || client.contact_name || '') : (mainClient ? mainClient.name : ''),
        "N° Proyecto": proj ? proj.project_number || '' : '',
        "Revisor": '',
        "Firma": '',
        "Gerente Proyecto": '',
        "Ingeniero": '',
        "Dibujante": '',
        "M2": proj ? parseFloat(proj.superficie) || 0 : 0,
        "Total UF": budg ? parseFloat(budg.total_amount) || 0 : 0
      });
    });

    // Sort facturacionRows
    facturacionRows.sort((a, b) => {
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

    const wsFacturacion = XLSX.utils.json_to_sheet(facturacionRows, {
      header: [
        "Presupuesto #", "Factura #", "Fecha", "Año", "Año Proy", "RUT", "Razón Social",
        "Giro", "Dirección", "Comuna", "Ciudad", "Contacto", "Obra", "Comentario",
        "Cuota", "TotCuota", "UF", "$", "F-Pago", "Estado F#", "Tipo", "Cliente",
        "N° Proyecto", "Revisor", "Firma", "Gerente Proyecto", "Ingeniero", "Dibujante", "M2", "Total UF"
      ]
    });

    // --- SHEET 2: Reporte_Presupuestos_y_Costos (PowerBI Compatible) ---
    const proyectosRows = [];
    projects.forEach(proj => {
      const projBudgets = budgets.filter(b => b.project_id === proj.id);
      const projExtraCosts = extraCosts.filter(c => c.project_id === proj.id);
      const client = clientMap.get(proj.client_id || proj.legal_entity_id);
      const mainClient = mainClientMap.get(proj.main_client_id);
      const clientName = client ? client.company_name : (mainClient ? mainClient.name : '');
      const fullProjTitle = `${proj.project_number || ''}-${proj.project_name || ''}${clientName ? ` - ${clientName}` : ''}`;

      projBudgets.forEach(budg => {
        proyectosRows.push({
          "Código de presupuesto": budg.budget_number || '',
          "Proyecto": fullProjTitle,
          "Presupuesto (UF)": parseFloat(budg.total_amount) || 0,
          "Costo Extra (UF)": '',
          "Descripción": budg.title || '',
          "Comentario": '',
          "m2": parseFloat(proj.superficie) || 0,
          "Rentabilidad esperada": (proj.rentabilidad !== undefined && proj.rentabilidad !== null) ? `${proj.rentabilidad}%` : '',
          "Factura": '',
          "Facturado": ''
        });
      });

      projExtraCosts.forEach(cost => {
        proyectosRows.push({
          "Código de presupuesto": '',
          "Proyecto": fullProjTitle,
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

    const wsProyectos = XLSX.utils.json_to_sheet(proyectosRows, {
      header: [
        "Código de presupuesto", "Proyecto", "Presupuesto (UF)", "Costo Extra (UF)",
        "Descripción", "Comentario", "m2", "Rentabilidad esperada", "Factura", "Facturado"
      ]
    });

    // --- RAW DATABASE SHEETS FOR RECOVERY ---
    const wsMainClients = XLSX.utils.json_to_sheet(mainClients);
    const wsClients = XLSX.utils.json_to_sheet(clients);
    
    // Sanitize JSON fields for Excel
    const sanitizedBudgets = budgets.map(b => ({
      ...b,
      backup_files: b.backup_files ? JSON.stringify(b.backup_files) : ''
    }));
    const wsBudgets = XLSX.utils.json_to_sheet(sanitizedBudgets);
    const wsBudgetItems = XLSX.utils.json_to_sheet(budgetItems);
    const wsRawProjects = XLSX.utils.json_to_sheet(projects);
    const wsExtraCosts = XLSX.utils.json_to_sheet(extraCosts);
    const wsInstallments = XLSX.utils.json_to_sheet(installments);
    
    // Remove sensitive password fields if present in profiles
    const sanitizedProfiles = profiles.map(p => {
      const copy = { ...p };
      delete copy.password;
      return copy;
    });
    const wsProfiles = XLSX.utils.json_to_sheet(sanitizedProfiles);

    // Assemble Workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, wsFacturacion, "Reporte_Facturacion");
    XLSX.utils.book_append_sheet(workbook, wsProyectos, "Reporte_Presupuestos_y_Costos");
    XLSX.utils.book_append_sheet(workbook, wsMainClients, "DB_Clientes_Principales");
    XLSX.utils.book_append_sheet(workbook, wsClients, "DB_Razones_Sociales");
    XLSX.utils.book_append_sheet(workbook, wsBudgets, "DB_Presupuestos");
    XLSX.utils.book_append_sheet(workbook, wsBudgetItems, "DB_Detalle_Presupuestos");
    XLSX.utils.book_append_sheet(workbook, wsRawProjects, "DB_Proyectos");
    XLSX.utils.book_append_sheet(workbook, wsExtraCosts, "DB_Costos_Extras");
    XLSX.utils.book_append_sheet(workbook, wsInstallments, "DB_Cuotas_Facturacion");
    XLSX.utils.book_append_sheet(workbook, wsProfiles, "DB_Usuarios");

    // Auto-fit columns helper
    [wsFacturacion, wsProyectos, wsMainClients, wsClients, wsBudgets, wsBudgetItems, wsRawProjects, wsExtraCosts, wsInstallments, wsProfiles].forEach(ws => {
      if (!ws || !ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const cols = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        cols.push({ wch: 20 });
      }
      ws['!cols'] = cols;
    });

    // File name with today's date YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    const fileName = `Respaldo_SPOERER_${today}.xlsx`;

    // Download file
    XLSX.writeFile(workbook, fileName);

    // Save log to Supabase
    await supabaseService.createBackupLog({
      userName,
      backupType,
      fileName
    });

    return { success: true, fileName };
  } catch (error) {
    console.error('Error generating consolidated backup:', error);
    throw error;
  }
};
