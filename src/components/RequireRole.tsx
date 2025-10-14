import { ReactNode, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLocation, useNavigate } from 'react-router-dom';

export default function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        navigate('/login', { replace: true, state: { from: location.pathname } });
        return;
      }
      const { data } = await supabase.from('usuarios').select('role').eq('id', uid).maybeSingle();
      if (!data?.role || !roles.includes(data.role)) {
        navigate('/login', { replace: true });
        return;
      }
      setOk(true);
    })();
  }, [roles, navigate, location.pathname]);

  if (ok === null) return null;
  return <>{children}</>;
}
