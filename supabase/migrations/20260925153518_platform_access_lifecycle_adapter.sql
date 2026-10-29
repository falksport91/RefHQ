-- Law18Ref platform-access lifecycle adapter.
-- This migration is intentionally local to Law18Ref. Central FS91 authorization,
-- lifecycle state, and owner/session verification remain outside this project.

alter table public.profiles
  add column if not exists platform_access_removed_at timestamptz,
  add column if not exists platform_access_banned_at timestamptz;

alter table public.officials
  add column if not exists platform_access_removed_at timestamptz;

create table if not exists public.platform_access_grant_archive (
  request_id uuid not null,
  target_user_id uuid not null,
  source_table text not null,
  grant_id uuid not null,
  organization_id uuid,
  event_id uuid,
  grant_snapshot jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (request_id, source_table, grant_id)
);

create table if not exists public.platform_access_action_requests (
  request_id uuid primary key,
  target_user_id uuid not null,
  action text not null check (action in ('remove', 'ban', 'unban')),
  reason text,
  result jsonb not null,
  completed_at timestamptz not null default now()
);

alter table public.platform_access_grant_archive enable row level security;
alter table public.platform_access_action_requests enable row level security;
revoke all on public.platform_access_grant_archive from public, anon, authenticated;
revoke all on public.platform_access_action_requests from public, anon, authenticated;
grant select, insert on public.platform_access_grant_archive to service_role;
grant select, insert on public.platform_access_action_requests to service_role;

create or replace function public.law18ref_current_user_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is null or coalesce((
    select profile.platform_access_removed_at is null
       and profile.platform_access_banned_at is null
    from public.profiles profile
    where profile.id = (select auth.uid())
  ), true)
$$;

revoke all on function public.law18ref_current_user_access_allowed() from public, anon;
grant execute on function public.law18ref_current_user_access_allowed() to authenticated, service_role;

-- Restrictive authenticated-user policies compose with every existing permissive
-- policy. Anonymous external check-in remains unaffected.
do $$
declare
  target_table record;
begin
  for target_table in
    select cls.relname
    from pg_class cls
    join pg_namespace namespace on namespace.oid = cls.relnamespace
    where namespace.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and cls.relrowsecurity
      and cls.relname not in ('platform_access_grant_archive', 'platform_access_action_requests')
  loop
    execute format('drop policy if exists law18ref_platform_access_gate on public.%I', target_table.relname);
    execute format(
      'create policy law18ref_platform_access_gate on public.%I as restrictive for all to authenticated using (public.law18ref_current_user_access_allowed()) with check (public.law18ref_current_user_access_allowed())',
      target_table.relname
    );
  end loop;
end
$$;

create or replace function public.law18ref_platform_access_preview(
  target_user uuid,
  requested_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text := case lower(trim(coalesce(requested_action, '')))
    when 'delete' then 'remove'
    when 'delete_access' then 'remove'
    else lower(trim(coalesce(requested_action, '')))
  end;
  target_profile public.profiles%rowtype;
  blockers jsonb := '[]'::jsonb;
  ownership_groups jsonb := '[]'::jsonb;
  official_ids uuid[] := '{}';
  counts jsonb;
begin
  if action_name not in ('remove', 'ban', 'unban') then
    raise exception 'Unsupported platform-access action.';
  end if;

  select * into target_profile from public.profiles where id = target_user;
  if target_profile.id is null then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'target_not_found', 'message', 'The Law18Ref profile does not exist.'));
  elsif target_profile.is_site_owner then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'site_owner_protected', 'message', 'The Law18Ref Site Owner cannot be removed or banned.'));
  end if;

  if action_name in ('remove', 'ban') then
    select coalesce(jsonb_agg(jsonb_build_object('organization_id', membership.organization_id, 'organization_name', organization.name)), '[]'::jsonb)
    into ownership_groups
    from public.organization_memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    where membership.user_id = target_user
      and membership.status = 'active'
      and membership.role in ('organization_director', 'organization_admin')
      and organization.active
      and not exists (
        select 1 from public.organization_memberships other
        where other.organization_id = membership.organization_id
          and other.user_id <> target_user
          and other.status = 'active'
          and other.role in ('organization_director', 'organization_admin')
      );
    if jsonb_array_length(ownership_groups) > 0 then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'last_group_leader',
        'message', 'Transfer or deactivate every group for which this is the last active director or administrator.',
        'groups', ownership_groups
      ));
    end if;
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into official_ids
  from public.officials where linked_user_id = target_user and merged_into_official_id is null;

  counts := jsonb_build_object(
    'organization_memberships', (select count(*) from public.organization_memberships where user_id = target_user and status <> 'archived'),
    'event_memberships', (select count(*) from public.event_memberships where user_id = target_user),
    'provisional_event_access', (select count(*) from public.provisional_event_access where official_id = any(official_ids)),
    'official_records', cardinality(official_ids),
    'active_calendar_feeds', (select count(*) from public.personal_calendar_feeds where user_id = target_user and active)
  );

  return jsonb_build_object(
    'schema_version', 1,
    'application', 'law18ref',
    'target_user_id', target_user,
    'action', action_name,
    'can_apply', jsonb_array_length(blockers) = 0,
    'blockers', blockers,
    'counts', counts,
    'preserves', jsonb_build_array('auth_user', 'sessions', 'profile', 'official_records', 'assignments', 'ratings', 'check_ins', 'audit_attribution', 'shared_business_data'),
    'restores_old_grants', false
  );
