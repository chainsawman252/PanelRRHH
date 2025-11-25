import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import styles from './Signup.module.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nombre, setNombre] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [empresaDireccion, setEmpresaDireccion] = useState('');
  const [empresaContacto, setEmpresaContacto] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      // Prefer: use Edge Function to create admin + company (secure, server-side)
  const basePath = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  // Use HashRouter-friendly URL so GH Pages doesn't 404
  const redirectTo = `${window.location.origin}${basePath}/#/auth/callback`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            nombre,
            role: 'admin',
            created_via: 'admin-panel',
            empresa_nombre: empresaNombre,
            empresa_direccion: empresaDireccion || null,
            empresa_contacto: empresaContacto || null,
            admin_setup_completed: false,
          },
        },
      });

      console.log('auth.signUp result', { data, error });
      if (error) {
        throw error;
      }

      const needsConfirm = !data.session;
      setMsg(
        needsConfirm
          ? 'Te enviamos un correo de confirmación. Abre el enlace para activar tu cuenta y luego inicia sesión.'
          : 'Administrador creado correctamente. Ya puedes iniciar sesión.'
      );
      setEmail(''); setPassword(''); setNombre('');
      setEmpresaNombre(''); setEmpresaDireccion(''); setEmpresaContacto('');
      // No redirigimos automáticamente si requiere confirmación
      if (!needsConfirm) {
        navigate('/login');
      }
    } catch (err: any) {
      // Debug: log full error
      console.error('Database/signup error', err);
      // Show richer error info in UI for now (you can simplify it later)
      const pretty = err?.message || (err && JSON.stringify(err)) || 'Error al crear cuenta';
      setMsg(pretty);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.signupPage}>
      <div className={styles.signupCard}>
        <h2 className={styles.pageTitle}>Crear cuenta</h2>
        <form onSubmit={onSubmit}>
          <div className={styles.formColumn}>
            <input className={styles.formInput} placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            <input className={styles.formInput} type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={styles.formInput} placeholder="Nombre de la empresa" value={empresaNombre} onChange={(e) => setEmpresaNombre(e.target.value)} required />
            <input className={styles.formInput} placeholder="Dirección (opcional)" value={empresaDireccion} onChange={(e) => setEmpresaDireccion(e.target.value)} />
            <input className={styles.formInput} placeholder="Contacto (opcional)" value={empresaContacto} onChange={(e) => setEmpresaContacto(e.target.value)} />
            <div className={styles.inputWithToggle}>
              <input
                className={styles.formInput}
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
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
            <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear cuenta'}</button>
            {msg && <div className={`${styles.msg} ${msg.startsWith('Error') ? styles.error : styles.success}`}>{msg}</div>}
          </div>
        </form>
        <div className={styles.linksRow}>
          <button className={styles.linkButton} onClick={() => navigate('/login')}>Volver al login</button>
        </div>
      </div>
    </div>
  );
}
