"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <button type="button" onClick={signOut} className="text-sm text-slate-600 underline">
      Sign out
    </button>
  );
}
