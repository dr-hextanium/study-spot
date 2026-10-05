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

test("render.yaml env keys match env.ts, plus NODE_VERSION, minus PORT, FS_PUBLISH_DIR, and RENDER_GIT_COMMIT", () => {
  const fromEnv = new Set<string>();
  for (const option of Env.options) for (const key of Object.keys(option.shape)) fromEnv.add(key);
  fromEnv.delete("PORT");
  fromEnv.delete("FS_PUBLISH_DIR");
  // Render sets this one itself on every deploy.
  fromEnv.delete("RENDER_GIT_COMMIT");
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

test("the release smoke is told which commit must be live", () => {
  const smoke = read(".github/workflows/smoke-deploy.yml");
  expect(smoke).toMatch(/workflow_call:\s*\n\s+inputs:\s*\n\s+expected_commit:/);
  expect(smoke).toMatch(/EXPECTED_COMMIT: \$\{\{ inputs\.expected_commit \}\}/);
  const migrate = read(".github/workflows/migrate.yml");
  expect(migrate).toMatch(/with:\s*\n\s+expected_commit: \$\{\{ github\.sha \}\}/);
});

test("migrate and backup both require the direct database host", () => {
  for (const name of ["migrate.yml", "backup.yml"]) {
    expect(read(`.github/workflows/${name}`)).toContain(
      "run: node apps/server/scripts/assert-db-host.ts --direct",
    );
  }
});

test("DATABASE_URL is set only on the steps that use it, never for a whole job", () => {
  // Job-level env keys sit at 6 spaces, step-level env keys at 10.
  for (const [name, steps] of [
    ["migrate.yml", 2],
    ["backup.yml", 3],
  ] as const) {
    const wf = read(`.github/workflows/${name}`);
    expect(wf).not.toMatch(/^ {6}DATABASE_URL:/m);
    expect(wf.match(/^ {10}DATABASE_URL: /gm)?.length).toBe(steps);
    expect(wf.match(/DATABASE_URL: /g)?.length).toBe(steps);
  }
});

test("the release, smoke, and backup jobs and the deploy hook call are time bound", () => {
  expect(read(".github/workflows/smoke-deploy.yml")).toContain("    timeout-minutes: 15\n");
  expect(read(".github/workflows/backup.yml")).toContain("    timeout-minutes: 30\n");
  const migrate = read(".github/workflows/migrate.yml");
  expect(migrate).toContain("    timeout-minutes: 20\n");
  expect(migrate).toMatch(/curl -fsS --max-time 30 -X POST/);
});

const workflows = () =>
  readdirSync(root(".github/workflows"))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => [f, read(`.github/workflows/${f}`)] as const);

test("each database secret is referenced by exactly one workflow", () => {
  const users = (secret: string) =>
    workflows()
      .filter(([, text]) => text.includes(secret))
      .map(([name]) => name);
  expect(users("DATABASE_URL_DIRECT")).toEqual(["migrate.yml"]);
  expect(users("BACKUP_DATABASE_URL")).toEqual(["backup.yml"]);
});

test("secrets reach scripts only through env mappings, and no workflow traces commands", () => {
  for (const [name, text] of workflows()) {
    const secretLines = text.split("\n").filter((line) => line.includes("secrets."));
    for (const line of secretLines) {
      expect({ name, line }).toEqual({
        name,
        line: expect.stringMatching(/^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/),
      });
    }
    expect(text).not.toMatch(/set -[a-wyz]*x/);
  }
});

test("the backup dump is one guarded, strict, encrypted pipeline", () => {
  const wf = read(".github/workflows/backup.yml");
  const dumpLines = wf.split("\n").filter((line) => /pg_dump"? -Fc/.test(line));
  expect(dumpLines).toHaveLength(1);
  expect(dumpLines[0]).toMatch(
    /pg_dump"? -Fc [^|]*"\$DATABASE_URL" \| age -r "\$BACKUP_AGE_RECIPIENT" > backup\.dump\.age$/,
  );
  expect(wf.match(/pg_dump[^\n]*\| age -r/g)).toHaveLength(1);
  const dumpStep = wf.slice(wf.indexOf("- name: Dump and encrypt"));
  const dumpScript = dumpStep.slice(dumpStep.indexOf("run: |"));
  expect(dumpScript.split("pg_dump")[0]).toContain("set -euo pipefail");
  expect(wf.indexOf("assert-db-host.ts --direct")).toBeGreaterThan(-1);
  expect(wf.indexOf("assert-db-host.ts --direct")).toBeLessThan(wf.indexOf("bin/psql"));
  expect(wf.indexOf("bin/psql")).toBeLessThan(wf.indexOf("- name: Dump and encrypt"));
  expect(wf).toContain("if-no-files-found: error");
  expect(wf.match(/^\s+path: .*$/gm)).toEqual(["          path: backup.dump.age"]);
});

test("releases queue one at a time and deploy through the hook from env", () => {
  const wf = read(".github/workflows/migrate.yml");
  expect(wf).toMatch(
    /^concurrency:\n {2}group: production-release\n {2}cancel-in-progress: false$/m,
  );
  const hook = wf.split("\n").filter((line) => line.includes("RENDER_DEPLOY_HOOK_URL"));
  expect(hook).toHaveLength(2);
  expect(hook[0]).toMatch(
    /^ {8}run: curl -fsS --max-time 30 -X POST "\$\{RENDER_DEPLOY_HOOK_URL\}&ref=\$\{GITHUB_SHA\}" > \/dev\/null$/,
  );
  expect(hook[1]).toMatch(
    /^ {10}RENDER_DEPLOY_HOOK_URL: \$\{\{ secrets\.RENDER_DEPLOY_HOOK_URL \}\}$/,
  );
  expect(wf).toMatch(
    /^ {2}smoke:\n {4}needs: migrate\n {4}uses: \.\/\.github\/workflows\/smoke-deploy\.yml$/m,
  );
});
