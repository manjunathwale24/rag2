"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import { SignOutButton } from "../../components/sign-out-button";
import { buildUploadPathname, MULTIPART_THRESHOLD_BYTES } from "../../../src/lib/upload-path";

type Document = { id: string; filename: string; status: "pending" | "indexed" | "failed"; error: string | null };
type Source = { filename: string; headingPath: string; score: number; text: string };

const ACCEPTED_FILES = ".pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg";

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export default function KnowledgeBasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  const refreshDocuments = useCallback(async () => {
    const response = await fetch(`/api/kbs/${id}/documents`);
    if (response.status === 401) return router.replace("/login");
    if (!response.ok) return setError(await errorMessage(response, "Knowledge base not found"));
    const body = (await response.json()) as { documents: Document[] };
    setDocuments(body.documents);
  }, [id, router]);

  // Loads on first render. Later refreshes call refreshDocuments after each action.
  useEffect(() => {
    fetch(`/api/kbs/${id}/documents`).then(async (response) => {
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) return setError(await errorMessage(response, "Knowledge base not found"));
      const body = (await response.json()) as { documents: Document[] };
      setDocuments(body.documents);
    });
  }, [id, router]);

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    setStatus(`Uploading ${file.name}…`);
    try {
      // Step 1: send the file straight to Blob. The server only hands out a short-lived upload permission.
      const pathname = buildUploadPathname(id, file.name, crypto.randomUUID());
      await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({ kbId: id }),
        multipart: file.size > MULTIPART_THRESHOLD_BYTES,
      });
      // Step 2: tell our database the file exists so it can be indexed.
      const response = await fetch(`/api/kbs/${id}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathname }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Could not register the document"));
      setStatus(`Uploaded ${file.name}. Press Sync to index it.`);
      await refreshDocuments();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    setBusy(true);
    setError(null);
    setStatus("Syncing…");
    const response = await fetch(`/api/kbs/${id}/sync`, { method: "POST" });
    setBusy(false);
    if (!response.ok) return setError(await errorMessage(response, "Sync failed"));
    const body = (await response.json()) as { remaining: number };
    setStatus(
      body.remaining > 0
        ? `${body.remaining} chunks still to index. Press Sync again to continue.`
        : "Everything is indexed.",
    );
    await refreshDocuments();
  }

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/kbs/${id}/retrieve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setBusy(false);
    if (!response.ok) return setError(await errorMessage(response, "Could not get an answer"));
    const body = (await response.json()) as { answer: string; sources: Source[] };
    setAnswer(body.answer);
    setSources(body.sources);
  }

  return (
    <section className="space-y-8">
      <header className="flex items-center justify-between">
        <Link href="/kbs" className="text-sm underline">← All knowledge bases</Link>
        <SignOutButton />
      </header>

      <div className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Documents</h1>
        <input type="file" accept={ACCEPTED_FILES} disabled={busy} onChange={onFileChosen} aria-label="Choose a file to upload" />
        <p className="text-xs text-slate-500">PDF, DOCX, Markdown, text or image. Up to 25 MB each.</p>

        {documents === null ? (
          <p className="text-slate-500">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="text-slate-500">No documents yet.</p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id} className="flex justify-between py-2 text-sm">
                <span>{doc.filename}</span>
                <span className={doc.status === "failed" ? "text-red-600" : "text-slate-500"}>
                  {doc.status}{doc.error ? `: ${doc.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={onSync} disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          Sync
        </button>
      </div>

      <form onSubmit={onAsk} className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Ask a question</h2>
        <div className="flex gap-2">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} required placeholder="What does the document say about…?" className="flex-1 rounded border px-3 py-2" />
          <button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Ask</button>
        </div>
        {answer !== null && (
          <div className="space-y-3">
            <p aria-label="Answer" className="whitespace-pre-wrap">{answer}</p>
            {sources.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-slate-600">Sources ({sources.length})</summary>
                <ul className="mt-2 space-y-2 text-sm">
                  {sources.map((source, index) => (
                    <li key={index} className="rounded bg-slate-50 p-2">
                      <p className="font-medium">{source.filename}{source.headingPath ? ` · ${source.headingPath}` : ""}</p>
                      <p className="text-slate-600">{source.text}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </form>

      {status && <p className="text-sm text-slate-600" role="status">{status}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
