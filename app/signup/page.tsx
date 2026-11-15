"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Turnstile } from "../components/turnstile";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email")),
        password: String(form.get("password")),
        captchaToken,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not create the account");
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
      return;
    }
    router.push("/kbs");
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded border px-3 py-2" />
          <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>
        </label>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={pending || !captchaToken} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-slate-600">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </section>
  );
}
