import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="page-title">RRHH Dashboard - Acceso</h2>
        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="form-input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="form-input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button className="btn" type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
            {err && <div style={{ color: 'crimson' }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button type="button" onClick={goCrearEmpresa} style={{ background: 'transparent', border: 'none', color: '#06f', cursor: 'pointer' }}>
                Crear empresa
              </button>
              <button type="button" onClick={() => navigate('/signup')} style={{ background: 'transparent', border: 'none', color: '#06f', cursor: 'pointer' }}>
                Crear cuenta
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}