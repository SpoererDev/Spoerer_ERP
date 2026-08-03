import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import CRM from './components/CRM';
import Presupuestos from './components/Presupuestos';
import Facturacion from './components/Facturacion';
import Usuarios from './components/Usuarios';
import Proyectos from './components/Proyectos';
import DailyBackupModal from './components/DailyBackupModal';
import DailyBackupBanner from './components/DailyBackupBanner';
import BackupHistoryModal from './components/BackupHistoryModal';
import { generateConsolidatedBackup } from './utils/backupExporter';
import { supabaseService } from './utils/supabaseService';
import { supabase } from './utils/supabaseClient';
import './App.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('crm');
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Backup states
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isBackupBannerVisible, setIsBackupBannerVisible] = useState(false);
  const [backupHistoryModalOpen, setBackupHistoryModalOpen] = useState(false);


  // Flat SQL-aligned states
  const [mainClients, setMainClients] = useState([]);
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]); // Budgets
  const [projects, setProjects] = useState([]);
  const [installments, setInstallments] = useState([]); // Flat billing installments
  const [extraCosts, setExtraCosts] = useState([]); // Flat extra costs
  const [users, setUsers] = useState([]); // Public profiles

  // Temporary mock invoice state for the billing tab (future expansion)
  const [invoices, setInvoices] = useState([
    { id: 'INV-2023-001', clientName: 'Logística Global S.A.', amount: 4200.00, dueDate: '15 Oct, 2023', status: 'Pagada' },
    { id: 'INV-2023-002', clientName: 'TecnoCorp Solutions', amount: 12850.00, dueDate: '02 Oct, 2023', status: 'No Pagada' },
    { id: 'INV-2023-003', clientName: 'Constructora Horizonte', amount: 7400.00, dueDate: '22 Oct, 2023', status: 'Pago Parcial' },
    { id: 'INV-2023-004', clientName: 'Retail Max S.L.', amount: 2100.00, dueDate: '28 Oct, 2023', status: 'No Pagada' },
    { id: 'INV-2023-005', clientName: 'Distribuidora Alianza', amount: 9900.00, dueDate: '05 Oct, 2023', status: 'Pagada' }
  ]);

  // Persistent filter states for each tab
  const [crmSearch, setCrmSearch] = useState('');

  const [presupuestosSearch, setPresupuestosSearch] = useState('');
  const [presupuestosStatusFilter, setPresupuestosStatusFilter] = useState('Todos');
  const [presupuestosCalcPeriod, setPresupuestosCalcPeriod] = useState('all');

  const [facturacionTemporalFilter, setFacturacionTemporalFilter] = useState('Todos');
  const [facturacionStatusFilter, setFacturacionStatusFilter] = useState('Todos');
  const [facturacionClientFilter, setFacturacionClientFilter] = useState('Todos');
  const [facturacionEncargadoFilter, setFacturacionEncargadoFilter] = useState('Todos');
  const [facturacionSearch, setFacturacionSearch] = useState('');

  const [proyectosSearch, setProyectosSearch] = useState('');
  const [proyectosTipoFilter, setProyectosTipoFilter] = useState(null);
  const [proyectosEncargadoFilter, setProyectosEncargadoFilter] = useState('Todos');

  const [usuariosSearch, setUsuariosSearch] = useState('');

  const isAdmin = user?.role?.toLowerCase() === 'admin' || 
                  user?.role?.toLowerCase() === 'administrador' || 
                  user?.role?.toLowerCase() === 'system administrator';

  const getTodayLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if today's backup is pending for Admin users
  useEffect(() => {
    async function checkDailyBackup() {
      if (!user || !isAdmin) return;
      try {
        const latestLog = await supabaseService.getLatestBackupLog();
        const today = getTodayLocalDate();
        if (!latestLog || latestLog.backup_date !== today) {
          setIsBackupModalOpen(true);
          setIsBackupBannerVisible(true);
        } else {
          setIsBackupModalOpen(false);
          setIsBackupBannerVisible(false);
        }
      } catch (err) {
        console.warn('Error verificando respaldo diario:', err);
      }
    }
    checkDailyBackup();
  }, [user, isAdmin]);


  const handleExecuteBackup = async (backupType = 'daily') => {
    try {
      await generateConsolidatedBackup({
        userName: user?.name || 'Administrador',
        backupType
      });
      setIsBackupModalOpen(false);
      setIsBackupBannerVisible(false);
    } catch (err) {
      console.error("Error al ejecutar respaldo:", err);
      alert("Ocurrió un error al generar el archivo de respaldo.");
      throw err;
    }
  };

  // Authenticate user on load or session
  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error al cerrar sesión en Supabase:", err);
    }
    setUser(null);
  };

  // Load flat data from Supabase on mount and check active session
  useEffect(() => {
    async function checkSessionAndLoadData() {
      try {
        setInitialLoading(true);
        
        // 1. Verificar sesión activa
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
            
          if (profile && profile.status === 'Active') {
            setUser({
              id: profile.id,
              email: profile.email,
              name: profile.name,
              role: profile.role
            });
          } else {
            await supabase.auth.signOut();
          }
        }

        // 2. Cargar datos de Supabase
        const [mainCls, cls, bgs, prjs, insts, costs, usrs] = await Promise.all([
          supabaseService.getMainClients(),
          supabaseService.getClients(),
          supabaseService.getBudgets(),
          supabaseService.getProjects(),
          supabaseService.getInstallments(),
          supabaseService.getExtraCosts(),
          supabaseService.getProfiles()
        ]);
        setMainClients(mainCls);
        setClients(cls);
        setQuotes(bgs);
        setProjects(prjs);
        setInstallments(insts);
        setExtraCosts(costs);
        setUsers(usrs);
      } catch (error) {
        console.error("Error cargando datos de Supabase:", error);
      } finally {
        setInitialLoading(false);
      }
    }
    checkSessionAndLoadData();
  }, []);

  // MAIN CLIENTS ACTIONS
  const addMainClient = async (newMainClient) => {
    try {
      const savedMain = await supabaseService.saveMainClient(newMainClient);
      setMainClients(prev => {
        const exists = prev.some(c => c.id === savedMain.id || c.name.toLowerCase() === savedMain.name.toLowerCase());
        if (exists) {
          return prev.map(c => c.id === savedMain.id ? savedMain : c);
        }
        return [...prev, savedMain];
      });
      return savedMain;
    } catch (err) {
      console.error("Error al guardar cliente principal:", err);
      throw err;
    }
  };

  const deleteMainClient = async (id) => {
    try {
      await supabaseService.deleteMainClient(id);
      setMainClients(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error al eliminar cliente principal:", err);
      throw new Error("Error al eliminar cliente principal. Verifique que no tenga razones sociales asociadas.");
    }
  };

  // CLIENTS ACTIONS
  const addClient = async (newClient) => {
    try {
      const savedClient = await supabaseService.saveClient(newClient);
      setClients(prev => {
        const exists = prev.some(c => c.id === savedClient.id || c.rut === savedClient.rut);
        if (exists) {
          return prev.map(c => c.id === savedClient.id ? savedClient : c);
        }
        return [...prev, savedClient];
      });
      return savedClient;
    } catch (err) {
      console.error("Error al guardar cliente:", err);
      throw err;
    }
  };

  const deleteClient = async (id) => {
    try {
      await supabaseService.deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error al eliminar cliente:", err);
      throw new Error("Error al eliminar cliente. Verifique que no tenga proyectos activos asociados.");
    }
  };

  // QUOTES (BUDGETS) ACTIONS
  const hasInvoicedOrPaidInstallments = (budgetId) => {
    if (!budgetId) return false;
    return installments.some(
      i => i.origin_budget_id === budgetId && (i.status === 'Factura emitida' || i.status === 'Pagada' || i.status === 'Facturado' || i.status === 'Pagado')
    );
  };

  const addQuote = async (newQuote, items, billingInstallments) => {
    const existing = quotes.find(q => q.id === newQuote.id);
    if (existing && existing.status !== newQuote.status && hasInvoicedOrPaidInstallments(newQuote.id)) {
      throw new Error('No se puede cambiar el estado de un presupuesto que posee cuotas facturadas o pagadas.');
    }
    try {
      const result = await supabaseService.saveQuote(newQuote, items || newQuote.items || [], billingInstallments);
      const savedQuote = result.budget;
      setQuotes(prev => {
        const exists = prev.some(q => q.id === savedQuote.id);
        if (exists) {
          return prev.map(q => q.id === savedQuote.id ? savedQuote : q);
        }
        return [savedQuote, ...prev];
      });
      if (result.installments) {
        setInstallments(prev => {
          const filtered = prev.filter(i => i.origin_budget_id !== savedQuote.id);
          return [...filtered, ...result.installments];
        });
      }
    } catch (err) {
      console.error("Error al guardar presupuesto:", err);
      throw err;
    }
  };

  const deleteQuote = async (id) => {
    if (hasInvoicedOrPaidInstallments(id)) {
      throw new Error('No se puede eliminar un presupuesto que posee cuotas facturadas o pagadas.');
    }
    try {
      await supabaseService.deleteQuote(id);
      setQuotes(prev => prev.filter(q => q.id !== id));
      setInstallments(prev => prev.filter(i => i.origin_budget_id !== id));
    } catch (err) {
      console.error("Error al eliminar presupuesto:", err);
      throw err;
    }
  };

  // VÍNCULO: APROBACIÓN Y CREACIÓN DE PROYECTO CON CUOTAS
  const handleApproveBudgetAndCreateProject = async (projectForm, budgetId, installmentsList, budgetForm = null) => {
    try {
      const result = await supabaseService.approveBudgetAndCreateProject(
        projectForm, 
        budgetId, 
        installmentsList,
        budgetForm
      );
      
      // Actualizar estados planos locales
      setProjects(prev => {
        const exists = prev.some(p => p.id === result.project.id);
        if (exists) {
          return prev.map(p => p.id === result.project.id ? result.project : p);
        } else {
          return [result.project, ...prev];
        }
      });
      setQuotes(prev => prev.map(q => q.id === budgetId ? result.budget : q));
      setInstallments(prev => {
        const filtered = prev.filter(i => i.project_id !== result.project.id);
        return [...filtered, ...result.installments];
      });
      
    } catch (err) {
      console.error("Error al aprobar presupuesto:", err);
      throw err;
    }
  };

  const handleDisassociateBudget = async (budgetId) => {
    if (hasInvoicedOrPaidInstallments(budgetId)) {
      throw new Error('No se puede desasociar un presupuesto que posee cuotas facturadas o pagadas.');
    }
    try {
      const updatedBudget = await supabaseService.disassociateBudget(budgetId);
      setQuotes(prev => prev.map(q => q.id === budgetId ? updatedBudget : q));
      setInstallments(prev => prev.map(i => i.origin_budget_id === budgetId ? { ...i, project_id: null } : i));
      return updatedBudget;
    } catch (err) {
      console.error("Error al desasociar presupuesto:", err);
      throw err;
    }
  };

  const handleUnapproveBudget = async (budgetId, newStatus) => {
    if (hasInvoicedOrPaidInstallments(budgetId)) {
      throw new Error('No se puede desaprobar un presupuesto que posee cuotas facturadas o pagadas.');
    }
    try {
      const updatedBudget = await supabaseService.unapproveBudget(budgetId, newStatus);
      setQuotes(prev => prev.map(q => q.id === budgetId ? updatedBudget : q));
      setInstallments(prev => prev.filter(i => i.origin_budget_id !== budgetId));
      return updatedBudget;
    } catch (err) {
      console.error("Error al desaprobar presupuesto:", err);
      throw err;
    }
  };

  const handleAssociateBudget = async (budgetId, projectId) => {
    try {
      const result = await supabaseService.associateBudget(budgetId, projectId);
      setQuotes(prev => prev.map(q => q.id === budgetId ? result.budget : q));
      setInstallments(prev => {
        const filtered = prev.filter(i => i.project_id !== projectId);
        return [...filtered, ...result.installments];
      });
      return result;
    } catch (err) {
      console.error("Error al asociar presupuesto:", err);
      throw err;
    }
  };

  // INSTALLMENTS (CUOTAS) ACTIONS
  const handleUpdateInstallment = async (id, updates) => {
    try {
      const updatedInst = await supabaseService.updateInstallment(id, updates);
      setInstallments(prev => prev.map(i => i.id === id ? updatedInst : i));
    } catch (err) {
      alert("Error al actualizar la cuota: " + err.message);
    }
  };

  // PROJECTS ACTIONS
  const handleSaveProject = async (updatedProject) => {
    try {
      const saved = await supabaseService.saveProject(updatedProject);
      setProjects(prev => {
        const exists = prev.some(p => p.id === saved.id);
        if (exists) {
          return prev.map(p => p.id === saved.id ? saved : p);
        } else {
          return [saved, ...prev];
        }
      });
      return saved;
    } catch (err) {
      console.error("Error al actualizar proyecto:", err);
      throw err;
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await supabaseService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setInstallments(prev => prev.filter(i => i.project_id !== id));
      setQuotes(prev => prev.map(q => q.projectId === id ? { ...q, projectId: null } : q));
    } catch (err) {
      console.error("Error al eliminar proyecto:", err);
      throw err;
    }
  };

  const handleSaveInstallments = async (budgetId, installmentsList) => {
    // Fallback if called with one argument
    if (Array.isArray(budgetId)) {
      installmentsList = budgetId;
      budgetId = installmentsList[0]?.origin_budget_id;
    }
    if (!budgetId) {
      alert("Error: No se pudo identificar el presupuesto asociado.");
      return;
    }

    try {
      setLoading(true);

      // Find original installments for this budget
      const originalInsts = installments.filter(inst => inst.origin_budget_id === budgetId);

      // Identify deleted installments
      const deletedInsts = originalInsts.filter(orig => !installmentsList.some(curr => curr.id === orig.id));

      // Identify new installments
      const newInsts = installmentsList.filter(inst => typeof inst.id === 'string' && inst.id.startsWith('temp-'));

      // Identify updated installments
      const updatedInsts = installmentsList.filter(inst => !newInsts.some(ni => ni.id === inst.id));

      // Execute deletions
      if (deletedInsts.length > 0) {
        await Promise.all(deletedInsts.map(inst => supabaseService.deleteInstallment(inst.id)));
      }

      // Execute updates
      if (updatedInsts.length > 0) {
        await Promise.all(updatedInsts.map(inst => 
          supabaseService.updateInstallment(inst.id, {
            numQuota: inst.numQuota,
            date: inst.date,
            status: inst.status,
            uf: inst.uf,
            comment: inst.comment,
            dateConfirmed: inst.dateConfirmed,
            invoiceFileUrl: inst.invoiceFileUrl,
            paymentBackupUrl: inst.paymentBackupUrl,
            invoiceNumber: inst.invoiceNumber,
            actualPaymentDate: inst.actualPaymentDate
          })
        ));
      }

      // Execute insertions
      if (newInsts.length > 0) {
        await Promise.all(newInsts.map(inst => 
          supabaseService.createInstallment({
            project_id: inst.project_id,
            origin_budget_id: inst.origin_budget_id,
            numQuota: inst.numQuota,
            date: inst.date,
            uf: inst.uf,
            status: inst.status,
            comment: inst.comment,
            dateConfirmed: inst.dateConfirmed,
            invoiceFileUrl: inst.invoiceFileUrl,
            paymentBackupUrl: inst.paymentBackupUrl,
            invoiceNumber: inst.invoiceNumber,
            actualPaymentDate: inst.actualPaymentDate
          })
        ));
      }

      const freshInsts = await supabaseService.getInstallments();
      setInstallments(freshInsts);
    } catch (err) {
      console.error("Error al guardar facturación:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // EXTRA COSTS ACTIONS
  const handleAddExtraCost = async (newCost) => {
    try {
      const savedCost = await supabaseService.saveExtraCost(newCost);
      setExtraCosts(prev => {
        const exists = prev.some(ec => ec.id === savedCost.id);
        if (exists) return prev.map(ec => ec.id === savedCost.id ? savedCost : ec);
        return [...prev, savedCost];
      });
    } catch (err) {
      console.error("Error al registrar costo extra:", err);
      throw err;
    }
  };

  const handleDeleteExtraCost = async (id) => {
    try {
      await supabaseService.deleteExtraCost(id);
      setExtraCosts(prev => prev.filter(ec => ec.id !== id));
    } catch (err) {
      console.error("Error al eliminar costo extra:", err);
      throw err;
    }
  };

  // INVOICES ACTIONS (Simulated)
  const addInvoice = (newInvoice) => {
    setInvoices([newInvoice, ...invoices]);
  };

  const updateInvoiceStatus = (id, newStatus) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: newStatus } : inv));
  };

  // USERS / PROFILES ACTIONS
  const addUser = async (newUser) => {
    try {
      const { data: userId, error } = await supabase.rpc('create_user_admin', {
        new_email: newUser.email,
        new_password: newUser.password || 'Password123!',
        new_name: newUser.name,
        new_role: newUser.role || 'Sales'
      });

      if (error) throw error;
      
      if (userId) {
        setUsers(prev => [...prev, {
          id: userId,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role || 'Sales',
          status: 'Active',
          joinedDate: (() => {
            const d = new Date();
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
          })(),
          initials: newUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        }]);
      }
    } catch (err) {
      throw err;
    }
  };

  const toggleUserStatus = async (id) => {
    try {
      const userToToggle = users.find(u => u.id === id);
      if (!userToToggle) return;
      await supabaseService.toggleProfileStatus(id, userToToggle.status);
      setUsers(prev => prev.map(u => u.id === id 
        ? { ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' } 
        : u
      ));
    } catch (err) {
      throw err;
    }
  };

  const editUser = async (userId, updates) => {
    try {
      const updated = await supabaseService.updateUser(userId, updates);
      setUsers(prev => prev.map(u => u.id === userId ? {
        ...u,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        initials: updated.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      } : u));
    } catch (err) {
      throw err;
    }
  };

  const deleteUser = async (userId) => {
    if (userId === user?.id) {
      throw new Error("No puedes eliminar tu propia cuenta de usuario.");
    }
    try {
      await supabaseService.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      throw err;
    }
  };

  // Render Login Check
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Sidebar 
      currentTab={currentTab} 
      setCurrentTab={setCurrentTab} 
      user={user} 
      onLogout={handleLogout}
      onOpenBackupHistory={() => setBackupHistoryModalOpen(true)}
    >
      {isBackupBannerVisible && isAdmin && (
        <DailyBackupBanner 
          onDownloadBackup={() => handleExecuteBackup('daily')}
          onDismiss={() => setIsBackupBannerVisible(false)}
        />
      )}

      {loading && (
        <div className="fixed inset-0 z-[999] bg-primary/20 backdrop-blur-[2px] flex flex-col items-center justify-center gap-md">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-body-md text-primary font-bold">Procesando...</span>
        </div>
      )}
      {initialLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-md">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-body-md text-on-surface-variant font-bold">Cargando base de datos de Supabase...</span>
        </div>
      ) : (
        <>
          {currentTab === 'crm' && (
            <CRM 
              mainClients={mainClients}
              onAddMainClient={addMainClient}
              onDeleteMainClient={deleteMainClient}
              clients={clients} 
              onAddClient={addClient} 
              onDeleteClient={deleteClient}
              searchTerm={crmSearch}
              setSearchTerm={setCrmSearch}
            />
          )}
          {currentTab === 'presupuestos' && (
            <Presupuestos 
              quotes={quotes} 
              mainClients={mainClients}
              clients={clients} 
              onAddQuote={addQuote} 
              onDeleteQuote={deleteQuote}
              projects={projects}
              onApproveBudgetAndCreateProject={handleApproveBudgetAndCreateProject}
              installments={installments}
              users={users}
              searchTerm={presupuestosSearch}
              setSearchTerm={setPresupuestosSearch}
              statusFilter={presupuestosStatusFilter}
              setStatusFilter={setPresupuestosStatusFilter}
              calcPeriod={presupuestosCalcPeriod}
              setCalcPeriod={setPresupuestosCalcPeriod}
              onSaveProject={handleSaveProject}
              onDisassociateBudget={handleDisassociateBudget}
              onUnapproveBudget={handleUnapproveBudget}
            />
          )}
          {currentTab === 'facturacion' && (
            <Facturacion 
              projects={projects}
              budgets={quotes}
              installments={installments}
              clients={clients}
              mainClients={mainClients}
              users={users}
              onUpdateInstallment={handleUpdateInstallment}
              onSaveInstallments={handleSaveInstallments}
              onSaveProject={handleSaveProject}
              onAddClient={addClient}
              temporalFilter={facturacionTemporalFilter}
              setTemporalFilter={setFacturacionTemporalFilter}
              statusFilter={facturacionStatusFilter}
              setStatusFilter={setFacturacionStatusFilter}
              clientFilter={facturacionClientFilter}
              setClientFilter={setFacturacionClientFilter}
              encargadoFilter={facturacionEncargadoFilter}
              setEncargadoFilter={setFacturacionEncargadoFilter}
              searchTerm={facturacionSearch}
              setSearchTerm={setFacturacionSearch}
            />
          )}
          {currentTab === 'usuarios' && isAdmin && (
            <Usuarios 
              users={users} 
              currentUser={user}
              onAddUser={addUser} 
              onToggleUserStatus={toggleUserStatus} 
              onEditUser={editUser}
              onDeleteUser={deleteUser}
              searchTerm={usuariosSearch}
              setSearchTerm={setUsuariosSearch}
            />
          )}
          {currentTab === 'proyectos' && (
            <Proyectos
              projects={projects}
              setProjects={setProjects}
              clients={clients}
              budgets={quotes}
              installments={installments}
              extraCosts={extraCosts}
              users={users}
              onUpdateInstallment={handleUpdateInstallment}
              onDisassociateBudget={handleDisassociateBudget}
              onAssociateBudget={handleAssociateBudget}
              onAddExtraCost={handleAddExtraCost}
              onDeleteExtraCost={handleDeleteExtraCost}
              onSaveProject={handleSaveProject}
              onDeleteProject={handleDeleteProject}
              onSaveInstallments={handleSaveInstallments}
              searchTerm={proyectosSearch}
              setSearchTerm={setProyectosSearch}
              tipoFilter={proyectosTipoFilter}
              setTipoFilter={setProyectosTipoFilter}
              encargadoFilter={proyectosEncargadoFilter}
              setEncargadoFilter={setProyectosEncargadoFilter}
            />
          )}
        </>
      )}

      {/* Backup Modals */}
      <DailyBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDownloadBackup={() => handleExecuteBackup('daily')}
        userName={user?.name}
      />

      <BackupHistoryModal
        isOpen={backupHistoryModalOpen}
        onClose={() => setBackupHistoryModalOpen(false)}
        onDownloadBackup={(type) => handleExecuteBackup(type)}
      />
    </Sidebar>
  );
}

