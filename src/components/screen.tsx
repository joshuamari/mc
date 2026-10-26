export function Screen({
  title,
  phase,
  summary,
}: {
  title: string;
  phase: string;
  summary: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">{summary}</p>
      <p className="text-sm text-zinc-500">{phase} has not been built yet.</p>
    </section>
  );
}
