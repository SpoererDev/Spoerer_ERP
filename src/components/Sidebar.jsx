import React, { useState, useMemo } from 'react';
import logoSpr from '../assets/logo SPR.PNG';

export default function Sidebar({ children, currentTab, setCurrentTab, user, onLogout, onOpenBackupHistory, latestBackupLog }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role?.toLowerCase() === 'admin' || 
                  user?.role?.toLowerCase() === 'administrador' || 
                  user?.role?.toLowerCase() === 'system administrator';

  const daysSinceBackup = useMemo(() => {
    if (!latestBackupLog) return null;
    const dateStr = latestBackupLog.backup_date || (latestBackupLog.created_at ? latestBackupLog.created_at.substring(0, 10) : null);
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return null;
    const backupDate = new Date(year, month - 1, day);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = today.getTime() - backupDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [latestBackupLog]);

  const hasWarning = daysSinceBackup === null || daysSinceBackup > 2;

  const subtitleText = useMemo(() => {
    if (daysSinceBackup === null) {
      return 'Sin respaldos registrados';
    }
    return `Último respaldo hace ${daysSinceBackup} ${daysSinceBackup === 1 ? 'día' : 'días'}`;
  }, [daysSinceBackup]);

  const navItems = [
    { id: 'crm', label: 'Clientes', icon: 'groups', category: 'CRM & Datos' },
    { id: 'presupuestos', label: 'Presupuestos', icon: 'request_quote', category: 'Ventas & Cotizaciones' },
    { id: 'proyectos', label: 'Proyectos', icon: 'folder', category: 'Operaciones' },
    { id: 'facturacion', label: 'Facturación', icon: 'receipt_long', category: 'Cobranza & Finanzas' },
    ...(isAdmin ? [{ id: 'usuarios', label: 'Control de Accesos', icon: 'manage_accounts', category: 'Administración' }] : []),
  ];

  const currentNav = navItems.find(item => item.id === currentTab) || navItems[0];
  const userInitials = (user?.name || 'AD').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex bg-background text-on-surface">
      {/* SideNavBar Shell */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-[#091426] h-screen transition-all duration-300 border-r border-slate-800 shadow-xl ${
          isCollapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {/* Brand Logo & Title */}
        <div className={`py-5 flex flex-col border-b border-slate-800/80 ${isCollapsed ? 'px-3 items-center' : 'px-5'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center p-1.5 shadow-sm flex-shrink-0">
              <img src={logoSpr} className="w-full h-full object-contain" alt="Logo SPOERER" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-white tracking-tight text-lg leading-tight font-sans">SPOERER</h1>
                </div>
                <span className="text-[11px] text-slate-400 font-mono tracking-wider uppercase mt-0.5">ERP SUITE</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1.5 custom-scrollbar overflow-y-auto text-left">
          {!isCollapsed && (
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1">
              Menú Principal
            </span>
          )}
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer w-full text-left active:scale-[0.98] ${
                  isActive
                    ? 'bg-slate-800/90 text-white font-semibold shadow-inner border-l-4 border-emerald-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`}
                title={item.label}
              >
                <span 
                  className={`material-symbols-outlined text-[22px] transition-colors ${
                    isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {!isCollapsed && (
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </button>
            );
          })}

          {isAdmin && (
            <button
              onClick={onOpenBackupHistory}
              className={`flex ${isCollapsed ? 'items-center justify-center px-0' : 'items-start px-3.5'} gap-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer w-full text-left hover:bg-slate-800/50 border-t border-slate-800/80 pt-3 mt-3 active:scale-[0.98] ${
                hasWarning ? 'text-slate-200 hover:text-white' : 'text-slate-300 hover:text-white'
              }`}
              title={`Respaldos e Historial - ${subtitleText}`}
            >
              <div className="relative shrink-0 mt-0.5">
                <span className={`material-symbols-outlined text-[22px] transition-colors ${
                  hasWarning ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  cloud_download
                </span>
                {hasWarning && isCollapsed && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 border-2 border-[#091426] rounded-full animate-pulse" />
                )}
              </div>
              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium whitespace-nowrap leading-tight text-slate-100">Respaldos e Historial</span>
                  <span className={`text-[11px] mt-1 flex items-center gap-1 leading-tight ${
                    hasWarning ? 'text-amber-400 font-semibold' : 'text-slate-400 font-normal'
                  }`}>
                    {hasWarning && (
                      <span className="material-symbols-outlined text-[13px] text-amber-400 shrink-0">warning</span>
                    )}
                    <span className="truncate">{subtitleText}</span>
                  </span>
                </div>
              )}
            </button>
          )}
        </nav>

        {/* Collapse Button Footer */}
        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full py-2 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 text-xs font-medium border border-slate-700/50"
            title={isCollapsed ? 'Expandir Menú' : 'Colapsar Menú'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isCollapsed ? 'menu_open' : 'keyboard_double_arrow_left'}
            </span>
            {!isCollapsed && <span>Colapsar Menú</span>}
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div
        className="flex flex-col flex-1 min-w-0 transition-all duration-300"
        style={{ paddingLeft: isCollapsed ? '72px' : '260px' }}
      >
        {/* Top Header Bar */}
        <header className="sticky top-0 z-40 flex justify-between items-center w-full px-6 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
          {/* Left Context Breadcrumb */}
          <div className="flex items-center gap-2 text-left">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{currentNav.category}</span>
            <span className="text-slate-300 text-xs">/</span>
            <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">{currentNav.label}</h2>
          </div>

          {/* Right Profile & Quick Actions */}
          <div className="flex items-center gap-4">
            {/* Quick action buttons */}
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
              {isAdmin && (
                <button
                  onClick={onOpenBackupHistory}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer relative"
                  title={`Historial de Respaldos - ${subtitleText}`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${hasWarning ? 'text-amber-500' : ''}`}>cloud_download</span>
                  {hasWarning && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white animate-pulse" />
                  )}
                </button>
              )}
              <button
                onClick={onLogout}
                className="p-2 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                title="Cerrar Sesión"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
              </button>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 hover:opacity-95 transition-opacity cursor-pointer focus:outline-none"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-tight">{user?.name || 'Administrador'}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{user?.role || 'Sistema'}</p>
                </div>
                <div className="relative">
                  <div className="w-9 h-9 rounded-full border border-slate-200 bg-[#091426] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    {userInitials}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-12 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50 text-left animate-scale-up">
                  <div className="px-4 py-2.5 border-b border-slate-100 sm:hidden">
                    <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                    <p className="text-[11px] text-slate-500">{user?.role}</p>
                  </div>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setCurrentTab('usuarios');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-2.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px] text-slate-500">manage_accounts</span>
                        Control de Accesos
                      </button>
                      <button
                        onClick={() => {
                          onOpenBackupHistory();
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-[18px] text-slate-500">history</span>
                          <span>Respaldos e Historial</span>
                        </div>
                        {hasWarning && (
                          <span className="material-symbols-outlined text-[15px] text-amber-500 shrink-0" title={subtitleText}>warning</span>
                        )}
                      </button>
                    </>
                  )}
                  <button
                    onClick={onLogout}
                    className="w-full px-4 py-2 hover:bg-red-50 text-xs font-medium text-red-600 flex items-center gap-2.5 border-t border-slate-100 cursor-pointer"
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
        <main className="p-6 bg-slate-50/50 flex-1 overflow-x-clip">
          {children}
        </main>
      </div>
    </div>
  );
}

