# CursorTraining2.0

MannyCat is a personal budget and cash-flow tracker. The browser tab title is **CursorTraining2.0**. The in-app name is MannyCat.

This repository is the approved foundation: the app shell, sign-in, row-level security migration, and money helpers. Accounts, transactions, budgets, and the other screens are later phases. Supabase is not connected yet.

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

`npm test` checks centavo math, the ₱47,000 starter template, and that the migration enables row-level security without granting browser writes. It does not connect to a database.

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
5. In Authentication → Users, create one email user. Then turn off public signups. Basic authenticator MFA is optional. Leave phone MFA off.
6. Prove row-level security:
   - Sign in as your user and confirm `select * from public.categories` returns only your rows.
   - Create a second test user. From that session, the same query must return no rows from the first user.
   - As either user, `insert into public.accounts (user_id, name, kind) values (auth.uid(), 'Cash', 'cash')` must fail. Ledger writes stay revoked until the transaction engine adds database functions.
   - Delete the test user when the check is done.
7. Export a JSON backup once that feature exists. The free plan has no automatic database backups, and a project pauses after 7 days without use. Restore a paused project from the Supabase dashboard.

## What this migration stores

Money is `bigint` centavos. Asset entries are positive when cash increases. Credit-card entries are positive when debt increases. Balances are the sum of entries on transactions that have not been voided.

The anon key can read the signed-in user's rows. It cannot insert, update, or delete ledger rows. Profile display name and timezone are the only client update.

## Later phases

1. Accounts, categories, and opening balances.
2. Transaction engine, including card purchases and payments.
3. Monthly budget.
4. Payday planner.
5. Card screens and reconciliation.
6. Savings goals.
7. Dashboard, reports, and JSON export.
8. Installable PWA and Vercel Hobby deploy.

Offline transaction entry is not part of this version. Saving money requires a connection.
