-- MannyCat foundation.
-- Money is stored as integer centavos (₱1 = 100).
-- Run this in the Supabase SQL editor, or with the Supabase CLI, after the project exists.
-- The anon and authenticated roles can read their own rows. Ledger writes are revoked
-- until posting functions are added with the transaction engine.
-- Do not add columns for bank login secrets, full payment card numbers, or card security codes.

create extension if not exists pgcrypto;

create type public.account_kind as enum (
  'cash',
  'bank',
  'savings',
  'emergency',
  'investment',
  'credit_card'
);

create type public.transaction_type as enum (
  'income',
  'expense',
  'credit_card_purchase',
  'credit_card_payment',
  'credit_card_refund',
  'credit_card_fee',
  'transfer',
  'opening_balance',
  'adjustment'
);

create type public.category_group as enum (
  'housing',
  'utilities',
  'food',
  'transport',
  'pet',
  'necessity',
  'want',
  'emergency',
  'savings',
  'irregular',
  'income',
  'excluded'
);

create type public.report_treatment as enum (
  'consumption',
  'savings_allocation',
  'income',
  'excluded'
);

create type public.amount_mode as enum ('fixed', 'percent');

create type public.rollover_policy as enum ('none', 'carry_unused');

create type public.budget_status as enum ('open', 'closed');

create type public.planned_item_kind as enum (
  'bill',
  'necessity_reserve',
  'discretionary',
  'emergency',
  'savings',
  'card_payment',
  'buffer'
);

create type public.planned_item_status as enum ('planned', 'paid', 'skipped');

create type public.goal_kind as enum (
  'emergency',
  'savings',
  'investment',
  'custom'
);

create type public.reconciliation_status as enum ('open', 'matched', 'stale');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.assert_same_owner(expected uuid, actual uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if expected is distinct from actual then
    raise exception 'Row owner does not match the parent row';
  end if;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind public.account_kind not null,
  currency text not null default 'PHP',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_currency_php check (currency = 'PHP')
);

create table public.credit_card_terms (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text,
  credit_limit_centavos bigint not null,
  statement_close_day smallint not null,
  payment_due_day smallint not null,
  last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_card_terms_limit_nonnegative check (credit_limit_centavos >= 0),
  constraint credit_card_terms_close_day check (statement_close_day between 1 and 31),
  constraint credit_card_terms_due_day check (payment_due_day between 1 and 31),
  constraint credit_card_terms_last4 check (last4 is null or last4 ~ '^[0-9]{4}$')
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category_group public.category_group not null,
  report_treatment public.report_treatment not null,
  essential boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_user_name_unique unique (user_id, name)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind public.goal_kind not null,
  target_centavos bigint,
  target_months_of_essentials numeric(4, 1),
  target_date date,
  linked_account_id uuid references public.accounts (id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_target_nonnegative check (target_centavos is null or target_centavos >= 0),
  constraint goals_months_nonnegative check (
    target_months_of_essentials is null or target_months_of_essentials >= 0
  )
);

create table public.budget_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  allocation_base_centavos bigint not null default 4700000,
  status public.budget_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_months_user_month_unique unique (user_id, month),
  constraint budget_months_first_of_month check (month = date_trunc('month', month)::date),
  constraint budget_months_base_nonnegative check (allocation_base_centavos >= 0)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_month_id uuid not null references public.budget_months (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  amount_mode public.amount_mode not null,
  planned_centavos bigint,
  percent_bps integer,
  rollover_policy public.rollover_policy not null default 'none',
  carry_in_centavos bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_lines_month_category_unique unique (budget_month_id, category_id),
  constraint budget_lines_amount_shape check (
    (
      amount_mode = 'fixed'
      and planned_centavos is not null
      and planned_centavos >= 0
      and percent_bps is null
    )
    or (
      amount_mode = 'percent'
      and percent_bps is not null
      and percent_bps >= 0
      and planned_centavos is null
    )
  )
);

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_month_id uuid not null references public.budget_months (id) on delete cascade,
  sequence smallint not null,
  period_start date not null,
  period_end date not null,
  expected_pay_date date not null,
  actual_income_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pay_periods_sequence check (sequence in (1, 2)),
  constraint pay_periods_month_sequence_unique unique (budget_month_id, sequence),
  constraint pay_periods_range check (period_start <= period_end)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  type public.transaction_type not null,
  description text not null,
  notes text,
  goal_id uuid references public.goals (id) on delete restrict,
  pay_period_id uuid references public.pay_periods (id) on delete restrict,
  idempotency_key uuid not null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_user_idempotency_unique unique (user_id, idempotency_key)
);

