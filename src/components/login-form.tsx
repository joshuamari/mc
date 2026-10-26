"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/app/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 rounded-md border border-zinc-300 bg-transparent px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:focus-visible:border-zinc-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="h-11 rounded-md border border-zinc-300 bg-transparent px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:focus-visible:border-zinc-100"
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
