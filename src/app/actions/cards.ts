"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isIsoDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import {
  CARD_ACTIVITIES,
  CardError,
  assertStatementDates,
  cardActivityPosting,
  isDayOfMonth,
  normalizeLast4,
  openingDebtEntry,
} from "@/lib/cards";
import { MoneyParseError, pesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const createCardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  creditLimit: z.string().trim().min(1).max(20),
  statementCloseDay: z.string().trim(),
  paymentDueDay: z.string().trim(),
  last4: z.string().trim().max(4),
  openingDebt: z.string().trim().min(1).max(20),
  occurredOn: z.string().trim(),
  idempotencyKey: z.uuid(),
});

const postActivitySchema = z.object({
  activity: z.enum(CARD_ACTIVITIES),
  description: z.string().trim().min(1).max(120),
  amount: z.string().trim().min(1).max(20),
  occurredOn: z.string().trim(),
  cardAccountId: z.uuid(),
  fromAccountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  idempotencyKey: z.uuid(),
});

const CREATE_MESSAGES = [
  "Sign in is required.",
  "Enter a card name of 80 characters or fewer.",
  "Enter a credit limit of zero or more.",
  "Choose the day the statement closes.",
  "Choose the day the payment is due.",
  "Enter the last 4 digits, or leave them blank.",
  "Enter the amount you already owe, or zero.",
  "Enter the date this debt was true.",
  "Missing idempotency key.",
  "Two cards is the limit.",
] as const;

const ACTIVITY_MESSAGES = [
  "Sign in is required.",
  "Choose a purchase or a payment.",
  "Enter a description.",
  "Enter a description of 120 characters or fewer.",
  "Enter an amount greater than zero.",
  "Enter the date this happened.",
  "Missing idempotency key.",
  "A purchase does not leave a balance.",
  "Choose a card.",
  "Choose a spending category.",
  "A payment does not use a category.",
  "Choose the card and the balance that pays it.",
] as const;

const STATEMENT_MESSAGES = [
  "Sign in is required.",
  "Choose a card.",
  "Enter the statement dates.",
  "The statement must start on or before the day it closes.",
  "Enter the statement balance.",
  "Enter a minimum due of zero or more.",
] as const;

const ACTIVITY_DB_TYPE = {
  purchase: "credit_card_purchase",
  payment: "credit_card_payment",
} as const;

export type CreateCardState = { error: string } | { savedId: string } | null;
export type PostCardActivityState = { error: string } | { savedId: string } | null;
export type SaveStatementState = { error: string } | { savedId: string } | null;