alter table public.pay_periods
  add constraint pay_periods_income_transaction_fk
  foreign key (actual_income_transaction_id)
  references public.transactions (id)
  on delete set null;

create table public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  amount_centavos bigint not null,
  constraint transaction_entries_nonzero check (amount_centavos <> 0)
);

comment on column public.transaction_entries.amount_centavos is
  'Signed centavos. Assets: positive increases the balance. Credit cards: positive increases the debt.';

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  amount_centavos bigint not null,
  memo text,
  constraint transaction_splits_nonzero check (amount_centavos <> 0)
);

comment on column public.transaction_splits.amount_centavos is
  'Signed centavos. Positive increases category activity. A refund is negative.';

create table public.bill_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete restrict,
  name text not null,
  due_day smallint not null,
  default_sequence smallint not null,
  default_amount_centavos bigint not null,
  kind public.planned_item_kind not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_templates_due_day check (due_day between 1 and 31),
  constraint bill_templates_sequence check (default_sequence in (1, 2)),
  constraint bill_templates_amount_nonnegative check (default_amount_centavos >= 0)
);

create table public.planned_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pay_period_id uuid not null references public.pay_periods (id) on delete cascade,
  category_id uuid references public.categories (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  name text not null,
  due_on date not null,
  planned_centavos bigint not null,
  kind public.planned_item_kind not null,
  status public.planned_item_status not null default 'planned',
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_items_amount_nonnegative check (planned_centavos >= 0)
);

create table public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  statement_balance_centavos bigint not null,
  minimum_due_centavos bigint,
  due_on date not null,
  created_at timestamptz not null default now(),
  constraint card_statements_period check (period_start <= period_end),
  constraint card_statements_minimum_nonnegative check (
    minimum_due_centavos is null or minimum_due_centavos >= 0
  )
);

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  statement_date date not null,
  statement_balance_centavos bigint not null,
  calculated_balance_centavos bigint not null,
  difference_centavos bigint not null,
  status public.reconciliation_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  constraint reconciliations_difference check (
    difference_centavos = statement_balance_centavos - calculated_balance_centavos
  )
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  before_row jsonb,
  after_row jsonb,
  created_at timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);
create index categories_user_id_idx on public.categories (user_id);
create index transactions_user_occurred_idx on public.transactions (user_id, occurred_on desc);
create index transaction_entries_account_idx on public.transaction_entries (account_id);
create index transaction_entries_transaction_idx on public.transaction_entries (transaction_id);
create index transaction_splits_transaction_idx on public.transaction_splits (transaction_id);
create index transaction_splits_category_idx on public.transaction_splits (category_id);
create index planned_items_period_idx on public.planned_items (pay_period_id, due_on);

create view public.account_balances
with (security_invoker = true) as
select
  e.user_id,
  e.account_id,
  coalesce(sum(e.amount_centavos), 0)::bigint as balance_centavos
from public.transaction_entries e
join public.transactions t on t.id = e.transaction_id
where t.voided_at is null
group by e.user_id, e.account_id;

comment on view public.account_balances is
  'Balance is the sum of signed entries on transactions that have not been voided.';

create view public.consumption_splits
with (security_invoker = true) as
select
  s.user_id,
  s.category_id,
  t.occurred_on,
  t.type,
  s.amount_centavos
from public.transaction_splits s
join public.transactions t on t.id = s.transaction_id
where t.voided_at is null
  and t.type in (
    'expense',
    'credit_card_purchase',
    'credit_card_refund',
    'credit_card_fee'
  );

comment on view public.consumption_splits is
  'Spending activity. Card payments, transfers, and opening balances are excluded by transaction type.';

