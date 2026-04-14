'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

function AuthPageContent() {
  const CANONICAL_SITE_URL = 'https://votaaiprevisao.com';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [cpfConfirmation, setCpfConfirmation] = useState('');
  const [cpfConfirmationTouched, setCpfConfirmationTouched] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signUpStep, setSignUpStep] = useState<1 | 2>(1);
  const [showSignUpConfirm, setShowSignUpConfirm] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const requestedNext = searchParams.get('next');
  const safeNextPath = requestedNext && requestedNext.startsWith('/') ? requestedNext : '/home';

  const normalizeUsername = (value: string) => {
    const withoutSpaces = value.replace(/\s+/g, '');
    if (!withoutSpaces) return '';
    const normalized = withoutSpaces.startsWith('@') ? withoutSpaces : `@${withoutSpaces.replace(/^@+/, '')}`;
    return normalized.toLowerCase();
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const isValidCpf = (value: string) => {
    const digits = value.replace(/\D/g, '');

    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
      return false;
    }

    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += Number(digits[i]) * (10 - i);
    }
    let firstDigit = (sum * 10) % 11;
    if (firstDigit === 10) firstDigit = 0;
    if (firstDigit !== Number(digits[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i += 1) {
      sum += Number(digits[i]) * (11 - i);
    }
    let secondDigit = (sum * 10) % 11;
    if (secondDigit === 10) secondDigit = 0;
    return secondDigit === Number(digits[10]);
  };

  const isValidUsername = (value: string) => /^@[^\s]+$/.test(value) && value.length >= 4;

  const cpfDigits = (value: string) => value.replace(/\D/g, '');
  const cpfConfirmationMismatch =
    cpfConfirmationTouched &&
    cpfDigits(cpfConfirmation).length > 0 &&
    cpfDigits(cpf) !== cpfDigits(cpfConfirmation);

  const checkUsernameAvailability = async (value: string) => {
    const response = await fetch(`/api/username-availability?username=${encodeURIComponent(value)}`);
    const result = await response.json();
    return result.available === true;
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const callbackBaseUrl = CANONICAL_SITE_URL;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${callbackBaseUrl}/login?next=${encodeURIComponent(safeNextPath)}`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (oauthError) {
        if (oauthError.message.toLowerCase().includes('provider is not enabled')) {
          setError('Login com Google indisponivel: habilite o provedor Google no Supabase (Authentication > Providers > Google).');
        } else {
          setError(oauthError.message);
        }
      }
    } catch (oauthUnexpectedError: any) {
      setError(oauthUnexpectedError.message || 'Erro ao iniciar login com Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const checkUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && user.email) {
          setUser(user);
          const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
          if (isAdmin) {
            router.push('/admin');
          } else {
            router.push(safeNextPath);
          }
        }
      } catch (error) {
        console.error('Erro ao verificar usuário:', error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkUser();
  }, [safeNextPath]);

  useEffect(() => {
    if (isSignUp) {
      // Garante que o cadastro sempre abra limpo, sem herdar autofill de login salvo.
      setUsername('');
      setEmail('');
      setPassword('');
      setCpf('');
      setCpfConfirmation('');
      setCpfConfirmationTouched(false);
      setBirthDate('');
      setSignUpStep(1);
    }
  }, [isSignUp]);

  const handleConfirmSignUp = async () => {
    setLoading(true);
    setError(null);

    try {
      const normalizedUsername = normalizeUsername(username);

      if (!isValidUsername(normalizedUsername)) {
        setError('Nome de usuário inválido. Use @ no início e não use espaços.');
        return;
      }

      if (!isValidCpf(cpf)) {
        setError('CPF inválido.');
        return;
      }

      if (!birthDate) {
        setError('Data de nascimento obrigatória.');
        return;
      }

      if (cpfDigits(cpf) !== cpfDigits(cpfConfirmation)) {
        setError('Os CPFs informados não são iguais.');
        return;
      }

      const isAvailable = await checkUsernameAvailability(normalizedUsername);
      if (!isAvailable) {
        setError('Esse nome de usuário já está em uso.');
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: normalizedUsername,
            cpf: cpf,
            birth_date: birthDate,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        setShowSignUpConfirm(false);
        setShowEmailConfirmation(true);
        setEmail('');
        setPassword('');
        setUsername('');
        setCpf('');
        setCpfConfirmation('');
        setCpfConfirmationTouched(false);
        setBirthDate('');
        setIsSignUp(false);
        setSignUpStep(1);
      }
    } catch (submitError: any) {
      setError(submitError.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSignUpConfirm = () => {
    const normalizedUsername = normalizeUsername(username);

    if (!isValidUsername(normalizedUsername)) {
      setError('Nome de usuário inválido. Use @ no início e não use espaços.');
      return;
    }

    if (!isValidCpf(cpf)) {
      setError('CPF inválido.');
      return;
    }

    if (!birthDate) {
      setError('Data de nascimento obrigatória.');
      return;
    }

    if (cpfDigits(cpf) !== cpfDigits(cpfConfirmation)) {
      setError('Os CPFs informados não são iguais.');
      return;
    }

    setShowSignUpConfirm(true);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignUp && signUpStep === 1) {
      const normalizedUsername = normalizeUsername(username);

      if (!isValidUsername(normalizedUsername)) {
        setError('Nome de usuário inválido. Use @ no início e não use espaços.');
        return;
      }

      if (!email.trim()) {
        setError('Email obrigatório.');
        return;
      }

      if (!password || password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }

      setSignUpStep(2);
      return;
    }

    try {
      if (isSignUp) {
        handleOpenSignUpConfirm();
        return;
      } else {
        setLoading(true);
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        if (data.user && data.user.email) {
          setUser(data.user);
          router.push(safeNextPath);
        }
      }
    } catch (error: any) {
      setError(error.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setEmail('');
    setPassword('');
  };

  if (checkingAuth) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-blue-700 via-blue-600 to-blue-50 flex items-center justify-center p-4" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-12 -right-16 h-64 w-64 rounded-full bg-blue-200/30 blur-2xl" />
      </div>
      <div className="relative bg-white/95 backdrop-blur rounded-3xl border border-blue-100 p-6 sm:p-10 max-w-md w-full shadow-2xl text-center">
        <div className="mb-6 flex justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0L3.586 10l4.707-4.707a1 1 0 111.414 1.414L7.414 9H16a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Voltar para o site
          </Link>
        </div>

        <div className="mb-8">
          {!isSignUp && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500 mb-2">Acesse sua conta</p>
          )}
          <h1 className="text-3xl font-bold text-blue-900 mb-2">VotaDF</h1>
          <p className="text-slate-600">
            {isSignUp ? 'Crie sua conta' : 'Faça login para continuar'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4" autoComplete={isSignUp ? 'off' : 'on'}>
          {isSignUp && (
            <>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">
                Etapa {signUpStep} de 2
              </div>

              {signUpStep === 1 && (
                <>
                  <p className="text-xs text-slate-500">No cadastro, você escolhe seu @usuário, email e senha.</p>

                  <div>
                    <label htmlFor="signup-username" className="block text-sm font-medium text-slate-900 mb-2 text-center">
                      Nome de usuário
                    </label>
                    <input
                      id="signup-username"
                      name="signup_username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                      placeholder="@seunome"
                      autoComplete="off"
                      required
                      minLength={3}
                      className="w-full rounded-xl border border-blue-200 bg-blue-50/40 px-4 py-3 text-center text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="text-left">
                    <label htmlFor="signup-email" className="block text-sm font-medium text-slate-900 mb-2">
                      Email
                    </label>
                    <input
                      id="signup-email"
                      name="signup_email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      autoComplete="off"
                      required
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="text-left">
                    <label htmlFor="signup-password" className="block text-sm font-medium text-slate-900 mb-2">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        id="signup-password"
                        name="signup_password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 transition hover:text-blue-800"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {!showPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A8.963 8.963 0 0019 10c-1.341-3.105-4.364-6-9-6a8.93 8.93 0 00-3.993.934L3.707 2.293z" />
                            <path d="M5.243 7.828A8.969 8.969 0 001 10c1.341 3.105 4.364 6 9 6a8.96 8.96 0 004.172-1.012l-1.516-1.516A4 4 0 016.528 8.95L5.243 7.828z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10 3C5.364 3 2.341 5.895 1 9c1.341 3.105 4.364 6 9 6s7.659-2.895 9-6c-1.341-3.105-4.364-6-9-6zm0 10a4 4 0 110-8 4 4 0 010 8z" />
                            <path d="M10 7a2 2 0 100 4 2 2 0 000-4z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {signUpStep === 2 && (
                <>
                  <div>
                    <label htmlFor="cpf" className="block text-sm font-medium text-slate-900 mb-2 text-center">
                      CPF
                    </label>
                    <input
                      id="cpf"
                      type="text"
                      inputMode="numeric"
                      value={cpf}
                      onChange={(e) => setCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      required
                      className="w-full rounded-xl border border-blue-200 bg-blue-50/40 px-4 py-3 text-center text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="cpfConfirmation" className="block text-sm font-medium text-slate-900 mb-2 text-center">
                      Confirme seu CPF
                    </label>
                    <input
                      id="cpfConfirmation"
                      type="text"
                      inputMode="numeric"
                      value={cpfConfirmation}
                      onChange={(e) => setCpfConfirmation(formatCpf(e.target.value))}
                      onBlur={() => setCpfConfirmationTouched(true)}
                      placeholder="000.000.000-00"
                      required
                      className="w-full rounded-xl border border-blue-200 bg-blue-50/40 px-4 py-3 text-center text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {cpfConfirmationMismatch && (
                      <p className="mt-2 text-center text-xs font-medium text-red-600">
                        Os CPFs informados não são iguais.
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="birthDate" className="block text-sm font-medium text-slate-900 mb-2 text-center">
                      Data de nascimento
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                      className="w-full rounded-xl border border-blue-200 bg-blue-50/40 px-4 py-3 text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 text-center">
                    Depois de salvar, só o admin poderá alterar CPF e data de nascimento.
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSignUpStep(1);
                    }}
                    className="w-full rounded-full border border-slate-300 bg-white px-6 py-3 text-slate-700 font-medium transition hover:bg-slate-50"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0L4.586 11H16a1 1 0 110-2H4.586l3.707-3.707a1 1 0 00-1.414-1.414l-5.414 5.414a1 1 0 000 1.414l5.414 5.414a1 1 0 001.414 0z" clipRule="evenodd" />
                      </svg>
                      Voltar para etapa anterior
                    </span>
                  </button>
                </>
              )}
            </>
          )}

          {!isSignUp && (
            <>
              <div className="text-left">
                <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="login_username"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="username"
                  spellCheck={false}
                  autoCapitalize="none"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="text-left">
                <label htmlFor="password" className="block text-sm font-medium text-slate-900 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="login_password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 transition hover:text-blue-800"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {!showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A8.963 8.963 0 0019 10c-1.341-3.105-4.364-6-9-6a8.93 8.93 0 00-3.993.934L3.707 2.293z" />
                        <path d="M5.243 7.828A8.969 8.969 0 001 10c1.341 3.105 4.364 6 9 6a8.96 8.96 0 004.172-1.012l-1.516-1.516A4 4 0 016.528 8.95L5.243 7.828z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M10 3C5.364 3 2.341 5.895 1 9c1.341 3.105 4.364 6 9 6s7.659-2.895 9-6c-1.341-3.105-4.364-6-9-6zm0 10a4 4 0 110-8 4 4 0 010 8z" />
                        <path d="M10 7a2 2 0 100 4 2 2 0 000-4z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {isSignUp && signUpStep === 2 ? (
            <button
              type="button"
              onClick={handleOpenSignUpConfirm}
              disabled={loading}
              className="w-full rounded-full bg-blue-600 px-6 py-3 text-white font-semibold shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processando...' : 'Criar Conta'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-blue-600 px-6 py-3 text-white font-semibold shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processando...' : isSignUp ? 'Continuar' : 'Fazer Login'}
            </button>
          )}
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs uppercase tracking-wide text-slate-500">ou</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full rounded-full border border-blue-200 bg-white px-6 py-3 text-slate-900 font-medium transition hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-3">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.653 32.657 29.233 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.848 1.154 7.965 3.035l5.657-5.657C34.183 6.053 29.328 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.848 1.154 7.965 3.035l5.657-5.657C34.183 6.053 29.328 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.225 0 10.036-1.999 13.438-5.252l-6.19-5.238C29.174 35.098 26.715 36 24 36c-5.212 0-9.617-3.329-11.284-7.946l-6.522 5.025C9.505 39.556 16.676 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.055 5.51l.003-.002 6.19 5.238C36.999 39.092 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
            {googleLoading ? 'Abrindo Google...' : 'Continuar com Google'}
          </span>
        </button>

        <div className="mt-6">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setShowSignUpConfirm(false);
              setShowEmailConfirmation(false);
              setEmail('');
              setPassword('');
              setUsername('');
              setCpf('');
              setCpfConfirmation('');
              setCpfConfirmationTouched(false);
              setBirthDate('');
              setSignUpStep(1);
            }}
            className="w-full text-center text-sm text-blue-700 hover:text-blue-900 transition font-medium"
          >
            {isSignUp ? 'Já tem uma conta? Faça login' : 'Não tem conta? Crie uma'}
          </button>
        </div>

      </div>

      {showSignUpConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 text-center">Confirme seus dados</h3>
            <p className="mt-2 text-sm text-slate-600 text-center">
              Confira antes de concluir. Após salvar, somente o admin poderá alterar CPF e data de nascimento.
            </p>

            <div className="mt-4 space-y-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
              <p><span className="font-semibold">CPF:</span> {cpf}</p>
              <p><span className="font-semibold">Data de nascimento:</span> {birthDate}</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowSignUpConfirm(false)}
                disabled={loading}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSignUp}
                disabled={loading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Criando...' : 'Confirmar dados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmailConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">Conta criada com sucesso</h3>
            <p className="mt-2 text-sm text-slate-600">Verifique seu email para confirmar o cadastro.</p>
            <button
              type="button"
              onClick={() => setShowEmailConfirmation(false)}
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageContent />
    </Suspense>
  );
}
