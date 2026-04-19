'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../utils/supabaseClient';

const DEFAULT_AUTHENTICATED_PATH = '/home';
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function AuthenticatedHomeRedirect() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    let mounted = true;

    const normalizeHashSession = async () => {
      if (typeof window === 'undefined') return null;

      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) return null;

      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token') || '';
      const refreshToken = hashParams.get('refresh_token') || '';

      if (!accessToken || !refreshToken) {
        return null;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        throw error;
      }

      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      return data.session || null;
    };

    const waitForStableSession = async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          return session;
        }

        await wait(250);
      }

      return null;
    };

    const redirectAuthenticatedUser = async () => {
      await normalizeHashSession();

      const session = await waitForStableSession();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !session?.access_token || !user) {
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
