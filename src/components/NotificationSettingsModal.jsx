import React, { useState, useEffect, useMemo } from 'react';

export default function NotificationSettingsModal({
  isOpen,
  onClose,
  users = [],
  notificationSettings = [],
  onSaveNotificationSetting
}) {
  // Available notification types in the system
  const notificationTypes = useMemo(() => [
    {
      id: 'budget_approved',
      title: 'Notificar al aprobar presupuesto',
      description: 'Envía una alerta por correo electrónico a los usuarios seleccionados cada vez que un presupuesto pasa a estado Aprobado y se vincula a un proyecto.',
      category: 'Presupuestos',
      icon: 'verified',
      isAvailable: true
    },
    {
      id: 'invoice_issued',
      title: 'Emisión de Factura',
      description: 'Notifica a los responsables cuando se emite y registra una nueva factura en el módulo de facturación.',
      category: 'Facturación',
      icon: 'receipt_long',
      isAvailable: false
    },
    {
      id: 'quote_created',
      title: 'Nueva Cotización Creada',
      description: 'Avisa al equipo comercial y de operaciones cuando se genera una nueva propuesta en borrador o en revisión.',
      category: 'Presupuestos',
      icon: 'request_quote',
      isAvailable: false
    },
    {
      id: 'payment_reminder',
      title: 'Recordatorio de Cobro',
      description: 'Alerta sobre cuotas de facturación pendientes o vencidas según el cronograma establecido.',
      category: 'Cobranzas',
      icon: 'schedule',
      isAvailable: false
    }
  ], []);

  // Currently selected notification type tab
  const [selectedType, setSelectedType] = useState('budget_approved');

  // Selected user IDs for each notification type: { [typeId]: string[] }
  const [selectedUsersByType, setSelectedUsersByType] = useState({});

  // Enabled flag for each notification type: { [typeId]: boolean }
  const [enabledByType, setEnabledByType] = useState({});

  // Search filter for the registered users list
  const [searchTerm, setSearchTerm] = useState('');

  // UI state for saving
  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');

  // Sync internal state when modal opens or notificationSettings change
  useEffect(() => {
    if (!isOpen) return;

    const initialUsersMap = {};
    const initialEnabledMap = {};

    notificationTypes.forEach(t => {
      const existing = (notificationSettings || []).find(s => s.notificationType === t.id);
      if (existing) {
        initialUsersMap[t.id] = Array.isArray(existing.userIds) ? existing.userIds : [];
        initialEnabledMap[t.id] = existing.enabled !== false;
      } else {
        initialUsersMap[t.id] = [];
        initialEnabledMap[t.id] = true;
      }
    });

    setSelectedUsersByType(initialUsersMap);
    setEnabledByType(initialEnabledMap);
    setSearchTerm('');
    setErrorMessage('');

  }, [isOpen, notificationSettings, notificationTypes]);

  if (!isOpen) return null;

  const currentTypeConfig = notificationTypes.find(t => t.id === selectedType) || notificationTypes[0];
  const currentUserIds = selectedUsersByType[selectedType] || [];
  const currentIsEnabled = enabledByType[selectedType] !== false;

  // Filter registered users (only show active users or matching search)
  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const nameMatch = user.name?.toLowerCase().includes(term);
    const emailMatch = user.email?.toLowerCase().includes(term);
    const roleMatch = user.role?.toLowerCase().includes(term);
    return nameMatch || emailMatch || roleMatch;
  });

  // Toggle user selection for current notification type
  const handleToggleUser = (userId) => {
    setSelectedUsersByType(prev => {
      const currentList = prev[selectedType] || [];
      const exists = currentList.includes(userId);
      const updatedList = exists
        ? currentList.filter(id => id !== userId)
        : [...currentList, userId];
      return {
        ...prev,
        [selectedType]: updatedList
      };
    });
  };

  // Select all filtered users
  const handleSelectAll = () => {
    setSelectedUsersByType(prev => {
      const currentList = new Set(prev[selectedType] || []);
      filteredUsers.forEach(u => currentList.add(u.id));
      return {
        ...prev,
        [selectedType]: Array.from(currentList)
      };
    });
  };

  // Deselect all filtered users
  const handleDeselectAll = () => {
    setSelectedUsersByType(prev => {
      const toRemove = new Set(filteredUsers.map(u => u.id));
      const currentList = prev[selectedType] || [];
      return {
        ...prev,
        [selectedType]: currentList.filter(id => !toRemove.has(id))
      };
    });
  };

  // Toggle overall enabled state for current notification type
  const handleToggleEnabled = () => {
    setEnabledByType(prev => ({
      ...prev,
      [selectedType]: !currentIsEnabled
    }));
  };

  // Submit save action
  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage('');
    try {
      if (onSaveNotificationSetting) {
        await onSaveNotificationSetting(selectedType, {
          userIds: currentUserIds,
          enabled: currentIsEnabled,
          title: currentTypeConfig.title,
          description: currentTypeConfig.description
        });
      }
      onClose();
    } catch (err) {
      console.error('Error guardando configuración de notificaciones:', err);
      setErrorMessage(err.message || 'Ocurrió un error al guardar la configuración en la base de datos.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
        {/* Main Modal Container */}
        <div className="relative bg-white w-full max-w-4xl lg:max-w-5xl rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up max-h-[90vh] overflow-hidden text-left">
          
          {/* Header */}
          <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-container/30 border border-secondary-container text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">notifications_active</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-primary font-bold leading-tight">
                  Configuración de Notificaciones
                </h2>
                <p className="text-body-sm text-on-surface-variant">
                  Administra los eventos automáticos del ERP y define qué usuarios recibirán los correos.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all cursor-pointer"
              title="Cerrar modal"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Modal Body: Split Layout (Izquierda: Panel de Eventos | Derecha: Destinatarios Registrados) */}
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0 bg-white">
            
            {/* Panel Izquierdo: Tipos de Notificaciones / Eventos */}
            <div className="w-full md:w-2/5 lg:w-1/3 p-lg bg-surface flex flex-col justify-between overflow-y-auto border-b md:border-b-0 md:border-r border-outline-variant/30 min-h-0">
              <div className="space-y-md">
                
                {/* Título de la sección de eventos */}
                <div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider block mb-1">
                    Panel de Eventos
                  </span>
                </div>

                {/* Lista de tipos de notificaciones */}
                <div className="space-y-2">
                  {notificationTypes.map(t => {
                    const isCurrent = t.id === selectedType;
                    const count = (selectedUsersByType[t.id] || []).length;
                    const isEnabled = enabledByType[t.id] !== false;

                    if (!t.isAvailable) {
                      return (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 opacity-65 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-slate-400 text-[20px]">
                              {t.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-600 truncate">
                                {t.title}
                              </p>
                              <span className="text-[10px] text-slate-400">
                                {t.category}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full shrink-0">
                            Próximamente
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedType(t.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                          isCurrent
                            ? 'bg-white border-secondary shadow-sm ring-1 ring-secondary/20'
                            : 'bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isCurrent ? 'bg-secondary text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <span className="material-symbols-outlined text-[18px]">
                                {t.icon}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {t.title}
                            </p>
                          </div>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container border border-secondary/20 shrink-0">
                            {count} {count === 1 ? 'destinatario' : 'destinatarios'}
                          </span>
                        </div>

                        {/* Switch de activación de la notificación */}
                        <div
                          className="pt-2 border-t border-slate-100 flex items-center justify-between"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={handleToggleEnabled}
                              className="w-3.5 h-3.5 text-secondary rounded border-slate-300 focus:ring-secondary/20 cursor-pointer"
                            />
                            <span>Activar este envío</span>
                          </label>

                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            isEnabled ? 'text-emerald-600' : 'text-slate-400'
                          }`}>
                            {isEnabled ? 'Habilitado' : 'Pausado'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Nota sutil al pie del panel */}
              <div className="pt-md text-center text-[11px] text-slate-400">
                SPOERER ERP &bull; Suite de Notificaciones
              </div>
            </div>

            {/* Panel Derecho: Lista de Usuarios Registrados */}
            <div className="w-full md:w-3/5 lg:w-2/3 flex flex-col p-lg min-h-0 overflow-hidden">
              
              {/* Encabezado del área de usuarios */}
              <div className="mb-md">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">
                      Destinatarios Registrados
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-secondary-container text-on-secondary-container border border-secondary/20">
                      {currentUserIds.length} seleccionados
                    </span>
                  </div>
                  <div className="text-[12px] text-on-surface-variant font-medium">
                    Evento: <strong className="text-primary">{currentTypeConfig.title}</strong>
                  </div>
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  Marca a los usuarios que deben recibir un correo electrónico al ejecutarse esta acción.
                </p>
              </div>

              {/* Barra de Búsqueda y Acciones Rápidas */}
              <div className="space-y-sm mb-md">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar usuario por nombre, correo o rol..."
                    className="w-full pl-9 pr-8 py-2 border border-outline-variant rounded-lg text-body-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all bg-white"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1">
                  <span>
                    Mostrando <strong>{filteredUsers.length}</strong> de {users.length} usuarios
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-secondary hover:text-secondary-dark font-semibold hover:underline cursor-pointer"
                    >
                      Seleccionar todos
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-slate-500 hover:text-slate-800 font-semibold hover:underline cursor-pointer"
                    >
                      Deseleccionar todos
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista Scrollable de Usuarios */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[46vh]">
                {filteredUsers.length === 0 ? (
                  <div className="p-xl text-center border border-dashed border-outline-variant rounded-xl bg-slate-50/50">
                    <span className="material-symbols-outlined text-slate-300 text-4xl mb-1">
                      person_search
                    </span>
                    <p className="text-body-sm font-semibold text-slate-600">
                      No se encontraron usuarios
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Intenta con otro término de búsqueda.
                    </p>
                  </div>
                ) : (
                  filteredUsers.map(user => {
                    const isSelected = currentUserIds.includes(user.id);
                    const initials = user.initials || (user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'US');
                    const isActive = user.status === 'Active';

                    return (
                      <div
                        key={user.id}
                        onClick={() => handleToggleUser(user.id)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                          isSelected
                            ? 'bg-secondary-container/15 border-secondary/40 shadow-xs'
                            : 'bg-white border-slate-200/90 hover:bg-slate-50/80 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Handled by container click
                            className="w-4 h-4 text-secondary rounded border-slate-300 focus:ring-secondary/20 cursor-pointer pointer-events-none"
                          />

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-secondary text-white shadow-xs'
                              : 'bg-primary/10 text-primary'
                          }`}>
                            {initials}
                          </div>

                          {/* User info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {user.name}
                              </p>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                user.role === 'Admin'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {user.role || 'Usuario'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-mono truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>

                        {/* Status Indicator */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title={isActive ? 'Usuario Activo' : 'Usuario Inactivo'}
                          />
                          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                            {isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Mensaje de error si falla el guardado */}
              {errorMessage && (
                <div className="mt-md p-md bg-red-50 border border-red-200 rounded-lg text-red-700 text-body-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-red-600">error</span>
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="pt-lg pb-md px-lg flex justify-between items-center border-t border-outline-variant/30 sticky bottom-0 bg-white z-10">
            <div className="text-body-sm text-on-surface-variant hidden sm:flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">info</span>
              <span>Los cambios afectarán a todas las aprobaciones futuras.</span>
            </div>

            <div className="flex items-center justify-end gap-md w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-lg py-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Guardar Configuración</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      </div>

    </>
  );
}

