-- A savings record that does not move money.
-- Run this after 20261027060000_archive_account.sql.
-- Each row is a date, an amount, whose money it is, and a goal when it is yours.
-- Maya and the other balances stay unchanged.

create table public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  direction text not null,
  owner public.contribution_owner not null,
  goal_id uuid references public.goals (id) on delete restrict,
  amount_centavos bigint not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint savings_entries_direction check (direction in ('deposit', 'withdrawal')),
  constraint savings_entries_amount_positive check (amount_centavos > 0),
  constraint savings_entries_owner_goal check (
    (owner = 'partner' and goal_id is null)
    or (owner = 'self' and goal_id is not null)
  ),
  constraint savings_entries_user_idempotency_unique unique (user_id, idempotency_key)
);

comment on table public.savings_entries is
  'Dated record of savings put in or taken out, split between you and your partner. A goal is set only for your amounts. This does not change an account balance.';

alter table public.savings_entries enable row level security;

create policy savings_entries_select_own
  on public.savings_entries for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.savings_entries from anon, authenticated;
grant select on table public.savings_entries to authenticated;

create or replace function public.record_savings_entry(
  p_direction text,
  p_owner public.contribution_owner,
  p_goal_id uuid,
  p_amount_centavos bigint,
  p_occurred_on date,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  goal_ok boolean;
  existing_id uuid;
  new_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if p_direction is null or p_direction not in ('deposit', 'withdrawal') then
    raise exception 'Choose put in or took out.';
  end if;

  if p_owner is null then
    raise exception 'Choose whose money this is.';
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

  select s.id
  into existing_id
  from public.savings_entries s
  where s.user_id = actor
    and s.idempotency_key = p_idempotency_key;

  if existing_id is not null then
    return existing_id;
  end if;

  if p_owner = 'partner' then
    if p_goal_id is not null then
      raise exception 'A partner amount has no goal.';
    end if;
  else
    select exists (
      select 1
      from public.goals g
      where g.id = p_goal_id
        and g.user_id = actor
        and g.archived_at is null
    )
    into goal_ok;

    if not goal_ok then
      raise exception 'Choose a goal.';
    end if;
  end if;

  insert into public.savings_entries (
    user_id,
    occurred_on,
    direction,
    owner,
    goal_id,
    amount_centavos,
    idempotency_key
  )
  values (
    actor,
    p_occurred_on,
    p_direction,
    p_owner,
    case when p_owner = 'partner' then null else p_goal_id end,
    p_amount_centavos,
    p_idempotency_key
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    select s.id
    into existing_id
    from public.savings_entries s
    where s.user_id = actor
      and s.idempotency_key = p_idempotency_key;

    if existing_id is null then
      raise;
    end if;

    return existing_id;
end;
$$;

comment on function public.record_savings_entry(text, public.contribution_owner, uuid, bigint, date, uuid) is
  'Records one savings amount for auth.uid() without changing an account balance. Your amount names a goal. A partner amount does not.';

revoke all on function public.record_savings_entry(text, public.contribution_owner, uuid, bigint, date, uuid) from public, anon, authenticated;

grant execute on function public.record_savings_entry(text, public.contribution_owner, uuid, bigint, date, uuid) to authenticated;

notify pgrst, 'reload schema';
