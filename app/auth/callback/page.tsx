'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../../utils/supabaseClient';

const DEFAULT_POST_LOGIN_PATH = '/home';

const emailOtpTypes = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const);

type EmailOtpType = typeof emailOtpTypes extends Set<infer T> ? T : never;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const resolvePostLoginPath = (candidate: string | null | undefined) => {
  const normalized = String(candidate || '').trim();

  if (
    !normalized ||
    normalized === '/' ||
    normalized.startsWith('/login') ||
    normalized.startsWith('/auth/callback')
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return normalized;
};

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => getSupabaseClient(), []);
  const next = searchParams?.get('next') || '';
  const code = searchParams?.get('code') || '';
  const tokenHash = searchParams?.get('token_hash') || '';
  const type = searchParams?.get('type') || '';

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | null = null;

    const getResolvedNext = () => {
      if (typeof window === 'undefined') {
        return DEFAULT_POST_LOGIN_PATH;
      }

      const storedNext = window.sessionStorage.getItem('post_login_redirect') || '';
      return resolvePostLoginPath(next || storedNext);
    };

    const clearPendingRedirect = () => {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('post_login_redirect');
      }
    };

    const syncProfile = async (accessToken: string) => {
      await fetch('/api/profile/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      }).catch(() => null);
    };

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

      const { data, error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        throw setSessionError;
      }

      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      return data.session || null;
    };

    const waitForStableSession = async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session?.access_token) {
          return session;
        }

        await wait(250);
      }

      return null;
    };

    const finishWithSession = async () => {
      const session = await waitForStableSession();

      if (!mounted) return false;
      if (!session?.access_token) return false;

      await syncProfile(session.access_token);

      if (!mounted) return true;

      clearPendingRedirect();
      router.replace(getResolvedNext());
      return true;
    };

    const finishAuth = async () => {
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (!mounted) return;
          if (exchangeError) {
            setError(exchangeError.message);
            return;
          }
        } else {
          await normalizeHashSession();
        }

        if (tokenHash && type && emailOtpTypes.has(type as EmailOtpType)) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });

          if (!mounted) return;
          if (verifyError) {
            setError(verifyError.message);
            return;
          }
        }

        if (await finishWithSession()) {
          return;
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (!mounted) return;

          if (!currentSession?.access_token) return;
          if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') return;

          void (async () => {
            await syncProfile(currentSession.access_token);

            if (!mounted) return;

            clearPendingRedirect();
            router.replace(getResolvedNext());
          })();
        });

        timeoutId = window.setTimeout(() => {
          subscription.unsubscribe();
          if (!mounted) return;
          setError('Não foi possível concluir o login com Google. Tente novamente.');
        }, 8000);
      } catch (callbackError) {
        if (!mounted) return;
        setError(callbackError instanceof Error ? callbackError.message : 'Não foi possível concluir o login.');
      }
    };

    void finishAuth();

    return () => {
      mounted = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [code, next, router, supabase.auth, tokenHash, type]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111111',
        backgroundImage: 'linear-gradient(32deg, rgba(8,8,8,0.74) 30px, transparent)',
        backgroundSize: '60px 60px',
        backgroundPosition: '-5px -5px',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(17,17,17,0.88)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
          padding: '32px 28px',
          color: '#fff',
          textAlign: 'center',
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Concluindo login</h1>
        <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: '#cbd5e1' }}>
          Estamos finalizando o acesso com Google e redirecionando você.
        </p>
        {error ? (
          <div
            style={{
              marginTop: 18,
              borderRadius: 14,
              background: 'rgba(127,29,29,0.35)',
              border: '1px solid rgba(248,113,113,0.3)',
              padding: '12px 14px',
              color: '#fecaca',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : (
          <div
            style={{
              margin: '20px auto 0',
              width: 38,
              height: 38,
              borderRadius: '9999px',
              border: '3px solid rgba(255,255,255,0.15)',
              borderTopColor: '#00c3ff',
              animation: 'spin 0.9s linear infinite',
            }}
          />
        )}
        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#111111' }} />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
