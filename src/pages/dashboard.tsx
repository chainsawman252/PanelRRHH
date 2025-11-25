import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import UsersPanel from '../components/UsersPanel';
import RecentFichajesChart from '../components/RecentFichajesChart';
import styles from './dashboard.module.css';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import kronosLogo from './kronos_logo.png';

type Fichaje = {
  id: string;
  tipo: 'IN' | 'OUT' | string | null;
  created_at: string | null;
  latitud: number | null;
  longitud: number | null;
  ubicacion_autorizada: boolean | null;
  usuario_id?: string | null;
  usuario?: { nombre: string | null; email: string; id_empresa: string | null };
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Fichaje[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'empleados' | 'datos'>('home');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportChartModal, setShowExportChartModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [minutesByUser, setMinutesByUser] = useState<Record<string, number>>({});
  const [minutesByUserByDay, setMinutesByUserByDay] = useState<Record<string, number>>({});
  const [allRows, setAllRows] = useState<Fichaje[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY'>('ALL');
  const [consolidatedView, setConsolidatedView] = useState(false);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // date-range for charts / exports (default last 7 days)
  const [startDate, setStartDate] = useState<string | null>(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string | null>(() => new Date().toISOString().slice(0, 10));
  const chartRef = useRef<any>(null);
  const [chartReloadTick, setChartReloadTick] = useState(0);

  useEffect(() => { load(days); }, [days]);

  // helper: fetch today's minutes for a set of user ids
  const fetchTodayMinutes = async (userIds: string[]) => {
    try {
      if (!userIds.length) { setMinutesByUser({}); return; }
      const todayLocal = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })();
      const { data: horas } = await supabase
        .from('v_horas_diarias')
        .select('usuario_id, dia_local, minutos_trabajados')
        .eq('dia_local', todayLocal)
        .in('usuario_id', userIds);
      const map: Record<string, number> = {};
      (horas as any[] | null)?.forEach((row: any) => {
        if (row?.usuario_id) map[row.usuario_id] = Number(row.minutos_trabajados || 0);
      });
      setMinutesByUser(map);
    } catch {
      setMinutesByUser({});
    }
  };

  // helper: fetch minutes by user by day for all fichajes
  const fetchMinutesByDay = async (userIds: string[], fichajes: Fichaje[]) => {
    try {
      if (!userIds.length) { setMinutesByUserByDay({}); return; }
      
      // Get unique days from fichajes
      const uniqueDays = new Set<string>();
      fichajes.forEach(f => {
        if (f.created_at) {
          const date = new Date(f.created_at);
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          uniqueDays.add(`${y}-${m}-${day}`);
        }
      });

      const { data: horas } = await supabase
        .from('v_horas_diarias')
        .select('usuario_id, dia_local, minutos_trabajados')
        .in('dia_local', Array.from(uniqueDays))
        .in('usuario_id', userIds);
      
      const map: Record<string, number> = {};
      (horas as any[] | null)?.forEach((row: any) => {
        if (row?.usuario_id && row?.dia_local) {
          const key = `${row.usuario_id}_${row.dia_local}`;
          map[key] = Number(row.minutos_trabajados || 0);
        }
      });
      setMinutesByUserByDay(map);
    } catch {
      setMinutesByUserByDay({});
    }
  };

  // Collapse paired IN+OUT fichajes: when an IN has a matching OUT for the same user
  // that happens later (newer) within a reasonable window (24h), skip the IN so
  // the UI doesn't show both rows repeating the same "Hoy" total.
  const collapsePairedFichajes = (list: Fichaje[]) => {
    if (!list || !list.length) return list;
    const DAY_MS = 24 * 60 * 60 * 1000;
    return list.filter((f) => {
      // only consider skipping IN rows
      if (f.tipo !== 'IN') return true;
      if (!f.usuario_id || !f.created_at) return true;
      const inDate = new Date(f.created_at).getTime();
      // if there exists an OUT for same user with created_at > inDate and within 24h, skip this IN
      const hasOut = list.some((other) => {
        if (other.usuario_id !== f.usuario_id) return false;
        if (other.tipo !== 'OUT') return false;
        if (!other.created_at) return false;
        const outDate = new Date(other.created_at).getTime();
        return outDate > inDate && (outDate - inDate) <= DAY_MS;
      });
      return !hasOut;
    });
  };

  // Convert minutes (integer) into H:MMh format, e.g. 390 -> "6:30h"
  const minutesToHoursString = (mins?: number) => {
    const m = Number(mins || 0);
    if (!m || m <= 0) return '0:00h';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}:${String(rem).padStart(2, '0')}h`;
  };

  const getMinutesForFichaje = (fichaje: Fichaje): number => {
    if (!fichaje.created_at || !fichaje.usuario_id) return 0;
    const date = new Date(fichaje.created_at);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dayLocal = `${y}-${m}-${day}`;
    const key = `${fichaje.usuario_id}_${dayLocal}`;
    return minutesByUserByDay[key] || 0;
  };

  const load = async (lastNDays: number) => {
    const fromISO = new Date(Date.now() - lastNDays * 24 * 60 * 60 * 1000).toISOString();

    // obtener la empresa del usuario actual
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    setUserEmail(sessionData.session?.user?.email || '');
    setUserName((sessionData.session?.user?.user_metadata as any)?.nombre || '');

    let filtroIds: string[] | null = null;
    if (uid) {
      const { data: me } = await supabase.from('usuarios').select('id_empresa').eq('id', uid).maybeSingle();
      const myCompanyId = (me as any)?.id_empresa as string | null;
      setCompanyId(myCompanyId || null);
      if (myCompanyId) {
        const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', myCompanyId).maybeSingle();
        setCompanyName((empresa as any)?.nombre || null);
      }
      if (myCompanyId) {
        // obtener ids de usuarios de la misma empresa
        const { data: users } = await supabase.from('usuarios').select('id').eq('id_empresa', myCompanyId).limit(2000);
        filtroIds = (users as any[] || []).map(u => u.id).filter(Boolean) as string[];
        // Query daily worked minutes for today using the view v_horas_diarias
        await fetchTodayMinutes(filtroIds);
      }
    }

    // si tenemos filtro por ids, pedir solo fichajes de esos usuarios
    let fichajesQuery = supabase
      .from('fichajes')
      .select('id,tipo,created_at,latitud,longitud,ubicacion_autorizada,usuario_id, usuario:usuarios(nombre,email,id_empresa)')
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
      const fichajes = data as any;
      setRows(fichajes);
      renderMap(fichajes);
      
      // Cargar minutos por día para los fichajes recientes
      const uids = Array.from(new Set(fichajes.map((f: any) => f.usuario_id).filter(Boolean))) as string[];
      await fetchMinutesByDay(uids, fichajes);
    }
  };

  const filteredAllRows = useMemo(() => {
    return allRows.filter(r => {
      const matchTipo = tipoFilter === 'ALL' ? true : r.tipo === tipoFilter;
      
      // Filtro de fecha
      let matchDate = true;
      if (dateFilter === 'TODAY' && r.created_at) {
        const today = new Date();
        const fichajeDate = new Date(r.created_at);
        matchDate = today.getFullYear() === fichajeDate.getFullYear() &&
                    today.getMonth() === fichajeDate.getMonth() &&
                    today.getDate() === fichajeDate.getDate();
      }
      
      if (!searchName.trim()) return matchTipo && matchDate;
      const needle = searchName.trim().toLowerCase();
      const name = (r.usuario?.nombre || '').toLowerCase();
      const email = (r.usuario?.email || '').toLowerCase();
      return matchTipo && matchDate && (name.includes(needle) || email.includes(needle));
    });
  }, [allRows, searchName, tipoFilter, dateFilter]);

  // Vista consolidada: una fila por usuario con última actividad
  const consolidatedRows = useMemo(() => {
    const userMap = new Map<string, Fichaje>();
    
    filteredAllRows.forEach(fichaje => {
      const userId = fichaje.usuario_id || fichaje.usuario?.email || '';
      if (!userId) return;
      
      const existing = userMap.get(userId);
      if (!existing || new Date(fichaje.created_at || 0) > new Date(existing.created_at || 0)) {
        userMap.set(userId, fichaje);
      }
    });
    
    return Array.from(userMap.values()).sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  }, [filteredAllRows]);

  const exportCSV = (rows: Fichaje[]) => {
    const header = ['Empleado', 'Email', 'Tipo', 'Fecha', 'Autorizada', 'Trabajado ese día'];
    const lines = rows.map(r => [
      r.usuario?.nombre || '',
      r.usuario?.email || '',
      r.tipo || '',
      r.created_at ? new Date(r.created_at).toISOString() : '',
      r.ubicacion_autorizada ? 'Si' : 'No',
      minutesToHoursString(getMinutesForFichaje(r)),
    ]);
    const csv = [header, ...lines].map(arr => arr.map(v => {
      const s = String(v ?? '');
      const escaped = s.replace(/"/g, '""');
      return s.includes(',') || s.includes('\n') ? '"' + escaped + '"' : escaped;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fichajes_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportXLSX = (rows: Fichaje[]) => {
    const data = rows.map(r => ({
      Empleado: r.usuario?.nombre || '',
      Email: r.usuario?.email || '',
      Tipo: r.tipo || '',
      Fecha: r.created_at ? new Date(r.created_at).toLocaleString('es-SV') : '',
      Autorizada: r.ubicacion_autorizada ? 'Sí' : 'No',
      'Trabajado ese día': minutesToHoursString(getMinutesForFichaje(r)),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fichajes');
    XLSX.writeFile(wb, `fichajes_${Date.now()}.xlsx`);
  };

  const exportPDF = async (rows: Fichaje[]) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF('landscape', 'mm');

    // Header with logo and company info
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    let x = 14, y = 10;
    try {
      const img = await loadImage(kronosLogo);
      const targetH = 14; // mm
      const ratio = img.width / img.height;
      const targetW = Math.min(28, targetH * ratio);
      doc.addImage(img, 'PNG', x, y, targetW, targetH);
      x += targetW + 6;
    } catch {}

    doc.setFontSize(14);
    const title = companyName ? `Empresa: ${companyName}` : 'Empresa';
    doc.text(title, x, y + 6);
    doc.setFontSize(10);
    if (companyId) doc.text(`ID: ${companyId}`, x, y + 12);
    doc.text(`Fecha de exportación: ${new Date().toLocaleString('es-SV')}`, x, y + 18);

    // Table
    const head = [[
      'Empleado', 'Email', 'Tipo', 'Fecha', 'Autorizada', 'Trabajado ese día'
    ]];
    const body = rows.map(r => ([
      r.usuario?.nombre || '',
      r.usuario?.email || '',
      r.tipo || '',
      r.created_at ? new Date(r.created_at).toLocaleString('es-SV') : '',
      r.ubicacion_autorizada ? 'Sí' : 'No',
      minutesToHoursString(getMinutesForFichaje(r))
    ]));

    autoTable(doc, {
      head,
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 150, 243] },
      startY: y + 24,
      theme: 'striped',
      margin: { left: 14, right: 14 }
    });
    doc.save(`fichajes_${Date.now()}.pdf`);
  };

  // -- Chart / range export helpers --
  const reloadChart = () => setChartReloadTick(t => t + 1);

  const exportChartPNG = () => {
    try {
      const base = chartRef.current?.toBase64Image?.();
      if (!base) return alert('No hay gráfica disponible para exportar');
      const a = document.createElement('a');
      a.href = base;
      a.download = `grafica_fichajes_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('exportChartPNG error', e);
    }
  };

  const exportChartPDF = async () => {
    try {
      const base = chartRef.current?.toBase64Image?.();
      if (!base) return alert('No hay gráfica disponible para exportar');
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF('landscape', 'mm');
      const w = doc.internal.pageSize.getWidth() - 20;
      doc.addImage(base, 'PNG', 10, 10, w, 0);
      doc.save(`grafica_fichajes_${Date.now()}.pdf`);
    } catch (e) {
      console.error('exportChartPDF error', e);
    }
  };

  const _rowsInRange = (s?: string | null, e?: string | null) => {
    const start = s ? new Date(s + 'T00:00:00') : new Date(0);
    const end = e ? new Date(e + 'T23:59:59.999') : new Date();
    return allRows.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      return d >= start && d <= end;
    });
  };

  const exportFichajesRangeCSV = () => exportCSV(consolidatedView ? consolidatedRows : filteredAllRows);
  const exportFichajesRangeXLSX = () => exportXLSX(consolidatedView ? consolidatedRows : filteredAllRows);
  const exportFichajesRangePDF = () => exportPDF(consolidatedView ? consolidatedRows : filteredAllRows);

  const openDatos = async () => {
    setActiveTab('datos');
    setDrawerOpen(false);
    if (!allRows.length) await loadAllFichajes();
    if (Object.keys(minutesByUser).length === 0) {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (uid) {
        const { data: me } = await supabase.from('usuarios').select('id_empresa').eq('id', uid).maybeSingle();
        const myCompanyId = (me as any)?.id_empresa as string | null;
        if (myCompanyId) {
          const { data: users } = await supabase.from('usuarios').select('id').eq('id_empresa', myCompanyId).limit(5000);
          const ids = ((users as any[]) || []).map(u => u.id).filter(Boolean) as string[];
          await fetchTodayMinutes(ids);
        }
      }
    }
  };

    const loadAllFichajes = async () => {
      setAllLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        let filtroIds: string[] | null = null;
        if (uid) {
          const { data: me } = await supabase.from('usuarios').select('id_empresa').eq('id', uid).maybeSingle();
          const myCompanyId = (me as any)?.id_empresa as string | null;
          if (myCompanyId) {
            const { data: users } = await supabase.from('usuarios').select('id').eq('id_empresa', myCompanyId).limit(5000);
            filtroIds = (users as any[] || []).map(u => u.id).filter(Boolean) as string[];
          }
        }
        let q = supabase
          .from('fichajes')
          .select('id,tipo,created_at,latitud,longitud,ubicacion_autorizada,usuario_id, usuario:usuarios(nombre,email,id_empresa)')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (filtroIds) q = (q as any).in('usuario_id', filtroIds);
        const { data, error } = await q;
        if (error) throw error;
        const allFichajes = (data || []) as any;
        setAllRows(allFichajes);
        
        // Cargar minutos por día
        const uids = Array.from(new Set(allFichajes.map((f: any) => f.usuario_id).filter(Boolean))) as string[];
        await fetchTodayMinutes(uids);
        await fetchMinutesByDay(uids, allFichajes);
      } catch (e) {
        console.error('loadAllFichajes error', e);
        setAllRows([]);
      } finally {
        setAllLoading(false);
      }
    };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate('/login', { replace: true });
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

  const formatMinutes = (mins?: number) => {
    if (!mins || mins <= 0) return '0 m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m} m`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} m`;
  };

  // Prepare rows for display by collapsing paired IN/OUT entries
  const visibleRows = collapsePairedFichajes(rows);
  const visibleAllRows = collapsePairedFichajes(filteredAllRows);

  // rows filtered by selected date range (for the Todos los fichajes table)
  const rowsInRange = useMemo(() => {
    if (!startDate && !endDate) return visibleAllRows;
    const s = startDate ? new Date(startDate + 'T00:00:00') : new Date(0);
    const e = endDate ? new Date(endDate + 'T23:59:59.999') : new Date();
    return visibleAllRows.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      return d >= s && d <= e;
    });
  }, [visibleAllRows, startDate, endDate]);

  return (
    <div className={styles.container} style={{ padding: 24 }}>
      {/* Hamburger button for mobile */}
      <button 
        className={styles.menuToggle} 
        onClick={() => setDrawerOpen(!drawerOpen)}
        aria-label="Toggle menu"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Overlay for mobile */}
      <div 
        className={`${styles.drawerOverlay} ${drawerOpen ? styles.drawerOverlayOpen : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      <div className={styles.dashboardTop}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 className={styles.dashboardTitle}>Panel RRHH</h2>
            <div className={styles.dashboardSub}>
              {companyName ? `Empresa: ${companyName}` : 'Filtrando por empresa'}
            </div>
            {companyId && (
              <div className={styles.dashboardSub} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span className={styles.smallMuted}>
                  ID empresa:
                  <code style={{ marginLeft: 6 }}>{companyId}</code>
                </span>
                <button
                  className={styles.btn}
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(companyId);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {}
                  }}
                  aria-live="polite"
                >
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            )}
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
        {/* Sections */}
        <section className={`${styles.section} ${activeTab === 'home' ? styles.active : ''}`}>
          <div ref={mapDivRef} className={styles.mapHero} />
        </section>
      </div>
      {/* HOME SECTION: Fichajes recientes */}
      <section className={`${styles.section} ${activeTab === 'home' ? styles.active : ''}`}>
        <div className={styles.dashboardBottom} style={{ marginTop: 20 }}>
          <section className={`${styles.dashboardCard} ${styles.fichajesSection}`} style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Fichajes recientes</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.fichajesTable}>
                <thead><tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Autorizada</th>
                  <th>Trabajado ese día</th>
                </tr></thead>
                <tbody className={styles.fichajesRow}>
                  {visibleRows.map(r => (
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
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{minutesToHoursString(getMinutesForFichaje(r))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      {/* EMPLEADOS SECTION */}
      <section className={`${styles.section} ${activeTab === 'empleados' ? styles.active : ''}`}>
        <div style={{ marginTop: 18 }}>
          <UsersPanel companyName={companyName} />
        </div>
      </section>

      {/* DATOS SECTION */}
      <section className={`${styles.section} ${activeTab === 'datos' ? styles.active : ''}`}>
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
            <h3 style={{ marginTop: 0 }}>Datos</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <label className={styles.smallMuted} style={{ alignSelf: 'center' }}>Desde:</label>
              <input type="date" value={startDate || ''} onChange={(e) => setStartDate(e.target.value)} />
              <label className={styles.smallMuted} style={{ alignSelf: 'center' }}>Hasta:</label>
              <input type="date" value={endDate || ''} onChange={(e) => setEndDate(e.target.value)} />
              <button className={styles.btn} onClick={() => reloadChart()}>Actualizar gráfica</button>
              <button className={styles.btn} onClick={() => setShowExportChartModal(true)} style={{ marginLeft: 'auto' }}>Exportar Gráfica</button>
            </div>
            <div style={{ minHeight: 120 }}>
              <RecentFichajesChart ref={chartRef} companyId={companyId} startDate={startDate} endDate={endDate} reloadTick={chartReloadTick} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className={styles.btn} onClick={() => setShowExportModal(true)}>Exportar Fichajes</button>
            </div>
          </section>
          <section className={styles.dashboardCard} style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Todos los fichajes</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Buscar por nombre o email"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              />
              <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value as any)}>
                <option value="ALL">Todos</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
              </select>
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)}>
                <option value="ALL">Todas las fechas</option>
                <option value="TODAY">Solo hoy</option>
              </select>
              <button 
                className={styles.btn} 
                onClick={() => setConsolidatedView(!consolidatedView)}
                style={{ background: consolidatedView ? 'var(--color-primary-600)' : 'var(--color-primary-500)' }}
              >
                {consolidatedView ? 'Vista Detallada' : 'Vista Consolidada'}
              </button>
              <button className={styles.btn} onClick={loadAllFichajes} disabled={allLoading}>{allLoading ? 'Cargando...' : 'Recargar'}</button>
              <button className={styles.btn} onClick={() => setShowExportModal(true)} disabled={!allRows.length} style={{ marginLeft: 'auto' }}>Exportar Fichajes</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.fichajesTable}>
                <thead><tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Autorizada</th>
                  <th>Trabajado ese día</th>
                </tr></thead>
                <tbody className={styles.fichajesRow}>
                  {(consolidatedView ? consolidatedRows : filteredAllRows).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                        {allLoading ? 'Cargando fichajes...' : allRows.length === 0 ? 'No hay fichajes cargados. Haz clic en "Recargar"' : 'No hay fichajes que coincidan con los filtros'}
                      </td>
                    </tr>
                  ) : (
                    (consolidatedView ? consolidatedRows : filteredAllRows)
                    .map(r => (
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
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{minutesToHoursString(getMinutesForFichaje(r))}</td>
                      </tr>
                  )))
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      {/* Sidebar - always visible, expands on hover */}
      <aside className={`${styles.drawerPanel} ${drawerOpen ? styles.drawerPanelOpen : ''}`} aria-label="Menú de secciones">
        {/* Icon bar (left side) */}
        <div className={styles.iconBar}>
          <button
            className={`${styles.iconBarItem} ${activeTab === 'home' ? styles.iconBarItemActive : ''}`}
            onClick={() => setActiveTab('home')}
            aria-label="Home"
            title="Home"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className={`${styles.iconBarItem} ${activeTab === 'empleados' ? styles.iconBarItemActive : ''}`}
            onClick={() => setActiveTab('empleados')}
            aria-label="Empleados"
            title="Empleados"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.8"/>
              <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21v-2a3 3 0 0 0-2-2.82" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 3.13a3 3 0 0 1 0 5.74" stroke="currentColor" strokeWidth="1.8"/>
            </svg>
          </button>
          <button
            className={`${styles.iconBarItem} ${activeTab === 'datos' ? styles.iconBarItemActive : ''}`}
            onClick={openDatos}
            aria-label="Datos"
            title="Datos"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 21h18" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M7 17V7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M12 17V4" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M17 17v-9" stroke="currentColor" strokeWidth="1.8"/>
            </svg>
          </button>
        </div>

        {/* Content panel (expandable on hover) */}
        <div className={styles.contentPanel}>
          <div className={styles.drawerHeader}>
            <div className={styles.drawerTitle}>Menu</div>
          </div>
          
          <div className={styles.profileRow}>
            <span className={styles.profileAvatar} aria-hidden />
            <div>
              <div className={styles.profileName}>{userName || 'Usuario'}</div>
              <div className={styles.profileEmail}>{userEmail}</div>
            </div>
          </div>
          
          <nav className={styles.drawerNav}>
            <button
              className={`${styles.menuItem} ${activeTab === 'home' ? styles.menuItemActive : ''}`}
              onClick={() => { setActiveTab('home'); setDrawerOpen(false); }}
            >
              Dashboard
            </button>
            <button
              className={`${styles.menuItem} ${activeTab === 'empleados' ? styles.menuItemActive : ''}`}
              onClick={() => { setActiveTab('empleados'); setDrawerOpen(false); }}
            >
              Empleados
            </button>
            <button
              className={`${styles.menuItem} ${activeTab === 'datos' ? styles.menuItemActive : ''}`}
              onClick={() => { openDatos(); setDrawerOpen(false); }}
            >
              Datos
            </button>
          </nav>
          
          <div className={styles.drawerFooter}>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M16 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Export Chart Modal */}
      {showExportChartModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowExportChartModal(false)}>
          <div className={styles.exportModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>Exportar Gráfica</h3>
              <button className={styles.modalCloseBtn} onClick={() => setShowExportChartModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalDescription}>Selecciona el formato de exportación:</p>
              <div className={styles.exportOptions}>
                <button 
                  className={styles.exportOption}
                  onClick={() => {
                    exportChartPNG();
                    setShowExportChartModal(false);
                  }}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span className={styles.exportLabel}>PNG</span>
                  <span className={styles.exportDesc}>Imagen de la gráfica</span>
                </button>
                <button 
                  className={styles.exportOption}
                  onClick={() => {
                    exportChartPDF();
                    setShowExportChartModal(false);
                  }}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M9 13h6M9 17h6M9 9h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className={styles.exportLabel}>PDF</span>
                  <span className={styles.exportDesc}>Documento PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Fichajes Modal */}
      {showExportModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowExportModal(false)}>
          <div className={styles.exportModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>Exportar Fichajes</h3>
              <button className={styles.modalCloseBtn} onClick={() => setShowExportModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalDescription}>Selecciona el formato de exportación:</p>
              <div className={styles.exportOptions}>
                <button 
                  className={styles.exportOption}
                  onClick={() => {
                    exportFichajesRangeCSV();
                    setShowExportModal(false);
                  }}
                  disabled={!filteredAllRows.length}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 18v-6M9 15l3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className={styles.exportLabel}>CSV</span>
                  <span className={styles.exportDesc}>Archivo separado por comas</span>
                </button>
                <button 
                  className={styles.exportOption}
                  onClick={() => {
                    exportFichajesRangeXLSX();
                    setShowExportModal(false);
                  }}
                  disabled={!filteredAllRows.length}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M10 13h4M10 17h4M10 9h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className={styles.exportLabel}>Excel</span>
                  <span className={styles.exportDesc}>Hoja de cálculo</span>
                </button>
                <button 
                  className={styles.exportOption}
                  onClick={() => {
                    exportFichajesRangePDF();
                    setShowExportModal(false);
                  }}
                  disabled={!filteredAllRows.length}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M9 13h6M9 17h6M9 9h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className={styles.exportLabel}>PDF</span>
                  <span className={styles.exportDesc}>Documento portable</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}