import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import styles from './Signup.module.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre, created_via: 'web-signup' } } as any,
      });
      if (error) throw error;
      // En supabase con confirmación por email, la sesión puede no estar activa aún
      setMsg('Registro enviado. Revisa tu correo para confirmar.');
      setEmail(''); setPassword(''); setNombre('');
      navigate('/login');
    } catch (err: any) {
      setMsg(err?.message || 'Error al crear cuenta');
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
