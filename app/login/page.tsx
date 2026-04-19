"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../utils/supabaseClient';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showConfirmEmail, setShowConfirmEmail] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseClient();
  const next = searchParams?.get('next') || '/home';

  useEffect(() => {
    let mounted = true;

    const redirectIfAuthenticated = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session) {
        router.replace(next);
      }
    };

    void redirectIfAuthenticated();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        router.replace(next);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [next, router, supabase.auth]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push(next);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedUsername = username.startsWith('@') ? username : `@${username.replace(/^@+/, '')}`;

    if (password !== confirmPassword) {
      setError('As senhas nao coincidem.');
      setLoading(false);
      return;
    }

    if (!normalizedUsername.startsWith('@') || normalizedUsername.length < 4) {
      setError('O nome de usuario deve comecar com @');
      setLoading(false);
      return;
    }

    try {
      const { data: userEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (userEmail) {
        setError('Ja existe um usuario com este e-mail.');
        setLoading(false);
        return;
      }

      const { data: userName } = await supabase
        .from('users')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (userName) {
        setError('Ja existe um usuario com este nome de usuario.');
        setLoading(false);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: normalizedUsername,
            cpf,
            birth_date: birthDate,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      setIsSignUp(false);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setUsername('');
      setCpf('');
      setBirthDate('');
      setShowConfirmEmail(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);

    try {
      const redirectTo = `${window.location.origin}/login?next=${encodeURIComponent(next)}`;
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (googleError) {
        setError(googleError.message);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {showConfirmEmail && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(3, 7, 18, 0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backdropFilter: 'blur(14px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              borderRadius: 28,
              border: '1px solid rgba(255,255,255,0.09)',
              background:
                'linear-gradient(145deg, rgba(10,15,26,0.96) 0%, rgba(17,24,39,0.96) 55%, rgba(8,15,28,0.98) 100%)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
              padding: '36px 32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 18,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '-30% auto auto 55%',
                width: 240,
                height: 240,
                background: 'radial-gradient(circle, rgba(0,195,255,0.22) 0%, rgba(0,195,255,0) 72%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 18,
                  background: 'linear-gradient(135deg, rgba(0,195,255,0.22), rgba(0,153,204,0.1))',
                  border: '1px solid rgba(0,195,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                  flexShrink: 0,
                }}
              >
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M4 7.75A2.75 2.75 0 0 1 6.75 5h10.5A2.75 2.75 0 0 1 20 7.75v8.5A2.75 2.75 0 0 1 17.25 19H6.75A2.75 2.75 0 0 1 4 16.25v-8.5Z"
                    stroke="#00c3ff"
                    strokeWidth="1.6"
                  />
                  <path
                    d="m5.5 7 5.47 4.38a1.65 1.65 0 0 0 2.06 0L18.5 7"
                    stroke="#7dd3fc"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <div
                  style={{
                    color: '#7dd3fc',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Cadastro concluido
                </div>
                <div
                  style={{
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 24,
                    lineHeight: 1.2,
                    fontFamily: 'Poppins, Segoe UI, Arial, sans-serif',
                  }}
                >
                  Confirme seu e-mail e faca login
                </div>
              </div>
            </div>
            <p
              style={{
                margin: 0,
                color: 'rgba(226,232,240,0.78)',
                fontSize: 14,
                lineHeight: 1.65,
                position: 'relative',
                zIndex: 1,
              }}
            >
              Enviamos um link de confirmacao para o e-mail informado. Depois de validar sua conta, volte para entrar e
              acessar a plataforma.
            </p>
            <div
              style={{
                borderRadius: 18,
                border: '1px solid rgba(125,211,252,0.14)',
                background: 'rgba(9, 15, 28, 0.55)',
                padding: '14px 16px',
                color: '#cbd5e1',
                fontSize: 13,
                lineHeight: 1.6,
                position: 'relative',
                zIndex: 1,
              }}
            >
              Se nao encontrar a mensagem, confira tambem a caixa de spam ou promocoes.
            </div>
            <button
              style={{
                marginTop: 4,
                background: 'linear-gradient(135deg, #00c3ff, #0099cc)',
                color: '#03111f',
                border: 'none',
                borderRadius: 16,
                padding: '14px 18px',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 16px 32px rgba(0, 195, 255, 0.18)',
                transition: 'transform 0.2s, filter 0.2s',
                position: 'relative',
                zIndex: 1,
              }}
              onClick={() => setShowConfirmEmail(false)}
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={{ ...styles.logo, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Image
            src="/logo.png"
            alt="Logo VP"
            width={44}
            height={44}
            style={{ height: 44, width: 44, objectFit: 'contain', marginBottom: 2 }}
          />
          <span
            style={{
              color: '#00c3ff',
              fontWeight: 700,
              fontSize: 22,
              fontFamily: 'Poppins, Segoe UI, Arial, sans-serif',
              letterSpacing: 0,
            }}
          >
            Votaai
          </span>
          <span
            style={{
              color: '#9ca3af',
              fontWeight: 500,
              fontSize: 13,
              fontFamily: 'Poppins, Segoe UI, Arial, sans-serif',
              marginTop: -6,
            }}
          >
            Previsao
          </span>
        </div>

        <div style={styles.subtitle}>Antecipe resultados. Tome decisoes com confianca.</div>
        <h2 style={styles.title}>{isSignUp ? 'Criar conta' : 'Acesse sua conta para continuar'}</h2>

        {error && (
          <div
            style={{
              color: '#f87171',
              background: '#2a1515',
              borderRadius: 10,
              padding: 10,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form style={styles.form} onSubmit={isSignUp ? handleSignUp : handleLogin} autoComplete="on">
          {isSignUp && (
            <>
              <div style={{ position: 'relative', width: '100%' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: 10,
                    color: '#00c3ff',
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: '"Poppins", "Segoe UI", Arial, sans-serif',
                    textShadow: '0 2px 8px #00334444',
                    pointerEvents: 'none',
                    zIndex: 2,
                    lineHeight: '1',
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    letterSpacing: '0.5px',
                    userSelect: 'none',
                  }}
                >
                  @
                </span>
                <input
                  id="username-input"
                  type="text"
                  placeholder="nome de usuario"
                  style={{ ...styles.input, paddingLeft: 44 }}
                  value={username.replace(/^@+/, '')}
                  onChange={(e) => {
                    setUsername(e.target.value.replace(/@/g, ''));
                  }}
                  autoComplete="username"
                  required
                  disabled={loading}
                />
              </div>

              <input
                type="text"
                placeholder="CPF"
                style={styles.input}
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                autoComplete="off"
                required
                disabled={loading}
                maxLength={14}
              />

              <input
                type="date"
                placeholder="Data de nascimento"
                style={styles.input}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                autoComplete="bday"
                required
                disabled={loading}
              />
            </>
          )}

          <input
            type="email"
            placeholder="E-mail"
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Senha"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            disabled={loading}
          />

          {isSignUp && (
            <input
              type="password"
              placeholder="Confirme a senha"
              style={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={loading}
            />
          )}

          <button style={styles.loginButton} type="submit" disabled={loading}>
            {loading ? (isSignUp ? 'Criando...' : 'Entrar') : (isSignUp ? 'Criar conta' : 'Entrar')}
          </button>

          <button type="button" style={styles.googleButton} onClick={handleGoogle} disabled={loading}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png" style={{ width: 18 }} alt="Google" />
            {isSignUp ? 'Cadastrar com Google' : 'Entrar com Google'}
          </button>
        </form>

        <div style={{ ...styles.link, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          {isSignUp ? (
            <>
              <span style={{ color: '#9ca3af' }}>Ja tem conta?</span>
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                style={{
                  color: '#00c3ff',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                  textDecoration: 'underline',
                  outline: 'none',
                  transition: 'color 0.2s',
                }}
                onFocus={(e) => (e.currentTarget.style.color = '#0099cc')}
                onBlur={(e) => (e.currentTarget.style.color = '#00c3ff')}
                onMouseOver={(e) => (e.currentTarget.style.color = '#0099cc')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#00c3ff')}
                tabIndex={0}
              >
                Fazer login
              </button>
            </>
          ) : (
            <>
              <span style={{ color: '#9ca3af' }}>Nao tem conta?</span>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                style={{
                  color: '#00c3ff',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                  textDecoration: 'underline',
                  outline: 'none',
                  transition: 'color 0.2s',
                }}
                onFocus={(e) => (e.currentTarget.style.color = '#0099cc')}
                onBlur={(e) => (e.currentTarget.style.color = '#00c3ff')}
                onMouseOver={(e) => (e.currentTarget.style.color = '#0099cc')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#00c3ff')}
                tabIndex={0}
              >
                Criar conta
              </button>
            </>
          )}
        </div>

        {!isSignUp && (
          <div style={styles.link}>
            <Link href="/login?reset=1">Esqueceu a senha?</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={styles.container} />}>
      <LoginPageContent />
    </Suspense>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    margin: 0,
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111111',
    backgroundImage: 'linear-gradient(32deg, rgba(8,8,8,0.74) 30px, transparent)',
    backgroundSize: '60px 60px',
    backgroundPosition: '-5px -5px',
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
  },
  card: {
    width: 360,
    padding: 35,
    borderRadius: 18,
    background: 'rgba(17,17,17,0.85)',
    backdropFilter: 'blur(6px)',
    border: '1px solid rgba(255,255,255,0.05)',
    boxShadow: '0 15px 40px rgba(0,0,0,0.7)',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 4,
    color: '#00c3ff',
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 25,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 500,
    marginBottom: 20,
    color: '#e5e7eb',
  },
  form: {
    width: '100%',
    maxWidth: 280,
    display: 'flex',
    flexDirection: 'column',
  },
  input: {
    width: '100%',
    padding: 12,
    marginBottom: 14,
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: '#1a1a1a',
    color: 'white',
    outline: 'none',
  },
  loginButton: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #00c3ff, #0099cc)',
    color: '#000',
    marginTop: 5,
  },
  googleButton: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    background: '#fff',
    color: '#111',
    marginTop: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  link: {
    marginTop: 14,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
};
