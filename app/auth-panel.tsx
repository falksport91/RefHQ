"use client";

import { FormEvent, useEffect, useState } from "react";
import { auth, type Law18Session } from "./auth-client";
import { TurnstileChallenge, turnstileEnabled } from "./turnstile";

type AuthPanelProps = {
  onSession: (session: Law18Session) => void;
  recovery?: boolean;
  initialMessage?: string;
};

export function AuthPanel({ onSession, recovery = false, initialMessage = "" }: AuthPanelProps) {
  const [joinToken, setJoinToken] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "recovery">(recovery ? "recovery" : "login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const captchaRequired = turnstileEnabled() && mode !== "recovery";

  function refreshChallenge() {
    setCaptchaToken("");
    setCaptchaAttempt((attempt) => attempt + 1);
  }

  // Recovery is an external authentication state transition.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMode(recovery ? "recovery" : "login"), [recovery]);
  useEffect(() => {
    if (initialMessage) setMessage(initialMessage);
  }, [initialMessage]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("join") || localStorage.getItem("law18ref-join-token") || "";
    if (token) localStorage.setItem("law18ref-join-token", token);
    // Join context is sourced from the browser after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinToken(token);
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (captchaRequired && !captchaToken) return;
    setBusy(true);
    setMessage("");
    try {
      onSession(await auth.signIn(email, password, captchaToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      refreshChallenge();
      setBusy(false);
    }
  }

  function signInWithGoogle() {
    setBusy(true);
    setMessage("");
    try {
      auth.signInWithGoogle();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start Google sign-in.");
      setBusy(false);
    }
  }

  async function sendRecovery() {
    if (!email) return setMessage("Enter your email address first.");
    if (captchaRequired && !captchaToken) return setMessage("Please complete the security verification first.");
    setBusy(true);
    setMessage("");
    try {
      await auth.sendRecovery(email, captchaToken);
      setMessage("Password setup email sent. Check your inbox.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the email.");
    } finally {
      refreshChallenge();
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (password !== confirmPassword) return setMessage("The passwords do not match.");
    setBusy(true);
    setMessage("");
    try {
      const { session } = auth.initialize();
      if (!session) throw new Error("This password link has expired. Request a new one.");
      onSession(await auth.updatePassword(await auth.ensureValidSession(session), password));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save your password.");
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (captchaRequired && !captchaToken) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await auth.signUp(email, password, fullName, captchaToken);
      if (result.access_token) onSession(result);
      else setMessage("Your account was created. Sign in to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the account.");
    } finally {
      refreshChallenge();
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <span className="auth-logo-lockup"><img src="/logo-draft-law18referee-management-v4.png" alt="Law18Referee Management" /></span>
      </section>
      <section className="auth-card">
        <p className="eyebrow">{joinToken ? "JOIN GROUP INVITATION" : "WELCOME TO LAW18REFEREE MANAGEMENT"}</p>
        <h1>{mode === "recovery" ? "Create your password" : mode === "signup" ? "Create referee account" : "Sign in"}</h1>
        <p className="auth-intro">
          {mode === "recovery"
            ? "Choose a secure password to finish setting up your account."
            : mode === "signup"
              ? joinToken ? "Create your account to join the group connected to this invitation." : "Use the same email address your assignor imported from Assignr."
              : joinToken ? "Sign in to join the group connected to this invitation." : "Access tournament check-in, schedules, coaching, and ratings."}
        </p>
        {mode !== "recovery" && <>
          <button className="google-auth" type="button" disabled={busy} onClick={signInWithGoogle}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.64.39 3.19 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>
            Continue with Google
          </button>
          <div className="auth-divider"><span>or use email</span></div>
        </>}
        <form autoComplete={mode === "login" ? "on" : "off"} onSubmit={mode === "recovery" ? updatePassword : mode === "signup" ? createAccount : signIn}>
          {mode === "signup" && <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required /></label>}
          {mode !== "recovery" && (
            <label>Email address<input type="email" name={mode === "login" ? "username" : "law18ref-new-account-email"} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={mode === "login" ? "username" : "off"} required /></label>
          )}
          <label>{mode === "recovery" ? "New password" : "Password"}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "recovery" ? "new-password" : "current-password"} minLength={8} required /></label>
          {mode === "recovery" && (
            <label>Confirm new password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
          )}
          {mode !== "recovery" && <TurnstileChallenge key={`${mode}-${captchaAttempt}`} action={mode === "signup" ? "signup" : "login"} onToken={setCaptchaToken} />}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary wide" disabled={busy || (captchaRequired && !captchaToken)}>{busy ? "Please wait…" : mode === "recovery" ? "Save password" : mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        {mode === "login" && <>
          <button className="auth-link" onClick={() => { refreshChallenge(); setMode("signup"); }} disabled={busy}>New referee? Create an account</button>
          <button className="auth-link compact-link" onClick={sendRecovery} disabled={busy || (captchaRequired && !captchaToken)}>Set or reset your password</button>
        </>}
        {mode === "signup" && <button className="auth-link" onClick={() => { refreshChallenge(); setMode("login"); }} disabled={busy}>Already have an account? Sign in</button>}
      </section>
    </main>
  );
}
