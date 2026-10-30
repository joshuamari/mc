-- Remove a balance that still has only its starting amount.
-- Run this after 20261027050000_savings.sql.
-- The account is hidden and its opening balance is voided.
-- A balance with later activity stays in place.

create or replace function public.archive_asset_account(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  account_kind public.account_kind;
  already_archived timestamptz;
begin
  if actor is null then
    raise exception 'Sign in is required.';
  end if;

  select a.kind, a.archived_at
  into account_kind, already_archived
  from public.accounts a
  where a.id = p_account_id
    and a.user_id = actor;

  if account_kind is null
    or account_kind not in ('cash', 'bank', 'savings', 'emergency', 'investment') then
    raise exception 'Choose a balance.';
  end if;

  if already_archived is not null then
    return p_account_id;
  end if;

  if exists (
    select 1
    from public.goals g
    where g.user_id = actor
      and g.linked_account_id = p_account_id
      and g.archived_at is null
  ) then
    raise exception 'This balance is used by a goal.';
  end if;

  if exists (
    select 1
    from public.transaction_entries e
    join public.transactions t on t.id = e.transaction_id
    where e.user_id = actor
      and e.account_id = p_account_id
      and t.voided_at is null
      and t.type <> 'opening_balance'
  ) then
    raise exception 'This balance has other activity.';
  end if;

  update public.transactions t
  set voided_at = now()
  where t.user_id = actor
    and t.voided_at is null
    and t.type = 'opening_balance'
    and (
      t.notes = p_account_id::text
      or exists (
        select 1
        from public.transaction_entries e
        where e.transaction_id = t.id
          and e.account_id = p_account_id
          and e.user_id = actor
      )
    );

  update public.accounts
  set archived_at = now()
  where id = p_account_id
    and user_id = actor;

  return p_account_id;
end;
$$;

comment on function public.archive_asset_account(uuid) is
  'Hides one asset account for auth.uid() when it has only a starting amount, and voids that opening balance.';

revoke all on function public.archive_asset_account(uuid) from public, anon, authenticated;

grant execute on function public.archive_asset_account(uuid) to authenticated;

notify pgrst, 'reload schema';
