import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMcpServer } from "../lib/mcp";
const user = "00000000-0000-4000-8000-000000000001";
test("MCP SDK advertises ten tools, guards writes, validates inputs and stages changes", async () => {
  const staged: Record<string, unknown>[] = [];
  let taskWrites = 0;
  const db = {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        async insert(row: Record<string, unknown>) {
          if (table === "tasks") taskWrites++;
          if (table === "pending_actions") staged.push(row);
          return { error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  for (const canWrite of [false, true]) {
    const server = createMcpServer(db, user, "test-client", canWrite);
    const client = new Client({ name: "test", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const list = await client.listTools();
    assert.equal(list.tools.length, 10);
    assert.equal(
      list.tools.find((t) => t.name === "list_tasks")?.annotations
        ?.readOnlyHint,
      true,
    );
    assert.equal(
      list.tools.find((t) => t.name === "create_task")?.annotations
        ?.readOnlyHint,
      false,
    );
    const call = await client.callTool({
      name: "create_task",
      arguments: {
        request_id: crypto.randomUUID(),
        title: "ChatGPT 등록 업무",
      },
    });
    if (!canWrite) {
      assert.equal(call.isError, true);
      assert.equal(staged.length, 0);
    } else {
      assert.notEqual(call.isError, true);
      assert.equal(staged.length, 1);
      assert.equal(staged[0].operation, "create_task");
      assert.equal(staged[0].user_id, user);
      assert.equal(taskWrites, 0);
    }
    const invalid = await client.callTool({
      name: "create_task",
      arguments: { request_id: "invalid", title: "invalid" },
    });
    assert.equal(invalid.isError, true);
    await client.close();
    await server.close();
  }
});
