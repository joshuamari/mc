import "server-only";

import { io } from "next/cache";

import { AccountForm } from "@/components/account-form";
import { RemoveBalanceButton } from "@/components/remove-balance-button";
import { getCurrentUser } from "@/lib/auth";
import {
  ASSET_ACCOUNT_LABELS,
  isAssetAccountKind,
  manilaDate,
  totalsByKind,
} from "@/lib/accounts";
import { formatCentavos, sumCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type AccountRow = {
  id: string;
  name: string;
  kind: string;
};

type BalanceRow = {
  account_id: string;
  balance_centavos: string | number;
};

export async function AccountsPanel() {
  // new Date() and crypto.randomUUID() cannot run while the static shell prerenders.
  await io();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [accountsResult, balancesResult, profileResult, categoriesResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, kind")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("account_balances")
        .select("account_id, balance_centavos")
        .eq("user_id", user.id),
      supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
      supabase
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  const loadError = accountsResult.error ?? balancesResult.error;
  const accounts = (accountsResult.data ?? []).flatMap((row: AccountRow) => {
    if (!isAssetAccountKind(row.kind)) {
      return [];
    }
    return [{ id: row.id, name: row.name, kind: row.kind }];
  });
  const balances = new Map<string, bigint>(
    ((balancesResult.data ?? []) as BalanceRow[]).map((row) => [
      row.account_id,
      BigInt(row.balance_centavos ?? 0),
    ]),
  );
  const listed = accounts.map((account) => ({
    ...account,
    balanceCentavos: balances.get(account.id) ?? 0n,
  }));
  const total = sumCentavos(listed.map((account) => account.balanceCentavos));
  const groups = totalsByKind(listed).map((group) => ({
    ...group,
    accounts: listed.filter((account) => account.kind === group.kind),
  }));
  const missingStarter =
    !profileResult.error &&
    !categoriesResult.error &&
    (!profileResult.data || (categoriesResult.count ?? 0) === 0);

  return (
    <div className="flex flex-col gap-8">
      {missingStarter ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          This user has no starter categories yet. You can still add balances.
          Before the budget phase, seed the profile from the Supabase SQL editor.
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Balances could not be loaded.
        </p>
      ) : listed.length === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">No balances yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">
            Total{" "}
            <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
              {formatCentavos(total)}
            </span>
          </p>
          {groups.map((group) => (
            <section key={group.kind} className="flex flex-col gap-1">
              <h2 className="text-sm font-medium text-zinc-500">
                {ASSET_ACCOUNT_LABELS[group.kind]}
                {group.count > 1 ? (
                  <span className="ml-2 font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
                    {formatCentavos(group.totalCentavos)}
                  </span>
                ) : null}
              </h2>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {group.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-baseline justify-between gap-4 py-3"
                  >
                    <p className="font-medium">{account.name}</p>
                    <div className="flex items-baseline gap-4">
                      <p className="tabular-nums">{formatCentavos(account.balanceCentavos)}</p>
                      <RemoveBalanceButton accountId={account.id} name={account.name} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <AccountForm
        today={manilaDate(new Date())}
        initialIdempotencyKey={crypto.randomUUID()}
      />
    </div>
  );
}
