'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../../utils/supabaseClient';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => getSupabaseClient(), []);
  const next = searchParams?.get('next') || '/home';
  const code = searchParams?.get('code') || '';

  useEffect(() => {
    let mounted = true;

    const finishAuth = async () => {
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (!mounted) return;

          if (exchangeError) {
            setError(exchangeError.message);
            return;
          }
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          setError(error.message);
          return;
        }

        if (session) {
          router.replace(next);
          return;
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (!mounted) return;

          if (currentSession && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
            router.replace(next);
          }
        });

        window.setTimeout(() => {
          if (!mounted) return;
          subscription.unsubscribe();
          setError('Não foi possível concluir o login com Google. Tente novamente.');
        }, 4000);
      } catch (callbackError) {
        if (!mounted) return;
        setError(callbackError instanceof Error ? callbackError.message : 'Não foi possível concluir o login.');
      }
    };

    void finishAuth();

    return () => {
      mounted = false;
    };
  }, [code, next, router, supabase.auth]);

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
