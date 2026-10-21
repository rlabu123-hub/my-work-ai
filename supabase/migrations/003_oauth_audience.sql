begin;
-- Administrator-only resource binding. Set resource to https://YOUR_APP_DOMAIN/mcp before enabling the hook.
create table public.mcp_resource_config(singleton boolean primary key default true check(singleton),resource text not null check(resource like 'https://%/mcp'));
alter table public.mcp_resource_config enable row level security;
revoke all on public.mcp_resource_config from anon,authenticated;
create function public.mcp_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=event->'claims'; client text:=coalesce(event->>'client_id',event->'claims'->>'client_id'); resource_id text; uid uuid:=coalesce(event->>'user_id',event->'claims'->>'sub')::uuid;
begin
 if client is not null then
  select c.resource into resource_id from public.mcp_resource_config c where c.singleton=true;
  if resource_id is not null and exists(select 1 from public.mcp_grants g where g.user_id=uid and g.client_id=client and g.can_read) then
   claims:=jsonb_set(claims,'{aud}',jsonb_build_array('authenticated',resource_id));
  end if;
 end if;
 return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.mcp_access_token_hook(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.mcp_access_token_hook(jsonb) to supabase_auth_admin;
commit;
