import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Starts the real server under the given runtime, waits for /health, then
 * sends SIGTERM and expects a clean exit. Usage: node apps/server/scripts/smoke-server.ts node|bun
 */
const runtime = process.argv[2] ?? "node";
if (runtime !== "node" && runtime !== "bun") {
  console.error(`unknown runtime ${runtime}, expected node or bun`);
  process.exit(1);
}

const port = "3999";
const child = spawn(runtime, ["apps/server/src/main.ts"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    PORT: port,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://smoke:smoke@127.0.0.1:1/smoke",
    WEB_ORIGIN: "http://localhost:5173",
    DATA_BASE_URL: "http://data.localhost:8788",
    PUBLISH_TARGET: "fs",
    FS_PUBLISH_DIR: mkdtempSync(join(tmpdir(), "smoke-publish-")),
  },
});
const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));

async function healthy(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const ok = await healthy();
child.kill("SIGTERM");
const code = await exited;
if (!ok) {
  console.error(`server smoke on ${runtime}: /health never answered`);
  process.exit(1);
}
if (code !== 0) {
  console.error(`server smoke on ${runtime}: exit code ${code} after SIGTERM`);
  process.exit(1);
}
console.log(`server smoke ok on ${runtime}`);
