import React, { useState } from 'react';
import logoSpr from '../assets/logo SPR.PNG';
import { supabase } from '../utils/supabaseClient';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    try {
      // 1. Intentamos iniciar sesión con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (authError) {
        throw new Error(authError.message);
      }

      // 2. Buscamos el perfil del usuario para obtener el rol y estado
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        throw new Error("No se encontró un perfil de usuario asociado.");
      }

      // 3. Verificamos si la cuenta está activa
      if (profile.status !== 'Active') {
        await supabase.auth.signOut();
        throw new Error("Su cuenta se encuentra inactiva. Contacte al administrador.");
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsLoading(false);
        onLogin({ 
          id: profile.id,
          email: profile.email, 
          name: profile.name, 
          role: profile.role 
        });
      }, 800);
    } catch (err) {
      console.error("Error de inicio de sesión:", err);
      setIsLoading(false);
      
      let errMsg = err.message;
      if (err.message === 'Invalid login credentials') {
        errMsg = "Las credenciales ingresadas no son válidas. Por favor, verifique su correo y contraseña.";
      } else if (err.message.includes('Email not confirmed')) {
        errMsg = "Su correo electrónico no ha sido verificado todavía.";
      } else if (err.message.includes('Email rate limit exceeded') || err.message.includes('rate limit')) {
        errMsg = "Se ha excedido el límite de intentos. Por favor, intente más tarde.";
      }
      
      setLoginError(errMsg);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-900 font-sans text-slate-100 relative overflow-hidden">
      {/* Subtle Background Glow Spheres */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="p-6 relative z-10 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700 p-1.5 flex items-center justify-center shadow-sm">
            <img src={logoSpr} className="w-full h-full object-contain" alt="Logo SPOERER" />
          </div>
          <span className="font-bold text-white tracking-tight text-xl font-sans">SPOERER ERP</span>
        </div>
        <span className="text-xs font-mono text-slate-400 bg-slate-800/60 border border-slate-700/60 px-3 py-1 rounded-full">
          Enterprise
        </span>
      </header>

      {/* Main Form */}
      <main className="flex-grow flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-[420px] bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-8 shadow-2xl space-y-6 animate-scale-up">
          {/* Form Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Iniciar Sesión</h1>
            <p className="text-xs text-slate-400">Acceda a la plataforma de gestión integrada</p>
          </div>

          {loginError && (
            <div className="bg-red-950/60 border border-red-800/80 text-red-300 p-3.5 rounded-xl flex items-start gap-3 text-left animate-fade-in text-xs">
              <span className="material-symbols-outlined text-[18px] text-red-400 flex-shrink-0 mt-0.5">error</span>
              <div>
                <span className="font-bold block text-red-200">Error de Autenticación</span>
                {loginError}
              </div>
            </div>
          )}

          <form className="space-y-4 text-left" onSubmit={handleSubmit}>
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block" htmlFor="email">
                Correo Electrónico
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  mail
                </span>
                <input
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-white outline-none transition-all text-xs placeholder:text-slate-500"
                  id="email"
                  name="email"
                  type="email"
                  placeholder="usuario@spoerer.cl"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  lock
                </span>
                <input
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-white outline-none transition-all text-xs placeholder:text-slate-500"
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              className={`w-full py-3 rounded-xl font-bold text-xs tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.98] mt-2 text-white ${
                isSuccess
                  ? 'bg-emerald-600'
                  : isLoading
                  ? 'bg-slate-700 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
              type="submit"
              disabled={isLoading || isSuccess}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin material-symbols-outlined text-[18px]">progress_activity</span>
                  <span>Verificando...</span>
                </>
              ) : isSuccess ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>Acceso Concedido</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 relative z-10 text-center text-xs text-slate-500">
        © 2026 SPOERER ERP Suite. Todos los derechos reservados.
      </footer>
    </div>
  );
}

