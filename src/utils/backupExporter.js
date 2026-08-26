import * as XLSX from 'xlsx';
import { supabaseService } from './supabaseService';
import { exportExcelFile } from './exportHelper';

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
      const budg = inst.origin_budget_id ? budgetMap.get(inst.origin_budget_id) : null;
      const proj = inst.project_id ? projectMap.get(inst.project_id) : (budg?.project_id ? projectMap.get(budg.project_id) : null);
      
      // Razón Social asociada específicamente a cada presupuesto
      const budgetLegalEntityId = budg ? (budg.legal_entity_id || budg.client_id) : null;
      const budgetRazonSocial = budgetLegalEntityId ? clientMap.get(budgetLegalEntityId) : null;

      // Nombre del cliente real (priorizando entidad unificada / Cliente Real)
      let realClientName = '';
      if (budg && budg.main_client_id && mainClientMap.has(budg.main_client_id)) {
        realClientName = mainClientMap.get(budg.main_client_id).name;
      } else if (budgetRazonSocial) {
        if (budgetRazonSocial.main_client_id && mainClientMap.has(budgetRazonSocial.main_client_id)) {
          realClientName = mainClientMap.get(budgetRazonSocial.main_client_id).name;
        } else if (budgetRazonSocial.real_client) {
          realClientName = budgetRazonSocial.real_client;
        }
      }

      if (!realClientName && proj) {
        if (proj.main_client_id && mainClientMap.has(proj.main_client_id)) {
          realClientName = mainClientMap.get(proj.main_client_id).name;
        } else {
          const projClient = clientMap.get(proj.client_id || proj.legal_entity_id);
          if (projClient) {
            if (projClient.main_client_id && mainClientMap.has(projClient.main_client_id)) {
              realClientName = mainClientMap.get(projClient.main_client_id).name;
            } else if (projClient.real_client) {
              realClientName = projClient.real_client;
            }
          }
        }
      }

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
        "RUT": budgetRazonSocial ? budgetRazonSocial.rut || '' : '',
        "Razón Social": budgetRazonSocial ? budgetRazonSocial.company_name || '' : '',
        "Giro": budgetRazonSocial ? budgetRazonSocial.giro || '' : '',
        "Dirección": budgetRazonSocial ? budgetRazonSocial.address || '' : '',
        "Comuna": budgetRazonSocial ? budgetRazonSocial.comuna || '' : '',
        "Ciudad": budgetRazonSocial ? budgetRazonSocial.ciudad || '' : '',
        "Contacto": budgetRazonSocial ? budgetRazonSocial.contact_name || '' : '',
        "Obra": proj ? proj.project_name || '' : '',
        "Comentario": inst.comment || '',
        "Cuota": inst.installment_number || '',
        "TotCuota": totCuotas || '',
        "UF": parseFloat(inst.planned_amount_uf) || 0,
        "$": isInvoiced ? parseFloat(inst.total_amount_clp) || 0 : '',
        "F-Pago": isPaid ? formatDateExcel(inst.actual_payment_date) : '',
        "Estado F#": statusUI,
        "Tipo": '',
        "Cliente": realClientName,
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
      const clientName = mainClient ? mainClient.name : (client ? (client.main_client_id ? mainClientMap.get(client.main_client_id)?.name || client.real_client : client.real_client || client.company_name) : '');
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

    // Suggested file name: YYMMDD – Respaldo ERP Spoerer.xlsx
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const fileName = `${yy}${mm}${dd} – Respaldo ERP Spoerer.xlsx`;

    // Download / Save file using exportExcelFile (picker with suggestedName)
    const exported = await exportExcelFile(workbook, fileName, 'spoerer_backup_general');
    if (exported === false) {
      return { success: false, cancelled: true };
    }

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
