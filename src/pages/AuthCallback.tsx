import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string>('Confirmando tu cuenta...');

  useEffect(() => {
    const run = async () => {
      try {
        const href = window.location.href;
        const url = new URL(href);
        // Code may arrive in the query (OAuth/PKCE)
        const codeFromQuery = url.searchParams.get('code');
        // With HashRouter the code can be after the hash as /#/auth/callback?code=...
        const afterHashQuery = new URLSearchParams((window.location.hash.split('?')[1]) || '');
        const codeFromHash = afterHashQuery.get('code');
        const hasCode = !!(codeFromQuery || codeFromHash);
        const hasAccessTokenInHash = window.location.hash.includes('access_token=');

        if (hasCode) {
          // Only exchange when a PKCE code is present
          const { data, error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) throw error;
          if (data?.session) {
            setMsg('Cuenta confirmada. Redirigiendo al panel...');
            setTimeout(() => navigate('/dashboard', { replace: true }), 500);
            return;
          }
        }

        // If we already have an access_token set (handled in main.tsx) or an existing session, just route
        if (hasAccessTokenInHash) {
          setMsg('Cuenta confirmada. Redirigiendo al panel...');
          setTimeout(() => navigate('/dashboard', { replace: true }), 500);
          return;
        }

        const { data: s } = await supabase.auth.getSession();
        if (s?.session) {
          setMsg('Sesión activa. Redirigiendo al panel...');
          setTimeout(() => navigate('/dashboard', { replace: true }), 500);
        } else {
          setMsg('Redirigiendo al inicio de sesión...');
          setTimeout(() => navigate('/login', { replace: true }), 800);
        }
      } catch (e) {
        // Silenciar errores de intercambio cuando no aplica (evita ruido en consola)
        setMsg('Ocurrió un error. Redirigiendo al inicio de sesión...');
        setTimeout(() => navigate('/login', { replace: true }), 1200);
      }
    };
    run();
  }, [navigate]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', padding: 20, borderRadius: 12 }}>
        {msg}
      </div>
    </div>
  );
}
