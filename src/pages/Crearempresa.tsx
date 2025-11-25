import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function CrearEmpresa() {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [contacto, setContacto] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!nombre.trim()) { setMsg('El nombre es obligatorio'); return; }
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) {
        setMsg('Debes iniciar sesión primero');
        return;
      }
      const { data: empresaData, error } = await supabase
        .from('empresas')
        .insert([{ nombre, direccion: direccion || null, contacto: contacto || null }])
        .select('id')
        .maybeSingle();
      if (error || !empresaData) throw error || new Error('No se obtuvo id de empresa');

      const empresaId = (empresaData as any).id as string;

      // actualizar id_empresa del usuario actual
      const { data: s2 } = await supabase.auth.getSession();
      const uid = s2.session?.user?.id;
      if (uid) {
        const { error: updErr } = await supabase.from('usuarios').update({ id_empresa: empresaId }).eq('id', uid);
        if (updErr) throw updErr;
      }

  setMsg('Empresa creada y asignada. Ya tienes rol de admin.');
  setNombre(''); setDireccion(''); setContacto('');
  navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setMsg(err?.message || 'Error al crear la empresa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="page-title">Crear empresa</h2>
        <p className="muted">Primero inicia sesión con tu cuenta (RRHH/Admin). Luego crea tu empresa.</p>
        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="form-input" placeholder="Nombre de la empresa" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            <input className="form-input" placeholder="Dirección (opcional)" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            <input className="form-input" placeholder="Contacto (opcional)" value={contacto} onChange={(e) => setContacto(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear empresa'}</button>
              <button className="btn" type="button" onClick={() => navigate(-1)}>Cancelar</button>
            </div>
            {msg && <div style={{ color: msg.startsWith('Error') ? 'crimson' : 'green' }}>{msg}</div>}
          </div>
        </form>
      </div>
    </div>
  );
}
