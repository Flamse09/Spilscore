import { supabase } from './supabaseClient';

/** Sends a 6-digit code by email. Returns an error message or null. */
export async function sendCode(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? error.message : null;
}

export async function verifyCode(email: string, token: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Calls cb immediately with the current user's email (or null) and on every change. */
export function onAuthChange(cb: (email: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user.email ?? null));
  return () => data.subscription.unsubscribe();
}
