"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  consumePendingSignupProfile,
  savePendingSignupProfile,
} from '../utils/pending-signup-profile';
import { getSupabaseClient } from '../utils/supabaseClient';

const DEFAULT_POST_LOGIN_PATH = '/home';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const normalizeCpfDigits = (value: string) => value.replace(/\D/g, '');

type UserCpfRow = {
  id: string;
  cpf: string | null;
};

const findUserByNormalizedCpf = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  normalizedCpf: string
) => {
  const profileResult = await supabase.from('profiles').select('id, cpf').not('cpf', 'is', null);
  const legacyResult = profileResult.error
    ? await supabase.from('users').select('id, cpf').not('cpf', 'is', null)
    : { data: [], error: null };

  if (profileResult.error && legacyResult.error) {
    throw profileResult.error;
  }

  const users = ((profileResult.error ? legacyResult.data : profileResult.data) || []) as UserCpfRow[];
  return users.find((user) => normalizeCpfDigits(String(user.cpf || '')) === normalizedCpf) || null;
};

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

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showConfirmEmail, setShowConfirmEmail] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const next = resolvePostLoginPath(searchParams?.get('next'));
  const isResetMode = searchParams?.get('reset') === '1';
  const shouldSwitchAccount = searchParams?.get('switch') === '1';

  const completePendingSignupProfile = async (accessToken?: string | null, userEmail?: string | null) => {
    if (!accessToken || !userEmail) return;

    const pendingProfile = consumePendingSignupProfile(userEmail);
    if (!pendingProfile) return;

    const response = await fetch('/api/profile/me', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        username: pendingProfile.username,
        cpf: pendingProfile.cpf,
        birth_date: pendingProfile.birth_date,
        avatar_url: '',
      }),
    }).catch(() => null);

    if (!response?.ok) {
      savePendingSignupProfile(pendingProfile);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hashParams.get('type') === 'recovery') {
      setIsRecoverySession(true);
    }
  }, []);

  useEffect(() => {
    if (!shouldSwitchAccount) return;

    let mounted = true;

    const clearCurrentSession = async () => {
      await supabase.auth.signOut();

      if (!mounted || typeof window === 'undefined') return;

      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('switch');
      const cleanedQuery = nextParams.toString();
      const nextUrl = cleanedQuery ? `/login?${cleanedQuery}` : '/login';
      window.history.replaceState({}, document.title, nextUrl);
      setNotice('Sessão anterior encerrada. Agora você pode entrar com outro e-mail.');
    };

    void clearCurrentSession();

    return () => {
      mounted = false;
    };
  }, [shouldSwitchAccount, supabase.auth]);

  useEffect(() => {
    let mounted = true;

    const redirectIfAuthenticated = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session && !isResetMode && !isRecoverySession && !shouldSwitchAccount) {
        router.replace(next);
      }
    };

    void redirectIfAuthenticated();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
        setError(null);
        setNotice('Digite sua nova senha para concluir a recuperação.');
        return;
      }

      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        if (!isResetMode && !isRecoverySession && !shouldSwitchAccount) {
          router.replace(next);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isRecoverySession, isResetMode, next, router, shouldSwitchAccount, supabase.auth]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      await completePendingSignupProfile(signInData.session?.access_token, signInData.user?.email);
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
    setNotice(null);

    const normalizedUsername = username.startsWith('@') ? username : `@${username.replace(/^@+/, '')}`;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCpf = normalizeCpfDigits(cpf);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    if (!normalizedUsername.startsWith('@') || normalizedUsername.length < 4) {
      setError('O nome de usuário deve começar com @');
      setLoading(false);
      return;
    }

    try {
      const emailProfileResult = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      const emailLegacyResult = emailProfileResult.error
        ? await supabase
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle()
        : { data: null, error: null };
      const userEmail = emailProfileResult.error ? emailLegacyResult.data : emailProfileResult.data;

      if (userEmail) {
        setError('Já existe um usuário com este e-mail.');
        setLoading(false);
        return;
      }

      const usernameProfileResult = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();
      const usernameLegacyResult = usernameProfileResult.error
        ? await supabase
            .from('users')
            .select('id')
            .eq('username', normalizedUsername)
            .maybeSingle()
        : { data: null, error: null };
      const userName = usernameProfileResult.error ? usernameLegacyResult.data : usernameProfileResult.data;

      if (userName) {
        setError('Já existe um usuário com este nome de usuário.');
        setLoading(false);
        return;
      }

      const userCpf = await findUserByNormalizedCpf(supabase, normalizedCpf);

      if (userCpf) {
        setError('Já existe um usuário com este CPF.');
        setLoading(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            username: normalizedUsername,
            cpf: normalizedCpf,
            birth_date: birthDate,
          },
        },
      });

      if (signUpError) {
        const normalizedMessage = String(signUpError.message || '').toLowerCase();

        if (
          normalizedMessage.includes('already registered') ||
          normalizedMessage.includes('already been registered') ||
          normalizedMessage.includes('user already registered')
        ) {
          setError('Já existe um usuário com este e-mail.');
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      savePendingSignupProfile({
        email: normalizedEmail,
        username: normalizedUsername,
        cpf: normalizedCpf,
        birth_date: birthDate,
      });

      if (signUpData.session?.access_token) {
        await fetch('/api/profile/me', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${signUpData.session.access_token}`,
          },
          body: JSON.stringify({
            username: normalizedUsername,
            cpf: normalizedCpf,
            birth_date: birthDate,
            avatar_url: '',
          }),
        })
          .then(async (response) => {
            if (response.ok) {
              consumePendingSignupProfile(normalizedEmail);
            }
          })
          .catch(() => null);
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
    setNotice(null);

    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('post_login_redirect', next);
      }

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
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

  const handleSendRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Informe seu e-mail para recuperar a senha.');
      setLoading(false);
      return;
    }

    try {
      const redirectTo = `${window.location.origin}/login?reset=1`;
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

      if (recoveryError) {
        setError(recoveryError.message);
        return;
      }

      setNotice('Enviamos um link de recuperação para o seu e-mail.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Não foi possível enviar o e-mail de recuperação.'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (!password || !confirmPassword) {
      setError('Preencha e confirme a nova senha.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setNotice('Senha alterada com sucesso. Agora você já pode entrar.');
      setPassword('');
      setConfirmPassword('');
      setIsRecoverySession(false);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/login');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Não foi possível atualizar a senha.'));
    } finally {
      setLoading(false);
    }
  };

  const renderPrimaryForm = () => {
    if (isRecoverySession) {
      return (
        <form style={styles.form} onSubmit={handleUpdatePassword} autoComplete="on">
          <input
            type="password"
            placeholder="Nova senha"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Confirme a nova senha"
            style={styles.input}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />
          <button style={styles.loginButton} type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      );
    }

    if (isResetMode) {
      return (
        <form style={styles.form} onSubmit={handleSendRecoveryEmail} autoComplete="on">
          <input
            type="email"
            placeholder="E-mail"
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={loading}
          />
          <button style={styles.loginButton} type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar recuperação'}
          </button>
        </form>
      );
    }

    return (
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
                placeholder="nome de usuário"
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

            <div style={{ width: '100%' }}>
              <label
                htmlFor="birth-date-input"
                style={{
                  display: 'block',
                  marginBottom: 8,
                  color: '#dbeafe',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: '"Poppins", "Segoe UI", Arial, sans-serif',
                }}
              >
                Data de nascimento
              </label>
              <input
                id="birth-date-input"
                type="date"
                style={styles.input}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                autoComplete="bday"
                required
                disabled={loading}
              />
            </div>
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
          {loading ? (isSignUp ? 'Criando...' : 'Entrando...') : isSignUp ? 'Criar conta' : 'Entrar'}
        </button>

        <button type="button" style={styles.googleButton} onClick={handleGoogle} disabled={loading}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png" style={{ width: 18 }} alt="Google" />
          {isSignUp ? 'Cadastrar com Google' : 'Entrar com Google'}
        </button>
      </form>
    );
  };

  const pageTitle = isRecoverySession
    ? 'Defina sua nova senha'
    : isResetMode
      ? 'Recupere sua senha'
      : isSignUp
        ? 'Criar conta'
        : 'Acesse sua conta para continuar';

  const subtitle = isRecoverySession
    ? 'Escolha uma nova senha para voltar ao seu acesso.'
    : isResetMode
      ? 'Informe seu e-mail para receber o link de recuperação.'
      : 'Antecipe resultados. Tome decisões com confiança.';

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
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
                  Cadastro concluído
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
                  Confirme seu e-mail e faça login
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
              Enviamos um link de confirmação para o e-mail informado. Depois de validar sua conta, volte para entrar e
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
              Se não encontrar a mensagem, confira também a caixa de spam ou promoções.
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
            Previsão
          </span>
        </div>

        <div style={styles.subtitle}>{subtitle}</div>
        <h2 style={styles.title}>{pageTitle}</h2>

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

        {notice && (
          <div
            style={{
              color: '#c6f6ff',
              background: 'rgba(3, 105, 161, 0.18)',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              borderRadius: 10,
              padding: 10,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {notice}
          </div>
        )}

        {renderPrimaryForm()}

        {!isResetMode && !isRecoverySession && (
          <div style={{ ...styles.link, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            {isSignUp ? (
              <>
                <span style={{ color: '#9ca3af' }}>Já tem conta?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setNotice(null);
                  }}
                  style={styles.inlineAction}
                >
                  Fazer login
                </button>
              </>
            ) : (
              <>
                <span style={{ color: '#9ca3af' }}>Não tem conta?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setNotice(null);
                  }}
                  style={styles.inlineAction}
                >
                  Criar conta
                </button>
              </>
            )}
          </div>
        )}

        {!isSignUp && !isRecoverySession && (
          <div style={styles.link}>
            {isResetMode ? <Link href="/login">Voltar para o login</Link> : <Link href="/login?reset=1">Esqueceu a senha?</Link>}
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
  inlineAction: {
    color: '#00c3ff',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    font: 'inherit',
    textDecoration: 'underline',
    outline: 'none',
    transition: 'color 0.2s',
  },
};
