import React, { useState } from 'react';

export default function Usuarios({ users, currentUser, onAddUser, onToggleUserStatus, onEditUser, onDeleteUser, searchTerm, setSearchTerm }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New user form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [role, setRole] = useState('Admin');
  const [permissions, setPermissions] = useState({
    viewAnalytics: true,
    editBilling: false,
    manageApi: false,
    exportData: false
  });

  // Success modal states
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);

  // View & Edit user modal states
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('Admin');
  const [editStatus, setEditStatus] = useState('Active');
  const [editPassword, setEditPassword] = useState('');

  // Custom UI alert & confirm states
  const [notification, setNotification] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState('Todos'); // 'Todos', 'Active', 'Inactive'

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editName || !editEmail) return;

    try {
      await onEditUser(selectedUser.id, {
        name: editName,
        email: editEmail,
        role: editRole,
        status: editStatus,
        password: editPassword || null
      });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      setEditPassword('');
      setNotification({
        type: 'success',
        title: 'Usuario Actualizado',
        message: 'Los cambios del usuario han sido guardados de manera exitosa.'
      });
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Actualizar',
        message: err.message
      });
    }
  };

  // Calculate dynamic stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'Active').length;
  const adminRoles = users.filter(u => u.role === 'Admin').length;
  const lockedAccounts = users.filter(u => u.status === 'Inactive').length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    const newUser = {
      name,
      email,
      password,
      role,
      status: 'Active',
      initials,
      permissions
    };

    try {
      await onAddUser(newUser);
      
      // Open success modal and save details
      setCreatedUser({ name, email, password, role });
      setIsSuccessModalOpen(true);

      // Reset form
      setName('');
      setEmail('');
      setPassword('Password123!');
      setRole('Admin');
      setPermissions({
        viewAnalytics: true,
        editBilling: false,
        manageApi: false,
        exportData: false
      });
      setIsModalOpen(false);
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Registrar',
        message: err.message
      });
    }
  };

  const handlePermissionChange = (key) => {
    setPermissions({
      ...permissions,
      [key]: !permissions[key]
    });
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = 
      statusFilter === 'Todos' || 
      user.status === statusFilter;
      
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-xl animate-fade-in text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary font-bold">Control de Usuarios y Accesos</h2>
          <p className="text-on-surface-variant font-body-md mt-1">Administra el personal, sus roles y permisos de seguridad granulares.</p>
        </div>
        <div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-sm px-md py-sm bg-secondary text-white font-semibold rounded-lg hover:opacity-95 transition-all shadow-sm active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            <span>Agregar Usuario</span>
          </button>
        </div>
      </div>

      {/* Bento Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-md">
        {/* KPI 1: Usuarios Totales */}
        <div className="bg-blue-50/40 border border-blue-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-blue-800 uppercase font-bold tracking-wider">Usuarios Totales</span>
            <div className="font-display-lg text-[34px] text-blue-950 font-extrabold">
              {totalUsers}
            </div>
          </div>
          <div className="p-3 bg-blue-100 rounded-full text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">person</span>
          </div>
        </div>

        {/* KPI 2: Activos Ahora */}
        <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-emerald-800 uppercase font-bold tracking-wider">Activos Ahora</span>
            <div className="font-display-lg text-[34px] text-emerald-950 font-extrabold">
              {activeUsers}
            </div>
          </div>
          <div className="p-3 bg-emerald-100 rounded-full text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">verified_user</span>
          </div>
        </div>

        {/* KPI 3: Administradores */}
        <div className="bg-indigo-50/40 border border-indigo-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-indigo-800 uppercase font-bold tracking-wider">Administradores</span>
            <div className="font-display-lg text-[34px] text-indigo-950 font-extrabold">
              {adminRoles}
            </div>
          </div>
          <div className="p-3 bg-indigo-100 rounded-full text-indigo-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">security</span>
          </div>
        </div>

        {/* KPI 4: Cuentas Inactivas */}
        <div className="bg-red-50/40 border border-red-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-red-800 uppercase font-bold tracking-wider">Cuentas Inactivas</span>
            <div className="font-display-lg text-[34px] text-red-950 font-extrabold">
              {lockedAccounts}
            </div>
          </div>
          <div className="p-3 bg-red-100 rounded-full text-red-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">report_problem</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="glass-card rounded-xl p-md flex flex-wrap items-end justify-between gap-md shadow-sm">
        <div className="flex flex-wrap items-end gap-md flex-grow">
          <div className="flex-grow max-w-lg min-w-[240px]">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold text-[11px]">Buscar Usuario</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
              <input 
                className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:outline-none" 
                placeholder="Buscar usuarios, roles..." 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button 
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('Todos');
            }}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant rounded bg-white text-on-surface hover:bg-slate-50 transition-all font-label-md active:scale-95 h-[38px]"
            title="Limpiar Filtros"
          >
            <span className="material-symbols-outlined text-[16px]">clear_all</span>
            <span>Limpiar</span>
          </button>
        </div>

        {/* Status Filter Button Group at the far right */}
        <div className="flex flex-col gap-xs text-left">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Estado</span>
          <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant h-[38px] items-center">
            {[
              { value: 'Todos', label: 'Todos' },
              { value: 'Active', label: 'Activos' },
              { value: 'Inactive', label: 'Inactivos' }
            ].map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter(status.value)}
                className={`px-3 py-1 rounded text-[11px] font-semibold transition-all h-full ${statusFilter === status.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Data Table Container */}
      {filteredUsers.length > 0 ? (
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Nombre</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Correo Electrónico</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Rol Asignado</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Estado</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-md">
                      <div className="flex items-center gap-sm">
                        <div className="w-9 h-9 rounded-full bg-secondary-container/30 flex items-center justify-center font-bold text-secondary text-body-sm">
                          {user.initials}
                        </div>
                        <div>
                          <p className="font-body-md font-bold text-primary">{user.name}</p>
                          <p className="font-body-sm text-[11px] text-on-surface-variant">Creado el {user.joinedDate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-md font-body-md text-body-md text-on-surface">{user.email}</td>
                    <td className="p-md">
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-primary-container text-secondary-fixed font-label-sm text-label-sm border border-outline-variant/20">
                        <span className="material-symbols-outlined text-[14px]">shield_person</span>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-md">
                      <span className={`inline-flex items-center gap-xs px-sm py-xs rounded-full font-label-sm text-label-sm border ${
                        user.status === 'Active' 
                          ? 'bg-secondary/10 text-secondary border-secondary/20' 
                          : 'bg-error/10 text-error border-error/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-secondary' : 'bg-error'}`}></span>
                        {user.status === 'Active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="p-md text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => {
                            setSelectedUser(user);
                            setEditName(user.name);
                            setEditEmail(user.email);
                            const roleToSet = user.role === 'System Administrator' ? 'Admin' : user.role;
                            setEditRole(roleToSet);
                            setEditStatus(user.status);
                            setEditPassword('');
                            setIsEditModalOpen(true);
                          }}
                          className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all" 
                          title="Editar"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              await onToggleUserStatus(user.id);
                            } catch (err) {
                              setNotification({
                                type: 'error',
                                title: 'Error al cambiar estado',
                                message: err.message
                              });
                            }
                          }}
                          className={`p-1 rounded transition-all ${user.status === 'Active' ? 'hover:bg-red-50 text-error hover:text-red-700' : 'hover:bg-emerald-50 text-secondary hover:text-secondary-fixed-dim'}`} 
                          title={user.status === 'Active' ? 'Desactivar' : 'Activar'}
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {user.status === 'Active' ? 'block' : 'check_circle'}
                          </span>
                        </button>
                        <button 
                          onClick={() => {
                            if (user.id === currentUser?.id) {
                              setNotification({
                                type: 'error',
                                title: 'Acción no permitida',
                                message: 'No puedes eliminar tu propia cuenta de usuario.'
                              });
                              return;
                            }
                            setUserToDelete(user);
                          }}
                          className={`p-1 rounded transition-all ${
                            user.id === currentUser?.id 
                              ? 'opacity-40 cursor-not-allowed text-slate-400' 
                              : 'hover:bg-red-50 text-error hover:text-red-700'
                          }`} 
                          title={user.id === currentUser?.id ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
                          disabled={user.id === currentUser?.id}
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
              Mostrando {filteredUsers.length} de {users.length} usuarios registrados
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
          No se encontraron usuarios.
        </div>
      )}

      {/* Modal: Add New User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl overflow-hidden border border-outline-variant animate-scale-up">
            <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <h2 className="font-headline-sm text-headline-sm text-primary font-bold">Agregar Nuevo Usuario ERP</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-lg space-y-md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="space-y-xs">
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-bold">NOMBRE COMPLETO</label>
                  <input 
                    className="w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md" 
                    placeholder="Ej: John Doe" 
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-xs">
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-bold">CORREO LABORAL</label>
                  <input 
                    className="w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md" 
                    placeholder="john.doe@empresa.com" 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-xs">
                <label className="font-label-sm text-label-sm text-on-surface-variant font-bold">CONTRASEÑA TEMPORAL</label>
                <input 
                  className="w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md" 
                  placeholder="Password123!" 
                  type="text"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-[11px] text-on-surface-variant/70 italic">El usuario usará esta clave para su primer inicio de sesión.</p>
              </div>
              <div className="space-y-xs">
                <label className="font-label-sm text-label-sm text-on-surface-variant font-bold">ROL PRINCIPAL DEL SISTEMA</label>
                <select 
                  className="w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md bg-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="Admin">Administrador - Acceso Total</option>
                  <option value="Sales">Ventas - CRM y Presupuestos</option>
                  <option value="Accountant">Contador - Finanzas e Impuestos</option>
                  <option value="Project_Manager">Soporte - Mesa de Ayuda</option>
                </select>
              </div>

              {/* Permission Scope */}
              <div className="space-y-sm">
                <label className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">Permisos Específicos</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  <label className="flex items-center gap-md p-sm border border-outline-variant rounded-lg cursor-pointer hover:bg-surface-container-low transition-all">
                    <input 
                      type="checkbox" 
                      className="rounded border-outline-variant text-secondary focus:ring-secondary cursor-pointer"
                      checked={permissions.viewAnalytics}
                      onChange={() => handlePermissionChange('viewAnalytics')}
                    />
                    <div>
                      <p className="font-label-md text-label-md text-primary font-bold">Ver Analíticas</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">Acceso de lectura a reportes</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-md p-sm border border-outline-variant rounded-lg cursor-pointer hover:bg-surface-container-low transition-all">
                    <input 
                      type="checkbox" 
                      className="rounded border-outline-variant text-secondary focus:ring-secondary cursor-pointer"
                      checked={permissions.editBilling}
                      onChange={() => handlePermissionChange('editBilling')}
                    />
                    <div>
                      <p className="font-label-md text-label-md text-primary font-bold">Editar Facturación</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">Crear facturas y pagos</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-md p-sm border border-outline-variant rounded-lg cursor-pointer hover:bg-surface-container-low transition-all">
                    <input 
                      type="checkbox" 
                      className="rounded border-outline-variant text-secondary focus:ring-secondary cursor-pointer"
                      checked={permissions.manageApi}
                      onChange={() => handlePermissionChange('manageApi')}
                    />
                    <div>
                      <p className="font-label-md text-label-md text-primary font-bold">Gestionar API</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">Generar tokens de desarrollo</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-md p-sm border border-outline-variant rounded-lg cursor-pointer hover:bg-surface-container-low transition-all">
                    <input 
                      type="checkbox" 
                      className="rounded border-outline-variant text-secondary focus:ring-secondary cursor-pointer"
                      checked={permissions.exportData}
                      onChange={() => handlePermissionChange('exportData')}
                    />
                    <div>
                      <p className="font-label-md text-label-md text-primary font-bold">Exportar Datos</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">Derecho a exportar en CSV/JSON</p>
                    </div>
                  </label>
                </div>
              </div>
              
              <div className="pt-lg flex justify-end gap-md border-t border-outline-variant/30">
                <button 
                  className="px-lg py-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all" 
                  onClick={() => setIsModalOpen(false)} 
                  type="button"
                >
                  Cancelar
                </button>
                <button 
                  className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all" 
                  type="submit"
                >
                  Crear Cuenta de Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Success Notification */}
      {isSuccessModalOpen && createdUser && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">verified</span>
            </div>
            
            <div className="space-y-xs">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¡Usuario Registrado!</h3>
              <p className="text-body-md text-on-surface-variant">El usuario ha sido creado de forma exitosa en Supabase Auth y su perfil fue sincronizado.</p>
            </div>

            <div className="bg-slate-50 p-md rounded-xl border border-slate-100 text-left space-y-sm">
              <p className="text-body-sm text-on-surface-variant font-bold uppercase tracking-wider text-[11px]">Credenciales de acceso:</p>
              <div className="space-y-xs font-body-sm text-on-surface">
                <p><strong>Nombre:</strong> {createdUser.name}</p>
                <p><strong>Correo:</strong> {createdUser.email}</p>
                <p><strong>Rol:</strong> {createdUser.role}</p>
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 mt-2 font-mono text-body-sm">
                  <span><strong>Clave:</strong> {createdUser.password}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(createdUser.password);
                      alert("Contraseña copiada al portapapeles");
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-secondary transition-all flex items-center justify-center"
                    title="Copiar contraseña"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-sm">
              <button 
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  setCreatedUser(null);
                }}
                className="w-full bg-primary text-white py-sm rounded-lg font-bold shadow-md hover:brightness-105 active:scale-95 transition-all text-body-md"
              >
                Cerrar y Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit User Details */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/40 backdrop-blur-sm">
          <div className="relative bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up text-left">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Editar Usuario ERP</h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-bold text-emerald-600">Usuario: {selectedUser.name}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedUser(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-lg space-y-lg text-left">
              <div className="bg-slate-50/50 p-md rounded-xl border border-slate-200/60 space-y-md animate-fade-in">
                <h3 className="text-body-md font-bold text-primary flex items-center gap-2 border-b border-slate-200/60 pb-2">
                  <span className="material-symbols-outlined text-[20px] text-secondary">person</span>
                  Información del Usuario
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Nombre Completo</label>
                    <input 
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Correo Laboral</label>
                    <input 
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Rol Principal</label>
                    <select 
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                    >
                      <option value="Admin">Administrador - Acceso Total</option>
                      <option value="Sales">Ventas - CRM y Presupuestos</option>
                      <option value="Accountant">Contador - Finanzas e Impuestos</option>
                      <option value="Project_Manager">Soporte - Mesa de Ayuda</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Estado de Cuenta</label>
                    <select 
                      className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      <option value="Active">Activo</option>
                      <option value="Inactive">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Modificar Contraseña</label>
                  <input 
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Nueva contraseña (dejar en blanco para conservar actual)" 
                    type="text"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                  />
                  <p className="text-[11px] text-on-surface-variant/70 italic mt-0.5">Ingrese una nueva contraseña si desea modificar la actual del usuario.</p>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedUser(null);
                  }}
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
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Usuario?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea eliminar por completo a <strong>{userToDelete.name}</strong>? Esta acción no se puede deshacer y revocará todo acceso.
              </p>
            </div>

            <div className="pt-sm flex gap-md">
              <button 
                onClick={() => setUserToDelete(null)}
                className="flex-1 bg-white border border-outline-variant text-on-surface py-sm rounded-lg font-bold hover:bg-surface-container transition-all active:scale-95 text-body-md"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const id = userToDelete.id;
                  if (id === currentUser?.id) {
                    setNotification({
                      type: 'error',
                      title: 'Acción no permitida',
                      message: 'No puedes eliminar tu propia cuenta de usuario.'
                    });
                    setUserToDelete(null);
                    return;
                  }
                  setUserToDelete(null);
                  try {
                    await onDeleteUser(id);
                    setNotification({
                      type: 'success',
                      title: 'Usuario Eliminado',
                      message: 'El usuario ha sido removido exitosamente del sistema.'
                    });
                  } catch (err) {
                    let errorMessage = err.message;
                    if (err.message?.includes('violates foreign key constraint') || err.message?.includes('budgets_created_by_fkey')) {
                      errorMessage = 'No se puede eliminar este usuario porque tiene elementos (como presupuestos) asignados a su cuenta en la base de datos. Para mantener la integridad de los datos, debe reasignar o eliminar esos elementos antes de poder borrar la cuenta.';
                    }
                    setNotification({
                      type: 'error',
                      title: 'Error al Eliminar',
                      message: errorMessage
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
    </div>
  );
}
