import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">CursorTraining2.0</p>
        <h1 className="text-3xl font-semibold tracking-tight">MannyCat</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          A personal budget and cash-flow tracker for variable pay, two monthly
          cutoffs, and credit-card spending.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in
        </Link>
        <Link
          href="/setup"
          className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Setup
        </Link>
      </div>
    </main>
  );
}
