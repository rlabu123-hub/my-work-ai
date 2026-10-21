begin;
create table public.mcp_grants(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,client_id text not null,can_read boolean not null default true,can_write boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,client_id));
alter table public.mcp_grants enable row level security;
create policy manage_mcp_grants on public.mcp_grants for all to authenticated using(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null) with check(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create table public.pending_actions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,client_id text not null,operation text not null check(operation in ('create_task','update_task','complete_task','create_goal')),payload jsonb not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,client_id,id));
alter table public.pending_actions enable row level security;
create policy read_pending on public.pending_actions for select to authenticated using(user_id=auth.uid() and ((auth.jwt()->>'client_id') is null or client_id=auth.jwt()->>'client_id'));
create policy insert_pending on public.pending_actions for insert to authenticated with check(user_id=auth.uid() and client_id=auth.jwt()->>'client_id' and status='pending' and exists(select 1 from public.mcp_grants g where g.user_id=auth.uid() and g.client_id=auth.jwt()->>'client_id' and g.can_write));
create policy approve_pending on public.pending_actions for update to authenticated using(user_id=auth.uid() and (auth.jwt()->>'client_id') is null) with check(user_id=auth.uid() and (auth.jwt()->>'client_id') is null);
-- OAuth tokens must never bypass the MCP server's confirmation flow by calling the data API directly.
-- Read access is allowed only after an application-specific read grant; direct writes require a normal app session.
create function public.mcp_read_allowed() returns boolean language sql stable security definer set search_path=public as $$ select (auth.jwt()->>'client_id') is null or exists(select 1 from public.mcp_grants g where g.user_id=auth.uid() and g.client_id=auth.jwt()->>'client_id' and g.can_read); $$;
revoke all on function public.mcp_read_allowed() from public;
grant execute on function public.mcp_read_allowed() to authenticated;
do $$ declare t text;begin foreach t in array array['projects','goals','tasks','task_dependencies','schedules','recordings','transcripts','meeting_notes','action_items','ai_recommendations','activity_logs','integration_connections','notification_preferences'] loop
 execute format('drop policy own_rows on public.%I',t);
 execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid())=user_id and (select public.mcp_read_allowed()))',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id and (select auth.jwt()->>''client_id'') is null)',t);
 execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid())=user_id and (select auth.jwt()->>''client_id'') is null) with check ((select auth.uid())=user_id and (select auth.jwt()->>''client_id'') is null)',t);
 execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id and (select auth.jwt()->>''client_id'') is null)',t);
 end loop;end $$;
create policy own_grant_read on public.mcp_grants for select to authenticated using(user_id=auth.uid() and client_id=auth.jwt()->>'client_id');
-- Approval and mutation run in one transaction; retries cannot create duplicate tasks.
create function public.resolve_mcp_action(action_id uuid,approve boolean) returns void language plpgsql security invoker set search_path=public as $$
declare a public.pending_actions; p jsonb;begin
 if (auth.jwt()->>'client_id') is not null then raise exception 'App session required';end if;
 select * into a from public.pending_actions where id=action_id and user_id=auth.uid() for update;
 if not found then raise exception 'Action not found';end if;
 if a.status<>'pending' then return;end if;
 if a.created_at<now()-interval '24 hours' then raise exception 'Action expired';end if;
 if approve then
 if not exists(select 1 from public.mcp_grants g where g.user_id=auth.uid() and g.client_id=a.client_id and g.can_write) then raise exception 'Permission revoked';end if;
 p=a.payload;
 if a.operation='create_task' then insert into public.tasks(id,user_id,title,description,project_id,due_date) values(a.id,auth.uid(),p->>'title',coalesce(p->>'description',''),(p->>'project_id')::uuid,(p->>'due_date')::date);
 elsif a.operation='update_task' then update public.tasks set title=coalesce(p->>'title',title),description=coalesce(p->>'description',description),due_date=case when p?'due_date' then (p->>'due_date')::date else due_date end where id=(p->>'task_id')::uuid and user_id=auth.uid();if not found then raise exception 'Task not found';end if;
 elsif a.operation='complete_task' then update public.tasks set status='done' where id=(p->>'task_id')::uuid and user_id=auth.uid();if not found then raise exception 'Task not found';end if;
 elsif a.operation='create_goal' then insert into public.goals(id,user_id,title,description,project_id,kpi,target) values(a.id,auth.uid(),p->>'title',coalesce(p->>'description',''),(p->>'project_id')::uuid,coalesce(p->>'kpi',''),coalesce((p->>'target')::numeric,100));
 end if;
 end if;
 update public.pending_actions set status=case when approve then 'approved' else 'rejected' end,updated_at=now() where id=a.id;
 insert into public.activity_logs(user_id,action,entity_id) values(auth.uid(),'mcp.'||a.operation||case when approve then '.approved' else '.rejected' end,a.id);
end $$;
revoke all on function public.resolve_mcp_action(uuid,boolean) from public;
grant execute on function public.resolve_mcp_action(uuid,boolean) to authenticated;
alter publication supabase_realtime add table public.pending_actions;
-- No raw recording access for third-party OAuth clients.
drop policy private_recordings_select on storage.objects;
create policy private_recordings_select on storage.objects for select to authenticated using(bucket_id='recordings' and (storage.foldername(name))[1]=(select auth.uid())::text and (select auth.jwt()->>'client_id') is null);
drop policy private_recordings_insert on storage.objects;
create policy private_recordings_insert on storage.objects for insert to authenticated with check(bucket_id='recordings' and (storage.foldername(name))[1]=(select auth.uid())::text and (select auth.jwt()->>'client_id') is null);
drop policy private_recordings_delete on storage.objects;
create policy private_recordings_delete on storage.objects for delete to authenticated using(bucket_id='recordings' and (storage.foldername(name))[1]=(select auth.uid())::text and (select auth.jwt()->>'client_id') is null);
commit;
