-- Income, spending, and transfers.
-- Run this after 20261026010000_accounts.sql.
-- Authenticated users still cannot insert ledger rows directly.
-- This function stamps auth.uid() and posts the transaction, its signed
-- account entries, and any category split in one transaction.

create or replace function public.post_cash_movement(
  movement_type public.transaction_type,
  movement_description text,
  p_amount_centavos bigint,
  p_occurred_on date,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_category_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  clean_description text := btrim(coalesce(movement_description, ''));
  source_ok boolean;
  destination_ok boolean;
  category_ok boolean;
  existing_id uuid;
  new_transaction_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if movement_type is null
    or movement_type not in ('income', 'expense', 'transfer') then
    raise exception 'Choose income, spending, or a transfer.';
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

  select exists (
    select 1
    from public.accounts a
    where a.id = p_from_account_id
      and a.user_id = actor
      and a.archived_at is null
      and a.kind in ('cash', 'bank', 'savings', 'emergency', 'investment')
  )
  into source_ok;

  select exists (
    select 1
    from public.accounts a
    where a.id = p_to_account_id
      and a.user_id = actor
      and a.archived_at is null
      and a.kind in ('cash', 'bank', 'savings', 'emergency', 'investment')
  )
  into destination_ok;

  if movement_type = 'income' then
    if p_from_account_id is not null then
      raise exception 'Income lands in one balance.';
    end if;
    if not destination_ok then
      raise exception 'Choose the balance this money landed in.';
    end if;

    select exists (
      select 1
      from public.categories c
      where c.id = p_category_id
        and c.user_id = actor
        and c.archived_at is null
        and c.report_treatment = 'income'
    )
    into category_ok;

    if not category_ok then
      raise exception 'Choose an income category.';
    end if;
  elsif movement_type = 'expense' then
    if p_to_account_id is not null then
      raise exception 'Spending leaves one balance.';
    end if;
    if not source_ok then
      raise exception 'Choose the balance this money left.';
    end if;

    select exists (
      select 1
      from public.categories c
      where c.id = p_category_id
        and c.user_id = actor
        and c.archived_at is null
        and c.report_treatment = 'consumption'
    )
    into category_ok;

    if not category_ok then
      raise exception 'Choose a spending category.';
    end if;
  else
    if p_category_id is not null then
      raise exception 'A transfer does not use a category.';
    end if;
    if p_from_account_id is null
      or p_to_account_id is null
      or p_from_account_id = p_to_account_id
      or not source_ok
      or not destination_ok then
      raise exception 'Choose two different balances.';
    end if;
  end if;

  insert into public.transactions (
    user_id,
    occurred_on,
    type,
    description,
    idempotency_key
  )
  values (
    actor,
    p_occurred_on,
    movement_type,
    clean_description,
    p_idempotency_key
  )
  returning id into new_transaction_id;

  if movement_type = 'income' then
    insert into public.transaction_entries (
      user_id,
      transaction_id,
      account_id,
      amount_centavos
    )
    values (
      actor,
      new_transaction_id,
      p_to_account_id,
      p_amount_centavos
    );

    insert into public.transaction_splits (
      user_id,
      transaction_id,
      category_id,
      amount_centavos
    )
    values (
      actor,
      new_transaction_id,
      p_category_id,
      p_amount_centavos
    );
  elsif movement_type = 'expense' then
    insert into public.transaction_entries (
      user_id,
      transaction_id,
      account_id,
      amount_centavos
    )
    values (
      actor,
      new_transaction_id,
      p_from_account_id,
      -p_amount_centavos
    );

    insert into public.transaction_splits (
      user_id,
      transaction_id,
      category_id,
      amount_centavos
    )
    values (
      actor,
      new_transaction_id,
      p_category_id,
      p_amount_centavos
    );
  else
    insert into public.transaction_entries (
      user_id,
      transaction_id,
      account_id,
      amount_centavos
    )
    values
      (
        actor,
        new_transaction_id,
        p_from_account_id,
        -p_amount_centavos
      ),
      (
        actor,
        new_transaction_id,
        p_to_account_id,
        p_amount_centavos
      );
  end if;

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

comment on function public.post_cash_movement(
  public.transaction_type,
  text,
  bigint,
  date,
  uuid,
  uuid,
  uuid,
  uuid
) is
  'Posts income, spending, or a transfer for auth.uid(). Asset entries are positive when that balance increases. Spending and income category splits stay positive. A transfer has no category.';

revoke all on function public.post_cash_movement(
  public.transaction_type,
  text,
  bigint,
  date,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.post_cash_movement(
  public.transaction_type,
  text,
  bigint,
  date,
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated;

notify pgrst, 'reload schema';
