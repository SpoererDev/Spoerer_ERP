import React, { useState } from 'react';
import { validateRut, formatRut } from '../utils/validation';

export default function CRM({ 
  mainClients = [], 
  onAddMainClient, 
  onDeleteMainClient,
  clients = [], 
  onAddClient, 
  onDeleteClient, 
  searchTerm, 
  setSearchTerm 
}) {
  // Sub-tabs navigation: 'main_clients' (Clientes Principales) | 'legal_entities' (Clientes con Razón Social)
  const [activeSubTab, setActiveSubTab] = useState('main_clients');

  // --- SUB-TAB 1: MAIN CLIENTS STATES ---
  const [isMainModalOpen, setIsMainModalOpen] = useState(false);
  const [editingMainClientId, setEditingMainClientId] = useState(null);
  const [viewingMainClient, setViewingMainClient] = useState(null);
  const [mainClientToDelete, setMainClientToDelete] = useState(null);

  const [mainName, setMainName] = useState('');
  const [mainContactName, setMainContactName] = useState('');
  const [mainContactEmail, setMainContactEmail] = useState('');
  const [mainAddress, setMainAddress] = useState('');
  const [mainComuna, setMainComuna] = useState('');
  const [mainCiudad, setMainCiudad] = useState('');
  const [mainPhone, setMainPhone] = useState('');
  const [mainNameError, setMainNameError] = useState('');

  // Auto-complete suggestion state for Main Client Name
  const [showMainSuggestions, setShowMainSuggestions] = useState(false);

  // Filter Main Clients by search term
  const filteredMainClients = mainClients.filter(mc => {
    const term = searchTerm.toLowerCase();
    return (
      (mc.name && mc.name.toLowerCase().includes(term)) ||
      (mc.contactName && mc.contactName.toLowerCase().includes(term)) ||
      (mc.contactEmail && mc.contactEmail.toLowerCase().includes(term)) ||
      (mc.phone && mc.phone.toLowerCase().includes(term))
    );
  });

  // Unique suggestions matching input string
  const mainNameSuggestions = mainClients
    .map(mc => mc.name)
    .filter(name => name && name.toLowerCase().includes(mainName.toLowerCase().trim()) && name.toLowerCase() !== mainName.toLowerCase().trim());

  const handleCloseMainModal = () => {
    setEditingMainClientId(null);
    setMainName('');
    setMainContactName('');
    setMainContactEmail('');
    setMainAddress('');
    setMainComuna('');
    setMainCiudad('');
    setMainPhone('');
    setMainNameError('');
    setShowMainSuggestions(false);
    setIsMainModalOpen(false);
  };

  const handleOpenEditMain = (mc) => {
    setEditingMainClientId(mc.id);
    setMainName(mc.name || '');
    setMainContactName(mc.contactName || '');
    setMainContactEmail(mc.contactEmail || '');
    setMainAddress(mc.address || '');
    setMainComuna(mc.comuna || '');
    setMainCiudad(mc.ciudad || '');
    setMainPhone(mc.phone || '');
    setMainNameError('');
    setShowMainSuggestions(false);
    setIsMainModalOpen(true);
  };

  const handleSubmitMainClient = async (e) => {
    e.preventDefault();
    const cleanName = mainName.trim();
    if (!cleanName) {
      setMainNameError('El nombre del cliente o empresa es obligatorio');
      return;
    }

    // Uniqueness validation (check if name exists in other mainClients)
    const isDuplicate = mainClients.some(mc => 
      mc.name.toLowerCase() === cleanName.toLowerCase() && mc.id !== editingMainClientId
    );

    if (isDuplicate) {
      setMainNameError('Ya existe un cliente principal registrado con este nombre');
      setNotification({
        type: 'error',
        title: 'Nombre Duplicado',
        message: 'El nombre del cliente principal debe ser único en la base de datos.'
      });
      return;
    }

    const mainClientData = {
      id: editingMainClientId || undefined,
      name: cleanName,
      contactName: mainContactName.trim() || null,
      contactEmail: mainContactEmail.trim() || null,
      address: mainAddress.trim() || null,
      comuna: mainComuna.trim() || null,
      ciudad: mainCiudad.trim() || null,
      phone: mainPhone.trim() || null
    };

    try {
      await onAddMainClient(mainClientData);
      handleCloseMainModal();
      setNotification({
        type: 'success',
        title: editingMainClientId ? 'Cliente Principal Actualizado' : 'Cliente Principal Creado',
        message: editingMainClientId 
          ? 'El cliente principal ha sido actualizado exitosamente.' 
          : 'El cliente principal ha sido registrado exitosamente en el sistema.'
      });
    } catch (err) {
      setNotification({
        type: 'error',
        title: 'Error al Registrar',
        message: err.message || 'Ocurrió un error al guardar el cliente principal.'
      });
    }
  };


  // --- SUB-TAB 2: LEGAL ENTITIES (RAZÓN SOCIAL) STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [viewingClient, setViewingClient] = useState(null);
  const [clientToDelete, setClientToDelete] = useState(null);
  
  const [rut, setRut] = useState('');
  const [company, setCompany] = useState(''); // Nombre o Razón Social
  const [selectedMainClientId, setSelectedMainClientId] = useState(''); // Selected Main Client ID or Name
  const [mainClientSearchText, setMainClientSearchText] = useState('');
  const [isMainClientDropdownOpen, setIsMainClientDropdownOpen] = useState(false);
  const [giro, setGiro] = useState('');
  const [address, setAddress] = useState('');
  const [comuna, setComuna] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [name, setName] = useState(''); // Contacto
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [rutError, setRutError] = useState('');

  // Notification state
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', title: string, message: string }

  // Filter Legal Entities by search term
  const filteredClients = clients.filter(client => {
    const term = searchTerm.toLowerCase();
    const mainClientName = client.mainClientName || client.realClient || '';
    return (
      (client.rut && client.rut.toLowerCase().includes(term)) ||
      (client.company && client.company.toLowerCase().includes(term)) ||
      (mainClientName && mainClientName.toLowerCase().includes(term)) ||
      (client.name && client.name.toLowerCase().includes(term)) || 
      (client.email && client.email.toLowerCase().includes(term))
    );
  });

  // Filter main clients based on searchable text in Legal Entity form
  const filteredMainClientOptions = mainClients.filter(mc =>
    mc.name.toLowerCase().includes((mainClientSearchText || '').toLowerCase().trim())
  );

  const handleMainClientSelectionChange = (mainId, customName = null) => {
    setSelectedMainClientId(mainId);
    if (!mainId) {
      setName('');
      setEmail('');
      setAddress('');
      setComuna('');
      setCiudad('');
      setPhone('');
      return;
    }

    const selectedMC = mainClients.find(mc => 
      mc.id === mainId || mc.name.toLowerCase() === (customName || mainId).toLowerCase()
    );
    if (selectedMC) {
      setSelectedMainClientId(selectedMC.id);
      setMainClientSearchText(selectedMC.name);
      setName(selectedMC.contactName || '');
      setEmail(selectedMC.contactEmail || '');
      setAddress(selectedMC.address || '');
      setComuna(selectedMC.comuna || '');
      setCiudad(selectedMC.ciudad || '');
      setPhone(selectedMC.phone || '');
    } else {
      setName('');
      setEmail('');
      setAddress('');
      setComuna('');
      setCiudad('');
      setPhone('');
    }
  };

  const handleRutChange = (value) => {
    const formatted = formatRut(value);
    setRut(formatted);

    const cleaned = formatted.split('.').join('').split('-').join('');

    if (cleaned.length > 1) {
      const isValid = validateRut(formatted);
      if (!isValid) {
        setRutError('RUT inválido');
      } else {
        setRutError('');
      }
    } else {
      setRutError('');
    }

    if (cleaned.length >= 7) {
      const existingClient = clients.find(c => {
        const cCleaned = c.rut ? c.rut.split('.').join('').split('-').join('') : '';
        return cCleaned === cleaned;
      });

      if (existingClient) {
        setEditingClientId(existingClient.id);
        setCompany(existingClient.company || '');
        
        const targetMCId = existingClient.mainClientId || existingClient.realClient || '';
        const matchedMC = mainClients.find(mc => mc.id === targetMCId || mc.name.toLowerCase() === targetMCId.toLowerCase());
        setSelectedMainClientId(matchedMC ? matchedMC.id : targetMCId);
        setMainClientSearchText(matchedMC ? matchedMC.name : (existingClient.mainClientName || existingClient.realClient || ''));
        setIsMainClientDropdownOpen(false);

        setGiro(existingClient.giro || '');
        setAddress(existingClient.address || '');
        setComuna(existingClient.comuna || '');
        setCiudad(existingClient.ciudad || '');
        setName(existingClient.name || '');
        setEmail(existingClient.email || '');
        setPhone(existingClient.phone || '');
        setRutError('');
      } else {
        if (editingClientId) {
          setEditingClientId(null);
        }
      }
    }
  };

  const handleCloseModal = () => {
    setEditingClientId(null);
    setRut('');
    setCompany('');
    setSelectedMainClientId('');
    setMainClientSearchText('');
    setIsMainClientDropdownOpen(false);
    setGiro('');
    setAddress('');
    setComuna('');
    setCiudad('');
    setName('');
    setEmail('');
    setPhone('');
    setRutError('');
    setIsModalOpen(false);
  };

  const handleOpenEdit = (client) => {
    setEditingClientId(client.id);
    setRut(client.rut || '');
    setCompany(client.company || '');
    
    const targetMCId = client.mainClientId || client.realClient || '';
    const matchedMC = mainClients.find(mc => mc.id === targetMCId || mc.name.toLowerCase() === targetMCId.toLowerCase());
    setSelectedMainClientId(matchedMC ? matchedMC.id : targetMCId);
    setMainClientSearchText(matchedMC ? matchedMC.name : (client.mainClientName || client.realClient || ''));
    setIsMainClientDropdownOpen(false);

    setGiro(client.giro || '');
    setAddress(client.address || '');
    setComuna(client.comuna || '');
    setCiudad(client.ciudad || '');
    setName(client.name || '');
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setRutError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rut || !company || !email) {
      setNotification({
        type: 'error',
        title: 'Campos Obligatorios',
        message: 'Por favor complete los campos obligatorios: RUT, Nombre o Razón Social y Correo Electrónico.'
      });
      return;
    }

    if (!validateRut(rut)) {
      setRutError('RUT inválido');
      setNotification({
        type: 'error',
        title: 'RUT Inválido',
        message: 'El RUT ingresado no es válido.'
      });
      return;
    }
    
    // Find matching Main Client
    const matchedMC = mainClients.find(mc => mc.id === selectedMainClientId || mc.name === selectedMainClientId);

    const clientData = {
      id: editingClientId || Date.now().toString(),
      rut,
      company,
      mainClientId: matchedMC ? matchedMC.id : (selectedMainClientId || null),
      realClient: matchedMC ? matchedMC.name : (selectedMainClientId || ''),
      mainClientName: matchedMC ? matchedMC.name : (selectedMainClientId || ''),
      giro,
      address,
      comuna,
      ciudad,
      name,
      email,
      phone: phone || 'N/A',
      initials: company.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
    };

    try {
      await onAddClient(clientData);
      handleCloseModal();
      setNotification({
        type: 'success',
        title: editingClientId ? 'Razón Social Actualizada' : 'Razón Social Creada',
        message: editingClientId 
          ? 'Los datos de la razón social han sido actualizados correctamente.' 
          : 'La razón social ha sido registrada exitosamente en el sistema.'
      });
    } catch (err) {
      setNotification({
        type: 'error',
        title: editingClientId ? 'Error al Actualizar' : 'Error al Registrar',
        message: err.message || 'Ocurrió un error al guardar la razón social.'
      });
    }
  };

  return (
    <div className="space-y-xl animate-fade-in text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 gap-4">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary font-bold">Gestión de Clientes</h2>
          <p className="text-on-surface-variant font-body-md mt-1">Administración centralizada de Clientes Principales y Razones Sociales.</p>
        </div>
        <div>
          {activeSubTab === 'main_clients' ? (
            <button 
              onClick={() => { handleCloseMainModal(); setIsMainModalOpen(true); }}
              className="flex items-center gap-2 px-md py-2 bg-secondary text-white rounded hover:brightness-105 transition-all font-label-md font-bold active:scale-95 shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">domain_add</span>
              <span>Crear Cliente Principal</span>
            </button>
          ) : (
            <button 
              onClick={() => { handleCloseModal(); setIsModalOpen(true); }}
              className="flex items-center gap-2 px-md py-2 bg-secondary text-white rounded hover:brightness-105 transition-all font-label-md font-bold active:scale-95 shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>Crear Razón Social</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex border-b border-outline-variant bg-surface-container-low/50 rounded-t-xl p-1 gap-1">
        <button
          onClick={() => setActiveSubTab('main_clients')}
          className={`flex items-center gap-2 px-6 py-3 font-label-md font-bold rounded-lg transition-all ${
            activeSubTab === 'main_clients'
              ? 'bg-white text-primary shadow-sm border border-outline-variant/60'
              : 'text-on-surface-variant hover:text-primary hover:bg-white/50'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">domain</span>
          <span>1. Clientes Principales</span>
          <span className="ml-2 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full font-extrabold">
            {mainClients.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('legal_entities')}
          className={`flex items-center gap-2 px-6 py-3 font-label-md font-bold rounded-lg transition-all ${
            activeSubTab === 'legal_entities'
              ? 'bg-white text-primary shadow-sm border border-outline-variant/60'
              : 'text-on-surface-variant hover:text-primary hover:bg-white/50'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">badge</span>
          <span>2. Clientes con Razón Social</span>
          <span className="ml-2 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full font-extrabold">
            {clients.length}
          </span>
        </button>
      </div>

      {/* Filter & KPI Bar */}
      <section className="glass-card rounded-xl p-md flex flex-wrap items-center justify-between gap-md shadow-sm">
        <div className="flex-grow max-w-lg min-w-[240px]">
          <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">
            {activeSubTab === 'main_clients' ? 'Buscar Cliente Principal' : 'Buscar Razón Social'}
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
            <input 
              className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:outline-none" 
              placeholder={activeSubTab === 'main_clients' ? "Buscar por nombre, contacto o correo..." : "Buscar por RUT, Razón Social, Cliente Principal..."}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        {searchTerm && (
          <button 
            onClick={() => { setSearchTerm(''); }}
            className="flex items-center gap-2 px-md py-2 border border-outline-variant rounded bg-white text-on-surface hover:bg-slate-50 transition-all font-label-md active:scale-95 h-[38px] self-end"
          >
            <span className="material-symbols-outlined text-[16px]">clear_all</span>
            <span>Limpiar Búsqueda</span>
          </button>
        )}
      </section>

      {/* SUB-TAB 1: CLIENTES PRINCIPALES TABLE */}
      {activeSubTab === 'main_clients' && (
        <>
          {filteredMainClients.length > 0 ? (
            <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden animate-fade-in">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Cliente / Empresa Principal</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Contacto Directo</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Correo Electrónico</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Teléfono</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center">Razones Sociales</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {filteredMainClients.map((mc) => {
                      const associatedEntities = clients.filter(c => 
                        (c.mainClientId && c.mainClientId === mc.id) || 
                        (c.realClient && c.realClient.toLowerCase() === mc.name.toLowerCase())
                      );
                      return (
                        <tr key={mc.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="p-md">
                            <div className="flex items-center gap-sm">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs bg-primary text-white shadow-sm">
                                {mc.initials}
                              </div>
                              <div>
                                <span className="font-body-md font-bold text-primary block">{mc.name}</span>
                                <span className="text-xs text-on-surface-variant">Cliente Principal</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-md font-body-md text-on-surface">{mc.contactName || 'Sin registrar'}</td>
                          <td className="p-md font-body-md text-on-surface">{mc.contactEmail || 'Sin registrar'}</td>
                          <td className="p-md font-body-md text-on-surface">{mc.phone || 'Sin registrar'}</td>
                          <td className="p-md text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                              associatedEntities.length > 0 ? 'bg-secondary-container/60 text-secondary' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {associatedEntities.length} {associatedEntities.length === 1 ? 'Razón Social' : 'Razones Sociales'}
                            </span>
                          </td>
                          <td className="p-md text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => setViewingMainClient(mc)}
                                className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all" 
                                title="Ver Ficha"
                              >
                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                              </button>
                              <button 
                                onClick={() => handleOpenEditMain(mc)}
                                className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all" 
                                title="Editar"
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              <button 
                                onClick={() => setMainClientToDelete(mc)}
                                className="p-1 hover:bg-red-50 rounded text-error hover:text-red-700 transition-all" 
                                title="Eliminar"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-lg py-md bg-surface-container-low border-t border-outline-variant flex items-center justify-between">
                <p className="text-body-sm text-on-surface-variant italic">
                  Mostrando {filteredMainClients.length} de {mainClients.length} clientes principales
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-outline-variant rounded-xl p-12 text-center text-on-surface-variant italic animate-fade-in">
              No se encontraron clientes principales registrados. Presione <strong>"Crear Cliente Principal"</strong> para agregar el primero.
            </div>
          )}
        </>
      )}

      {/* SUB-TAB 2: CLIENTES CON RAZÓN SOCIAL TABLE */}
      {activeSubTab === 'legal_entities' && (
        <>
          {filteredClients.length > 0 ? (
            <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden animate-fade-in">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">RUT</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Nombre o Razón Social</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Cliente Principal</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Giro</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Contacto</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Correo Electrónico</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Teléfono</th>
                      <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-md font-body-md font-bold text-primary">{client.rut || 'N/A'}</td>
                        <td className="p-md">
                          <div className="flex items-center gap-sm">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-secondary-container text-on-secondary-container">
                              {client.initials}
                            </div>
                            <span className="font-body-md font-bold text-on-surface">{client.company}</span>
                          </div>
                        </td>
                        <td className="p-md font-body-md font-semibold text-primary">
                          {client.mainClientName || client.realClient || <span className="text-on-surface-variant font-normal italic">Sin asignar</span>}
                        </td>
                        <td className="p-md font-body-md text-on-surface-variant">{client.giro || 'N/A'}</td>
                        <td className="p-md font-body-md text-on-surface">{client.name || 'N/A'}</td>
                        <td className="p-md font-body-md text-on-surface">{client.email}</td>
                        <td className="p-md font-body-md text-on-surface">{client.phone}</td>
                        <td className="p-md text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => setViewingClient(client)}
                              className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all" 
                              title="Ver Detalle"
                            >
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                            </button>
                            <button 
                              onClick={() => handleOpenEdit(client)}
                              className="p-1 hover:bg-slate-100 rounded text-secondary hover:text-secondary-fixed-dim transition-all" 
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button 
                              onClick={() => setClientToDelete(client)}
                              className="p-1 hover:bg-red-50 rounded text-error hover:text-red-700 transition-all" 
                              title="Eliminar"
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
              <div className="px-lg py-md bg-surface-container-low border-t border-outline-variant flex items-center justify-between">
                <p className="text-body-sm text-on-surface-variant italic">
                  Mostrando {filteredClients.length} de {clients.length} razones sociales registradas
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-outline-variant rounded-xl p-12 text-center text-on-surface-variant italic animate-fade-in">
              No se encontraron razones sociales. Presione <strong>"Crear Razón Social"</strong> para agregar una.
            </div>
          )}
        </>
      )}


      {/* --- MODAL: CREAR / EDITAR CLIENTE PRINCIPAL --- */}
      {isMainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">
                  {editingMainClientId ? 'Editar Cliente Principal' : 'Registrar Cliente Principal'}
                </h2>
                <p className="text-body-md text-on-surface-variant">
                  {editingMainClientId ? 'Modifique la información básica del cliente principal' : 'Complete los parámetros requeridos'}
                </p>
              </div>
              <button 
                type="button"
                onClick={handleCloseMainModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmitMainClient} className="p-lg space-y-lg text-left">
              <div className="space-y-md">
                {/* Nombre del Cliente o Empresa (Mandatorio y Único con sugerencias) */}
                <div className="flex flex-col gap-xs relative">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold flex items-center justify-between">
                    <span>Nombre del Cliente o Empresa *</span>
                    <span className="text-xs text-secondary font-semibold">Obligatorio y Único</span>
                  </label>
                  <input 
                    type="text" 
                    className={`w-full border rounded-lg text-body-md py-2.5 px-3 focus:ring-1 outline-none transition-all bg-white ${
                      mainNameError ? 'border-error focus:ring-error/20 focus:border-error' : 'border-slate-300 focus:ring-secondary focus:border-secondary'
                    }`} 
                    placeholder="Ej: Spoerer & Cia"
                    required
                    value={mainName}
                    onChange={(e) => {
                      setMainName(e.target.value);
                      setMainNameError('');
                      setShowMainSuggestions(true);
                    }}
                    onFocus={() => setShowMainSuggestions(true)}
                  />
                  {mainNameError && (
                    <span className="text-error text-body-sm block mt-1 font-medium">{mainNameError}</span>
                  )}

                  {/* Dynamic suggestions dropdown */}
                  {showMainSuggestions && mainName.trim() !== '' && mainNameSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-outline-variant rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      <div className="px-3 py-1 bg-slate-50 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b">
                        Sugerencias de nombres existentes:
                      </div>
                      {mainNameSuggestions.map((sugg, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setMainName(sugg);
                            setShowMainSuggestions(false);
                          }}
                          className="px-3 py-2 text-body-md hover:bg-secondary-container/40 cursor-pointer transition-colors font-medium text-primary"
                        >
                          {sugg}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nombre de Contacto */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Nombre de Contacto (Opcional)
                  </label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Juan Pérez"
                    value={mainContactName}
                    onChange={(e) => setMainContactName(e.target.value)}
                  />
                </div>

                {/* Mail de Contacto */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Mail de Contacto (Opcional)
                  </label>
                  <input 
                    type="email" 
                    className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: contacto@spoerer.cl"
                    value={mainContactEmail}
                    onChange={(e) => setMainContactEmail(e.target.value)}
                  />
                </div>

                {/* Dirección */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Dirección (Opcional)
                  </label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Av. Providencia 1234, Of. 501"
                    value={mainAddress}
                    onChange={(e) => setMainAddress(e.target.value)}
                  />
                </div>

                {/* Comuna */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Comuna (Opcional)
                  </label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Providencia"
                    value={mainComuna}
                    onChange={(e) => setMainComuna(e.target.value)}
                  />
                </div>

                {/* Ciudad */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Ciudad (Opcional)
                  </label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Santiago"
                    value={mainCiudad}
                    onChange={(e) => setMainCiudad(e.target.value)}
                  />
                </div>

                {/* Teléfono */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Teléfono (Opcional)
                  </label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: +56 9 1234 5678"
                    value={mainPhone}
                    onChange={(e) => setMainPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant mt-sm">
                <button
                  className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold"
                  onClick={handleCloseMainModal}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95"
                >
                  {editingMainClientId ? 'Actualizar Cliente Principal' : 'Guardar Cliente Principal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* --- MODAL: CREAR / EDITAR CLIENTE CON RAZÓN SOCIAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">
                  {editingClientId ? 'Editar Razón Social' : 'Registrar Nueva Razón Social'}
                </h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  {editingClientId ? (
                    <>
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-bold text-emerald-600">Editando Registro Existente</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <span>Ingresando una nueva razón social</span>
                    </>
                  )}
                </p>
              </div>
              <button 
                type="button"
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-lg space-y-lg text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md text-left">
                {/* Cliente Principal Searchable Input & Dropdown */}
                <div className="flex flex-col gap-xs md:col-span-2 bg-surface-container-low p-md rounded-xl border border-outline-variant/60 relative">
                  <label className="text-label-sm text-primary uppercase tracking-wider font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px] text-secondary">domain</span>
                      <span>Cliente Principal</span>
                    </span>
                    {selectedMainClientId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMainClientId('');
                          setMainClientSearchText('');
                          setIsMainClientDropdownOpen(false);
                          handleMainClientSelectionChange('');
                        }}
                        className="text-xs text-error hover:underline flex items-center gap-0.5 font-bold"
                      >
                        <span className="material-symbols-outlined text-[14px]">cancel</span>
                        Limpiar selección
                      </button>
                    )}
                  </label>

                  <div className="relative">
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg text-body-md py-2.5 px-3 pr-10 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white font-medium"
                      placeholder="Escriba para buscar cliente principal..."
                      value={mainClientSearchText}
                      onChange={(e) => {
                        const text = e.target.value;
                        setMainClientSearchText(text);
                        setIsMainClientDropdownOpen(true);
                        
                        const matched = mainClients.find(mc => mc.name.toLowerCase() === text.toLowerCase().trim());
                        if (matched) {
                          handleMainClientSelectionChange(matched.id, matched.name);
                        } else {
                          setSelectedMainClientId(text);
                          setName('');
                          setEmail('');
                        }
                      }}
                      onFocus={() => setIsMainClientDropdownOpen(true)}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant pointer-events-none">
                      search
                    </span>
                  </div>

                  {/* Floating dropdown options */}
                  {isMainClientDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-outline-variant rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      {filteredMainClientOptions.length > 0 ? (
                        filteredMainClientOptions.map((mc) => (
                          <div
                            key={mc.id}
                            onClick={() => {
                              setMainClientSearchText(mc.name);
                              handleMainClientSelectionChange(mc.id, mc.name);
                              setIsMainClientDropdownOpen(false);
                            }}
                            className={`px-3 py-2.5 text-body-md cursor-pointer transition-colors flex items-center justify-between border-b border-slate-100 last:border-0 ${
                              selectedMainClientId === mc.id ? 'bg-secondary-container/50 font-bold text-secondary' : 'hover:bg-slate-50 text-primary'
                            }`}
                          >
                            <span className="font-medium">{mc.name}</span>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-body-sm text-on-surface-variant italic text-center">
                          {mainClientSearchText ? `No se encontraron coincidencias para "${mainClientSearchText}"` : 'No hay clientes principales registrados'}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-on-surface-variant mt-1">
                    Escriba caracteres para buscar y filtrar dinámicamente la lista de clientes principales.
                  </p>
                </div>

                {/* RUT */}
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    RUT *
                  </label>
                  <input 
                    type="text" 
                    className={`w-full border rounded-lg text-body-md py-2 px-3 focus:ring-1 outline-none transition-all bg-white ${
                      rutError ? 'border-error focus:ring-error/20 focus:border-error' : 'border-slate-300 focus:ring-secondary focus:border-secondary'
                    }`} 
                    placeholder="Ej: 12.345.678-9"
                    required
                    value={rut}
                    onChange={(e) => handleRutChange(e.target.value)}
                  />
                  {rutError && (
                    <span className="text-error text-body-sm block mt-1 font-medium">{rutError}</span>
                  )}
                </div>

                {/* Nombre o Razón Social */}
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Nombre o Razón Social *
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: TechNova Solutions SpA"
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                {/* Giro */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Giro
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Servicios Informáticos"
                    value={giro}
                    onChange={(e) => setGiro(e.target.value)}
                  />
                </div>

                {/* Contacto */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Contacto
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Alejandro Sánchez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Dirección */}
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Dirección
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Av. Providencia 1234, Of. 501"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                {/* Comuna */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Comuna
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Providencia"
                    value={comuna}
                    onChange={(e) => setComuna(e.target.value)}
                  />
                </div>

                {/* Ciudad */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Ciudad
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Santiago"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                  />
                </div>

                {/* Correo Electrónico */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Correo Electrónico *
                  </label>
                  <input 
                    type="email" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="ejemplo@empresa.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {/* Teléfono */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Teléfono
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-300 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: +56 9 1234 5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant mt-sm">
                <button
                  className="px-lg py-2 border border-outline-variant rounded text-on-surface hover:bg-slate-50 transition-all font-bold"
                  onClick={handleCloseModal}
                  type="button"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  className="px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95"
                >
                  {editingClientId ? 'Actualizar Razón Social' : 'Guardar Razón Social'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL FICHA CLIENTE PRINCIPAL --- */}
      {viewingMainClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Ficha de Cliente Principal</h2>
                <p className="text-body-md text-on-surface-variant">Detalles e información de contacto</p>
              </div>
              <button 
                onClick={() => setViewingMainClient(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-lg space-y-md">
              <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Nombre del Cliente / Empresa</span>
                <span className="text-body-lg text-primary font-bold block mt-1">{viewingMainClient.name}</span>
              </div>
              <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Contacto Directo</span>
                <span className="text-body-lg text-primary block mt-1">{viewingMainClient.contactName || 'Sin registrar'}</span>
              </div>
              <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Mail de Contacto</span>
                <span className="text-body-lg text-primary block mt-1">{viewingMainClient.contactEmail || 'Sin registrar'}</span>
              </div>
              <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Dirección</span>
                <span className="text-body-lg text-primary block mt-1">{viewingMainClient.address || 'Sin registrar'}</span>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                  <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Comuna</span>
                  <span className="text-body-lg text-primary block mt-1">{viewingMainClient.comuna || 'Sin registrar'}</span>
                </div>
                <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                  <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Ciudad</span>
                  <span className="text-body-lg text-primary block mt-1">{viewingMainClient.ciudad || 'Sin registrar'}</span>
                </div>
              </div>
              <div className="bg-surface-container-low p-md rounded-xl border border-outline-variant/40">
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Teléfono</span>
                <span className="text-body-lg text-primary block mt-1">{viewingMainClient.phone || 'Sin registrar'}</span>
              </div>
              <div className="flex justify-end pt-md">
                <button
                  onClick={() => setViewingMainClient(null)}
                  className="px-lg py-2 bg-secondary text-white rounded font-bold shadow-md hover:brightness-105 active:scale-95"
                >
                  Cerrar Ficha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL FICHA RAZÓN SOCIAL --- */}
      {viewingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Ficha de Razón Social</h2>
                <p className="text-body-md text-on-surface-variant">Detalles de facturación y legales</p>
              </div>
              <button 
                onClick={() => setViewingClient(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-lg flex flex-col gap-md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md text-left">
                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">RUT</span>
                    <span className="font-body-lg text-body-lg text-primary font-semibold mt-1 block">{viewingClient.rut || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Nombre o Razón Social</span>
                    <span className="font-body-lg text-body-lg text-primary font-semibold mt-1 block">{viewingClient.company || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Cliente Principal</span>
                    <span className="font-body-lg text-body-lg text-primary font-semibold mt-1 block">{viewingClient.mainClientName || viewingClient.realClient || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Giro</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.giro || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Contacto (Persona)</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.name || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Dirección</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.address || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Correo Electrónico</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.email || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Teléfono</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.phone || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-md pt-lg border-t border-outline-variant mt-sm">
                <button
                  type="button"
                  onClick={() => setViewingClient(null)}
                  className="px-lg py-2 bg-secondary text-white rounded hover:brightness-110 transition-all font-bold shadow-lg shadow-secondary/20 active:scale-95"
                >
                  Cerrar Ficha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- NOTIFICATION MODAL --- */}
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

      {/* --- CONFIRMATION MODAL: DELETE MAIN CLIENT --- */}
      {mainClientToDelete && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Cliente Principal?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea eliminar por completo a <strong>{mainClientToDelete.name}</strong>?
              </p>
            </div>

            <div className="pt-sm flex gap-md">
              <button 
                onClick={() => setMainClientToDelete(null)}
                className="flex-1 bg-white border border-outline-variant text-on-surface py-sm rounded-lg font-bold hover:bg-surface-container transition-all active:scale-95 text-body-md"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const id = mainClientToDelete.id;
                  setMainClientToDelete(null);
                  try {
                    await onDeleteMainClient(id);
                    setNotification({
                      type: 'success',
                      title: 'Cliente Principal Eliminado',
                      message: 'El cliente principal ha sido eliminado exitosamente.'
                    });
                  } catch (err) {
                    setNotification({
                      type: 'error',
                      title: 'Error al Eliminar',
                      message: err.message || 'Ocurrió un error al eliminar el cliente principal.'
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

      {/* --- CONFIRMATION MODAL: DELETE LEGAL ENTITY --- */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Razón Social?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea eliminar a <strong>{clientToDelete.company}</strong>?
              </p>
            </div>

            <div className="pt-sm flex gap-md">
              <button 
                onClick={() => setClientToDelete(null)}
                className="flex-1 bg-white border border-outline-variant text-on-surface py-sm rounded-lg font-bold hover:bg-surface-container transition-all active:scale-95 text-body-md"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const id = clientToDelete.id;
                  setClientToDelete(null);
                  try {
                    await onDeleteClient(id);
                    setNotification({
                      type: 'success',
                      title: 'Razón Social Eliminada',
                      message: 'La razón social ha sido eliminada exitosamente.'
                    });
                  } catch (err) {
                    setNotification({
                      type: 'error',
                      title: 'Error al Eliminar',
                      message: err.message || 'Ocurrió un error al eliminar la razón social.'
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
