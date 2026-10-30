-- Monthly budget plans.
-- Run this after 20261026020000_transactions.sql.
-- Authenticated users still cannot insert budget rows directly.
-- This function stamps auth.uid() and replaces one open month's fixed plan.

create or replace function public.save_budget_month(
  p_month date,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  line_index integer;
  line jsonb;
  line_category uuid;
  line_amount bigint;
  category_ids uuid[] := array[]::uuid[];
  amounts bigint[] := array[]::bigint[];
  category_ok boolean;
  expected_count integer;
  existing_id uuid;
  existing_status public.budget_status;
  month_id uuid;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'Choose a month.';
  end if;

  if p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception 'Enter an amount for every category.';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_lines) item
  ) <> (
    select count(distinct item->>'category_id')
    from jsonb_array_elements(p_lines) item
  ) then
    raise exception 'Enter an amount for every category.';
  end if;

  for line_index in 0 .. jsonb_array_length(p_lines) - 1 loop
    line := p_lines -> line_index;

    if coalesce(line->>'category_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(line->>'planned_centavos', '') !~ '^[0-9]+$' then
      raise exception 'Enter a planned amount of zero or more.';
    end if;

    line_category := (line->>'category_id')::uuid;
    begin
      line_amount := (line->>'planned_centavos')::bigint;
    exception
      when numeric_value_out_of_range then
        raise exception 'Enter a planned amount of zero or more.';
    end;

    select exists (
      select 1
      from public.categories c
      where c.id = line_category
        and c.user_id = actor
        and c.archived_at is null
        and c.report_treatment in ('consumption', 'savings_allocation')
    )
    into category_ok;

    if not category_ok then
      raise exception 'Choose a budget category.';
    end if;

    category_ids := array_append(category_ids, line_category);
    amounts := array_append(amounts, line_amount);
  end loop;

  select count(*)
  into expected_count
  from public.categories c
  where c.user_id = actor
    and c.archived_at is null
    and c.report_treatment in ('consumption', 'savings_allocation');

  if coalesce(array_length(category_ids, 1), 0) <> expected_count then
    raise exception 'Enter an amount for every category.';
  end if;

  select b.id, b.status
  into existing_id, existing_status
  from public.budget_months b
  where b.user_id = actor
    and b.month = p_month;

  if existing_status = 'closed' then
    raise exception 'This month is closed.';
  end if;

  if existing_id is null then
    begin
      insert into public.budget_months (
        user_id,
        month,
        allocation_base_centavos
      )
      values (
        actor,
        p_month,
        4700000
      )
      returning id into month_id;
    exception
      when unique_violation then
        select b.id, b.status
        into month_id, existing_status
        from public.budget_months b
        where b.user_id = actor
          and b.month = p_month;

        if month_id is null or existing_status = 'closed' then
          raise;
        end if;
    end;
  else
    month_id := existing_id;
  end if;

  update public.budget_months
  set updated_at = now()
  where id = month_id
    and user_id = actor;

  delete from public.budget_lines
  where budget_month_id = month_id
    and user_id = actor;

  insert into public.budget_lines (
    user_id,
    budget_month_id,
    category_id,
    amount_mode,
    planned_centavos
  )
  select
    actor,
    month_id,
    ids.category_id,
    'fixed',
    ids.planned_centavos
  from unnest(category_ids, amounts) as ids(category_id, planned_centavos);

  return month_id;
end;
$$;

comment on function public.save_budget_month(date, jsonb) is
  'Replaces the signed-in user''s fixed plan for one open month. Amounts are centavos. Income categories and card purchases are not part of this plan.';

revoke all on function public.save_budget_month(date, jsonb) from public, anon, authenticated;

grant execute on function public.save_budget_month(date, jsonb) to authenticated;

notify pgrst, 'reload schema';
