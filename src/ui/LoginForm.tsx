import { useEffect, useState } from 'preact/hooks';
import { onAuthChange, sendCode, signOut, verifyCode } from '../sync/auth';

export function LoginForm() {
  const [user, setUser] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthChange(setUser), []);

  if (user) {
    return (
      <div class="card stack">
        <div>Logget ind som <strong>{user}</strong>. Dine spil synkroniseres til skyen.</div>
        <button onClick={() => signOut()}>Log ud</button>
      </div>
    );
  }

  return (
    <div class="card stack">
      <p class="muted" style="margin:0">Log ind for at gemme dine spil i skyen. Appen virker også uden.</p>
      <input type="email" autoComplete="email" placeholder="Din e-mail" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
      {!sent ? (
        <button
          class="primary"
          disabled={busy || !email.includes('@')}
          onClick={async () => {
            setBusy(true);
            try {
              const err = await sendCode(email);
              setMsg(err ?? 'Koden er sendt. Tjek din mail.');
              if (!err) setSent(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send kode
        </button>
      ) : (
        <>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="Kode fra mailen" value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          <button
            class="primary"
            disabled={busy || code.trim().length < 6}
            onClick={async () => {
              setBusy(true);
              try {
                setMsg(await verifyCode(email, code));
              } finally {
                setBusy(false);
              }
            }}
          >
            Log ind
          </button>
          <button onClick={() => { setSent(false); setCode(''); setMsg(null); }}>Send ny kode</button>
        </>
      )}
      {msg && <p class="muted" style="margin:0">{msg}</p>}
    </div>
  );
}
