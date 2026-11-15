"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { SignOutButton } from "../components/sign-out-button";

type KnowledgeBase = { id: string; name: string };

export default function KnowledgeBaseListPage() {
  const router = useRouter();
  const [kbs, setKbs] = useState<KnowledgeBase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/kbs").then(async (response) => {
      if (response.status === 401) return router.replace("/login");
      const body = (await response.json()) as { knowledgeBases: KnowledgeBase[] };
      setKbs(body.knowledgeBases);
    });
  }, [router]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name")).trim();
    const response = await fetch("/api/kbs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not create the knowledge base");
      return;
    }
    const kb = (await response.json()) as KnowledgeBase;
    router.push(`/kbs/${kb.id}`);
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your knowledge bases</h1>
        <SignOutButton />
      </header>

      <form onSubmit={onCreate} className="flex gap-2">
        <input name="name" required maxLength={120} placeholder="New knowledge base name" className="flex-1 rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">Create</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {kbs === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : kbs.length === 0 ? (
        <p className="text-slate-500">No knowledge bases yet. Create one above.</p>
      ) : (
        <ul className="divide-y rounded-lg bg-white shadow-sm">
          {kbs.map((kb) => (
            <li key={kb.id} className="px-4 py-3">
              <Link href={`/kbs/${kb.id}`} className="font-medium underline">{kb.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
