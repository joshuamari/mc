-- Credit cards, purchases, and payments.
-- Run this after 20261027020000_payday.sql.
-- Authenticated users still cannot insert ledger rows directly.
-- A purchase increases card debt and a spending category.
-- A payment decreases one asset balance and the card debt. It has no category.
-- At most two cards that have not been archived.

create or replace function public.create_credit_card(
  card_name text,
  credit_limit_centavos bigint,
  statement_close_day smallint,
  payment_due_day smallint,
  card_last4 text,
  opening_debt_centavos bigint,
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
  clean_name text := btrim(card_name);
  clean_last4 text := nullif(btrim(coalesce(card_last4, '')), '');
  new_account_id uuid;
  new_transaction_id uuid;
  existing_account_id uuid;
  card_count integer;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if clean_name is null or clean_name = '' or char_length(clean_name) > 80 then
    raise exception 'Enter a card name of 80 characters or fewer.';
  end if;

  if credit_limit_centavos is null or credit_limit_centavos < 0 then
    raise exception 'Enter a credit limit of zero or more.';
  end if;

  if statement_close_day is null
    or statement_close_day < 1
    or statement_close_day > 31 then
    raise exception 'Choose the day the statement closes.';
  end if;

  if payment_due_day is null or payment_due_day < 1 or payment_due_day > 31 then
    raise exception 'Choose the day the payment is due.';
  end if;

  if clean_last4 is not null and clean_last4 !~ '^[0-9]{4}$' then
    raise exception 'Enter the last 4 digits, or leave them blank.';
  end if;

  if opening_debt_centavos is null or opening_debt_centavos < 0 then
    raise exception 'Enter the amount you already owe, or zero.';
  end if;

  if occurred_on is null then
    raise exception 'Enter the date this debt was true.';
  end if;

  if p_idempotency_key is null then
    raise exception 'Missing idempotency key.';
  end if;

  existing_account_id := public.account_id_for_opening_key(actor, p_idempotency_key);
  if existing_account_id is not null then
    return existing_account_id;
  end if;

  select count(*)
  into card_count
  from public.accounts a
  where a.user_id = actor
    and a.kind = 'credit_card'
    and a.archived_at is null;

  if card_count >= 2 then
    raise exception 'Two cards is the limit.';
  end if;

  insert into public.accounts (user_id, name, kind)
  values (actor, clean_name, 'credit_card')
  returning id into new_account_id;

  insert into public.credit_card_terms (
    account_id,
    user_id,
    credit_limit_centavos,
    statement_close_day,
    payment_due_day,
    last4
  )
  values (
    new_account_id,
    actor,
    credit_limit_centavos,
    statement_close_day,
    payment_due_day,
    clean_last4
  );

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
    'Opening debt',
    case
      when opening_debt_centavos = 0 then new_account_id::text
      else null
    end,
    p_idempotency_key
  )
  returning id into new_transaction_id;

  if opening_debt_centavos <> 0 then
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
      opening_debt_centavos
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

create or replace function public.post_card_activity(
  activity_type public.transaction_type,
  activity_description text,
  p_amount_centavos bigint,
  p_occurred_on date,
  p_card_account_id uuid,
  p_from_account_id uuid,
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
  clean_description text := btrim(coalesce(activity_description, ''));
  card_ok boolean;
  source_ok boolean;
  category_ok boolean;
  existing_id uuid;
  new_transaction_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if activity_type is null
    or activity_type not in ('credit_card_purchase', 'credit_card_payment') then
    raise exception 'Choose a purchase or a payment.';
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
    where a.id = p_card_account_id
      and a.user_id = actor
      and a.archived_at is null
      and a.kind = 'credit_card'
  )
  into card_ok;

  select exists (
    select 1
    from public.accounts a
    where a.id = p_from_account_id
      and a.user_id = actor
      and a.archived_at is null
      and a.kind in ('cash', 'bank', 'savings', 'emergency', 'investment')
  )
  into source_ok;

  if activity_type = 'credit_card_purchase' then
    if p_from_account_id is not null then
      raise exception 'A purchase does not leave a balance.';
    end if;
    if not card_ok then
      raise exception 'Choose a card.';
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
      raise exception 'A payment does not use a category.';
    end if;
    if not card_ok or not source_ok or p_from_account_id = p_card_account_id then
      raise exception 'Choose the card and the balance that pays it.';
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
    activity_type,
    clean_description,
    p_idempotency_key
  )
  returning id into new_transaction_id;

  if activity_type = 'credit_card_purchase' then
    insert into public.transaction_entries (
      user_id,
      transaction_id,
      account_id,
      amount_centavos
    )
    values (
      actor,
      new_transaction_id,
      p_card_account_id,
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
        p_card_account_id,
        -p_amount_centavos
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

comment on function public.create_credit_card(text, bigint, smallint, smallint, text, bigint, date, uuid) is
  'Creates one credit card and its opening debt for auth.uid(). Positive centavos increase the debt. Zero posts no entry. Last 4 digits are optional.';

comment on function public.post_card_activity(public.transaction_type, text, bigint, date, uuid, uuid, uuid, uuid) is
  'Posts a card purchase or payment for auth.uid(). A purchase increases debt and a spending category. A payment decreases an asset and the debt, with no category.';

revoke all on function public.create_credit_card(text, bigint, smallint, smallint, text, bigint, date, uuid) from public, anon, authenticated;
revoke all on function public.post_card_activity(public.transaction_type, text, bigint, date, uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_credit_card(text, bigint, smallint, smallint, text, bigint, date, uuid) to authenticated;
grant execute on function public.post_card_activity(public.transaction_type, text, bigint, date, uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
