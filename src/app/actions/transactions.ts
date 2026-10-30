"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isIsoDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { MoneyParseError, pesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import {
  MOVEMENT_TYPES,
  MovementError,
  cashMovementPosting,
} from "@/lib/transactions";

const postMovementSchema = z.object({
  movementType: z.enum(MOVEMENT_TYPES),
  description: z.string().trim().min(1).max(120),
  amount: z.string().trim().min(1).max(20),
  occurredOn: z.string().trim(),
  fromAccountId: z.uuid().optional(),
  toAccountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  idempotencyKey: z.uuid(),
});

const DATABASE_MESSAGES = [
  "Sign in is required.",
  "Choose income, spending, or a transfer.",
  "Enter a description.",
  "Enter a description of 120 characters or fewer.",
  "Enter an amount greater than zero.",
  "Enter the date this happened.",
  "Missing idempotency key.",
  "Income lands in one balance.",
  "Choose the balance this money landed in.",
  "Choose an income category.",
  "Spending leaves one balance.",
  "Choose the balance this money left.",
  "Choose a spending category.",
  "A transfer does not use a category.",
  "Choose two different balances.",
] as const;

export type PostMovementState = { error: string } | { savedId: string } | null;

export async function postMovement(
  _state: PostMovementState,
  formData: FormData,
): Promise<PostMovementState> {
  await getCurrentUser();

  const parsed = postMovementSchema.safeParse({
    movementType: formData.get("movementType"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    fromAccountId: optionalFormText(formData, "fromAccountId"),
    toAccountId: optionalFormText(formData, "toAccountId"),
    categoryId: optionalFormText(formData, "categoryId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success || !isIsoDate(parsed.data.occurredOn)) {
    return {
      error: "Enter a description, a peso amount, a real date, and the balance.",
    };
  }

  let amountCentavos: bigint;
  try {
    amountCentavos = pesosToCentavos(parsed.data.amount);
    cashMovementPosting({
      type: parsed.data.movementType,
      amountCentavos,
      fromAccountId: parsed.data.fromAccountId,
      toAccountId: parsed.data.toAccountId,
      categoryId: parsed.data.categoryId,
    });
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof MovementError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_cash_movement", {
    movement_type: parsed.data.movementType,
    movement_description: parsed.data.description,
    p_amount_centavos: amountCentavos.toString(),
    p_occurred_on: parsed.data.occurredOn,
    p_from_account_id: parsed.data.fromAccountId ?? null,
    p_to_account_id: parsed.data.toAccountId ?? null,
    p_category_id: parsed.data.categoryId ?? null,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return { error: movementErrorMessage(error.message, error.code) };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The transaction could not be saved." };
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { savedId: data };
}

function optionalFormText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function movementErrorMessage(message: string, code: string | undefined): string {
  const known = DATABASE_MESSAGES.find((item) => message.includes(item));
  if (known) {
    return known;
  }
  if (
    code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("post_cash_movement")
  ) {
    return "Apply supabase/migrations/20261026020000_transactions.sql in the Supabase SQL editor, then try again.";
  }
  return "The transaction could not be saved.";
}
