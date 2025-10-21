import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Login.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as any;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('signIn result', { data, error });
      if (error || !data.session) {
        // show server error details if available
        const message = error?.message || 'No session';
        throw error || new Error(message);
      }
      const { data: u } = await supabase.from('usuarios').select('role,id_empresa').eq('id', data.session.user.id).maybeSingle();
      console.log('usuario role query', { u });
      if (!u?.role || !['admin', 'rrhh'].includes(u.role)) {
        setErr('No tienes permisos para acceder al panel.');
        return;
      }
      // Si el usuario ya tiene empresa, llevar al dashboard, si no, a crear empresa
      const redirect = location.state?.from || (u?.id_empresa ? '/dashboard' : '/crear-empresa');
      navigate(redirect, { replace: true });
    } catch (e: any) {
      setErr(e?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const goCrearEmpresa = async () => {
    setErr(null);
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) {
      setErr('Debes iniciar sesión primero para crear una empresa.');
      return;
    }
    navigate('/crear-empresa');
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard} role="main" aria-labelledby="login-title">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {/* decorative logo */}
          <div aria-hidden style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, var(--button-gradient-start), var(--button-gradient-end))', boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }} />
          <h2 id="login-title" className={styles.pageTitle}>RRHH Dashboard</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '.95rem' }}>Accede a tu cuenta</p>
        </div>

        <form onSubmit={onSubmit} aria-busy={loading} aria-describedby={err ? 'login-error' : undefined}>
          <div className={styles.formColumn}>
            {/* visually-hidden label for accessibility */}
            <label style={{ position: 'absolute', left: '-10000px' }} htmlFor="login-email">Correo</label>
            <input
              id="login-email"
              className={styles.formInput}
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-label="Correo electrónico"
            />

            <label style={{ position: 'absolute', left: '-10000px' }} htmlFor="login-password">Contraseña</label>
            <div className={styles.inputWithToggle}>
              <input
                id="login-password"
                className={styles.formInput}
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-label="Contraseña"
              />
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {/* eye icon: show/hide */}
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9.88 9.88a3 3 0 004.24 4.24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 5c5 0 9 4 9 7s-4 7-9 7c-1.5 0-2.9-.3-4.2-.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M1.5 12s4-7 10.5-7S22.5 12 22.5 12s-4 7-10.5 7S1.5 12 1.5 12z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>

            <button
              className={styles.btn}
              type="submit"
              disabled={loading}
              aria-live="polite"
              aria-label={loading ? 'Ingresando' : 'Ingresar'}
            >
              {/* inline SVG spinner for loading state */}
              {loading && (
                <svg width="18" height="18" viewBox="0 0 50 50" aria-hidden="true" focusable="false" style={{ verticalAlign: 'middle', marginRight: 8 }}>
                  <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="4" strokeLinecap="round" strokeDasharray="31.4 31.4">
                    <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite" />
                  </circle>
                </svg>
              )}
              <span style={{ verticalAlign: 'middle' }}>{loading ? 'Ingresando...' : 'Ingresar'}</span>
            </button>

            {err && (
              <div id="login-error" role="alert" className={styles.error}>
                {err}
              </div>
            )}

            <div className={styles.actionsRow}>
              <button type="button" onClick={goCrearEmpresa} className={styles.linkButton}>
                Crear empresa
              </button>
              <button type="button" onClick={() => navigate('/signup')} className={styles.linkButton}>
                Crear cuenta
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}