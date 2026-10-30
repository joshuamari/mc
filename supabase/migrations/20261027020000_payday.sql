-- Payday cutoffs.
-- Run this after 20261027010000_budget.sql.
-- Authenticated users still cannot insert planner rows directly.
-- This function stamps auth.uid() and stores two cutoffs for one open budget month.
-- Bill amounts are copied from that month's plan. Card payments are not included.

create or replace function public.save_pay_cutoffs(
  p_month date,
  p_cutoffs jsonb,
  p_assignments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  month_id uuid;
  month_status public.budget_status;
  line_index integer;
  line jsonb;
  sequences smallint[] := array[]::smallint[];
  starts date[] := array[]::date[];
  ends date[] := array[]::date[];
  pays date[] := array[]::date[];
  period_ids uuid[] := array[]::uuid[];
  sequence_no smallint;
  start_on date;
  end_on date;
  pay_on date;
  other_start date;
  other_end date;
  income_count integer;
  income_id uuid;
  category_ids uuid[] := array[]::uuid[];
  assignment_sequences smallint[] := array[]::smallint[];
  line_category uuid;
  line_sequence smallint;
  expected_count integer;
  item_period uuid;
  item_name text;
  item_amount bigint;
  item_kind public.planned_item_kind;
  item_group public.category_group;
  idx integer;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'Choose a month.';
  end if;

  select b.id, b.status
  into month_id, month_status
  from public.budget_months b
  where b.user_id = actor
    and b.month = p_month;

  if month_id is null then
    raise exception 'Save the monthly budget first.';
  end if;

  if month_status = 'closed' then
    raise exception 'This month is closed.';
  end if;

  if p_cutoffs is null
    or jsonb_typeof(p_cutoffs) <> 'array'
    or jsonb_array_length(p_cutoffs) <> 2 then
    raise exception 'Choose two cutoffs.';
  end if;

  for line_index in 0 .. jsonb_array_length(p_cutoffs) - 1 loop
    line := p_cutoffs -> line_index;
    if coalesce(line->>'sequence', '') !~ '^[12]$'
      or coalesce(line->>'period_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(line->>'period_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(line->>'expected_pay_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Enter dates inside this month.';
    end if;

    sequence_no := (line->>'sequence')::smallint;
    begin
      start_on := (line->>'period_start')::date;
      end_on := (line->>'period_end')::date;
      pay_on := (line->>'expected_pay_date')::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Enter dates inside this month.';
    end;

    if start_on > end_on
      or start_on < p_month
      or end_on >= (p_month + interval '1 month')::date
      or pay_on < p_month
      or pay_on >= (p_month + interval '1 month')::date then
      raise exception 'Enter dates inside this month.';
    end if;

    if pay_on < start_on or pay_on > end_on then
      raise exception 'Choose a pay date inside the cutoff.';
    end if;

    sequences := array_append(sequences, sequence_no);
    starts := array_append(starts, start_on);
    ends := array_append(ends, end_on);
    pays := array_append(pays, pay_on);
  end loop;

  if array_length(sequences, 1) <> 2
    or not (1 = any(sequences) and 2 = any(sequences)) then
    raise exception 'Choose two cutoffs.';
  end if;

  other_start := starts[array_position(sequences, 1::smallint)];
  other_end := ends[array_position(sequences, 1::smallint)];
  start_on := starts[array_position(sequences, 2::smallint)];
  end_on := ends[array_position(sequences, 2::smallint)];
  if other_start <= end_on and start_on <= other_end then
    raise exception 'Cutoffs cannot share a day.';
  end if;

  if p_assignments is null
    or jsonb_typeof(p_assignments) <> 'array'
    or jsonb_array_length(p_assignments) = 0 then
    raise exception 'Choose a cutoff for every category.';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_assignments) item
  ) <> (
    select count(distinct item->>'category_id')
    from jsonb_array_elements(p_assignments) item
  ) then
    raise exception 'Choose a cutoff for every category.';
  end if;

  for line_index in 0 .. jsonb_array_length(p_assignments) - 1 loop
    line := p_assignments -> line_index;
    if coalesce(line->>'category_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(line->>'sequence', '') !~ '^[12]$' then
      raise exception 'Choose a cutoff for every category.';
    end if;

    line_category := (line->>'category_id')::uuid;
    line_sequence := (line->>'sequence')::smallint;

    if not exists (
      select 1
      from public.budget_lines bl
      join public.categories c on c.id = bl.category_id
      where bl.budget_month_id = month_id
        and bl.user_id = actor
        and bl.category_id = line_category
        and bl.amount_mode = 'fixed'
        and bl.planned_centavos is not null
        and c.user_id = actor
        and c.archived_at is null
        and c.report_treatment in ('consumption', 'savings_allocation')
    ) then
      raise exception 'Choose a budget category.';
    end if;

    category_ids := array_append(category_ids, line_category);
    assignment_sequences := array_append(assignment_sequences, line_sequence);
  end loop;

  select count(*)
  into expected_count
  from public.budget_lines bl
  join public.categories c on c.id = bl.category_id
  where bl.budget_month_id = month_id
    and bl.user_id = actor
    and bl.amount_mode = 'fixed'
    and bl.planned_centavos is not null
    and c.archived_at is null
    and c.report_treatment in ('consumption', 'savings_allocation');

  if coalesce(array_length(category_ids, 1), 0) <> expected_count then
    raise exception 'Choose a cutoff for every category.';
  end if;

  for idx in 1 .. 2 loop
    sequence_no := idx::smallint;
    start_on := starts[array_position(sequences, sequence_no)];
    end_on := ends[array_position(sequences, sequence_no)];
    pay_on := pays[array_position(sequences, sequence_no)];

    insert into public.pay_periods (
      user_id,
      budget_month_id,
      sequence,
      period_start,
      period_end,
      expected_pay_date
    )
    values (
      actor,
      month_id,
      sequence_no,
      start_on,
      end_on,
      pay_on
    )
    on conflict (budget_month_id, sequence) do update
    set
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      expected_pay_date = excluded.expected_pay_date,
      actual_income_transaction_id = null,
      updated_at = now()
    returning id into item_period;

    select count(*)
    into income_count
    from public.transactions t
    where t.user_id = actor
      and t.type = 'income'
      and t.voided_at is null
      and t.occurred_on between start_on and end_on;

    income_id := null;
    if income_count = 1 then
      select t.id
      into income_id
      from public.transactions t
      where t.user_id = actor
        and t.type = 'income'
        and t.voided_at is null
        and t.occurred_on between start_on and end_on;
    end if;

    update public.pay_periods
    set actual_income_transaction_id = income_id
    where id = item_period
      and user_id = actor;

    period_ids := array_append(period_ids, item_period);
  end loop;

  delete from public.planned_items
  where user_id = actor
    and pay_period_id = any(period_ids);

  for idx in 1 .. array_length(category_ids, 1) loop
    line_category := category_ids[idx];
    line_sequence := assignment_sequences[idx];
    -- period_ids is filled in sequence order, so index 1 is cutoff 1.
    item_period := period_ids[line_sequence];
    pay_on := pays[array_position(sequences, line_sequence)];

    select c.name, c.category_group, bl.planned_centavos
    into item_name, item_group, item_amount
    from public.budget_lines bl
    join public.categories c on c.id = bl.category_id
    where bl.budget_month_id = month_id
      and bl.user_id = actor
      and bl.category_id = line_category;

    item_kind := case item_group::text
      when 'housing' then 'bill'::public.planned_item_kind
      when 'utilities' then 'bill'::public.planned_item_kind
      when 'food' then 'necessity_reserve'::public.planned_item_kind
      when 'transport' then 'necessity_reserve'::public.planned_item_kind
      when 'pet' then 'necessity_reserve'::public.planned_item_kind
      when 'necessity' then 'necessity_reserve'::public.planned_item_kind
      when 'want' then 'discretionary'::public.planned_item_kind
      when 'emergency' then 'emergency'::public.planned_item_kind
      when 'savings' then 'savings'::public.planned_item_kind
      when 'irregular' then 'buffer'::public.planned_item_kind
      else null
    end;

    if item_kind is null or item_amount is null then
      raise exception 'Choose a budget category.';
    end if;

    insert into public.planned_items (
      user_id,
      pay_period_id,
      category_id,
      name,
      due_on,
      planned_centavos,
      kind
    )
    values (
      actor,
      item_period,
      line_category,
      item_name,
      pay_on,
      item_amount,
      item_kind
    );
  end loop;

  return month_id;
end;
$$;

comment on function public.save_pay_cutoffs(date, jsonb, jsonb) is
  'Stores two cutoffs for the signed-in user''s open budget month. Planned amounts are copied from that month. A single income transaction in the cutoff is linked as the paycheck.';

revoke all on function public.save_pay_cutoffs(date, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.save_pay_cutoffs(date, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
