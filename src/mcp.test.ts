// @vitest-environment node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { saveKey, forgetKey } from "./credentials";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp";

it("registers the nine branded tools over MCP without writing to stdout", async () => {
  const output = vi.spyOn(process.stdout, "write");
  const server = createMcpServer();
  const client = new Client({ name: "integration-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "estimate_sprite", "create_character", "animate_character", "get_generation", "list_characters", "list_actions", "improve_prompt", "upload_character", "export_sprite_sheet",
    ].sort());
    for (const name of ["create_character", "animate_character"]) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.inputSchema.required).toContain("client_key");
      expect(tool.inputSchema.required).toContain("max_credits");
      expect(tool.annotations?.readOnlyHint).toBe(false);
    }
    expect(tools.find(t => t.name === "list_actions")?.description).toContain("cli_exportable");
    expect(tools.find(t => t.name === "list_actions")?.description).toContain("download the MP4");
    expect(output).not.toHaveBeenCalled();
  } finally { await client.close(); await server.close(); output.mockRestore(); }
});

it("a refused key is forgotten, so a key saved later by login is used without restarting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ssg-mcp-"));
  vi.stubEnv("XDG_CONFIG_HOME", dir); vi.stubEnv("SPRITESHEETGEN_API_KEY", ""); vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "");
  await saveKey("ak_old.revokedrevokedrevoked", join(dir, "spritesheetgen", "credentials"));
  const auths: string[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const auth = (init?.headers as Record<string, string>).authorization;
    auths.push(auth);
    return auth.includes("ak_old")
      ? Response.json({ ok: false, error: { code: "AUTH_ERROR", message: "invalid API key" } }, { status: 401 })
      : Response.json({ ok: true, data: { characters: [], next_cursor: null } });
  }));
  const server = createMcpServer();
  const client = new Client({ name: "integration-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    const first = await client.callTool({ name: "list_characters", arguments: { source: "generated" } });
    expect(first.isError).toBe(true);
    await saveKey("ak_new.workingworkingworking", join(dir, "spritesheetgen", "credentials"));
    const second = await client.callTool({ name: "list_characters", arguments: { source: "generated" } });
    expect(second.isError).toBeFalsy();
    expect(auths).toEqual(["Bearer ak_old.revokedrevokedrevoked", "Bearer ak_new.workingworkingworking"]);
  } finally { await client.close(); await server.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});

it("uses a newly saved valid key on the next call and stops after logout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ssg-mcp-"));
  const file = join(dir, "spritesheetgen", "credentials");
  vi.stubEnv("XDG_CONFIG_HOME", dir); vi.stubEnv("SPRITESHEETGEN_API_KEY", ""); vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "");
  const auths: string[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    auths.push((init?.headers as Record<string, string>).authorization);
    return Response.json({ ok: true, data: { characters: [], next_cursor: null } });
  }));
  const server = createMcpServer();
  const client = new Client({ name: "integration-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    for (const key of ["ak_first.workingworkingworking", "ak_second.workingworkingworking"]) {
      await saveKey(key, file);
      expect((await client.callTool({ name: "list_characters", arguments: { source: "generated" } })).isError).toBeFalsy();
    }
    await forgetKey(file);
    expect((await client.callTool({ name: "list_characters", arguments: { source: "generated" } })).isError).toBe(true);
    expect(auths).toEqual(["Bearer ak_first.workingworkingworking", "Bearer ak_second.workingworkingworking"]);
  } finally { await client.close(); await server.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
