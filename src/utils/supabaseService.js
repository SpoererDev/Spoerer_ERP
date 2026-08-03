import { supabase } from './supabaseClient';

// Helper: Verify if a string is a valid Postgres UUID
const isUuid = (id) => {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

// Helper: Map main client fields
const mapMainClientFromDb = (dbMainClient) => ({
  id: dbMainClient.id,
  name: dbMainClient.name,
  contactName: dbMainClient.contact_name || '',
  contactEmail: dbMainClient.contact_email || '',
  initials: dbMainClient.name 
    ? dbMainClient.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() 
    : 'CP'
});

const mapMainClientToDb = (mainClient) => ({
  name: mainClient.name,
  contact_name: mainClient.contactName || null,
  contact_email: mainClient.contactEmail || null
});

// Helper: Map client fields between database (snake_case) and frontend (camelCase)
const mapClientFromDb = (dbClient) => ({
  id: dbClient.id,
  rut: dbClient.rut,
  company: dbClient.company_name,
  mainClientId: dbClient.main_client_id || null,
  realClient: dbClient.main_clients ? dbClient.main_clients.name : (dbClient.real_client || ''),
  mainClientName: dbClient.main_clients ? dbClient.main_clients.name : (dbClient.real_client || ''),
  giro: dbClient.giro,
  address: dbClient.address,
  comuna: dbClient.comuna,
  ciudad: dbClient.ciudad,
  name: dbClient.contact_name,
  email: dbClient.contact_email,
  phone: dbClient.contact_phone,
  initials: dbClient.company_name 
    ? dbClient.company_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() 
    : 'CL'
});

const mapClientToDb = (client) => ({
  rut: client.rut,
  company_name: client.company,
  main_client_id: client.mainClientId || null,
  real_client: client.realClient || client.mainClientName || null,
  giro: client.giro,
  address: client.address,
  comuna: client.comuna,
  ciudad: client.ciudad,
  contact_name: client.name,
  contact_email: client.email,
  contact_phone: client.phone
});

// Helper: Map budget fields between database and frontend
const mapBudgetFromDb = (dbBudget) => {
  if (!dbBudget) return null;

  const mainClientName = dbBudget.main_clients 
    ? dbBudget.main_clients.name 
    : (dbBudget.clients 
        ? (dbBudget.clients.main_clients ? dbBudget.clients.main_clients.name : (dbBudget.clients.real_client || dbBudget.clients.company_name))
        : '');

  const legalEntityCompany = dbBudget.clients ? dbBudget.clients.company_name : '';

  return {
    id: dbBudget.id,
    quoteId: dbBudget.budget_number,
    clientId: dbBudget.client_id,
    mainClientId: dbBudget.main_client_id || null,
    legalEntityId: dbBudget.legal_entity_id || dbBudget.client_id || null,
    projectId: dbBudget.project_id,
    clientName: mainClientName || legalEntityCompany || 'Cliente',
    mainClientName: mainClientName,
    company: legalEntityCompany || mainClientName,
    title: dbBudget.title,
    date: dbBudget.date ? dbBudget.date.split('-').reverse().join('/') : '', // YYYY-MM-DD -> DD/MM/YYYY
    amount: parseFloat(dbBudget.total_amount) || 0,
    validity: `${dbBudget.validity_days} días`,
    status: dbBudget.status,
    items: dbBudget.budget_items ? dbBudget.budget_items.map(item => ({
      id: item.id,
      description: item.description,
      qty: parseFloat(item.quantity) || 0,
      price: parseFloat(item.unit_price) || 0
    })) : [],
    backupFiles: dbBudget.backup_files || []
  };
};

// Helper: Map project fields between database and frontend
const mapProjectFromDb = (dbProject) => {
  if (!dbProject) return null;

  const mainClientName = dbProject.main_clients 
    ? dbProject.main_clients.name 
    : (dbProject.clients 
        ? (dbProject.clients.main_clients ? dbProject.clients.main_clients.name : (dbProject.clients.real_client || dbProject.clients.company_name))
        : '');

  const legalEntityCompany = dbProject.clients ? dbProject.clients.company_name : '';
  const displayClient = legalEntityCompany || mainClientName || 'Cliente';

  return {
    id: dbProject.id,
    projectNumber: dbProject.project_number,
    projectName: `${dbProject.project_number}-${dbProject.project_name} - ${displayClient}`, // Concatenated for legacy UI
    rawProjectName: dbProject.project_name, // Clean name
    superficie: parseFloat(dbProject.superficie) || 0,
    rentabilidad: parseFloat(dbProject.rentabilidad) || 0,
    anio: dbProject.year,
    cliente: displayClient,
    clientId: dbProject.client_id,
    mainClientId: dbProject.main_client_id || null,
    legalEntityId: dbProject.legal_entity_id || dbProject.client_id || null,
    status: dbProject.status,
    tipo: dbProject.tipo,
    encargado: dbProject.encargado || ''
  };
};

const mapInstallmentStatusToDb = (status) => {
  if (status === 'Factura emitida') return 'Facturado';
  if (status === 'Pagada') return 'Pagado';
  return status;
};

const mapInstallmentStatusFromDb = (status) => {
  if (status === 'Facturado') return 'Factura emitida';
  if (status === 'Pagado') return 'Pagada';
  return status;
};

// Helper: Map installment fields
const mapInstallmentFromDb = (dbInst) => ({
  id: dbInst.id,
  project_id: dbInst.project_id,
  origin_budget_id: dbInst.origin_budget_id,
  numQuota: dbInst.installment_number,
  date: dbInst.scheduled_date,
  uf: parseFloat(dbInst.planned_amount_uf) || 0,
  net_clp: dbInst.net_amount_clp ? parseFloat(dbInst.net_amount_clp) : null,
  tax_clp: dbInst.tax_amount_clp ? parseFloat(dbInst.tax_amount_clp) : null,
  total_clp: dbInst.total_amount_clp ? parseFloat(dbInst.total_amount_clp) : null,
  status: mapInstallmentStatusFromDb(dbInst.status),
  actualInvoiceDate: dbInst.actual_invoice_date || null,
  invoiceNumber: dbInst.invoice_number || '',
  invoiceFileUrl: dbInst.invoice_file_url || '',
  actualPaymentDate: dbInst.actual_payment_date || null,
  paymentBackupUrl: dbInst.payment_backup_url || '',
  comment: dbInst.comment || '',
  dateConfirmed: dbInst.date_confirmed || false
});

// Helper: Map extra costs fields
const mapExtraCostFromDb = (dbCost) => ({
  id: dbCost.id,
  project_id: dbCost.project_id,
  amount: parseFloat(dbCost.amount) || 0,
  superficie: parseFloat(dbCost.superficie) || 0,
  comment: dbCost.comment || ''
});

// Helper: Map status to storage folder name
const getStatusFolder = (status) => {
  const s = (status || 'Borrador').toLowerCase().trim();
  if (s === 'borrador' || s === 'en revisión' || s === 'en revision') return 'borradores';
  if (s === 'enviado') return 'enviados';
  if (s === 'aprobado' || s === 'aprovado') return 'aprobados';
  if (s === 'rechazado') return 'rechazados';
  return 'borradores';
};

// Helper: Upload files to Supabase Storage
const uploadQuoteFiles = async (budgetNumber, status, files) => {
  if (!files || files.length === 0) return [];
  
  const folder = getStatusFolder(status);
  const uploadedFiles = [];
  
  for (const file of files) {
    if (file.fileObject) {
      const path = `presupuestos/${folder}/${budgetNumber}/${file.name}`;
      const { data, error } = await supabase.storage.from('budgets').upload(path, file.fileObject, {
        upsert: true
      });
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from('budgets').getPublicUrl(path);
      
      uploadedFiles.push({
        name: file.name,
        size: file.size,
        type: file.type,
        url: publicUrl,
        path: path
      });
    } else {
      uploadedFiles.push({
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url,
        path: file.path
      });
    }
  }
  return uploadedFiles;
};

// Helper: Move files in Supabase Storage when status changes
const moveQuoteFiles = async (budgetNumber, oldStatus, newStatus, existingFiles) => {
  const oldFolder = getStatusFolder(oldStatus);
  const newFolder = getStatusFolder(newStatus);
  
  if (oldFolder === newFolder || !existingFiles || existingFiles.length === 0) {
    return existingFiles || [];
  }
  
  const movedFiles = [];
  
  for (const file of existingFiles) {
    if (file.path) {
      const oldPath = file.path;
      const newPath = `presupuestos/${newFolder}/${budgetNumber}/${file.name}`;
      
      const { error } = await supabase.storage.from('budgets').move(oldPath, newPath);
      if (error) {
        console.error(`Error moving file from ${oldPath} to ${newPath}:`, error);
        movedFiles.push(file);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('budgets').getPublicUrl(newPath);
        movedFiles.push({
          ...file,
          url: publicUrl,
          path: newPath
        });
      }
    } else {
      movedFiles.push(file);
    }
  }
  
  return movedFiles;
};

export const supabaseService = {
  // MAIN CLIENTS CRM CRUD
  async getMainClients() {
    try {
      const { data, error } = await supabase
        .from('main_clients')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) {
        console.warn("Table main_clients not available or error:", error.message);
        return [];
      }
      return data.map(mapMainClientFromDb);
    } catch (err) {
      console.warn("Error fetching main clients:", err.message);
      return [];
    }
  },

  async saveMainClient(mainClient) {
    const dbData = mapMainClientToDb(mainClient);
    
    try {
      if (mainClient.id && isUuid(mainClient.id)) {
        // Update
        const { data, error } = await supabase
          .from('main_clients')
          .update(dbData)
          .eq('id', mainClient.id)
          .select();
        
        if (error) {
          if (error.message && error.message.includes('main_clients')) {
            throw new Error("La tabla 'main_clients' no existe en Supabase. Por favor ejecute el script SQL en el Editor SQL de Supabase.");
          }
          throw error;
        }
        return mapMainClientFromDb(data[0]);
      } else {
        // Insert
        const { data, error } = await supabase
          .from('main_clients')
          .insert([dbData])
          .select();
        
        if (error) {
          if (error.message && error.message.includes('main_clients')) {
            throw new Error("La tabla 'main_clients' no existe en Supabase. Por favor ejecute el script SQL en el Editor SQL de Supabase.");
          }
          throw error;
        }
        return mapMainClientFromDb(data[0]);
      }
    } catch (err) {
      if (err.message && err.message.includes('main_clients')) {
        throw new Error("La tabla 'main_clients' no existe en Supabase. Por favor ejecute el script SQL proporcionado en el Editor SQL de Supabase.");
      }
      throw err;
    }
  },

  async deleteMainClient(id) {
    const { error } = await supabase
      .from('main_clients')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return id;
  },

  // CLIENTS (Razones Sociales) CRM CRUD
  async getClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*, main_clients(*)')
        .order('company_name', { ascending: true });
      
      if (error) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('clients')
          .select('*')
          .order('company_name', { ascending: true });
        if (fallbackError) throw fallbackError;
        return fallbackData.map(mapClientFromDb);
      }
      return data.map(mapClientFromDb);
    } catch (err) {
      console.error("Error in getClients:", err);
      throw err;
    }
  },

  async saveClient(client) {
    const dbData = mapClientToDb(client);
    
    if (client.id && isUuid(client.id)) {
      // Update
      const { data, error } = await supabase
        .from('clients')
        .update(dbData)
        .eq('id', client.id)
        .select('*, main_clients(*)');
      
      if (error) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('clients')
          .update(dbData)
          .eq('id', client.id)
          .select();
        if (fallbackError) throw fallbackError;
        return mapClientFromDb(fallbackData[0]);
      }
      return mapClientFromDb(data[0]);
    } else {
      // Insert
      const { data, error } = await supabase
        .from('clients')
        .insert([dbData])
        .select('*, main_clients(*)');
      
      if (error) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('clients')
          .insert([dbData])
          .select();
        if (fallbackError) throw fallbackError;
        return mapClientFromDb(fallbackData[0]);
      }
      return mapClientFromDb(data[0]);
    }
  },

  async deleteClient(id) {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return id;
  },

  // BUDGETS CRUD
  async getBudgets() {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*)), budget_items(*)')
        .order('created_at', { ascending: false });
      
      if (error) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('budgets')
          .select('*, clients:clients!client_id(*), budget_items(*)')
          .order('created_at', { ascending: false });
        if (fallbackError) throw fallbackError;
        return fallbackData.map(mapBudgetFromDb).filter(Boolean);
      }
      return data.map(mapBudgetFromDb).filter(Boolean);
    } catch (err) {
      console.error("Error in getBudgets:", err);
      throw err;
    }
  },

  async saveQuote(quote, items, billingInstallments) {
    // 1. Calculate amount dynamically (Net total before taxes)
    const netAmount = items.reduce((sum, item) => sum + ((parseFloat(item.qty) || 1) * (parseFloat(item.price) || 0)), 0);
    const totalAmount = Math.round(netAmount * 100) / 100;

    const validityDays = quote.validity 
      ? parseInt(quote.validity.replace(/[^0-9]/g, '')) || 30 
      : 30;

    const formattedDate = quote.date 
      ? quote.date.split('/').reverse().join('-') // DD/MM/YYYY -> YYYY-MM-DD
      : new Date().toISOString().split('T')[0];

    const budgetNumber = quote.quoteId;
    let finalFiles = quote.backupFiles || [];
    let savedBudget;

    if (quote.id && isUuid(quote.id)) {
      // Update Budget
      // 1. Retrieve the existing budget to see if status changed or files deleted
      const { data: oldBudget } = await supabase
        .from('budgets')
        .select('status, backup_files, project_id')
        .eq('id', quote.id)
        .single();

      if (oldBudget) {
        // Move files if status changed
        if (oldBudget.status !== quote.status) {
          const existingUploadedFiles = oldBudget.backup_files || [];
          finalFiles = await moveQuoteFiles(budgetNumber, oldBudget.status, quote.status, existingUploadedFiles);
        }
        // Remove deleted files from storage
        const oldFiles = oldBudget.backup_files || [];
        const newFileNames = new Set((quote.backupFiles || []).map(f => f.name));
        for (const oldFile of oldFiles) {
          if (!newFileNames.has(oldFile.name) && oldFile.path) {
            await supabase.storage.from('budgets').remove([oldFile.path]);
          }
        }
      }

      // 2. Upload any newly added files
      finalFiles = await uploadQuoteFiles(budgetNumber, quote.status, finalFiles);

      const budgetData = {
        client_id: quote.clientId || quote.legalEntityId || null,
        main_client_id: quote.mainClientId || null,
        legal_entity_id: quote.legalEntityId || quote.clientId || null,
        project_id: quote.projectId || (oldBudget ? oldBudget.project_id : null),
        title: quote.title,
        date: formattedDate,
        total_amount: totalAmount,
        validity_days: validityDays,
        status: quote.status || 'Borrador',
        backup_files: finalFiles
      };

      const { data, error } = await supabase
        .from('budgets')
        .update(budgetData)
        .eq('id', quote.id)
        .select();
      if (error) throw error;
      savedBudget = data[0];
    } else {
      // Insert Budget
      // 1. Upload files directly to the target status folder
      finalFiles = await uploadQuoteFiles(budgetNumber, quote.status, finalFiles);

      const budgetData = {
        client_id: quote.clientId || quote.legalEntityId || null,
        main_client_id: quote.mainClientId || null,
        legal_entity_id: quote.legalEntityId || quote.clientId || null,
        project_id: quote.projectId || null,
        title: quote.title,
        date: formattedDate,
        total_amount: totalAmount,
        validity_days: validityDays,
        status: quote.status || 'Borrador',
        created_by: quote.createdBy || null,
        budget_number: budgetNumber,
        backup_files: finalFiles
      };

      if (!budgetData.created_by) {
        const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
        if (profiles && profiles.length > 0) {
          budgetData.created_by = profiles[0].id;
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            budgetData.created_by = session.user.id;
          }
        }
      }

      const { data, error } = await supabase
        .from('budgets')
        .insert([budgetData])
        .select();
      if (error) throw error;
      savedBudget = data[0];
    }

    // 2. Sync Items (Budget Items)
    await supabase.from('budget_items').delete().eq('budget_id', savedBudget.id);

    if (items && items.length > 0) {
      const itemsToInsert = items.map(item => ({
        budget_id: savedBudget.id,
        description: item.description,
        quantity: parseFloat(item.qty) || 1,
        unit_price: parseFloat(item.price) || 0
      }));
      const { error: itemsError } = await supabase.from('budget_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;
    }

    // 2.5 Sync Billing Installments (Cuotas) if provided
    if (billingInstallments && savedBudget.id) {
      const projectId = savedBudget.project_id;
      
      if (projectId) {
        // Delete existing installments linked to this budget
        const { error: delError } = await supabase
          .from('billing_installments')
          .delete()
          .eq('origin_budget_id', savedBudget.id);
        
        if (delError) throw delError;

        // Insert new/updated installments if they are provided
        if (billingInstallments.length > 0) {
          const installmentsToInsert = billingInstallments.map(inst => ({
            project_id: projectId,
            origin_budget_id: savedBudget.id,
            installment_number: inst.numQuota,
            scheduled_date: inst.date,
            planned_amount_uf: parseFloat(inst.uf) || 0,
            comment: inst.comment || '',
            status: mapInstallmentStatusToDb(inst.status || 'Por facturar'),
            date_confirmed: inst.dateConfirmed || false,
            invoice_number: inst.invoiceNumber || null,
            invoice_file_url: inst.invoiceFileUrl || null,
            actual_invoice_date: inst.actualInvoiceDate || null,
            actual_payment_date: inst.actualPaymentDate || null,
            payment_backup_url: inst.paymentBackupUrl || null,
            net_amount_clp: inst.net_clp || null,
            tax_amount_clp: inst.tax_clp || null,
            total_amount_clp: inst.total_clp || null
          }));

          const { error: insError } = await supabase
            .from('billing_installments')
            .insert(installmentsToInsert);
          
          if (insError) throw insError;
        }
      }
    }

    // Retrieve fresh installments to sync in state
    let freshInstallments = null;
    if (billingInstallments && savedBudget.id) {
      const { data: dbInsts } = await supabase
        .from('billing_installments')
        .select('*')
        .eq('origin_budget_id', savedBudget.id);
      if (dbInsts) {
        freshInstallments = dbInsts.map(mapInstallmentFromDb);
      }
    }

    // Retrieve fully hydrated budget
    let finalBudget = null;
    const { data: hydratedBudget, error: finalError } = await supabase
      .from('budgets')
      .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*)), budget_items(*)')
      .eq('id', savedBudget.id)
      .single();

    if (finalError) {
      const { data: fallbackBudget } = await supabase
        .from('budgets')
        .select('*, clients:clients!client_id(*), budget_items(*)')
        .eq('id', savedBudget.id)
        .single();
      finalBudget = fallbackBudget;
    } else {
      finalBudget = hydratedBudget;
    }

    return {
      budget: mapBudgetFromDb(finalBudget),
      installments: freshInstallments
    };
  },

  async deleteQuote(id) {
    // 1. Get backup files to delete them from storage
    const { data: budget } = await supabase
      .from('budgets')
      .select('backup_files')
      .eq('id', id)
      .single();

    if (budget && budget.backup_files && budget.backup_files.length > 0) {
      const pathsToDelete = budget.backup_files.map(f => f.path).filter(Boolean);
      if (pathsToDelete.length > 0) {
        await supabase.storage.from('budgets').remove(pathsToDelete);
      }
    }

    // 1.5. Delete referenced billing installments first
    const { error: instError } = await supabase
      .from('billing_installments')
      .delete()
      .eq('origin_budget_id', id);
    if (instError) throw instError;

    // 2. Delete budget from database
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return id;
  },

  // PROJECTS CRUD
  async getProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*))')
      .order('created_at', { ascending: false });
    
    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('projects')
        .select('*, clients:clients!client_id(*)')
        .order('created_at', { ascending: false });
      if (fallbackError) throw fallbackError;
      return fallbackData.map(mapProjectFromDb).filter(Boolean);
    }
    return data.map(mapProjectFromDb).filter(Boolean);
  },

  async saveProject(project) {
    const projectData = {
      project_number: project.projectNumber,
      project_name: project.rawProjectName,
      client_id: project.clientId || project.legalEntityId || null,
      main_client_id: project.mainClientId || null,
      legal_entity_id: project.legalEntityId || project.clientId || null,
      superficie: parseFloat(project.superficie) || 0,
      rentabilidad: parseFloat(project.rentabilidad) || 0,
      year: parseInt(project.anio) || new Date().getFullYear(),
      status: project.status || 'Activo',
      tipo: project.tipo || null,
      encargado: project.encargado || null
    };

    if (project.id && isUuid(project.id)) {
      // Update
      const { data, error } = await supabase
        .from('projects')
        .update(projectData)
        .eq('id', project.id)
        .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*))');
      
      if (error) throw error;
      return mapProjectFromDb(data[0]);
    } else {
      // Insert
      const { data, error } = await supabase
        .from('projects')
        .insert([projectData])
        .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*))');
      
      if (error) throw error;
      return mapProjectFromDb(data[0]);
    }
  },

  async deleteProject(id) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return id;
  },

  // EXTRA COSTS CRUD
  async getExtraCosts() {
    const { data, error } = await supabase
      .from('extra_costs')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data.map(mapExtraCostFromDb);
  },

  async saveExtraCost(cost) {
    const dbData = {
      project_id: cost.project_id,
      amount: parseFloat(cost.amount) || 0,
      superficie: parseFloat(cost.superficie) || 0,
      comment: cost.comment
    };

    if (cost.id && isUuid(cost.id)) {
      const { data, error } = await supabase
        .from('extra_costs')
        .update(dbData)
        .eq('id', cost.id)
        .select();
      if (error) throw error;
      return mapExtraCostFromDb(data[0]);
    } else {
      const { data, error } = await supabase
        .from('extra_costs')
        .insert([dbData])
        .select();
      if (error) throw error;
      return mapExtraCostFromDb(data[0]);
    }
  },

  async deleteExtraCost(id) {
    const { error } = await supabase
      .from('extra_costs')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return id;
  },

  // INSTALLMENTS CRUD
  async getInstallments() {
    const { data, error } = await supabase
      .from('billing_installments')
      .select('*')
      .order('scheduled_date', { ascending: true });
    
    if (error) throw error;
    return data.map(mapInstallmentFromDb);
  },

  async updateInstallment(id, updates) {
    const dbUpdates = {};
    if (updates.numQuota !== undefined) dbUpdates.installment_number = updates.numQuota;
    if (updates.date !== undefined) dbUpdates.scheduled_date = updates.date;
    if (updates.status !== undefined) dbUpdates.status = mapInstallmentStatusToDb(updates.status);
    if (updates.uf !== undefined) dbUpdates.planned_amount_uf = parseFloat(updates.uf) || 0;
    if (updates.comment !== undefined) dbUpdates.comment = updates.comment;
    if (updates.dateConfirmed !== undefined) dbUpdates.date_confirmed = updates.dateConfirmed;
    
    // Financial details
    if (updates.actualInvoiceDate !== undefined) dbUpdates.actual_invoice_date = updates.actualInvoiceDate;
    if (updates.invoiceNumber !== undefined) dbUpdates.invoice_number = updates.invoiceNumber;
    if (updates.invoiceFileUrl !== undefined) dbUpdates.invoice_file_url = updates.invoiceFileUrl;
    if (updates.actualPaymentDate !== undefined) dbUpdates.actual_payment_date = updates.actualPaymentDate;
    if (updates.paymentBackupUrl !== undefined) dbUpdates.payment_backup_url = updates.paymentBackupUrl;
    
    // CLP Desglose calculations (when moving to Facturado)
    if (updates.net_clp !== undefined) dbUpdates.net_amount_clp = updates.net_clp;
    if (updates.tax_clp !== undefined) dbUpdates.tax_amount_clp = updates.tax_clp;
    if (updates.total_clp !== undefined) dbUpdates.total_amount_clp = updates.total_clp;

    const { data, error } = await supabase
      .from('billing_installments')
      .update(dbUpdates)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return mapInstallmentFromDb(data[0]);
  },

  async createInstallment(installment) {
    const dbData = {
      project_id: installment.project_id,
      origin_budget_id: installment.origin_budget_id,
      installment_number: installment.numQuota,
      scheduled_date: installment.date,
      planned_amount_uf: parseFloat(installment.uf) || 0,
      status: mapInstallmentStatusToDb(installment.status || 'Por facturar'),
      comment: installment.comment || '',
      date_confirmed: installment.dateConfirmed || false,
      invoice_number: installment.invoiceNumber || null,
      invoice_file_url: installment.invoiceFileUrl || null,
      actual_invoice_date: installment.actualInvoiceDate || null,
      actual_payment_date: installment.actualPaymentDate || null,
      payment_backup_url: installment.paymentBackupUrl || null,
      net_amount_clp: installment.net_clp || null,
      tax_amount_clp: installment.tax_clp || null,
      total_amount_clp: installment.total_clp || null
    };

    const { data, error } = await supabase
      .from('billing_installments')
      .insert([dbData])
      .select();

    if (error) throw error;
    return mapInstallmentFromDb(data[0]);
  },

  async deleteInstallment(id) {
    const { error } = await supabase
      .from('billing_installments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return id;
  },

  // Vínculo Presupuesto + Proyecto + Cuotas (Transacción Atómica de Aprobación)
  async approveBudgetAndCreateProject(projectForm, budgetId, billingInstallments, budgetForm = null) {
    // 1. Create Project
    const projectData = {
      project_number: projectForm.projectNumber,
      project_name: projectForm.rawProjectName,
      client_id: projectForm.clientId || projectForm.legalEntityId || null,
      main_client_id: projectForm.mainClientId || null,
      legal_entity_id: projectForm.legalEntityId || projectForm.clientId || null,
      superficie: parseFloat(projectForm.superficie) || 0,
      rentabilidad: parseFloat(projectForm.rentabilidad) || 0,
      year: parseInt(projectForm.anio) || new Date().getFullYear(),
      status: 'Activo',
      tipo: projectForm.tipo || null,
      encargado: projectForm.encargado || null
    };

    let dbProj, projError;
    if (projectForm.id) {
      const { data, error } = await supabase
        .from('projects')
        .update(projectData)
        .eq('id', projectForm.id)
        .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*))')
        .single();
      dbProj = data;
      projError = error;
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert([projectData])
        .select('*, main_clients(*), clients:clients!client_id(*, main_clients(*))')
        .single();
      dbProj = data;
      projError = error;
    }
    
    if (projError) throw projError;
    const project = mapProjectFromDb(dbProj);

    // 2. Fetch budget to freeze total_amount
    const { data: dbBudgetItemData } = await supabase
      .from('budget_items')
      .select('*')
      .eq('budget_id', budgetId);

    const frozenNet = dbBudgetItemData 
      ? dbBudgetItemData.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0)
      : 0;
    const frozenTotalAmount = Math.round(frozenNet * 100) / 100;

    // 2.5 Scale budget items if the amount was changed in the approval modal
    if (budgetForm && budgetForm.amount !== undefined && Math.abs(budgetForm.amount - frozenTotalAmount) > 0.01) {
      if (dbBudgetItemData && dbBudgetItemData.length > 0) {
        const scaleFactor = frozenTotalAmount > 0 ? (budgetForm.amount / frozenTotalAmount) : 1;
        let currentSum = 0;
        
        for (let i = 0; i < dbBudgetItemData.length; i++) {
          const item = dbBudgetItemData[i];
          let newUnitPrice = 0;
          
          if (i === dbBudgetItemData.length - 1) {
            // Last item: adjust to match the target amount exactly
            const targetQty = parseFloat(item.quantity) || 1;
            const remainingAmount = budgetForm.amount - currentSum;
            newUnitPrice = Math.round((remainingAmount / targetQty) * 100) / 100;
          } else {
            if (frozenTotalAmount > 0) {
              newUnitPrice = Math.round((parseFloat(item.unit_price) * scaleFactor) * 100) / 100;
            } else if (i === 0) {
              newUnitPrice = budgetForm.amount;
            }
            currentSum += (parseFloat(item.quantity) || 1) * newUnitPrice;
          }
          
          await supabase
            .from('budget_items')
            .update({ unit_price: newUnitPrice })
            .eq('id', item.id);
        }
      } else {
        // Insert a default item if there were no items
        await supabase
          .from('budget_items')
          .insert({
            budget_id: budgetId,
            description: budgetForm.title || 'Servicios ERP',
            quantity: 1,
            unit_price: budgetForm.amount
          });
      }
    }

    // 3. Move files in storage if status changes to Aprobado, or handle budgetForm files
    const { data: currentBudget } = await supabase
      .from('budgets')
      .select('status, budget_number, backup_files')
      .eq('id', budgetId)
      .single();

    let finalFiles = [];
    if (currentBudget) {
      if (budgetForm && budgetForm.backupFiles) {
        // Remove deleted files from storage
        const oldFiles = currentBudget.backup_files || [];
        const newFileNames = new Set(budgetForm.backupFiles.map(f => f.name));
        for (const oldFile of oldFiles) {
          if (!newFileNames.has(oldFile.name) && oldFile.path) {
            await supabase.storage.from('budgets').remove([oldFile.path]);
          }
        }

        // Move existing files that weren't deleted
        const existingFilesToMove = budgetForm.backupFiles.filter(f => !f.fileObject);
        let movedFiles = [];
        if (currentBudget.status !== 'Aprobado') {
          movedFiles = await moveQuoteFiles(
            currentBudget.budget_number,
            currentBudget.status,
            'Aprobado',
            existingFilesToMove
          );
        } else {
          movedFiles = existingFilesToMove;
        }

        // Upload new files
        const newFilesToUpload = budgetForm.backupFiles.filter(f => f.fileObject);
        const combinedFiles = [...movedFiles, ...newFilesToUpload];
        
        finalFiles = await uploadQuoteFiles(currentBudget.budget_number, 'Aprobado', combinedFiles);
      } else {
        if (currentBudget.status !== 'Aprobado') {
          finalFiles = await moveQuoteFiles(
            currentBudget.budget_number,
            currentBudget.status,
            'Aprobado',
            currentBudget.backup_files || []
          );
        } else {
          finalFiles = currentBudget.backup_files || [];
        }
      }
    }

    // 4. Update Budget (setApproved, link project_id, update files, amount, and title if provided)
    const budgetUpdateData = {
      status: 'Aprobado',
      project_id: project.id,
      backup_files: finalFiles
    };

    if (budgetForm && budgetForm.amount !== undefined) {
      budgetUpdateData.total_amount = budgetForm.amount;
    } else {
      budgetUpdateData.total_amount = frozenTotalAmount;
    }

    if (budgetForm && budgetForm.title !== undefined) {
      budgetUpdateData.title = budgetForm.title;
    }

    const { error: budgetError } = await supabase
      .from('budgets')
      .update(budgetUpdateData)
      .eq('id', budgetId);
    
    if (budgetError) throw budgetError;

    // 4. Insert billing installments linked to project and budget
    if (billingInstallments && billingInstallments.length > 0) {
      const installmentsToInsert = billingInstallments.map(inst => ({
        project_id: project.id,
        origin_budget_id: budgetId,
        installment_number: inst.numQuota,
        scheduled_date: inst.date,
        planned_amount_uf: parseFloat(inst.uf) || 0,
        status: 'Por facturar',
        date_confirmed: inst.dateConfirmed || false
      }));

      const { error: instError } = await supabase
        .from('billing_installments')
        .insert(installmentsToInsert);
      
      if (instError) throw instError;
    }

    // Retrieve fresh budgets and installments to sync states
    const { data: freshBudget } = await supabase
      .from('budgets')
      .select('*, clients:clients!client_id(*), budget_items(*)')
      .eq('id', budgetId)
      .single();

    const { data: freshInsts } = await supabase
      .from('billing_installments')
      .select('*')
      .eq('project_id', project.id);

    return {
      project,
      budget: freshBudget ? mapBudgetFromDb(freshBudget) : null,
      installments: freshInsts ? freshInsts.map(mapInstallmentFromDb) : []
    };
  },

  async disassociateBudget(budgetId) {
    // 1. Fetch current budget title
    const { data: budgetToUpdate } = await supabase
      .from('budgets')
      .select('title')
      .eq('id', budgetId)
      .single();

    let newTitle = budgetToUpdate?.title;
    if (newTitle) {
      const regex = /^\d+[\s\S]*?-[\s\S]*?\s+-\s+[\s\S]+$/;
      if (regex.test(newTitle)) {
        // Extract raw name: e.g. "Edificio Ciudad" from "0280-Edificio Ciudad - TechNova Solutions"
        const nameParts = newTitle.split('-');
        newTitle = nameParts.slice(1).join('-').split(' - ')[0]?.trim() || newTitle;
      }
    }

    // 2. Clear project_id and update title in DB
    const { data, error } = await supabase
      .from('budgets')
      .update({ 
        project_id: null,
        title: newTitle
      })
      .eq('id', budgetId)
      .select('*, clients:clients!client_id(*), budget_items(*)');
    if (error) throw error;
    return mapBudgetFromDb(data[0]);
  },

  async associateBudget(budgetId, projectId) {
    // 1. Update the budget's project_id
    const { data, error } = await supabase
      .from('budgets')
      .update({ project_id: projectId })
      .eq('id', budgetId)
      .select('*, clients:clients!client_id(*), budget_items(*)');

    if (error) throw error;

    // 2. Update any existing billing installments associated with this budget to the new project
    const { error: instError } = await supabase
      .from('billing_installments')
      .update({ project_id: projectId })
      .eq('origin_budget_id', budgetId);

    if (instError) throw instError;

    // 3. Retrieve all billing installments for this project to return to UI
    const { data: freshInsts, error: fetchInstsError } = await supabase
      .from('billing_installments')
      .select('*')
      .eq('project_id', projectId);

    if (fetchInstsError) throw fetchInstsError;

    return {
      budget: mapBudgetFromDb(data[0]),
      installments: freshInsts ? freshInsts.map(mapInstallmentFromDb) : []
    };
  },

  // PROFILES (USERS)
  async getProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      status: p.status,
      joinedDate: (() => {
        const d = new Date(p.created_at);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      })(),
      initials: p.name 
        ? p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() 
        : 'US'
    }));
  },

  async toggleProfileStatus(id, currentStatus) {
    const nextStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    const { data, error } = await supabase
      .from('profiles')
      .update({ status: nextStatus })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async updateUser(userId, updates) {
    const { error } = await supabase.rpc('update_user', {
      user_id: userId,
      new_name: updates.name,
      new_email: updates.email,
      new_role: updates.role,
      new_status: updates.status,
      new_password: updates.password || null
    });
    if (error) throw error;
    return {
      id: userId,
      ...updates
    };
  },

  async deleteUser(userId) {
    const { error } = await supabase.rpc('delete_user', {
      user_id: userId
    });
    if (error) throw error;
    return userId;
  },

  async uploadInstallmentFile(folder, projectNumber, file) {
    if (!file) return '';
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${folder}/${projectNumber}/${Date.now()}_${cleanName}`;
    const { data, error } = await supabase.storage.from('budgets').upload(path, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('budgets').getPublicUrl(path);
    return publicUrl;
  },

  async deleteInstallmentFile(pathOrUrl) {
    if (!pathOrUrl) return;
    let path = pathOrUrl;
    if (pathOrUrl.includes('/public/budgets/')) {
      path = pathOrUrl.split('/public/budgets/')[1];
    }
    const { error } = await supabase.storage.from('budgets').remove([path]);
    if (error) {
      console.error(`Error deleting file at path ${path}:`, error);
    }
  }
};
