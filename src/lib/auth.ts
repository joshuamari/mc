import "server-only";

import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
};

export async function getCurrentUser(): Promise<CurrentUser> {
  // Supabase compares the access token expiry to the current time. A private
  // cache runs that check per request, outside the prerendered shell.
  "use cache: private";

  if (!hasSupabaseEnv()) {
    redirect("/setup");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/login");
  }

  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
}