end;
$$;

create or replace function public.law18ref_platform_access_change(
  target_user uuid,
  requested_action text,
  change_reason text,
  operation_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text := case lower(trim(coalesce(requested_action, '')))
    when 'delete' then 'remove'
    when 'delete_access' then 'remove'
    else lower(trim(coalesce(requested_action, '')))
  end;
  preview jsonb;
  prior public.platform_access_action_requests%rowtype;
  result jsonb;
begin
  if operation_request_id is null then raise exception 'A request_id is required.'; end if;
  if action_name not in ('remove', 'ban', 'unban') then raise exception 'Unsupported platform-access action.'; end if;

  select * into prior from public.platform_access_action_requests where request_id = operation_request_id;
  if prior.request_id is not null then
    if prior.target_user_id <> target_user or prior.action <> action_name then
      raise exception 'The request_id was already used for a different platform-access change.';
    end if;
    return prior.result || jsonb_build_object('idempotent_replay', true);
  end if;

  preview := public.law18ref_platform_access_preview(target_user, action_name);
  if not coalesce((preview ->> 'can_apply')::boolean, false) then
    raise exception 'Platform-access change blocked: %', preview -> 'blockers';
  end if;

  if action_name in ('remove', 'ban') then
    insert into public.platform_access_grant_archive (request_id, target_user_id, source_table, grant_id, organization_id, grant_snapshot)
    select operation_request_id, target_user, 'organization_memberships', membership.id, membership.organization_id, to_jsonb(membership)
    from public.organization_memberships membership
    where membership.user_id = target_user and membership.status <> 'archived'
    on conflict do nothing;

    insert into public.platform_access_grant_archive (request_id, target_user_id, source_table, grant_id, organization_id, event_id, grant_snapshot)
    select operation_request_id, target_user, 'event_memberships', membership.id, event.organization_id, membership.event_id, to_jsonb(membership)
    from public.event_memberships membership
    join public.events event on event.id = membership.event_id
    where membership.user_id = target_user
    on conflict do nothing;

    insert into public.platform_access_grant_archive (request_id, target_user_id, source_table, grant_id, organization_id, event_id, grant_snapshot)
    select operation_request_id, target_user, 'provisional_event_access', access.id, official.organization_id, access.event_id, to_jsonb(access)
    from public.provisional_event_access access
    join public.officials official on official.id = access.official_id
    where official.linked_user_id = target_user
    on conflict do nothing;

    insert into public.platform_access_grant_archive (request_id, target_user_id, source_table, grant_id, organization_id, grant_snapshot)
    select operation_request_id, target_user, 'official_pending_roles', official.id, official.organization_id,
      jsonb_build_object('pending_org_role', official.pending_org_role, 'pending_org_roles', official.pending_org_roles, 'identity_status', official.identity_status)
    from public.officials official
    where official.linked_user_id = target_user and official.merged_into_official_id is null
    on conflict do nothing;

    update public.organization_memberships set status = 'archived', updated_at = now()
    where user_id = target_user and status <> 'archived';
    delete from public.event_memberships where user_id = target_user;
    delete from public.provisional_event_access access using public.officials official
    where access.official_id = official.id and official.linked_user_id = target_user;
    update public.officials
      set pending_org_role = 'referee', pending_org_roles = array['referee']::public.membership_role[],
          identity_status = 'removed', platform_access_removed_at = now(), updated_at = now()
      where linked_user_id = target_user and merged_into_official_id is null;
    update public.personal_calendar_feeds
      set active = false, sync_status = 'paused', last_error = 'Synchronization paused because Law18Ref access was removed.', updated_at = now()
      where user_id = target_user and active;
    update public.profiles
      set platform_access_removed_at = coalesce(platform_access_removed_at, now()),
          platform_access_banned_at = case when action_name = 'ban' then coalesce(platform_access_banned_at, now()) else platform_access_banned_at end,
          updated_at = now()
      where id = target_user;
  else
    update public.profiles set platform_access_banned_at = null, updated_at = now() where id = target_user;
  end if;

  result := preview || jsonb_build_object(
    'applied', true,
    'idempotent_replay', false,
    'request_id', operation_request_id,
    'state', case when action_name = 'ban' then 'banned' else 'access_removed' end,
    'completed_at', now(),
    'restored_grants', 0
  );
  insert into public.platform_access_action_requests (request_id, target_user_id, action, reason, result)
  values (operation_request_id, target_user, action_name, nullif(trim(change_reason), ''), result);
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (null, 'platform_access.' || action_name, 'profile', target_user::text,
    jsonb_build_object('request_id', operation_request_id, 'reason', nullif(trim(change_reason), ''), 'state', result ->> 'state'));
  return result;
end;
$$;

revoke all on function public.law18ref_platform_access_preview(uuid, text) from public, anon, authenticated;
revoke all on function public.law18ref_platform_access_change(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.law18ref_platform_access_preview(uuid, text) to service_role;
grant execute on function public.law18ref_platform_access_change(uuid, text, text, uuid) to service_role;

-- Automatic email linking must never rematerialize archived grants. Only an
-- explicit ordinary join may clear platform_access_removed_at for that group.
create or replace function public.link_current_referee()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if verified_email = '' then return; end if;
  insert into public.profiles (id, organization_id, full_name, email, primary_email, role)
  select (select auth.uid()), null,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', split_part(verified_email, '@', 1)),
    verified_email, verified_email, 'referee'::public.app_role
  on conflict (id) do update set primary_email = excluded.primary_email, email = excluded.email;

  update public.officials set linked_user_id = (select auth.uid()), identity_status = 'linked', updated_at = now()
  where lower(trim(email)) = verified_email
    and (linked_user_id is null or linked_user_id = (select auth.uid()))
    and platform_access_removed_at is null;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  select distinct official.organization_id, (select auth.uid()), intended.role, 'active'::public.membership_status
  from public.officials official
  cross join lateral unnest(case when cardinality(official.pending_org_roles) > 0 then official.pending_org_roles else array[coalesce(official.pending_org_role, 'referee'::public.membership_role)] end) intended(role)
  where official.linked_user_id = (select auth.uid())
    and official.platform_access_removed_at is null
    and intended.role not in ('site_owner','event_admin')
  on conflict (organization_id, user_id, role) do update set status = 'active', updated_at = now();

  insert into public.event_memberships (
    event_id, user_id, role, full_schedule_access, coaching_tools_enabled,
    ratings_history_scope, ratings_event_ids, assigned_game_ids, assigned_dates,
    assigned_sites, assignment_editing_override, created_by
  )
  select staged.event_id, (select auth.uid()), intended.role, staged.full_schedule_access,
    staged.coaching_tools_enabled, staged.ratings_history_scope, staged.ratings_event_ids,
    staged.assigned_game_ids, staged.assigned_dates, staged.assigned_sites,
    staged.assignment_editing_override, staged.created_by
  from public.provisional_event_access staged
  join public.officials official on official.id = staged.official_id
  cross join lateral unnest(staged.roles) intended(role)
  where official.linked_user_id = (select auth.uid()) and official.platform_access_removed_at is null
  on conflict (event_id, user_id, role) do update set
    full_schedule_access = excluded.full_schedule_access,
    coaching_tools_enabled = excluded.coaching_tools_enabled,
    ratings_history_scope = excluded.ratings_history_scope,
    ratings_event_ids = excluded.ratings_event_ids,
    assigned_game_ids = excluded.assigned_game_ids,
    assigned_dates = excluded.assigned_dates,
    assigned_sites = excluded.assigned_sites,
    assignment_editing_override = excluded.assignment_editing_override;

  delete from public.provisional_event_access staged using public.officials official
  where staged.official_id = official.id and official.linked_user_id = (select auth.uid())
    and official.platform_access_removed_at is null;
end;
$$;
revoke execute on function public.link_current_referee() from public, anon;
grant execute on function public.link_current_referee() to authenticated;

create or replace function public.claim_organization_join_link(join_token text)
returns table (organization_id uuid, organization_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_link public.organization_join_links;
  account_email text;
  account_name text;
  matched_official uuid;
  matched_user uuid;
  access_was_removed boolean := false;
begin
  select * into target_link from public.organization_join_links
  where token = join_token and active and (expires_at is null or expires_at > now());
  if target_link.id is null then raise exception 'This Join Group link is invalid, disabled, or expired.'; end if;

  select lower(email), full_name into account_email, account_name from public.profiles where id = (select auth.uid());
  if account_email is null then raise exception 'Complete your account before joining this organization.'; end if;

  select id, linked_user_id, platform_access_removed_at is not null
  into matched_official, matched_user, access_was_removed
  from public.officials
  where organization_id = target_link.organization_id and lower(email) = account_email and merged_into_official_id is null
  order by created_at limit 1;
  if matched_user is not null and matched_user <> (select auth.uid()) then
    raise exception 'A group official with this email is already linked to another account.';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (target_link.organization_id, (select auth.uid()), target_link.default_role, 'active')
  on conflict (organization_id, user_id, role) do update set status = 'active', updated_at = now();

  if matched_official is null then
    insert into public.officials (
      organization_id, full_name, email, linked_user_id, identity_status, source,
      source_display_name, pending_org_role, pending_org_roles, platform_access_removed_at
    ) values (
      target_link.organization_id, coalesce(nullif(account_name, ''), account_email), account_email,
      (select auth.uid()), 'linked', 'join_link', coalesce(nullif(account_name, ''), account_email),
      target_link.default_role, array[target_link.default_role]::public.membership_role[], null
    );
  else
    update public.officials set
      linked_user_id = (select auth.uid()), identity_status = 'linked',
      pending_org_role = target_link.default_role,
      pending_org_roles = case when access_was_removed then array[target_link.default_role]::public.membership_role[] else (
        select array_agg(distinct role_value) from unnest(
          coalesce(pending_org_roles, array[]::public.membership_role[]) || array[target_link.default_role]::public.membership_role[]
        ) role_value
      ) end,
      platform_access_removed_at = null, updated_at = now()
    where id = matched_official;
  end if;

  update public.profiles set platform_access_removed_at = null, updated_at = now() where id = (select auth.uid());
  update public.organization_join_links set last_used_at = now(), use_count = use_count + 1 where id = target_link.id;
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_link.organization_id, (select auth.uid()), 'membership.joined_via_link', 'organization_membership',
    (select auth.uid())::text, jsonb_build_object('join_link_id', target_link.id, 'role', target_link.default_role, 'fresh_access', access_was_removed));
  return query select organization.id, organization.name from public.organizations organization where organization.id = target_link.organization_id;
end;
$$;
revoke execute on function public.claim_organization_join_link(text) from public, anon;
grant execute on function public.claim_organization_join_link(text) to authenticated;
