import Link from "next/link";

export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16">
      <p className="text-sm text-zinc-500">CursorTraining2.0</p>
      <h1 className="text-2xl font-semibold tracking-tight">Connect Supabase later</h1>
      <p className="text-zinc-700 dark:text-zinc-300">
        This copy of MannyCat does not call Supabase until you add keys. The
        full steps, including the migration file and the two-user access check,
        are in the project README.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        <li>Create a Free project and do not add a payment method.</li>
        <li>Copy the project URL and anon key into <code>.env.local</code>.</li>
        <li>
          Run <code>supabase/migrations/20261026000000_foundation.sql</code>.
        </li>
        <li>Create your user, then turn off public signup.</li>
      </ol>
      <Link href="/" className="text-sm underline">
        Back to home
      </Link>
    </main>
  );
}
