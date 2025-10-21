import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import UsersPanel from '../components/UsersPanel';
import styles from './dashboard.module.css';

type Fichaje = {
  id: string;
  tipo: 'IN' | 'OUT' | string | null;
  created_at: string | null;
  latitud: number | null;
  longitud: number | null;
  ubicacion_autorizada: boolean | null;
  usuario?: { nombre: string | null; email: string; id_empresa: string | null };
};

export default function Dashboard() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Fichaje[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => { load(days); }, [days]);

  const load = async (lastNDays: number) => {
    const fromISO = new Date(Date.now() - lastNDays * 24 * 60 * 60 * 1000).toISOString();

    // obtener la empresa del usuario actual
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;

    let filtroIds: string[] | null = null;
    if (uid) {
      const { data: me } = await supabase.from('usuarios').select('id_empresa').eq('id', uid).maybeSingle();
      const companyId = (me as any)?.id_empresa as string | null;
      if (companyId) {
        const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', companyId).maybeSingle();
        setCompanyName((empresa as any)?.nombre || null);
      }
      if (companyId) {
        // obtener ids de usuarios de la misma empresa
        const { data: users } = await supabase.from('usuarios').select('id').eq('id_empresa', companyId).limit(2000);
        filtroIds = (users as any[] || []).map(u => u.id).filter(Boolean) as string[];
      }
    }

    // si tenemos filtro por ids, pedir solo fichajes de esos usuarios
    let fichajesQuery = supabase
      .from('fichajes')
      .select('id,tipo,created_at,latitud,longitud,ubicacion_autorizada, usuario:usuarios(nombre,email,id_empresa)')
      .gte('created_at', fromISO)
      .order('created_at', { ascending: false })
      .limit(500);

    if (filtroIds) {
      if (filtroIds.length === 0) {
        setRows([]);
        renderMap([]);
        return;
      }
      fichajesQuery = (fichajesQuery as any).in('usuario_id', filtroIds);
    }

    const { data, error } = await fichajesQuery;
    if (!error && data) {
      setRows(data as any);
      renderMap(data as any);
    }
  };

  const renderMap = (data: Fichaje[]) => {
    if (!mapDivRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapDivRef.current).setView([13.6929, -89.2182], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    layerRef.current!.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    data.forEach((r) => {
      if (typeof r.latitud === 'number' && typeof r.longitud === 'number') {
        const color = r.tipo === 'IN' ? 'green' : 'red';
        const m = L.circleMarker([r.latitud, r.longitud], { radius: 6, color, fillColor: color, fillOpacity: 0.8 })
          .bindPopup(`
            <div>
              <strong>${r.tipo === 'IN' ? 'Entrada' : 'Salida'}</strong><br/>
              ${new Date(r.created_at || '').toLocaleString('es-SV')}<br/>
              ${r.usuario?.nombre || ''} (${r.usuario?.email || ''})<br/>
              Autorizada: ${r.ubicacion_autorizada ? 'Sí' : 'No'}
            </div>
          `);
        m.addTo(layerRef.current!);
        bounds.push([r.latitud, r.longitud]);
      }
    });
    if (bounds.length && mapRef.current) mapRef.current.fitBounds(bounds as any, { padding: [30, 30] });
  };

  return (
    <div className={styles.container} style={{ padding: 24 }}>
      <div className={styles.dashboardTop}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 className={styles.dashboardTitle}>Panel RRHH</h2>
            <div className={styles.dashboardSub}>{companyName ? `Empresa: ${companyName}` : 'Filtrando por empresa'}</div>
          </div>
          <div className={styles.dashboardControls}>
            <label className={styles.smallMuted}>Días:</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={7}>7</option>
              <option value={30}>30</option>
              <option value={90}>90</option>
            </select>
            <button className={styles.btn} onClick={() => load(days)}>Actualizar</button>
          </div>
        </div>

        <div ref={mapDivRef} className={styles.mapHero} />
      </div>

      <div className={styles.dashboardBottom} style={{ marginTop: 20 }}>
        <section className={`${styles.dashboardCard} ${styles.fichajesSection}`}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Fichajes recientes</h3>
          <table className={styles.fichajesTable}>
            <thead><tr>
              <th>Empleado</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Autorizada</th>
            </tr></thead>
            <tbody className={styles.fichajesRow}>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={styles.fichajeAvatar}>{(r.usuario?.nombre || r.usuario?.email || '').charAt(0).toUpperCase()}</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.usuario?.nombre || r.usuario?.email}</div>
                      <div className={styles.smallMuted}>{r.usuario?.email}</div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.tipo}</td>
                  <td style={{ textAlign: 'center' }}>{new Date(r.created_at || '').toLocaleString('es-SV')}</td>
                  <td style={{ textAlign: 'center' }}>{r.ubicacion_autorizada ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className={styles.indicatorsGraphs}>
          <section className={styles.dashboardCard}>
            <h3 style={{ marginTop: 0 }}>Indicadores</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className={styles.card} style={{ padding: 12, flex: 1 }}>Total fichajes: <strong>{rows.length}</strong></div>
              <div className={styles.card} style={{ padding: 12, flex: 1 }}>Entradas hoy: <strong>{rows.filter(r => r.tipo === 'IN').length}</strong></div>
              <div className={styles.card} style={{ padding: 12, flex: 1 }}>Salidas hoy: <strong>{rows.filter(r => r.tipo === 'OUT').length}</strong></div>
            </div>
          </section>

          <section className={styles.dashboardCard}>
            <h3 style={{ marginTop: 0 }}>Gráficos</h3>
            <div style={{ minHeight: 220 }} className={styles.smallMuted}>Aquí irán las gráficas — se mostrarán abajo del mapa como solicitaste.</div>
          </section>
        </div>
      </div>

      {/* New workers panel */}
      <div style={{ marginTop: 18 }}>
        <UsersPanel companyName={companyName} />
      </div>
    </div>
  );
}