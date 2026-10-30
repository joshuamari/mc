"use client";

import { useActionState, useEffect, useRef } from "react";

import { exportBackup, type ExportBackupState } from "@/app/actions/backup";

export function BackupForm() {
  const [state, formAction, pending] = useActionState<ExportBackupState, FormData>(
    exportBackup,
    null,
  );
  const downloaded = useRef<string | null>(null);
  const file = state && "json" in state ? state : null;

  useEffect(() => {
    if (!file || downloaded.current === file.json) {
      return;
    }
    downloaded.current = file.json;
    const url = URL.createObjectURL(new Blob([file.json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [file]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Backup</h2>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {file ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Backup downloaded.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Preparing…" : "Download backup"}
      </button>
    </form>
  );
}
