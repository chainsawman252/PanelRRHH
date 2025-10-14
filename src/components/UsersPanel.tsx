import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import EditUserModal from './EditUserModal';

export default function UsersPanel({ companyName }: { companyName?: string | null }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hasActivo, setHasActivo] = useState<boolean | null>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return setUsers([]);
      const { data: me } = await supabase.from('usuarios').select('id_empresa').eq('id', uid).maybeSingle();
      const companyId = (me as any)?.id_empresa;
      if (!companyId) return setUsers([]);
      // Try selecting with 'activo' first; if the column doesn't exist, retry without it.
      // Fetch full user profile columns present in your schema (except password).
      // Based on your schema: nombre,email,telefono,dui,id_empresa,avatar_url,puesto,departamento,role,created_at,updated_at
      const cols = 'id,nombre,email,telefono,dui,id_empresa,avatar_url,puesto,departamento,role,created_at,updated_at';
  const res = await supabase.from('usuarios').select(cols).eq('id_empresa', companyId).order('nombre', { ascending: true }).limit(2000);
  console.log('load usuarios response', res);
  if ((res as any).error) throw (res as any).error;
  setHasActivo(false); // your schema doesn't include 'activo' column
  setUsers((res as any).data || []);
    } catch (err: any) {
      setMsg(err?.message || 'Error al cargar usuarios');
    } finally { setLoading(false); }
  };

  const onSaved = (updated: any) => {
    console.log('onSaved called with', updated);
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setMsg('Usuario actualizado');
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <section className="dashboard-card users-panel">
  <h3 style={{ marginTop: 0 }}>Trabajadores</h3>
  <div className="small-muted">{companyName ? `Empresa: ${companyName}` : 'Lista de empleados pertenecientes a tu empresa.'} Puedes editar sus perfiles aquí.</div>
      <div style={{ height: 12 }} />
      {msg && <div className="chip">{msg}</div>}
      <table className="users-table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Tel</th>
            <th>DUI</th>
            <th>Puesto</th>
            <th>Departamento</th>
            <th>Rol</th>
            <th>Creado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.nombre || '—'}</td>
              <td className="small-muted">{u.email}</td>
              <td className="small-muted">{u.telefono || '—'}</td>
              <td className="small-muted">{u.dui || '—'}</td>
              <td className="small-muted">{u.puesto || '—'}</td>
              <td className="small-muted">{u.departamento || '—'}</td>
              <td>{u.role || 'user'}</td>
              <td className="small-muted">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
              <td className="user-actions">
                <button className="btn" onClick={() => setEditing(u)}>Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && <EditUserModal user={editing} hasActivo={!!hasActivo} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </section>
  );
}
