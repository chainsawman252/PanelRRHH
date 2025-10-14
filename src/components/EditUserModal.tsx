import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

type Props = {
  user: any;
  hasActivo?: boolean;
  onClose: () => void;
  onSaved: (updated: any) => void;
};

export default function EditUserModal({ user, hasActivo, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState(user?.role || 'user');
  const [activo, setActivo] = useState(Boolean(user?.activo));
  const [telefono, setTelefono] = useState(user?.telefono || '');
  const [dui, setDui] = useState(user?.dui || '');
  const [puesto, setPuesto] = useState(user?.puesto || '');
  const [departamento, setDepartamento] = useState(user?.departamento || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
  const updates: any = { nombre, role };
      // Only update email if changed
      if (email && email !== user.email) updates.email = email;
  if (telefono !== user?.telefono) updates.telefono = telefono || null;
  if (dui !== user?.dui) updates.dui = dui || null;
  if (puesto !== user?.puesto) updates.puesto = puesto || null;
  if (departamento !== user?.departamento) updates.departamento = departamento || null;
  if (avatarUrl !== user?.avatar_url) updates.avatar_url = avatarUrl || null;
  if (hasActivo) updates.activo = activo;
      // Return the updated row so we can confirm persistence. Use explicit column list to avoid PostgREST 406 with '*'.
      const cols = 'id,nombre,email,telefono,dui,id_empresa,avatar_url,puesto,departamento,role,created_at,updated_at';
      let res = await supabase.from('usuarios').update(updates).eq('id', user.id).select(cols).maybeSingle();
      console.log('update usuarios response (first attempt)', res, 'updates:', updates);
      if ((res as any).error) {
        const err = (res as any).error;
        // If it's a 406 (select issues) or select/returning is blocked, try a fallback: update without select
        if ((res as any).status === 406 || String(err.message || '').toLowerCase().includes('cannot') || String(err.message || '').toLowerCase().includes('406')) {
          console.warn('Select-on-update failed, retrying update without select to test persistence...');
          const fallback = await supabase.from('usuarios').update(updates).eq('id', user.id);
          console.log('update usuarios fallback response', fallback);
          if ((fallback as any).error) {
            // fallback failed too — surface meaningful error
            const ferr = (fallback as any).error;
            if (String(ferr.message || '').toLowerCase().includes('permission') || String(ferr.message || '').toLowerCase().includes('row')) {
              throw new Error('Permiso denegado por políticas RLS o permiso insuficiente en UPDATE. Revisa las policies de Supabase.');
            }
            throw ferr;
          }
          // Fallback update succeeded (no returned row). Optimistically update UI with our updates merged into user
          const optimistic = { ...user, ...updates, updated_at: new Date().toISOString() };
          onSaved(optimistic);
          setMsg('Usuario actualizado (sin confirmación del servidor)');
          setTimeout(() => onClose(), 700);
          return;
        }
        if (String(err.message || '').toLowerCase().includes('row') || String(err.message || '').toLowerCase().includes('permission')) {
          throw new Error('Permiso denegado por políticas RLS o permiso insuficiente. Revisa las policies de Supabase para permitir actualizaciones por el rol actual.');
        }
        throw err;
      }
      const updatedRow = (res as any).data;
      if (!updatedRow) {
        console.warn('Update returned no data; attempting follow-up GET to confirm persistence');
        try {
          const fetchRes = await supabase.from('usuarios').select(cols).eq('id', user.id).maybeSingle();
          console.log('follow-up fetch response', fetchRes);
          if ((fetchRes as any).error) {
            console.warn('Follow-up GET returned error', (fetchRes as any).error);
          }
          const fetched = (fetchRes as any).data;
          if (fetched) {
            onSaved(fetched);
            setMsg('Usuario actualizado (confirmado tras GET)');
            setTimeout(() => onClose(), 700);
            return;
          }
        } catch (gerr) {
          console.warn('Follow-up GET failed', gerr);
        }
        // If we reach here, do the optimistic fallback similar to the other branch
        const optimistic = { ...user, ...updates, updated_at: new Date().toISOString() };
        console.warn('Using optimistic update because server did not return the updated row');
        onSaved(optimistic);
        setMsg('Usuario actualizado (sin confirmación del servidor)');
        setTimeout(() => onClose(), 700);
        return;
      }
      // Use the returned row to update UI
      onSaved(updatedRow);
      setMsg('Usuario actualizado correctamente');
      // small delay to let user see success
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setMsg(err?.message || 'Error al actualizar usuario');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>Editar usuario</h3>
        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-row">
              <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
              <input className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            </div>
            <div className="form-row">
              <input className="form-input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" />
              <input className="form-input" value={dui} onChange={(e) => setDui(e.target.value)} placeholder="DUI" />
            </div>
            <div className="form-row">
              <input className="form-input" value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Puesto" />
              <input className="form-input" value={departamento} onChange={(e) => setDepartamento(e.target.value)} placeholder="Departamento" />
            </div>
            <div style={{ marginTop: 4 }}>
              <input className="form-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Avatar URL (opcional)" />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="user">Empleado</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
              <button className="btn" type="button" onClick={onClose}>Cancelar</button>
            </div>
            {msg && <div style={{ color: 'crimson' }}>{msg}</div>}
          </div>
        </form>
      </div>
    </div>
  );
}
