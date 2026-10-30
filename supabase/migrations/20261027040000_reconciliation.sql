-- Card statement reconciliation.
-- Run this after 20261027030000_cards.sql.
-- Authenticated users still cannot insert statement rows directly.
-- The recorded debt is the sum of that card's entries on or before the close date.
-- The difference is the printed statement balance minus that recorded debt.

create or replace function public.save_card_statement(
  p_card_account_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_on date,
  p_statement_balance_centavos bigint,
  p_minimum_due_centavos bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  card_ok boolean;
  calculated bigint;
  difference bigint;
  new_status public.reconciliation_status;
  reconciliation_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if p_period_start is null or p_period_end is null or p_due_on is null then
    raise exception 'Enter the statement dates.';
  end if;

  if p_period_start > p_period_end then
    raise exception 'The statement must start on or before the day it closes.';
  end if;

  if p_statement_balance_centavos is null then
    raise exception 'Enter the statement balance.';
  end if;

  if p_minimum_due_centavos is not null and p_minimum_due_centavos < 0 then
    raise exception 'Enter a minimum due of zero or more.';
  end if;

  select exists (
    select 1
    from public.accounts a
    where a.id = p_card_account_id
      and a.user_id = actor
      and a.archived_at is null
      and a.kind = 'credit_card'
  )
  into card_ok;

  if not card_ok then
    raise exception 'Choose a card.';
  end if;

  select coalesce(sum(e.amount_centavos), 0)::bigint
  into calculated
  from public.transaction_entries e
  join public.transactions t on t.id = e.transaction_id
  where e.account_id = p_card_account_id
    and e.user_id = actor
    and t.voided_at is null
    and t.occurred_on <= p_period_end;

  difference := p_statement_balance_centavos - calculated;
  new_status := case
    when difference = 0 then 'matched'::public.reconciliation_status
    else 'open'::public.reconciliation_status
  end;

  delete from public.card_statements
  where user_id = actor
    and account_id = p_card_account_id
    and period_end = p_period_end;

  delete from public.reconciliations
  where user_id = actor
    and account_id = p_card_account_id
    and statement_date = p_period_end;

  insert into public.card_statements (
    user_id,
    account_id,
    period_start,
    period_end,
    statement_balance_centavos,
    minimum_due_centavos,
    due_on
  )
  values (
    actor,
    p_card_account_id,
    p_period_start,
    p_period_end,
    p_statement_balance_centavos,
    p_minimum_due_centavos,
    p_due_on
  );

  insert into public.reconciliations (
    user_id,
    account_id,
    statement_date,
    statement_balance_centavos,
    calculated_balance_centavos,
    difference_centavos,
    status
  )
  values (
    actor,
    p_card_account_id,
    p_period_end,
    p_statement_balance_centavos,
    calculated,
    difference,
    new_status
  )
  returning id into reconciliation_id;

  return reconciliation_id;
end;
$$;

comment on function public.save_card_statement(uuid, date, date, date, bigint, bigint) is
  'Saves one card statement for auth.uid() and compares its balance with recorded debt through the close date. A later save for the same close date replaces the previous check.';

revoke all on function public.save_card_statement(uuid, date, date, date, bigint, bigint) from public, anon, authenticated;

grant execute on function public.save_card_statement(uuid, date, date, date, bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
