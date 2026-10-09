import { supabase } from './supabaseClient';

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Forkert e-mail eller adgangskode.',
  'User already registered': 'Der findes allerede en konto med den e-mail. Log ind i stedet.',
  'Signups not allowed for this instance': 'Oprettelse af nye konti er slået fra.',
  'Email not confirmed': 'E-mailen er ikke bekræftet. Slå "Confirm email" fra i Supabase.',
};

function danish(message: string): string {
  return MESSAGES[message] ?? message;
}

/** Signs in with email and password. Returns an error message or null. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? danish(error.message) : null;
}

/** Creates the account and signs in (requires "Confirm email" to be off in Supabase). */
export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return danish(error.message);
  if (!data.session) return 'Kontoen er oprettet, men ikke logget ind. Slå "Confirm email" fra i Supabase og log ind igen.';
  return null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Calls cb immediately with the current user's email (or null) and on every change. */
export function onAuthChange(cb: (email: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user.email ?? null));
  return () => data.subscription.unsubscribe();
}
