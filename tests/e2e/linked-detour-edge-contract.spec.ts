import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, test } from "@playwright/test";

const edgeSource = readFileSync("supabase/functions/hdms-api/index.ts", "utf8");
const edgeCode = ts.transpileModule(edgeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const payload = {
  id: "D-808f2278-c99e-4269-af57-e5f33e0fa6bc", recordType: "DETOUR", linkedDetourCreate: true, detourRefId: "F-1",
  latStart: 6.82, lonStart: 101.21, latEnd: 6.83, lonEnd: 101.23,
  coordinates: [[101.21, 6.82], [101.23, 6.83]], detourName: "ทางเลี่ยงทดสอบ", directionMode: "FORWARD_ONLY",
  detourMeta: { start_point_photo: { url: "https://example.invalid/a" }, end_point_photo: { url: "https://example.invalid/b" } },
};

function testEdge({ race = false, archived = false, linkErrors = false } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  const links = new Set(["D-before"]);
  const writes: string[] = [];
  let appendCount = 0;
  let handler!: (request: Request) => Promise<Response>;
  const client = {
    from(table: string) {
      expect(table).toBe("doh_detour_routes");
      return {
        select: () => ({ eq: (_column: string, id: string) => ({
          single: async () => ({ data: rows.get(id) }),
          is: () => ({ maybeSingle: async () => {
            const data = rows.get(id);
            return { data: data?.deleted_at ? null : data };
          } }),
        }) }),
        insert: async (row: Record<string, unknown>) => {
          const id = String(row.id);
          writes.push(id);
          if (race || archived) {
            rows.set(id, { ...row, deleted_at: archived ? "2026-11-26" : null });
            return { error: { code: "23505" } };
          }
          rows.set(id, row);
          return { error: null };
        },
        upsert: () => { throw new Error("Linked create must not overwrite a route"); },
      };
    },
    rpc: async (name: string, args: { p_flood_id: string; p_detour_id: string }) => {
      expect(name).toBe("doh_append_event_detour_link");
      expect(args.p_flood_id).toBe("F-1");
      expect(rows.has(args.p_detour_id)).toBe(true);
      appendCount++;
      if (appendCount === 1 && !race) {
        return linkErrors ? { data: null, error: { code: "22023" } } : { data: false, error: null };
      }
      links.add(args.p_detour_id);
      return { data: true, error: null };
    },
  };
  runInNewContext(edgeCode, {
    exports: {},
    require: (name: string) => {
      expect(name).toContain("@supabase/supabase-js");
      return { createClient: () => client };
    },
    Deno: {
      env: { get: () => "test-value" },
      serve: (callback: typeof handler) => { handler = callback; },
    },
    Response, URL, console, crypto,
  });
  const submit = (body = payload) => handler(new Request("https://example.invalid/hdms-api", {
    method: "POST", body: JSON.stringify({ action: "upsertRouteAction", args: [body], light: true }),
  }));
  return { submit, rows, links, writes };
}

for (const linkErrors of [false, true]) {
  test(`Edge acknowledges a saved row without confirming an unsuccessful append (RPC ${linkErrors ? "error" : "false"})`, async () => {
    const { submit, rows, links, writes } = testEdge({ linkErrors });
    const first = await submit();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true, savedId: payload.id, detourLinkState: "PENDING" });
    expect([...links]).toEqual(["D-before"]);
    expect(rows.get(payload.id)?.detour_meta).toEqual(payload.detourMeta);

    for (let i = 0; i < 2; i++) {
      const repeat = await submit();
      expect(await repeat.json()).toEqual({ success: true, savedId: payload.id, detourLinkState: "LINKED" });
    }
    expect(writes).toEqual([payload.id]);
    expect(rows.size).toBe(1);
    expect([...links]).toEqual(["D-before", payload.id]);
    expect(rows.get(payload.id)?.detour_meta).toEqual(payload.detourMeta);
  });
}

test("Edge recovers a concurrent same-ID insert, but does not relink an archived row", async () => {
  const race = testEdge({ race: true });
  expect(await (await race.submit()).json()).toEqual({ success: true, savedId: payload.id, detourLinkState: "LINKED" });
  expect([...race.links]).toEqual(["D-before", payload.id]);

  const archived = testEdge({ archived: true });
  expect((await archived.submit()).status).toBe(409);
  expect([...archived.links]).toEqual(["D-before"]);
  expect(archived.rows.get(payload.id)?.deleted_at).toBeTruthy();
});
