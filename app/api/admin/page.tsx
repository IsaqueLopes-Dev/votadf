'use client';

import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [data, setData] = useState('');

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.text())
      .then((text) => setData(text));
  }, []);

  return (
    <div>
      <h1>Admin</h1>
      <p>API retornou: {data}</p>
    </div>
  );
}
