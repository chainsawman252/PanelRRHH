import React, { useEffect, useMemo, useState, forwardRef, useRef, useImperativeHandle } from 'react';
import { supabase } from '../lib/supabase';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type Props = {
  companyId?: string | null;
  // optional ISO date strings (yyyy-mm-dd) for start and end (inclusive)
  startDate?: string | null;
  endDate?: string | null;
  reloadTick?: number;
};

const todayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const RecentFichajesChart = forwardRef(function RecentFichajesChart(
  { companyId, startDate, endDate, reloadTick }: Props,
  ref: any
) {
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const chartRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    toBase64Image: () => chartRef.current?.toBase64Image?.() || null,
    chart: () => chartRef.current,
  }), []);

  // labels for the last 7 days (including today)
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      arr.push(d);
    }
    return arr;
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // determine start and end ISO boundaries
        const s = startDate ? new Date(startDate + 'T00:00:00') : (() => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-6); return d; })();
        const e = endDate ? new Date(endDate + 'T23:59:59.999') : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();
        const startISO = s.toISOString();
        const endISO = e.toISOString();

        let usuarioIds: string[] | null = null;
        if (companyId) {
          const { data: users } = await supabase.from('usuarios').select('id').eq('id_empresa', companyId).limit(5000);
          usuarioIds = (users as any[] || []).map(u => u.id).filter(Boolean) as string[];
          if (usuarioIds.length === 0) usuarioIds = null;
        }

        let q = supabase.from('fichajes').select('created_at').gte('created_at', startISO).lte('created_at', endISO).limit(5000);
        if (usuarioIds) q = (q as any).in('usuario_id', usuarioIds);
        const { data, error } = await q;
        if (error) throw error;
        const map: Record<string, number> = {};
        (data as any[] || []).forEach((r) => {
          if (!r?.created_at) return;
          const d = new Date(r.created_at);
          const key = todayKey(d);
          map[key] = (map[key] || 0) + 1;
        });
        setCounts(map);
      } catch (e) {
        console.error('RecentFichajesChart load error', e);
        setCounts({});
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId, startDate, endDate, reloadTick]);

  const labels = days.map(d => d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' }));
  const data = {
    labels,
    datasets: [
      {
        label: 'Fichajes',
        data: days.map(d => counts[todayKey(d)] || 0),
        backgroundColor: 'rgba(33, 150, 243, 0.85)',
        borderColor: 'rgba(33, 150, 243, 1)',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Fichajes últimos 7 días' },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  } as any;

  return (
    <div style={{ minHeight: 220, position: 'relative' }}>
      {loading ? (
        <div style={{ padding: 12 }} className="small-muted">Cargando gráfica...</div>
      ) : (
        <Bar ref={chartRef} data={data} options={options} />
      )}
    </div>
  );
});

export default RecentFichajesChart;