export async function createCreditCard(
  _state: CreateCardState,
  formData: FormData,
): Promise<CreateCardState> {
  await getCurrentUser();

  const parsed = createCardSchema.safeParse({
    name: formData.get("name"),
    creditLimit: formData.get("creditLimit"),
    statementCloseDay: formData.get("statementCloseDay"),
    paymentDueDay: formData.get("paymentDueDay"),
    last4: formData.get("last4") ?? "",
    openingDebt: formData.get("openingDebt"),
    occurredOn: formData.get("occurredOn"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const closeDay = Number(parsed.success ? parsed.data.statementCloseDay : "");
  const dueDay = Number(parsed.success ? parsed.data.paymentDueDay : "");
  if (!parsed.success || !isIsoDate(parsed.data.occurredOn) || !isDayOfMonth(closeDay) || !isDayOfMonth(dueDay)) {
    return { error: "Enter a name, a limit, the statement days, and a real date." };
  }

  let creditLimitCentavos: bigint;
  let openingDebtCentavos: bigint;
  let last4: string | null;
  try {
    creditLimitCentavos = pesosToCentavos(parsed.data.creditLimit);
    if (creditLimitCentavos < 0n) {
      throw new CardError("Enter a credit limit of zero or more.");
    }
    openingDebtCentavos = pesosToCentavos(parsed.data.openingDebt);
    openingDebtEntry(openingDebtCentavos);
    last4 = normalizeLast4(parsed.data.last4);
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof CardError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_credit_card", {
    card_name: parsed.data.name,
    credit_limit_centavos: creditLimitCentavos.toString(),
    statement_close_day: closeDay,
    payment_due_day: dueDay,
    card_last4: last4,
    opening_debt_centavos: openingDebtCentavos.toString(),
    occurred_on: parsed.data.occurredOn,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return {
      error: cardErrorMessage(
        error.message,
        error.code,
        "create_credit_card",
        CREATE_MESSAGES,
        "20261027030000_cards.sql",
        "The card could not be saved.",
      ),
    };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The card could not be saved." };
  }

  revalidatePath("/cards");
  return { savedId: data };
}

export async function postCardActivity(
  _state: PostCardActivityState,
  formData: FormData,
): Promise<PostCardActivityState> {
  await getCurrentUser();

  const parsed = postActivitySchema.safeParse({
    activity: formData.get("activity"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    cardAccountId: formData.get("cardAccountId"),
    fromAccountId: optionalFormText(formData, "fromAccountId"),
    categoryId: optionalFormText(formData, "categoryId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success || !isIsoDate(parsed.data.occurredOn)) {
    return { error: "Enter a description, a peso amount, a real date, and the card." };
  }

  let amountCentavos: bigint;
  try {
    amountCentavos = pesosToCentavos(parsed.data.amount);
    cardActivityPosting({
      type: parsed.data.activity,
      amountCentavos,
      cardAccountId: parsed.data.cardAccountId,
      fromAccountId: parsed.data.fromAccountId,
      categoryId: parsed.data.categoryId,
    });
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof CardError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_card_activity", {
    activity_type: ACTIVITY_DB_TYPE[parsed.data.activity],
    activity_description: parsed.data.description,
    p_amount_centavos: amountCentavos.toString(),
    p_occurred_on: parsed.data.occurredOn,
    p_card_account_id: parsed.data.cardAccountId,
    p_from_account_id: parsed.data.fromAccountId ?? null,
    p_category_id: parsed.data.categoryId ?? null,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return {
      error: cardErrorMessage(
        error.message,
        error.code,
        "post_card_activity",
        ACTIVITY_MESSAGES,
        "20261027030000_cards.sql",
        "The card activity could not be saved.",
      ),
    };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The card activity could not be saved." };
  }

  revalidatePath("/cards");
  revalidatePath("/accounts");
  revalidatePath("/budget");
  return { savedId: data };
}

export async function saveCardStatement(
  _state: SaveStatementState,
  formData: FormData,
): Promise<SaveStatementState> {
  await getCurrentUser();

  const cardAccountId = formData.get("cardAccountId");
  const periodStart = formData.get("periodStart");
  const periodEnd = formData.get("periodEnd");
  const dueOn = formData.get("dueOn");
  const statementBalance = formData.get("statementBalance");
  const minimumDue = formData.get("minimumDue");
  const parsedCard = z.uuid().safeParse(cardAccountId);
  if (
    !parsedCard.success ||
    typeof periodStart !== "string" ||
    typeof periodEnd !== "string" ||
    typeof dueOn !== "string" ||
    typeof statementBalance !== "string"
  ) {
    return { error: "Enter the statement dates." };
  }

  let statementBalanceCentavos: bigint;
  let minimumDueCentavos: bigint | null;
  try {
    assertStatementDates(periodStart.trim(), periodEnd.trim(), dueOn.trim());
    statementBalanceCentavos = pesosToCentavos(statementBalance);
    const minimumText = typeof minimumDue === "string" ? minimumDue.trim() : "";
    if (minimumText === "") {
      minimumDueCentavos = null;
    } else {
      minimumDueCentavos = pesosToCentavos(minimumText);
      if (minimumDueCentavos < 0n) {
        throw new CardError("Enter a minimum due of zero or more.");
      }
    }
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof CardError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_card_statement", {
    p_card_account_id: parsedCard.data,
    p_period_start: periodStart.trim(),
    p_period_end: periodEnd.trim(),
    p_due_on: dueOn.trim(),
    p_statement_balance_centavos: statementBalanceCentavos.toString(),
    p_minimum_due_centavos:
      minimumDueCentavos === null ? null : minimumDueCentavos.toString(),
  });

  if (error) {
    return {
      error: cardErrorMessage(
        error.message,
        error.code,
        "save_card_statement",
        STATEMENT_MESSAGES,
        "20261027040000_reconciliation.sql",
        "The statement could not be saved.",
      ),
    };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The statement could not be saved." };
  }

  revalidatePath("/cards");
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

function cardErrorMessage(
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
