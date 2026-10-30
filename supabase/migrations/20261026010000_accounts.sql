-- Accounts and opening balances.
-- Run this after 20261026000000_foundation.sql.
-- Authenticated users still cannot insert ledger rows directly.
-- This function stamps auth.uid() and posts the account plus its opening balance
-- in one transaction.

create or replace function public.account_id_for_opening_key(actor uuid, opening_key uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.account_id
      from public.transaction_entries e
      where e.transaction_id = t.id
      limit 1
    ),
    case
      when t.notes ~ '^[0-9a-fA-F-]{36}$' then t.notes::uuid
      else null
    end
  )
  from public.transactions t
  where t.user_id = actor
    and t.idempotency_key = opening_key
    and t.type = 'opening_balance';
$$;

create or replace function public.create_asset_account(
  account_name text,
  account_kind public.account_kind,
  opening_balance_centavos bigint,
  occurred_on date,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  clean_name text := btrim(account_name);
  new_account_id uuid;
  new_transaction_id uuid;
  existing_account_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if clean_name is null or clean_name = '' or char_length(clean_name) > 80 then
    raise exception 'Enter an account name of 80 characters or fewer.';
  end if;

  if account_kind is null
    or account_kind not in ('cash', 'bank', 'savings', 'emergency', 'investment') then
    raise exception 'Choose cash, bank, savings, emergency, or investment.';
  end if;

  if opening_balance_centavos is null then
    raise exception 'Enter an opening balance.';
  end if;

  if occurred_on is null then
    raise exception 'Enter the date this balance was true.';
  end if;

  if p_idempotency_key is null then
    raise exception 'Missing idempotency key.';
  end if;

  existing_account_id := public.account_id_for_opening_key(actor, p_idempotency_key);
  if existing_account_id is not null then
    return existing_account_id;
  end if;

  insert into public.accounts (user_id, name, kind)
  values (actor, clean_name, account_kind)
  returning id into new_account_id;

  -- A zero opening balance cannot have an entry: entries must be non-zero.
  -- The account id is stored in notes so a retried request finds this account.
  -- A non-zero balance stores the account on its single signed entry instead.
  insert into public.transactions (
    user_id,
    occurred_on,
    type,
    description,
    notes,
    idempotency_key
  )
  values (
    actor,
    occurred_on,
    'opening_balance',
    'Opening balance',
    case
      when opening_balance_centavos = 0 then new_account_id::text
      else null
    end,
    p_idempotency_key
  )
  returning id into new_transaction_id;

  if opening_balance_centavos <> 0 then
    insert into public.transaction_entries (
      user_id,
      transaction_id,
      account_id,
      amount_centavos
    )
    values (
      actor,
      new_transaction_id,
      new_account_id,
      opening_balance_centavos
    );
  end if;

  return new_account_id;
exception
  when unique_violation then
    existing_account_id := public.account_id_for_opening_key(actor, p_idempotency_key);
    if existing_account_id is null then
      raise;
    end if;
    return existing_account_id;
end;
$$;

comment on function public.create_asset_account(text, public.account_kind, bigint, date, uuid) is
  'Creates one asset account and its opening balance for auth.uid(). Positive centavos increase the asset. Zero posts no entry.';

revoke all on function public.account_id_for_opening_key(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_asset_account(text, public.account_kind, bigint, date, uuid) from public, anon, authenticated;
grant execute on function public.create_asset_account(text, public.account_kind, bigint, date, uuid) to authenticated;

grant select on public.account_balances to authenticated;

notify pgrst, 'reload schema';
