import React, { useState } from 'react';
import logoSpr from '../assets/logo SPR.PNG';

export default function Sidebar({ children, currentTab, setCurrentTab, user, onLogout, onOpenBackupHistory }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role?.toLowerCase() === 'admin' || 
                  user?.role?.toLowerCase() === 'administrador' || 
                  user?.role?.toLowerCase() === 'system administrator';

  const navItems = [
    { id: 'crm', label: 'Clientes', icon: 'groups' },
    { id: 'presupuestos', label: 'Presupuestos', icon: 'request_quote' },
    { id: 'facturacion', label: 'Facturación', icon: 'receipt_long' },
    { id: 'proyectos', label: 'Proyectos', icon: 'folder' },
    ...(isAdmin ? [{ id: 'usuarios', label: 'Control de Accesos', icon: 'manage_accounts' }] : []),
  ];

  return (
    <div className="min-h-screen flex text-on-surface">
      {/* SideNavBar Shell */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-primary h-screen transition-all duration-300 border-r border-outline-variant ${isCollapsed ? 'w-[72px]' : 'w-[260px]'
          }`}
      >
        {/* Brand Logo */}
        <div className={`py-xl flex flex-col gap-xs ${isCollapsed ? 'px-md items-center' : 'px-lg'}`}>
          <div className="flex items-center gap-sm">
            <img src={logoSpr} className="w-10 h-10 object-contain rounded-lg flex-shrink-0" alt="Logo" />
            {!isCollapsed && (
              <div className="flex flex-col text-left">
                <h1 className="font-headline-sm text-headline-sm font-bold text-on-primary leading-none">SPOERER</h1>
                <span className="text-[11px] text-on-primary-container opacity-80 uppercase tracking-widest mt-1">ERP Suite</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-md flex flex-col gap-base custom-scrollbar overflow-y-auto mt-4 text-left">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center gap-md px-md py-sm rounded-lg transition-all active:scale-[0.98] w-full text-left ${isActive
                    ? 'bg-primary-container text-secondary-fixed border-l-4 border-secondary-fixed font-semibold'
                    : 'text-on-primary-container hover:text-on-primary hover:bg-primary-container/40'
                  }`}
                title={item.label}
              >
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                {!isCollapsed && <span className="font-body-md text-body-md whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}

          {isAdmin && (
            <button
              onClick={onOpenBackupHistory}
              className="flex items-center gap-md px-md py-sm rounded-lg transition-all active:scale-[0.98] w-full text-left text-on-primary-container hover:text-on-primary hover:bg-primary-container/40 border-t border-outline-variant/20 pt-3 mt-2"
              title="Respaldos e Historial"
            >
              <span className="material-symbols-outlined text-[22px]">cloud_download</span>
              {!isCollapsed && <span className="font-body-md text-body-md whitespace-nowrap">Respaldos</span>}
            </button>
          )}
        </nav>

        {/* Collapse Button and Footer */}
        <div className="p-md flex flex-col gap-sm">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full py-sm bg-primary-container text-on-primary-container hover:text-on-primary rounded-lg transition-colors flex items-center justify-center gap-sm active:scale-95"
            title={isCollapsed ? 'Expandir' : 'Colapsar'}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isCollapsed ? 'menu_open' : 'keyboard_double_arrow_left'}
            </span>
            {!isCollapsed && <span className="font-body-sm text-body-sm">Colapsar Menú</span>}
          </button>
        </div>
      </aside>

      {/* Main Page Area Container */}
      <div
        className="flex flex-col flex-1 min-w-0 transition-all duration-300"
        style={{ paddingLeft: isCollapsed ? '72px' : '260px' }}
      >
        {/* TopAppBar Shell */}
        <header className="sticky top-0 z-40 flex justify-end items-center w-full px-lg h-16 bg-surface border-b border-outline-variant">
          <div className="flex items-center gap-lg">
            {/* Quick Actions */}
            <div className="flex items-center gap-md">
               {isAdmin && (
                <button
                  onClick={onOpenBackupHistory}
                  className="p-1.5 hover:bg-surface-container rounded-full text-on-surface-variant hover:text-primary transition-all"
                  title="Historial de Respaldos"
                >
                  <span className="material-symbols-outlined text-[22px]">cloud_download</span>
                </button>
              )}
              <button
                onClick={onLogout}
                className="p-1.5 hover:bg-error-container hover:text-error rounded-full text-on-surface-variant transition-all"
                title="Cerrar Sesión"
              >
                <span className="material-symbols-outlined text-[22px]">logout</span>
              </button>
            </div>

            {/* Profile Info */}
            <div className="relative flex items-center gap-sm border-l border-outline-variant pl-lg">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-sm hover:opacity-90 transition-opacity focus:outline-none"
              >
                <div className="text-right hidden sm:block">
                  <p className="font-label-md text-label-md text-primary uppercase font-bold">{user?.name || 'Administrador'}</p>
                  <p className="text-xs text-on-surface-variant">{user?.role || 'Administrador del Sistema'}</p>
                </div>
                <div className="w-10 h-10 rounded-full border border-outline-variant overflow-hidden bg-primary flex items-center justify-center text-white font-bold text-sm">
                  AD
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-12 w-52 bg-white border border-outline-variant rounded-lg shadow-lg py-sm z-50 text-left">
                  <div className="px-md py-sm border-b border-outline-variant/30 sm:hidden">
                    <p className="font-label-md text-label-md text-primary font-bold">{user?.name}</p>
                    <p className="text-xs text-on-surface-variant">{user?.role}</p>
                  </div>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setCurrentTab('usuarios');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-md py-sm hover:bg-surface-container-low text-body-md text-on-surface flex items-center gap-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                        Mi Perfil / Accesos
                      </button>
                      <button
                        onClick={() => {
                          onOpenBackupHistory();
                          setShowUserMenu(false);
                        }}
                        className="w-full px-md py-sm hover:bg-surface-container-low text-body-md text-on-surface flex items-center gap-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">history</span>
                        Respaldos e Historial
                      </button>
                    </>
                  )}
                  <button
                    onClick={onLogout}
                    className="w-full px-md py-sm hover:bg-error-container hover:text-error text-body-md text-on-surface flex items-center gap-sm border-t border-outline-variant/30"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="p-xl bg-background flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
