"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});

export type SignInState = { error: string } | null;

export async function signIn(
  _state: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!hasSupabaseEnv()) {
    redirect("/setup");
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      error: "Enter a valid email and a password of at least 8 characters.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "This email is not confirmed yet. In the Supabase SQL editor, confirm the user, then try again.",
      };
    }
    if (error.code === "invalid_credentials") {
      return {
        error:
          "Supabase does not have this email and password on project hrfcqzbrovfrjcimnsti. Check Authentication → Users in that project.",
      };
    }
    if (error.message === "fetch failed") {
      return {
        error:
          "The app could not open a connection to Supabase. Start it with npm run dev so this computer's network certificate is trusted.",
      };
    }
    return {
      error: "Sign-in did not reach a valid session. Supabase said: " + error.message,
    };
  }

  redirect("/dashboard");
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
