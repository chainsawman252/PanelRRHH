import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { supabase } from './lib/supabase';

// Handle magic-link/confirm flows that deliver tokens in the URL hash
// Example: http://host/#access_token=...&refresh_token=...&type=signup
(() => {
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#access_token=') || hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        // Persist the session; then route through our callback page for a clean redirect
        supabase.auth.setSession({ access_token, refresh_token }).finally(() => {
          window.location.hash = '#/auth/callback';
        });
      }
    }
  } catch {}
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
