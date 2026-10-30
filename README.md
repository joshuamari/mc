# CursorTraining2.0

MannyCat is a personal budget and cash-flow tracker. The browser tab title is **CursorTraining2.0**. The in-app name is MannyCat.

This repository has the app shell, sign-in, row-level security, money helpers, asset balances, transactions for income, spending, and transfers, the monthly budget, the payday planner, credit cards with statement checks, savings goals, a dashboard, reports, and a JSON backup. The installable app and Vercel deploy are later.

## Requirements

- Node.js 22.13 or newer, or Node.js 24 LTS. This project was installed with Node.js 22.12.0, which prints an engine warning from a nested ESLint package. Update Node before you rely on lint in CI.
- npm 10 or newer.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `npm run dev` trusts this computer's network inspection certificate so the server can reach Supabase. Without keys, sign-in stays on the setup instructions. With keys, the login form accepts the email user you create in Supabase. There is no public signup screen.

## Checks

```bash
npm test
npm run lint
npm run build
```

`npm test` checks centavo math, the ₱47,000 starter template, and that the migrations enable row-level security without granting browser writes. It does not connect to a database.

The two-user access check runs after you apply the migration. It is described below and has not been executed yet.

## Supabase, when you are ready

Stay on the Free plan. Do not add a payment method, phone MFA, point-in-time recovery, or a compute upgrade.

1. Create a Supabase organization and one project. Singapore is the closest common region.
2. In Project Settings → API, copy the project URL and the anon public key.
3. Put them in `.env.local` and, later, in the Vercel project environment:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

   Do not create a `NEXT_PUBLIC_` variable for the secret or service-role key. The app does not use that key.
4. Open the SQL editor and run `supabase/migrations/20261026000000_foundation.sql`.
   Apply that file before you create your login, so the signup trigger can create your profile and starter categories.
   Then run `supabase/migrations/20261026010000_accounts.sql`. That function is what the Balances screen uses to save an account and its opening balance.
   Then run `supabase/migrations/20261026020000_transactions.sql`. That function is what the Transactions screen uses to record income, spending, and transfers.
   Then run `supabase/migrations/20261027010000_budget.sql`. That function is what the Monthly budget screen uses to save the plan for this month.
   Then run `supabase/migrations/20261027020000_payday.sql`. Then run `supabase/migrations/20261028010000_payday_split.sql`. That function is what the Payday planner uses to save each cutoff's share of a monthly amount.
   Then run `supabase/migrations/20261027030000_cards.sql`. Those functions are what the Credit cards screen uses to add a card and to record a purchase or a payment.
   Then run `supabase/migrations/20261027040000_reconciliation.sql`. That function compares a printed statement with the debt recorded through its close date.
   Then run `supabase/migrations/20261027050000_savings.sql`. That function is what the Savings screen uses to add a goal.
   Then run `supabase/migrations/20261027060000_archive_account.sql`. That function is what Balances uses to remove a place that still has only its starting amount. Then run `supabase/migrations/20261027070000_savings_entries.sql`. That table is the dated savings record and does not change a balance. Direct inserts stay revoked.
5. In Authentication → Users, create one email user. Then turn off public signups. Basic authenticator MFA is optional. Leave phone MFA off.
6. Prove row-level security:
   - Sign in as your user and confirm `select * from public.categories` returns only your rows.
   - Create a second test user. From that session, the same query must return no rows from the first user.
   - As either user, `insert into public.accounts (user_id, name, kind) values (auth.uid(), 'Cash', 'cash')` must fail. Direct inserts stay revoked. Income, spending, and transfers go through `post_cash_movement`. Monthly plans go through `save_budget_month`. Cutoff shares go through `save_pay_cutoff_shares`. Cards, purchases, and payments go through `create_credit_card` and `post_card_activity`. Statement checks go through `save_card_statement`. Goals go through `create_savings_goal`. The savings record goes through `record_savings_entry` and does not change a balance.
   - Delete the test user when the check is done.
7. On Settings, download a JSON backup and keep the file somewhere you control. The free plan has no automatic database backups, and a project pauses after 7 days without use. Restore a paused project from the Supabase dashboard.

## What this migration stores

Money is `bigint` centavos. Asset entries are positive when cash increases. Credit-card entries are positive when debt increases. Balances are the sum of entries on transactions that have not been voided.

The anon key can read the signed-in user's rows. It cannot insert, update, or delete ledger rows. Profile display name and timezone are the only client update.

## Later phases

1. Accounts, categories, and opening balances. Asset balances are on the Balances screen. Categories still come from the signup seed.
2. Income, spending, and transfers are on the Transactions screen. Card purchases and payments are on the Credit cards screen.
3. Monthly budget. The Monthly budget screen edits the plan for this month and compares it with spending. The ₱47,000 starter amounts are the first draft. Card purchases count once they are recorded on Credit cards.
4. Payday planner. The Payday planner divides the saved monthly budget across two cutoffs. A box can be split, and each cutoff subtracts only its share from the paycheck. Card payments are recorded on Credit cards.
5. Card screens and reconciliation. The Credit cards screen tracks two cards, purchases, payments, and a statement check. A payment reduces debt and is not a second expense. The statement check compares the printed balance with recorded debt.
6. Savings goals. The Savings screen keeps a target and a separate dated record of whose money was put in or taken out. Your amounts name a goal. Your partner's amounts do not. This record does not change Maya or any other balance.
7. Dashboard, reports, and JSON export. The Dashboard shows this month's income and spending, cash and bank balances, card debt, and savings progress. Reports keep spending, card payments, and transfers in separate totals. Settings downloads a JSON backup. Amounts in the file are centavos.
8. Installable PWA and Vercel Hobby deploy.

Offline transaction entry is not part of this version. Saving money requires a connection.
