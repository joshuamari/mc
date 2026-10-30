"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isIsoDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { MoneyParseError, pesosToCentavos } from "@/lib/money";
import {
  CONTRIBUTION_OWNERS,
  GOAL_DIRECTIONS,
  GOAL_KINDS,
  SavingsError,
} from "@/lib/savings";
import { createClient } from "@/lib/supabase/server";

const GOAL_MESSAGES = [
  "Sign in is required.",
  "Enter a goal name of 80 characters or fewer.",
  "Choose a goal type.",
  "Enter a target of zero or more.",
  "Choose the balance this goal uses.",
  "Link an emergency fund balance.",
  "Link a savings balance.",
  "Link an investment balance.",
  "Link a savings, emergency, or investment balance.",
  "A goal with this name already exists.",
] as const;

const ENTRY_MESSAGES = [
  "Sign in is required.",
  "Choose put in or took out.",
  "Choose whose money this is.",
  "Enter an amount greater than zero.",
  "Enter the date this happened.",
  "Missing idempotency key.",
  "A partner amount has no goal.",
  "Choose a goal.",
] as const;

export type CreateGoalState = { error: string } | { savedId: string } | null;
export type RecordSavingsEntryState = { error: string } | { savedId: string } | null;

export async function createSavingsGoal(
  _state: CreateGoalState,
  formData: FormData,
): Promise<CreateGoalState> {
  await getCurrentUser();

  const name = formData.get("name");
  const kind = formData.get("kind");
  const target = formData.get("target");
  const targetDateRaw = formData.get("targetDate");
  const linkedAccountId = formData.get("linkedAccountId");
  const targetDate =
    typeof targetDateRaw === "string" && targetDateRaw.trim() !== ""
      ? targetDateRaw.trim()
      : null;
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      kind: z.enum(GOAL_KINDS),
      target: z.string().trim().min(1).max(20),
      linkedAccountId: z.uuid(),
    })
    .safeParse({ name, kind, target, linkedAccountId });

  if (!parsed.success || (targetDate !== null && !isIsoDate(targetDate))) {
    return { error: "Enter a name, a type, a target, and the balance this goal uses." };
  }

  let targetCentavos: bigint;
  try {
    targetCentavos = pesosToCentavos(parsed.data.target);
    if (targetCentavos < 0n) {
      throw new SavingsError("Enter a target of zero or more.");
    }
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof SavingsError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_savings_goal", {
    p_name: parsed.data.name,
    p_kind: parsed.data.kind,
    p_target_centavos: targetCentavos.toString(),
    p_target_date: targetDate,
    p_linked_account_id: parsed.data.linkedAccountId,
  });

  if (error) {
    return {
      error: savingsErrorMessage(
        error.message,
        error.code,
        "create_savings_goal",
        GOAL_MESSAGES,
        "20261027050000_savings.sql",
        "The goal could not be saved.",
      ),
    };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The goal could not be saved." };
  }

  revalidatePath("/savings");
  return { savedId: data };
}

export async function recordSavingsEntry(
  _state: RecordSavingsEntryState,
  formData: FormData,
): Promise<RecordSavingsEntryState> {
  await getCurrentUser();

  const owner = formData.get("owner");
  const goalRaw = formData.get("goalId");
  const goalId = owner === "self" && typeof goalRaw === "string" && goalRaw.length > 0 ? goalRaw : undefined;
  const parsed = z
    .object({
      direction: z.enum(GOAL_DIRECTIONS),
      owner: z.enum(CONTRIBUTION_OWNERS),
      goalId: z.uuid().optional(),
      amount: z.string().trim().min(1).max(20),
      occurredOn: z.string().trim(),
      idempotencyKey: z.uuid(),
    })
    .safeParse({
      direction: formData.get("direction"),
      owner,
      goalId,
      amount: formData.get("amount"),
      occurredOn: formData.get("occurredOn"),
      idempotencyKey: formData.get("idempotencyKey"),
    });

  if (!parsed.success || !isIsoDate(parsed.data.occurredOn)) {
    return { error: "Enter whose money it is, an amount, and a real date." };
  }
  if (parsed.data.owner === "self" && !parsed.data.goalId) {
    return { error: "Choose a goal." };
  }
  if (parsed.data.owner === "partner" && parsed.data.goalId) {
    return { error: "A partner amount has no goal." };
  }

  let amountCentavos: bigint;
  try {
    amountCentavos = pesosToCentavos(parsed.data.amount);
    if (amountCentavos <= 0n) {
      throw new SavingsError("Enter an amount greater than zero.");
    }
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof SavingsError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_savings_entry", {
    p_direction: parsed.data.direction,
    p_owner: parsed.data.owner,
    p_goal_id: parsed.data.owner === "partner" ? null : parsed.data.goalId,
    p_amount_centavos: amountCentavos.toString(),
    p_occurred_on: parsed.data.occurredOn,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return {
      error: savingsErrorMessage(
        error.message,
        error.code,
        "record_savings_entry",
        ENTRY_MESSAGES,
        "20261027070000_savings_entries.sql",
        "The savings record could not be saved.",
      ),
    };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The savings record could not be saved." };
  }

  revalidatePath("/savings");
  revalidatePath("/dashboard");
  return { savedId: data };
}

function savingsErrorMessage(
  message: string,
  code: string | undefined,
  functionName: string,
  knownMessages: readonly string[],
  migrationFile: string,
  fallback: string,
): string {
  const known = knownMessages.find((item) => message.includes(item));
  if (known) {
    return known;
  }
  if (
    code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes(functionName)
  ) {
    return `Apply supabase/migrations/${migrationFile} in the Supabase SQL editor, then try again.`;
  }
  return fallback;
}
