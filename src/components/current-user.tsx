import { signOut } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export async function CurrentUser() {
  const user = await getCurrentUser();

  return (
    <form action={signOut} className="flex items-center gap-3">
      <span className="max-w-48 truncate text-sm text-zinc-600 dark:text-zinc-400">
        {user.email}
      </span>
      <button
        type="submit"
        className="h-10 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
      >
        Sign out
      </button>
    </form>
  );
}
