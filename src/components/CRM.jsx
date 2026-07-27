import React, { useState } from 'react';
import { validateRut, formatRut } from '../utils/validation';

export default function CRM({ clients, onAddClient, onDeleteClient, searchTerm, setSearchTerm }) {
  
  // New client form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [viewingClient, setViewingClient] = useState(null);
  
  const [rut, setRut] = useState('');
  const [company, setCompany] = useState(''); // Nombre o Razón Social
  const [realClient, setRealClient] = useState(''); // Cliente Real
  const [giro, setGiro] = useState('');
  const [address, setAddress] = useState('');
  const [comuna, setComuna] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [name, setName] = useState(''); // Contacto
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [rutError, setRutError] = useState('');

  // Generate list of unique existing values for autocomplete suggestions
  const uniqueRealClients = Array.from(
    new Set(
      clients
        .map(c => c.realClient)
        .filter(val => typeof val === 'string' && val.trim() !== '')
    )
  ).sort();

  // Custom modal / alert states
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', title: string, message: string }
  const [clientToDelete, setClientToDelete] = useState(null);

  // Filter clients by search term (including RUT, Contact name, Company, and Email)
  const filteredClients = clients.filter(client => {
    const term = searchTerm.toLowerCase();
    return (
      (client.rut && client.rut.toLowerCase().includes(term)) ||
      (client.name && client.name.toLowerCase().includes(term)) || 
      (client.company && client.company.toLowerCase().includes(term)) ||
      (client.email && client.email.toLowerCase().includes(term))
    );
  });

  const handleRutChange = (value) => {
    // Format RUT as the user types
    const formatted = formatRut(value);
    setRut(formatted);

    // Clean RUT to compare with database
    const cleaned = formatted.split('.').join('').split('-').join('');

    // Perform validation
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

    // Auto-fill logic: if RUT exists, load client data for editing
    if (cleaned.length >= 7) {
      const existingClient = clients.find(c => {
        const cCleaned = c.rut ? c.rut.split('.').join('').split('-').join('') : '';
        return cCleaned === cleaned;
      });

      if (existingClient) {
        setEditingClientId(existingClient.id);
        setCompany(existingClient.company || '');
        setRealClient(existingClient.realClient || '');
        setGiro(existingClient.giro || '');
        setAddress(existingClient.address || '');
        setComuna(existingClient.comuna || '');
        setCiudad(existingClient.ciudad || '');
        setName(existingClient.name || '');
        setEmail(existingClient.email || '');
        setPhone(existingClient.phone || '');
        setRutError(''); // Clear error since it exists in DB
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
    setRealClient('');
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
    setRealClient(client.realClient || '');
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
    
    const clientData = {
      id: editingClientId || Date.now().toString(),
      rut,
      company,
      realClient,
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
        title: editingClientId ? 'Cliente Actualizado' : 'Cliente Creado',
        message: editingClientId 
          ? 'Los datos del cliente han sido actualizados correctamente.' 
          : 'El cliente ha sido registrado exitosamente en el sistema.'
      });
    } catch (err) {
      setNotification({
        type: 'error',
        title: editingClientId ? 'Error al Actualizar' : 'Error al Registrar',
        message: err.message || (editingClientId 
          ? 'Ocurrió un error al actualizar los datos del cliente.' 
          : 'Ocurrió un error al registrar el cliente.')
      });
    }
  };

  return (
    <div className="space-y-xl animate-fade-in text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary font-bold">Registro de Clientes</h2>
          <p className="text-on-surface-variant font-body-md mt-1">Gestión centralizada de la información de los clientes de la organización.</p>
        </div>
        <button 
          onClick={() => { handleCloseModal(); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-md py-2 bg-secondary text-white rounded hover:brightness-105 transition-all font-label-md font-bold active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">person_add</span>
          <span>Crear Cliente</span>
        </button>
      </div>

      {/* KPI Dashboard */}
      <div className="w-full md:w-1/4">
        <div className="bg-blue-50/40 border border-blue-200/60 rounded-xl p-md flex items-center justify-between hover-scale shadow-sm transition-all">
          <div className="space-y-1">
            <span className="text-label-md text-blue-800 uppercase font-bold tracking-wider">Clientes Registrados</span>
            <div className="font-display-lg text-[34px] text-blue-950 font-extrabold">
              {clients.length}
            </div>
          </div>
          <div className="p-3 bg-blue-100 rounded-full text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">groups</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="glass-card rounded-xl p-md flex flex-wrap items-end gap-md shadow-sm">
        <div className="flex-grow max-w-lg min-w-[240px]">
          <label className="block font-label-md text-label-md text-on-surface-variant mb-1 uppercase font-bold">Buscar Cliente</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
            <input 
              className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-1 focus:ring-secondary focus:outline-none" 
              placeholder="Buscar por RUT, Nombre, Empresa o Correo..." 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <button 
          onClick={() => { setSearchTerm(''); }}
          className="flex items-center gap-2 px-md py-2 border border-outline-variant rounded bg-white text-on-surface hover:bg-slate-50 transition-all font-label-md active:scale-95 h-[38px]"
        >
          <span className="material-symbols-outlined text-[16px]">clear_all</span>
          <span>Limpiar</span>
        </button>
      </section>

      {/* CRM Main Table Container */}
      {filteredClients.length > 0 ? (
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">RUT</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Nombre o Razón Social</th>
                  <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Cliente Real</th>
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
                    <td className="p-md font-body-md text-on-surface">{client.realClient || 'N/A'}</td>
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
          {/* Pagination */}
          <div className="px-lg py-md bg-surface-container-low border-t border-outline-variant flex items-center justify-between">
            <p className="text-body-sm text-on-surface-variant italic">
              Mostrando {filteredClients.length} de {clients.length} clientes registrados
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
          No se encontraron clientes que coincidan con la búsqueda.
        </div>
      )}

      {/* modal window / Crear o Editar cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">
                  {editingClientId ? 'Editar Datos del Cliente' : 'Registrar Nuevo Cliente'}
                </h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">
                  {editingClientId ? (
                    <>
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-bold text-emerald-600">Editando Cliente Existente</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <span>Ingresando un nuevo registro de cliente</span>
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
                {/* RUT */}
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    RUT *
                  </label>
                  <input 
                    type="text" 
                    className={`w-full border rounded-lg text-body-md py-2 px-3 focus:ring-1 outline-none transition-all bg-white ${
                      rutError ? 'border-error focus:ring-error/20 focus:border-error' : 'border-slate-200 focus:ring-secondary focus:border-secondary'
                    }`} 
                    placeholder="Ej: 12.345.678-9"
                    required
                    value={rut}
                    onChange={(e) => handleRutChange(e.target.value)}
                  />
                  {rutError && (
                    <span className="text-error text-body-sm block mt-1 font-medium">{rutError}</span>
                  )}
                  {editingClientId && (
                    <span className="text-secondary text-body-sm block mt-1 font-semibold flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      RUT existente: Editando datos del cliente.
                    </span>
                  )}
                </div>

                {/* Razón Social */}
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Nombre o Razón Social *
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: TechNova Solutions S.A."
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                {/* Cliente Real */}
                <div className="flex flex-col gap-xs md:col-span-2 animate-fade-in">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Cliente Real
                  </label>
                  <input 
                    type="text" 
                    list="real-client-suggestions"
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
                    placeholder="Ej: Cliente Real S.A."
                    value={realClient}
                    onChange={(e) => setRealClient(e.target.value)}
                  />
                  <datalist id="real-client-suggestions">
                    {uniqueRealClients.map((val, idx) => (
                      <option key={idx} value={val} />
                    ))}
                  </datalist>
                </div>

                {/* Giro */}
                <div className="flex flex-col gap-xs">
                  <label className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                    Giro
                  </label>
                  <input 
                    type="text" 
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                    className="w-full border-slate-200 rounded-lg text-body-md py-2 px-3 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all bg-white" 
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
                  {editingClientId ? 'Actualizar Cliente' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* modal window / Ver Ficha de Cliente */}
      {viewingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col animate-scale-up">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary font-bold">Ficha del Cliente</h2>
                <p className="text-body-md text-on-surface-variant flex items-center gap-2">Detalles completos del registro en el sistema</p>
              </div>
              <button 
                onClick={() => setViewingClient(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-lg flex flex-col gap-md max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md text-left">
                {/* RUT */}
                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">RUT</span>
                    <span className="font-body-lg text-body-lg text-primary font-semibold mt-1 block">{viewingClient.rut || 'N/A'}</span>
                  </div>
                </div>

                {/* Razón Social */}
                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Nombre o Razón Social</span>
                    <span className="font-body-lg text-body-lg text-primary font-semibold mt-1 block">{viewingClient.company || 'N/A'}</span>
                  </div>
                </div>

                {/* Cliente Real */}
                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Cliente Real</span>
                    <span className="font-body-lg text-body-lg text-primary font-semibold mt-1 block">{viewingClient.realClient || 'N/A'}</span>
                  </div>
                </div>

                {/* Giro */}
                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Giro</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.giro || 'N/A'}</span>
                  </div>
                </div>

                {/* Contacto */}
                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Contacto (Persona)</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.name || 'N/A'}</span>
                  </div>
                </div>

                {/* Dirección */}
                <div className="space-y-xs md:col-span-2">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Dirección</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.address || 'N/A'}</span>
                  </div>
                </div>

                {/* Comuna */}
                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Comuna</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.comuna || 'N/A'}</span>
                  </div>
                </div>

                {/* Ciudad */}
                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Ciudad</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.ciudad || 'N/A'}</span>
                  </div>
                </div>

                {/* Correo Electrónico */}
                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Correo Electrónico</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.email || 'N/A'}</span>
                  </div>
                </div>

                {/* Teléfono */}
                <div className="space-y-xs">
                  <div className="bg-surface-container-low p-md rounded border border-outline-variant/30">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block font-bold">Teléfono</span>
                    <span className="font-body-lg text-body-lg text-primary mt-1 block">{viewingClient.phone || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
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
      {clientToDelete && (
        <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-md text-left">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-outline-variant p-lg space-y-md text-center animate-scale-up">
            <div className="w-16 h-16 bg-error-container/20 rounded-full flex items-center justify-center text-error mx-auto shadow-sm mb-2">
              <span className="material-symbols-outlined text-[36px]">warning</span>
            </div>
            
            <div className="space-y-xs text-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">¿Eliminar Cliente?</h3>
              <p className="text-body-md text-on-surface-variant">
                ¿Está seguro de que desea eliminar por completo a <strong>{clientToDelete.company}</strong>? Esta acción no se puede deshacer y desvinculará sus datos.
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
                      title: 'Cliente Eliminado',
                      message: 'El cliente ha sido removido exitosamente del sistema.'
                    });
                  } catch (err) {
                    setNotification({
                      type: 'error',
                      title: 'Error al Eliminar',
                      message: err.message || 'Ocurrió un error al eliminar el cliente.'
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
