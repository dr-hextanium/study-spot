import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Env } from "../src/env.ts";

const root = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path), "utf8");

/** Splits a blueprint's envVars list into key -> block text without a YAML dependency. */
function envBlocks(yaml: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const parts = yaml.split(/^\s+- key: /m).slice(1);
  for (const part of parts) {
    const key = part.split("\n")[0]?.trim();
    if (key) blocks.set(key, part);
  }
  return blocks;
}

test("render.yaml env keys match env.ts, plus NODE_VERSION, minus PORT and FS_PUBLISH_DIR", () => {
  const fromEnv = new Set<string>();
  for (const option of Env.options) for (const key of Object.keys(option.shape)) fromEnv.add(key);
  fromEnv.delete("PORT");
  fromEnv.delete("FS_PUBLISH_DIR");
  fromEnv.add("NODE_VERSION");
  expect([...envBlocks(read("render.yaml")).keys()].sort()).toEqual([...fromEnv].sort());
});

test("secrets and origins are prompted with sync false and never carry a value", () => {
  const blocks = envBlocks(read("render.yaml"));
  for (const key of [
    "DATABASE_URL",
    "CF_API_TOKEN",
    "CF_ACCOUNT_ID",
    "WEB_ORIGIN",
    "DATA_BASE_URL",
  ]) {
    const block = blocks.get(key) ?? "";
    expect(block).toContain("sync: false");
    expect(block).not.toContain("value:");
  }
  expect(blocks.get("PUBLISH_TARGET")).toContain('value: "pages"');
});

test("the service uses the free plan, the health path, and the Node start command", () => {
  const yaml = read("render.yaml");
  expect(yaml).toContain("plan: free");
  expect(yaml).toContain("healthCheckPath: /health");
  expect(yaml).toContain("startCommand: node apps/server/src/main.ts");
  // Bare off is YAML boolean false, which Render would reject.
  expect(yaml).toContain('autoDeployTrigger: "off"');
});

test("the server never runs migrations on start", () => {
  const files = readdirSync(root("apps/server/src"), { recursive: true, encoding: "utf8" });
  for (const file of files.filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(root(`apps/server/src/${file}`), "utf8");
    expect(text).not.toMatch(/migrate\(|db:migrate|drizzle-orm\/postgres-js\/migrator/);
  }
});

test("migrations run only from migrate.yml, behind the production environment and a host guard", () => {
  const wf = read(".github/workflows/migrate.yml");
  expect(wf).toContain("workflow_dispatch:");
  expect(wf).toContain('- "v*"');
  expect(wf).not.toContain("pull_request");
  expect(wf).toContain("environment: production");
  expect(wf.indexOf("assert-db-host.ts")).toBeGreaterThan(-1);
  expect(wf.indexOf("assert-db-host.ts")).toBeLessThan(wf.indexOf("bun run db:migrate"));
  expect(wf.indexOf("bun run db:migrate")).toBeLessThan(wf.indexOf("RENDER_DEPLOY_HOOK_URL"));
});

test("the backup workflow encrypts before upload and never uploads a plain dump", () => {
  const wf = read(".github/workflows/backup.yml");
  expect(wf).toContain("environment: backup");
  expect(wf).toContain("age -r");
  expect(wf).toContain("retention-days: 90");
  expect(wf).toContain("path: backup.dump.age");
  expect(wf).not.toMatch(/path:\s*backup\.dump\s*$/m);
});
