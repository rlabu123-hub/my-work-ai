begin;
create function public.save_task_with_dependencies(task_data jsonb,dependency_ids uuid[]) returns void language plpgsql security invoker set search_path=public as $$
declare tid uuid:=(task_data->>'id')::uuid;has_cycle boolean;
begin
 if auth.uid() is null or (auth.jwt()->>'client_id') is not null then raise exception 'App session required';end if;
 insert into public.tasks(id,user_id,title,description,project_id,goal_id,start_date,due_date,importance,urgency,estimated_minutes,actual_minutes,status,manual_priority,notes,position)
 values(tid,auth.uid(),task_data->>'title',coalesce(task_data->>'description',''),(task_data->>'project_id')::uuid,(task_data->>'goal_id')::uuid,(task_data->>'start_date')::date,(task_data->>'due_date')::date,coalesce((task_data->>'importance')::int,3),coalesce((task_data->>'urgency')::int,3),coalesce((task_data->>'estimated_minutes')::int,30),coalesce((task_data->>'actual_minutes')::int,0),coalesce(task_data->>'status','todo'),(task_data->>'manual_priority')::int,coalesce(task_data->>'notes',''),coalesce((task_data->>'position')::double precision,0))
 on conflict(id) do update set title=excluded.title,description=excluded.description,project_id=excluded.project_id,goal_id=excluded.goal_id,start_date=excluded.start_date,due_date=excluded.due_date,importance=excluded.importance,urgency=excluded.urgency,estimated_minutes=excluded.estimated_minutes,actual_minutes=excluded.actual_minutes,status=excluded.status,manual_priority=excluded.manual_priority,notes=excluded.notes,position=excluded.position;
 delete from public.task_dependencies where task_id=tid and user_id=auth.uid();
 insert into public.task_dependencies(user_id,task_id,depends_on) select auth.uid(),tid,id from (select distinct unnest(dependency_ids) as id) d;
 with recursive deps(id) as (select depends_on from public.task_dependencies where task_id=tid and user_id=auth.uid() union select d.depends_on from public.task_dependencies d join deps p on d.task_id=p.id where d.user_id=auth.uid()) select exists(select 1 from deps where id=tid) into has_cycle;
 if has_cycle then raise exception '선행 업무가 순환합니다.';end if;
end $$;
revoke all on function public.save_task_with_dependencies(jsonb,uuid[]) from public;
grant execute on function public.save_task_with_dependencies(jsonb,uuid[]) to authenticated;
alter publication supabase_realtime add table public.task_dependencies;
commit;
