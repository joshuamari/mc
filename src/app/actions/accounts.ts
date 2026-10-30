"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ASSET_ACCOUNT_KINDS, isIsoDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { MoneyParseError, pesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(ASSET_ACCOUNT_KINDS),
  openingBalance: z.string().trim().min(1).max(20),
  occurredOn: z.string().trim(),
  idempotencyKey: z.uuid(),
});

const DATABASE_MESSAGES = new Set([
  "Sign in is required.",
  "Enter an account name of 80 characters or fewer.",
  "Choose cash, bank, savings, emergency, or investment.",
  "Enter an opening balance.",
  "Enter the date this balance was true.",
  "Missing idempotency key.",
]);

export type CreateAccountState = { error: string } | { savedId: string } | null;

export async function createAccount(
  _state: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  const parsed = createAccountSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    openingBalance: formData.get("openingBalance"),
    occurredOn: formData.get("occurredOn"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success || !isIsoDate(parsed.data.occurredOn)) {
    return {
      error: "Enter a name, a type, a peso amount, and a real date.",
    };
  }

  let openingBalanceCentavos: bigint;
  try {
    openingBalanceCentavos = pesosToCentavos(parsed.data.openingBalance);
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return { error: error.message };
    }
    throw error;
  }

  const user = await getCurrentUser();
  const supabase = await createClient();
  const existing = await supabase
    .from("accounts")
    .select("name")
    .eq("user_id", user.id)
    .is("archived_at", null);
  if (existing.error) {
    return { error: "The account could not be saved." };
  }
  const nameTaken = (existing.data ?? []).some(
    (account: { name: string }) =>
      account.name.trim().toLowerCase() === parsed.data.name.toLowerCase(),
  );
  if (nameTaken) {
    return {
      error: `${parsed.data.name} is already a balance. Add or remove money on Transactions.`,
    };
  }

  const { data, error } = await supabase.rpc("create_asset_account", {
    account_name: parsed.data.name,
    account_kind: parsed.data.kind,
    opening_balance_centavos: openingBalanceCentavos.toString(),
    occurred_on: parsed.data.occurredOn,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return { error: accountErrorMessage(error.message, error.code) };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The account could not be saved." };
  }

  revalidatePath("/accounts");
  return { savedId: data };
}

const ARCHIVE_MESSAGES = [
  "Sign in is required.",
  "Choose a balance.",
  "This balance is used by a goal.",
  "This balance has other activity.",
] as const;

export type ArchiveAccountState = { error: string } | { savedId: string } | null;

export async function archiveAccount(
  _state: ArchiveAccountState,
  formData: FormData,
): Promise<ArchiveAccountState> {
  await getCurrentUser();

  const parsed = z.uuid().safeParse(formData.get("accountId"));
  if (!parsed.success) {
    return { error: "Choose a balance." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_asset_account", {
    p_account_id: parsed.data,
  });

  if (error) {
    return { error: archiveErrorMessage(error.message, error.code) };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The balance could not be removed." };
  }

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/transactions");
  revalidatePath("/savings");
  return { savedId: data };
}

function archiveErrorMessage(message: string, code: string | undefined): string {
  const known = ARCHIVE_MESSAGES.find((item) => message.includes(item));
  if (known) {
    return known;
  }
  if (
    code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("archive_asset_account")
  ) {
    return "Apply supabase/migrations/20261027060000_archive_account.sql in the Supabase SQL editor, then try again.";
  }
  return "The balance could not be removed.";
}

function accountErrorMessage(message: string, code: string | undefined): string {
  if (DATABASE_MESSAGES.has(message)) {
    return message;
  }
  if (
    code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("create_asset_account")
  ) {
    return "Apply supabase/migrations/20261026010000_accounts.sql in the Supabase SQL editor, then try again.";
  }
  return "The account could not be saved.";
}
