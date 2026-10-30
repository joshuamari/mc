-- Savings goals.
-- Run this after 20261027040000_reconciliation.sql.
-- Authenticated users still cannot insert goal or ledger rows directly.
-- A goal stores a target and the balance it is tied to.
-- A deposit or withdrawal is a transfer. It also records whose money moved.

create type public.contribution_owner as enum ('self', 'partner');

alter table public.transactions
  add column contribution_owner public.contribution_owner;

alter table public.transactions
  add constraint transactions_goal_owner_pair check (
    (goal_id is null and contribution_owner is null)
    or (goal_id is not null and contribution_owner is not null)
  );

create unique index goals_active_name_unique
  on public.goals (user_id, name)
  where archived_at is null;

comment on column public.transactions.contribution_owner is
  'Set on a goal deposit or withdrawal. self is your money. partner is your partner''s money.';

grant usage on type public.contribution_owner to authenticated;

create or replace function public.create_savings_goal(
  p_name text,
  p_kind public.goal_kind,
  p_target_centavos bigint,
  p_target_date date,
  p_linked_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  clean_name text := btrim(coalesce(p_name, ''));
  linked_kind public.account_kind;
  new_goal_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if clean_name = '' or char_length(clean_name) > 80 then
    raise exception 'Enter a goal name of 80 characters or fewer.';
  end if;

  if p_kind is null then
    raise exception 'Choose a goal type.';
  end if;

  if p_target_centavos is null or p_target_centavos < 0 then
    raise exception 'Enter a target of zero or more.';
  end if;

  select a.kind
  into linked_kind
  from public.accounts a
  where a.id = p_linked_account_id
    and a.user_id = actor
    and a.archived_at is null;

  if linked_kind is null then
    raise exception 'Choose the balance this goal uses.';
  end if;

  if p_kind = 'emergency' and linked_kind <> 'emergency' then
    raise exception 'Link an emergency fund balance.';
  elsif p_kind = 'savings' and linked_kind <> 'savings' then
    raise exception 'Link a savings balance.';
  elsif p_kind = 'investment' and linked_kind <> 'investment' then
    raise exception 'Link an investment balance.';
  elsif p_kind = 'custom' and linked_kind not in ('savings', 'emergency', 'investment') then
    raise exception 'Link a savings, emergency, or investment balance.';
  end if;

  insert into public.goals (
    user_id,
    name,
    kind,
    target_centavos,
    target_date,
    linked_account_id
  )
  values (
    actor,
    clean_name,
    p_kind,
    p_target_centavos,
    p_target_date,
    p_linked_account_id
  )
  returning id into new_goal_id;

  return new_goal_id;
exception
  when unique_violation then
    raise exception 'A goal with this name already exists.';
end;
$$;

create or replace function public.post_goal_transfer(
  p_goal_id uuid,
  p_direction text,
  p_owner public.contribution_owner,
  p_description text,
  p_amount_centavos bigint,
  p_occurred_on date,
  p_other_account_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  clean_description text := btrim(coalesce(p_description, ''));
  linked_account_id uuid;
  goal_archived timestamptz;
  linked_kind public.account_kind;
  other_ok boolean;
  existing_id uuid;
  new_transaction_id uuid;
  linked_amount bigint;
  other_amount bigint;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if p_direction is null or p_direction not in ('deposit', 'withdrawal') then
    raise exception 'Choose a deposit or a withdrawal.';
  end if;

  if p_owner is null then
    raise exception 'Choose whose money this is.';
  end if;

  if clean_description = '' then
    raise exception 'Enter a description.';
  end if;

  if char_length(clean_description) > 120 then
    raise exception 'Enter a description of 120 characters or fewer.';
  end if;

  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  if p_occurred_on is null then
    raise exception 'Enter the date this happened.';
  end if;

  if p_idempotency_key is null then
    raise exception 'Missing idempotency key.';
  end if;

  select t.id
  into existing_id
  from public.transactions t
  where t.user_id = actor
    and t.idempotency_key = p_idempotency_key;

  if existing_id is not null then
    return existing_id;
  end if;

  select g.linked_account_id, g.archived_at
  into linked_account_id, goal_archived
  from public.goals g
  where g.id = p_goal_id
    and g.user_id = actor;

  if linked_account_id is null or goal_archived is not null then
    raise exception 'Choose a goal.';
  end if;

  select a.kind
  into linked_kind
  from public.accounts a
  where a.id = linked_account_id
    and a.user_id = actor
    and a.archived_at is null;

  if linked_kind is null or linked_kind not in ('savings', 'emergency', 'investment') then
    raise exception 'Choose the balance this goal uses.';
  end if;

  select exists (
    select 1
    from public.accounts a
    where a.id = p_other_account_id
      and a.user_id = actor
      and a.archived_at is null
      and a.kind in ('cash', 'bank')
      and a.id <> linked_account_id
  )
  into other_ok;

  if not other_ok then
    raise exception 'Choose the cash or bank balance.';
  end if;

  if p_direction = 'deposit' then
    linked_amount := p_amount_centavos;
    other_amount := -p_amount_centavos;
  else
    linked_amount := -p_amount_centavos;
    other_amount := p_amount_centavos;
  end if;

  insert into public.transactions (
    user_id,
    occurred_on,
    type,
    description,
    goal_id,
    contribution_owner,
    idempotency_key
  )
  values (
    actor,
    p_occurred_on,
    'transfer',
    clean_description,
    p_goal_id,
    p_owner,
    p_idempotency_key
  )
  returning id into new_transaction_id;

  insert into public.transaction_entries (
    user_id,
    transaction_id,
    account_id,
    amount_centavos
  )
  values
    (actor, new_transaction_id, p_other_account_id, other_amount),
    (actor, new_transaction_id, linked_account_id, linked_amount);

  return new_transaction_id;
exception
  when unique_violation then
    select t.id
    into existing_id
    from public.transactions t
    where t.user_id = actor
      and t.idempotency_key = p_idempotency_key;

    if existing_id is null then
      raise;
    end if;

    return existing_id;
end;
$$;

comment on function public.create_savings_goal(text, public.goal_kind, bigint, date, uuid) is
  'Creates one savings goal for auth.uid(). The target is separate from the linked account balance.';

comment on function public.post_goal_transfer(uuid, text, public.contribution_owner, text, bigint, date, uuid, uuid) is
  'Posts a deposit or withdrawal for auth.uid() as a transfer and records whether the money is yours or your partner''s.';

revoke all on function public.create_savings_goal(text, public.goal_kind, bigint, date, uuid) from public, anon, authenticated;
revoke all on function public.post_goal_transfer(uuid, text, public.contribution_owner, text, bigint, date, uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_savings_goal(text, public.goal_kind, bigint, date, uuid) to authenticated;
grant execute on function public.post_goal_transfer(uuid, text, public.contribution_owner, text, bigint, date, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
