"use client";

import { useActionState } from "react";

import { archiveAccount, type ArchiveAccountState } from "@/app/actions/accounts";

export function RemoveBalanceButton({
  accountId,
  name,
}: {
  accountId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ArchiveAccountState, FormData>(
    archiveAccount,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="accountId" value={accountId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (!window.confirm(`Remove ${name}?`)) {
            event.preventDefault();
          }
        }}
        className="text-sm text-zinc-500 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="max-w-48 text-right text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
