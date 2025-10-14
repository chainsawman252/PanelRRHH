import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div style={{ maxWidth: 480, margin: '6vh auto', padding: 24, border: '1px solid #ddd', borderRadius: 8 }}>
      <h2>Crear cuenta</h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear cuenta'}</button>
          {msg && <div style={{ color: msg.startsWith('Error') ? 'crimson' : 'green' }}>{msg}</div>}
        </div>
      </form>
    </div>
  );
}
