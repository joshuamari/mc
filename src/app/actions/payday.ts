"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isMonthStart, manilaMonthStart } from "@/lib/budget";
import { MoneyParseError, pesosToCentavos } from "@/lib/money";
import { PaydayError, paydayPlanPosting, type CutoffAmounts, type CutoffInput } from "@/lib/payday";
import { createClient } from "@/lib/supabase/server";

const DATABASE_MESSAGES = [
  "Sign in is required.",
  "Choose a month.",
  "Save the monthly budget first.",
  "This month is closed.",
  "Choose two cutoffs.",
  "Enter dates inside this month.",
  "Choose a pay date inside the cutoff.",
  "Cutoffs cannot share a day.",
  "Choose a cutoff for every category.",
  "Choose a budget category.",
  "The two amounts must add up to the monthly amount.",
] as const;

export type SavePaydayState = { error: string } | { savedId: string } | null;

export async function savePayCutoffs(
  _state: SavePaydayState,
  formData: FormData,
): Promise<SavePaydayState> {
  await getCurrentUser();

  const month = formData.get("month");
  const categoryIds = formData
    .getAll("categoryId")
    .filter((value): value is string => typeof value === "string");
  const parsedMonth = z.string().trim().safeParse(month);
  const parsedIds = z.array(z.uuid()).min(1).safeParse(categoryIds);
  if (!parsedMonth.success || !parsedIds.success || !isMonthStart(parsedMonth.data)) {
    return { error: "Choose a cutoff for every category." };
  }
  if (parsedMonth.data !== manilaMonthStart(new Date())) {
    return { error: "This plan is for a different month. Refresh and try again." };
  }

  const cutoffs: CutoffInput[] = [];
  for (const sequence of [1, 2] as const) {
    const periodStart = formData.get(`start:${sequence}`);
    const periodEnd = formData.get(`end:${sequence}`);
    const expectedPayDate = formData.get(`pay:${sequence}`);
    if (
      typeof periodStart !== "string" ||
      typeof periodEnd !== "string" ||
      typeof expectedPayDate !== "string"
    ) {
      return { error: "Enter dates inside this month." };
    }
    cutoffs.push({
      sequence,
      periodStart: periodStart.trim(),
      periodEnd: periodEnd.trim(),
      expectedPayDate: expectedPayDate.trim(),
    });
  }

  const shares = new Map<string, CutoffAmounts>();
  const categories: { categoryId: string; amountCentavos: bigint }[] = [];
  for (const categoryId of parsedIds.data) {
    const monthlyRaw = formData.get(`monthly:${categoryId}`);
    const firstRaw = formData.get(`cutoff1:${categoryId}`);
    const secondRaw = formData.get(`cutoff2:${categoryId}`);
    if (
      typeof monthlyRaw !== "string" ||
      typeof firstRaw !== "string" ||
      typeof secondRaw !== "string"
    ) {
      return { error: "The two amounts must add up to the monthly amount." };
    }
    try {
      const amountCentavos = pesosToCentavos(monthlyRaw);
      const firstCentavos = pesosToCentavos(firstRaw);
      const secondCentavos = pesosToCentavos(secondRaw);
      categories.push({ categoryId, amountCentavos });
      shares.set(categoryId, { firstCentavos, secondCentavos });
    } catch (error) {
      if (error instanceof MoneyParseError) {
        return { error: "The two amounts must add up to the monthly amount." };
      }
      throw error;
    }
  }

  let plan;
  try {
    plan = paydayPlanPosting(parsedMonth.data, cutoffs, shares, categories);
  } catch (error) {
    if (error instanceof PaydayError) {
      return { error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_pay_cutoff_shares", {
    p_month: parsedMonth.data,
    p_cutoffs: plan.cutoffs.map((cutoff) => ({
      sequence: cutoff.sequence,
      period_start: cutoff.periodStart,
      period_end: cutoff.periodEnd,
      expected_pay_date: cutoff.expectedPayDate,
    })),
    p_assignments: plan.assignments.map((assignment) => ({
      category_id: assignment.categoryId,
      cutoff_1_centavos: assignment.firstCentavos.toString(),
      cutoff_2_centavos: assignment.secondCentavos.toString(),
    })),
  });

  if (error) {
    return { error: paydayErrorMessage(error.message, error.code) };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { error: "The cutoffs could not be saved." };
  }

  revalidatePath("/payday");
  return { savedId: data };
}

function paydayErrorMessage(message: string, code: string | undefined): string {
  const known = DATABASE_MESSAGES.find((item) => message.includes(item));
  if (known) {
    return known;
  }
  if (
    code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("save_pay_cutoff_shares")
  ) {
    return "Apply supabase/migrations/20261028010000_payday_split.sql in the Supabase SQL editor, then try again.";
  }
  return "The cutoffs could not be saved.";
}
