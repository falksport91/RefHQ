alter table public.games
  add column if not exists tags text[] not null default '{}'::text[];

comment on column public.games.tags is
  'Short operational labels displayed with a game. Tags are preserved when schedules are reimported.';

create or replace function public.update_game_details(game_uuid uuid, requested_game jsonb)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games;
  updated_game public.games;
  target_event public.events;
  normalized_tags text[];
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;
  select * into target_game from public.games where id = game_uuid for update;
  if target_game.id is null or not public.can_manage_game(target_game.id, target_game.event_id) then
    raise exception 'You do not have permission to edit this game.';
  end if;
  if nullif(trim(requested_game ->> 'field_name'), '') is null
     or nullif(trim(requested_game ->> 'home_team'), '') is null
     or nullif(trim(requested_game ->> 'away_team'), '') is null
     or nullif(requested_game ->> 'starts_at', '') is null then
    raise exception 'Date, time, field, and both teams are required.';
  end if;
  if requested_game ? 'tags' and jsonb_typeof(requested_game -> 'tags') <> 'array' then
    raise exception 'Game tags must be an array.';
  end if;

  select coalesce(array_agg(tag order by ordinal), '{}'::text[])
  into normalized_tags
  from (
    select trim(value) as tag, ordinal
    from jsonb_array_elements_text(coalesce(requested_game -> 'tags', to_jsonb(target_game.tags))) with ordinality as item(value, ordinal)
    where trim(value) <> '' and length(trim(value)) <= 40 and ordinal <= 12
  ) clean_tags;

  update public.games
  set starts_at = (requested_game ->> 'starts_at')::timestamptz,
      field_name = trim(requested_game ->> 'field_name'),
      venue_name = nullif(trim(requested_game ->> 'venue_name'), ''),
      home_team = trim(requested_game ->> 'home_team'),
      away_team = trim(requested_game ->> 'away_team'),
      division = coalesce(trim(requested_game ->> 'division'), ''),
      age_group = nullif(trim(requested_game ->> 'age_group'), ''),
      gender = nullif(trim(requested_game ->> 'gender'), ''),
      game_type = nullif(trim(requested_game ->> 'game_type'), ''),
      operational = coalesce((requested_game ->> 'operational')::boolean, false),
      tags = normalized_tags,
      schedule_changed_at = now(),
      schedule_changed_by = (select auth.uid()),
      schedule_change_summary = 'Game information updated'
  where id = target_game.id
  returning * into updated_game;

  select * into target_event from public.events where id = target_game.event_id;
  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
  values (target_event.organization_id, target_event.id, (select auth.uid()), 'game.updated', 'game', target_game.id::text,
    jsonb_build_object('before', to_jsonb(target_game), 'after', to_jsonb(updated_game), 'notifications_sent', false));
  return updated_game;
end;
$$;

create or replace function public.swap_game_details(first_game_uuid uuid, second_game_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  first_game public.games;
  second_game public.games;
  target_event public.events;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;
  if first_game_uuid is null or second_game_uuid is null or first_game_uuid = second_game_uuid then
    raise exception 'Choose two different games.';
  end if;
  perform 1 from public.games where id in (first_game_uuid, second_game_uuid) order by id for update;
  select * into first_game from public.games where id = first_game_uuid;
  select * into second_game from public.games where id = second_game_uuid;
  if first_game.id is null or second_game.id is null then raise exception 'One of the selected games no longer exists.'; end if;
  if first_game.event_id <> second_game.event_id then raise exception 'Game details can only be swapped within the same event.'; end if;
  if not public.can_manage_game(first_game.id, first_game.event_id)
     or not public.can_manage_game(second_game.id, second_game.event_id) then
    raise exception 'You do not have permission to edit both selected games.';
  end if;

  update public.games set
    home_team = second_game.home_team, away_team = second_game.away_team,
    division = second_game.division, age_group = second_game.age_group,
    gender = second_game.gender, game_type = second_game.game_type,
    operational = second_game.operational, tags = second_game.tags,
    schedule_changed_at = now(), schedule_changed_by = (select auth.uid()),
    schedule_change_summary = 'Game details swapped between schedule slots'
  where id = first_game.id;
  update public.games set
    home_team = first_game.home_team, away_team = first_game.away_team,
    division = first_game.division, age_group = first_game.age_group,
    gender = first_game.gender, game_type = first_game.game_type,
    operational = first_game.operational, tags = first_game.tags,
    schedule_changed_at = now(), schedule_changed_by = (select auth.uid()),
    schedule_change_summary = 'Game details swapped between schedule slots'
  where id = second_game.id;

  select * into target_event from public.events where id = first_game.event_id;
  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
  values (target_event.organization_id, target_event.id, (select auth.uid()), 'game.details_swapped', 'event', target_event.id::text,
    jsonb_build_object('first_game_id', first_game.id, 'second_game_id', second_game.id,
      'schedule_slots_changed', false, 'crews_changed', false, 'ratings_changed', false, 'notifications_sent', false));
  return jsonb_build_object('event_id', target_event.id, 'first_game_id', first_game.id, 'second_game_id', second_game.id);
end;
$$;

revoke all on function public.update_game_details(uuid, jsonb) from public, anon;
grant execute on function public.update_game_details(uuid, jsonb) to authenticated;
revoke all on function public.swap_game_details(uuid, uuid) from public, anon;
grant execute on function public.swap_game_details(uuid, uuid) to authenticated;
