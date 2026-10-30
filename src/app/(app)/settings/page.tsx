import { BackupForm } from "@/components/backup-form";

export default function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Download a JSON backup of this account. Amounts in the file are
          centavos. The app timezone is Asia/Manila.
        </p>
      </div>
      <BackupForm />
      <div className="flex max-w-2xl flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Restore
        </h2>
        <p>Keep the file somewhere you control. It is the copy of your accounts, transactions, plans, cards, and goals.</p>
        <p>
          The download leaves the database as it is. To read the numbers again, open the file. A paused
          Supabase project is restored from the Supabase dashboard. The free plan pauses after 7 days
          without use and has no automatic database backups.
        </p>
      </div>
    </section>
  );
}
