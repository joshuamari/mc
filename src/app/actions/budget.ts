"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  BudgetError,
  budgetPlanPosting,
  isMonthStart,
  manilaMonthStart,
  parsePlannedInput,
} from "@/lib/budget";
import { MoneyParseError } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const DATABASE_MESSAGES = [
  "Sign in is required.",
  "Choose a month.",
  "Enter an amount for every category.",
  "Enter a planned amount of zero or more.",
  "Choose a budget category.",
  "This month is closed.",
] as const;

export type SaveBudgetState = { error: string } | { savedId: string } | null;

export async function saveBudget(
  _state: SaveBudgetState,
  formData: FormData,
): Promise<SaveBudgetState> {
  await getCurrentUser();

  const month = formData.get("month");
  const categoryIds = formData
    .getAll("categoryId")
    .filter((value): value is string => typeof value === "string");
  const parsedMonth = z.string().trim().safeParse(month);
  const parsedIds = z.array(z.uuid()).min(1).safeParse(categoryIds);
  if (
    !parsedMonth.success ||
    !parsedIds.success ||
    !isMonthStart(parsedMonth.data)
  ) {
    return { error: "Enter an amount for every category." };
  }
  if (parsedMonth.data !== manilaMonthStart(new Date())) {
    return { error: "This plan is for a different month. Refresh and try again." };
  }

  let lines;
  try {
    const amounts = new Map<string, bigint>();
    for (const categoryId of parsedIds.data) {
      const raw = formData.get(`amount:${categoryId}`);
      if (typeof raw !== "string") {
        return { error: "Enter an amount for every category." };
      }
      amounts.set(categoryId, parsePlannedInput(raw));
    }
    lines = budgetPlanPosting(parsedIds.data, amounts);
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof BudgetError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_budget_month", {
    p_month: parsedMonth.data,
    p_lines: lines.map((line) => ({
      category_id: line.categoryId,
      planned_centavos: line.plannedCentavos.toString(),
    })),
  });

  if (error) {
    return { error: budgetErrorMessage(error.message, error.code) };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The plan could not be saved." };
  }

  revalidatePath("/budget");
  return { savedId: data };
}

function budgetErrorMessage(message: string, code: string | undefined): string {
  const known = DATABASE_MESSAGES.find((item) => message.includes(item));
  if (known) {
    return known;
  }
  if (
    code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("save_budget_month")
  ) {
    return "Apply supabase/migrations/20261027010000_budget.sql in the Supabase SQL editor, then try again.";
  }
  return "The plan could not be saved.";
}
