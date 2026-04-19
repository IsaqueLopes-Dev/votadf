'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../utils/supabaseClient';

const DEFAULT_AUTHENTICATED_PATH = '/usuarios';

export default function AuthenticatedHomeRedirect() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    let mounted = true;

    const redirectAuthenticatedUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted || !session?.access_token) {
        return;
      }

      router.replace(DEFAULT_AUTHENTICATED_PATH);
    };

    void redirectAuthenticatedUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || !session?.access_token) {
        return;
      }

      router.replace(DEFAULT_AUTHENTICATED_PATH);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  return null;
}