create function public.seed_starter_categories(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, category_group, report_treatment, essential)
  values
    (target_user, 'Rent', 'housing', 'consumption', true),
    (target_user, 'Water bill', 'utilities', 'consumption', true),
    (target_user, 'Electricity bill', 'utilities', 'consumption', true),
    (target_user, 'Internet bill', 'utilities', 'consumption', true),
    (target_user, 'Office transportation', 'transport', 'consumption', true),
    (target_user, 'Office lunch', 'food', 'consumption', true),
    (target_user, 'Cat litter', 'pet', 'consumption', true),
    (target_user, 'Cat wet food', 'pet', 'consumption', true),
    (target_user, 'Groceries', 'food', 'consumption', true),
    (target_user, 'Wants and personal spending', 'want', 'consumption', false),
    (target_user, 'Emergency fund contribution', 'emergency', 'savings_allocation', false),
    (target_user, 'Long-term savings and investments', 'savings', 'savings_allocation', false),
    (target_user, 'Irregular expenses buffer', 'irregular', 'consumption', false),
    (target_user, 'Salary', 'income', 'income', false),
    (target_user, 'Other income', 'income', 'income', false)
  on conflict (user_id, name) do nothing;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  perform public.seed_starter_categories(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create function public.enforce_credit_card_terms()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner uuid;
  account_kind public.account_kind;
begin
  select a.user_id, a.kind into owner, account_kind
  from public.accounts a
  where a.id = new.account_id;

  if owner is null then
    raise exception 'Credit card account was not found';
  end if;
  if account_kind <> 'credit_card' then
    raise exception 'Credit card terms require a credit_card account';
  end if;
  perform public.assert_same_owner(owner, new.user_id);
  return new;
end;
$$;

create trigger credit_card_terms_enforce
  before insert or update on public.credit_card_terms
  for each row execute function public.enforce_credit_card_terms();

create function public.enforce_entry_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transaction_owner uuid;
  account_owner uuid;
begin
  select user_id into transaction_owner from public.transactions where id = new.transaction_id;
  select user_id into account_owner from public.accounts where id = new.account_id;
  perform public.assert_same_owner(transaction_owner, new.user_id);
  perform public.assert_same_owner(account_owner, new.user_id);
  return new;
end;
$$;

create trigger transaction_entries_enforce_owner
  before insert or update on public.transaction_entries
  for each row execute function public.enforce_entry_owner();

create function public.enforce_split_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transaction_owner uuid;
  category_owner uuid;
begin
  select user_id into transaction_owner from public.transactions where id = new.transaction_id;
  select user_id into category_owner from public.categories where id = new.category_id;
  perform public.assert_same_owner(transaction_owner, new.user_id);
  perform public.assert_same_owner(category_owner, new.user_id);
  return new;
end;
$$;

create trigger transaction_splits_enforce_owner
  before insert or update on public.transaction_splits
  for each row execute function public.enforce_split_owner();

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.credit_card_terms enable row level security;
alter table public.categories enable row level security;
alter table public.goals enable row level security;
alter table public.budget_months enable row level security;
alter table public.budget_lines enable row level security;
alter table public.pay_periods enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.bill_templates enable row level security;
alter table public.planned_items enable row level security;
alter table public.card_statements enable row level security;
alter table public.reconciliations enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy accounts_select_own
  on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy credit_card_terms_select_own
  on public.credit_card_terms for select to authenticated
  using (user_id = (select auth.uid()));

create policy categories_select_own
  on public.categories for select to authenticated
  using (user_id = (select auth.uid()));

create policy goals_select_own
  on public.goals for select to authenticated
  using (user_id = (select auth.uid()));

create policy budget_months_select_own
  on public.budget_months for select to authenticated
  using (user_id = (select auth.uid()));

create policy budget_lines_select_own
  on public.budget_lines for select to authenticated
  using (user_id = (select auth.uid()));

create policy pay_periods_select_own
  on public.pay_periods for select to authenticated
  using (user_id = (select auth.uid()));

create policy transactions_select_own
  on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));

create policy transaction_entries_select_own
  on public.transaction_entries for select to authenticated
  using (user_id = (select auth.uid()));

create policy transaction_splits_select_own
  on public.transaction_splits for select to authenticated
  using (user_id = (select auth.uid()));

create policy bill_templates_select_own
  on public.bill_templates for select to authenticated
  using (user_id = (select auth.uid()));

create policy planned_items_select_own
  on public.planned_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy card_statements_select_own
  on public.card_statements for select to authenticated
  using (user_id = (select auth.uid()));

create policy reconciliations_select_own
  on public.reconciliations for select to authenticated
  using (user_id = (select auth.uid()));

create policy audit_events_select_own
  on public.audit_events for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.seed_starter_categories(uuid) from public, anon, authenticated;
revoke all on function public.assert_same_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_credit_card_terms() from public, anon, authenticated;
revoke all on function public.enforce_entry_owner() from public, anon, authenticated;
revoke all on function public.enforce_split_owner() from public, anon, authenticated;
