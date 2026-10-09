import { useEffect, useState } from 'preact/hooks';
import { onAuthChange, signIn, signOut, signUp } from '../sync/auth';

const MIN_PASSWORD = 6;

export function LoginForm() {
  const [user, setUser] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const ready = email.includes('@') && password.length >= MIN_PASSWORD;

  async function run(action: (email: string, password: string) => Promise<string | null>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await action(email, password));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      class="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) run(signIn);
      }}
    >
      <p class="muted" style="margin:0">Log ind for at gemme dine spil i skyen. Appen virker også uden.</p>
      <input type="email" name="email" autoComplete="username" placeholder="Din e-mail" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder={`Adgangskode (mindst ${MIN_PASSWORD} tegn)`}
        value={password}
        onInput={(e) => setPassword(e.currentTarget.value)}
      />
      <button type="submit" class="primary" disabled={busy || !ready}>Log ind</button>
      <button type="button" disabled={busy || !ready} onClick={() => run(signUp)}>Opret konto</button>
      {msg && <p class="warn" style="margin:0">{msg}</p>}
    </form>
  );
}
