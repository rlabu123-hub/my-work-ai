import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
test("PostgreSQL migrations, RLS isolation, OAuth grants, audit, and atomic idempotent approval", async () => {
  const db = new PGlite();
  await db.exec(
    `create role authenticated; create role anon;create role supabase_auth_admin; create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;create publication supabase_realtime;grant usage on schema public,auth,storage to authenticated,anon;alter default privileges in schema public grant all on tables to authenticated;alter default privileges in schema public grant usage on sequences to authenticated;`,
  );
  for (const file of [
    "001_initial.sql",
    "002_mcp_permissions.sql",
    "003_oauth_audience.sql",
    "004_dependencies.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into auth.users values('${A}'),('${B}');set role authenticated;`,
  );
  async function asUser(id: string, client?: string) {
    await db.query(`select set_config('request.jwt.claims',$1,false)`, [
      JSON.stringify({ sub: id, ...(client ? { client_id: client } : {}) }),
    ]);
  }
  await asUser(A);
  await db.query(
    `insert into public.projects(id,title) values($1,'Private A')`,
    [C],
  );
  const task = "10000000-0000-4000-8000-000000000001";
  await db.query(
    `insert into public.tasks(id,title,project_id) values($1,'A task',$2)`,
    [task, C],
  );
  const logs = await db.query(`select action from public.activity_logs`);
  assert.equal(logs.rows.length, 1);
  await asUser(B);
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
  assert.equal(
    (await db.query("select * from public.projects")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        `insert into public.tasks(title,user_id) values('intruder',$1)`,
        [A],
      ),
    /row-level security/,
  );
  await assert.rejects(
    () =>
      db.query(
        `insert into public.tasks(title,project_id) values('cross owner',$1)`,
        [C],
      ),
    /foreign key/,
  );
  await asUser(A, "oauth-client");
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
  await assert.rejects(
    () =>
      db.query(
        `insert into public.mcp_grants(client_id,can_read,can_write) values('oauth-client',true,true)`,
      ),
    /row-level security/,
  );
  await asUser(A);
  await db.query(
    `insert into public.mcp_grants(client_id,can_read,can_write) values('oauth-client',true,false)`,
  );
  await asUser(A, "oauth-client");
  assert.equal((await db.query("select * from public.tasks")).rows.length, 1);
  await db.exec(
    "reset role;insert into public.mcp_resource_config(resource) values('https://work.example/mcp');set role supabase_auth_admin;",
  );
  const hook = await db.query<{
    mcp_access_token_hook: { claims: { aud: string[] } };
  }>("select public.mcp_access_token_hook($1::jsonb)", [
    JSON.stringify({
      user_id: A,
      client_id: "oauth-client",
      claims: { sub: A, aud: "authenticated" },
    }),
  ]);
  assert.deepEqual(hook.rows[0].mcp_access_token_hook.claims.aud, [
    "authenticated",
    "https://work.example/mcp",
  ]);
  await db.exec("set role authenticated");
  await asUser(A, "oauth-client");
  await assert.rejects(
    () =>
      db
        .query(
          `update public.tasks set title='hacked' where id=$1 returning id`,
          [task],
        )
        .then((r) => {
          if (!r.rows.length) throw new Error("blocked");
        }),
    /blocked|row-level/,
  );
  const action = "20000000-0000-4000-8000-000000000001";
  await assert.rejects(
    () =>
      db.query(
        `insert into public.pending_actions(id,client_id,operation,payload) values($1,'oauth-client','create_task','{"title":"MCP task"}')`,
        [action],
      ),
    /row-level/,
  );
  await asUser(A);
  await db.query(`update public.mcp_grants set can_write=true`);
  await asUser(A, "oauth-client");
  await db.query(
    `insert into public.pending_actions(id,client_id,operation,payload) values($1,'oauth-client','create_task','{"title":"MCP task"}')`,
    [action],
  );
  assert.equal((await db.query("select * from public.tasks")).rows.length, 1);
  await assert.rejects(
    () => db.query(`select public.resolve_mcp_action($1,true)`, [action]),
    /App session/,
  );
  await asUser(B);
  assert.equal(
    (await db.query("select * from public.pending_actions")).rows.length,
    0,
  );
  await asUser(A);
  await db.query(`select public.resolve_mcp_action($1,true)`, [action]);
  await db.query(`select public.resolve_mcp_action($1,true)`, [action]);
  assert.equal((await db.query("select * from public.tasks")).rows.length, 2);
  assert.equal(
    (await db.query(`select * from public.tasks where id=$1`, [action])).rows
      .length,
    1,
  );
  await db.query(`delete from public.mcp_grants`);
  await asUser(A, "oauth-client");
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
  await asUser(A);
  const dependent = "30000000-0000-4000-8000-000000000001";
  await db.query(
    "select public.save_task_with_dependencies($1::jsonb,$2::uuid[])",
    [JSON.stringify({ id: dependent, title: "dependent" }), [task]],
  );
  assert.equal(
    (await db.query("select * from public.task_dependencies")).rows.length,
    1,
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.save_task_with_dependencies($1::jsonb,$2::uuid[])",
        [JSON.stringify({ id: task, title: "cyclic edit" }), [dependent]],
      ),
    /순환/,
  );
  assert.equal(
    (
      await db.query<{ title: string }>(
        "select title from public.tasks where id=$1",
        [task],
      )
    ).rows[0].title,
    "A task",
  );
  await db.close();
});
