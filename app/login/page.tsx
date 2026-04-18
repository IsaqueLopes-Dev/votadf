"use client";

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../utils/supabaseClient';

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [cpfConfirmation, setCpfConfirmation] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      const next = searchParams?.get('next') || '/home';
      router.push(next);
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }
    if (!username.startsWith('@')) {
      setError('O nome de usuário deve começar com @');
      setLoading(false);
      return;
    }
    try {
      // Verifica se já existe usuário com o mesmo e-mail
      let { data: userEmail, error: emailError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (userEmail) {
        setError('Já existe um usuário com este e-mail.');
        setLoading(false);
        return;
      }
      // Verifica se já existe usuário com o mesmo nome de usuário
      let { data: userName, error: userNameError } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (userName) {
        setError('Já existe um usuário com este nome de usuário.');
        setLoading(false);
        return;
      }
      // Cria o usuário no auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // Cria o usuário na tabela users
      await supabase.from('users').insert([
        {
          email,
          username,
          cpf,
          birth_date: birthDate,
        },
      ]);
      setIsSignUp(false);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setUsername('');
      setCpf('');
      setBirthDate('');
      alert('Cadastro realizado! Verifique seu e-mail.');
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (googleError) setError(googleError.message);
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ ...styles.logo, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <img
            src="/logo.png"
            alt="Logo VP"
            style={{ height: 44, width: 44, objectFit: 'contain', marginBottom: 2 }}
          />
          <span style={{ color: '#00c3ff', fontWeight: 700, fontSize: 22, fontFamily: 'Poppins, Segoe UI, Arial, sans-serif', letterSpacing: 0 }}>Votaai</span>
          <span style={{ color: '#9ca3af', fontWeight: 500, fontSize: 13, fontFamily: 'Poppins, Segoe UI, Arial, sans-serif', marginTop: -6 }}>Previsão</span>
        </div>
        <div style={styles.subtitle}>
          Antecipe resultados. Tome decisões com confiança.
        </div>
        <h2 style={styles.title}>{isSignUp ? 'Criar conta' : 'Acesse sua conta para continuar'}</h2>
            {error && (
              <div style={{ color: '#f87171', background: '#2a1515', borderRadius: 10, padding: 10, marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}
        <form style={styles.form} onSubmit={isSignUp ? handleSignUp : handleLogin} autoComplete="on">
          {isSignUp && (
            <>
              {/* Label removido conforme solicitado */}
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{
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
                }}>@</span>
                <input
                  id="username-input"
                  type="text"
                  placeholder="nome de usuário"
                  style={{ ...styles.input, paddingLeft: 44 }}
                  value={username.replace(/^@+/, '')}
                  onChange={e => {
                    // Sempre mantém o valor sem o @, mas adiciona ao salvar
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
                onChange={e => setCpf(e.target.value)}
                autoComplete="off"
                required
                disabled={loading}
                maxLength={14}
              />
              {/* Campo 'Confirme o CPF' removido conforme solicitado */}
              <input
                type="date"
                placeholder="Data de nascimento"
                style={styles.input}
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
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
            onChange={e => setEmail(e.target.value)}
            autoComplete="username"
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Senha"
            style={styles.input}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            disabled={loading}
          />
          {isSignUp && (
            <input
              type="password"
              placeholder="Confirme a senha"
              style={styles.input}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={loading}
            />
          )}
          <button style={styles.loginButton} type="submit" disabled={loading}>
            {loading ? (isSignUp ? 'Criando...' : 'Entrar') : (isSignUp ? 'Criar conta' : 'Entrar')}
          </button>
          <button
            type="button"
            style={styles.googleButton}
            onClick={handleGoogle}
            disabled={loading}
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png"
              style={{ width: 18 }}
              alt="Google"
            />
            {isSignUp ? 'Cadastrar com Google' : 'Entrar com Google'}
          </button>
        </form>
        <div style={{ ...styles.link, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          {isSignUp ? (
            <>
              <span style={{ color: '#9ca3af' }}>Já tem conta?</span>
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
                onFocus={e => (e.currentTarget.style.color = '#0099cc')}
                onBlur={e => (e.currentTarget.style.color = '#00c3ff')}
                onMouseOver={e => (e.currentTarget.style.color = '#0099cc')}
                onMouseOut={e => (e.currentTarget.style.color = '#00c3ff')}
                tabIndex={0}
              >
                Fazer login
              </button>
            </>
          ) : (
            <>
              <span style={{ color: '#9ca3af' }}>Não tem conta?</span>
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
                onFocus={e => (e.currentTarget.style.color = '#0099cc')}
                onBlur={e => (e.currentTarget.style.color = '#00c3ff')}
                onMouseOver={e => (e.currentTarget.style.color = '#0099cc')}
                onMouseOut={e => (e.currentTarget.style.color = '#00c3ff')}
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
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111111",
    backgroundImage:
      "linear-gradient(32deg, rgba(8,8,8,0.74) 30px, transparent)",
    backgroundSize: "60px 60px",
    backgroundPosition: "-5px -5px",
    fontFamily: "Inter, Segoe UI, Arial, sans-serif",
  },
  card: {
    width: 360,
    padding: 35,
    borderRadius: 18,
    background: "rgba(17,17,17,0.85)",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,0.05)",
    boxShadow: "0 15px 40px rgba(0,0,0,0.7)",
    color: "white",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  logo: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 4,
    color: "#00c3ff",
  },
  subtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 25,
    textAlign: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: 500,
    marginBottom: 20,
    color: "#e5e7eb",
  },
  form: {
    width: "100%",
    maxWidth: 280,
    display: "flex",
    flexDirection: "column",
  },
  input: {
    width: "100%",
    padding: 12,
    marginBottom: 14,
    borderRadius: 10,
    border: "1px solid #2a2a2a",
    background: "#1a1a1a",
    color: "white",
    outline: "none",
  },
  loginButton: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    background: "linear-gradient(135deg, #00c3ff, #0099cc)",
    color: "#000",
    marginTop: 5,
  },
  googleButton: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    background: "#fff",
    color: "#111",
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  link: {
    marginTop: 14,
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },
};
