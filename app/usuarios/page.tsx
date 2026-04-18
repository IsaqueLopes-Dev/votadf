'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyUsuariosPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/home');
    }, 1200);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#111',
      }}
    >
      <img
        src="/logo.png"
        alt="Logo VP"
        style={{
          width: 80,
          height: 80,
          marginBottom: 24,
          borderRadius: 16,
          background: '#fff',
        }}
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
  );
}
