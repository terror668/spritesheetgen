// @vitest-environment node
import { mkdtemp, readFile, stat, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { checkKeyShape, credentialsPath, forgetKey, loadKey, saveKey } from "./credentials";

const KEY = "ak_8f0c5cb3b4986a808e86.abcdefghijklmnopqrstuvwxyz_-0123456789AB";

it("stores the key under the user's config directory", () => {
  expect(credentialsPath({ XDG_CONFIG_HOME: "/cfg" }, "linux")).toBe("/cfg/spritesheetgen/credentials");
  expect(credentialsPath({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32")).toContain("spritesheetgen");
});

it("the environment wins over the login file, which is used when the environment has none", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ssg-cred-"));
  const env = { XDG_CONFIG_HOME: dir };
  expect(loadKey(env)).toBeUndefined();
  await saveKey(KEY, credentialsPath(env));
  expect(loadKey(env)).toBe(KEY);
  expect(loadKey({ ...env, SPRITESHEETGEN_API_KEY: "from-env" })).toBe("from-env");
  await forgetKey(credentialsPath(env));
  expect(loadKey(env)).toBeUndefined();
});

it("the saved file is readable only by its owner, also when it existed before", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "ssg-cred-")), "spritesheetgen", "credentials");
  await saveKey(KEY, file);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  await chmod(dirname(file), 0o755);
  await chmod(file, 0o644);
  await writeFile(file, "old");
  await saveKey(KEY, file);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect((await stat(dirname(file))).mode & 0o777).toBe(0o700);
  expect((await readFile(file, "utf8")).trim()).toBe(KEY);
});

it("accepts an issued key (trimmed) and refuses paste mistakes", () => {
  expect(checkKeyShape(`  ${KEY}\n`)).toBe(KEY);
  for (const bad of ["", "sk_live_123", "ak_abc", `Bearer ${KEY}`, `${KEY} ${KEY}`]) expect(() => checkKeyShape(bad)).toThrow(/ak_/);
});

it("replaces a credentials symlink without modifying its target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ssg-cred-"));
  const target = join(dir, "unrelated");
  const file = join(dir, "credentials");
  await writeFile(target, "keep");
  await symlink(target, file);
  await saveKey(KEY, file);
  expect(await readFile(target, "utf8")).toBe("keep");
  expect((await readFile(file, "utf8")).trim()).toBe(KEY);
});
