import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default function LoginPage() {
  const configured = hasSupabaseEnv();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">CursorTraining2.0</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          MannyCat is limited to the account you create in Supabase. Public
          signup stays off.
        </p>
      </div>
      {configured ? (
        <LoginForm />
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Supabase is not configured yet. Follow the{" "}
          <Link href="/setup" className="underline">
            setup steps
          </Link>{" "}
          before signing in.
        </p>
      )}
    </main>
  );
}
