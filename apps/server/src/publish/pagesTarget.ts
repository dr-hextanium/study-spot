import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { MUTABLE_PATHS, type PublishFile, type PublishTarget } from "./target.ts";

/*
 * Cloudflare Pages direct upload, the same calls wrangler 4.147 makes
 * (wrangler-dist/cli.js, src/pages/upload.ts and src/api/pages/deploy.ts):
 *   GET  /accounts/{account}/pages/projects/{project}/upload-token   (API token) -> { jwt }
 *   POST /pages/assets/check-missing  { hashes }                      (JWT) -> missing hashes
 *   POST /pages/assets/upload         [{ key, value, metadata, base64 }] (JWT)
 *   POST /pages/assets/upsert-hashes  { hashes }                      (JWT)
 *   POST /accounts/{account}/pages/projects/{project}/deployments     (API token)
 *        multipart: manifest = {"/path": hash}, _headers file; no branch = production
 */

export const CF_API = "https://api.cloudflare.com/client/v4";
/** wrangler's per-request upload bucket limits. */
const MAX_BATCH_BYTES = 40 * 1024 * 1024;
const MAX_BATCH_FILES = 2000;

/** Pages asset key: blake3 of base64(content) + extension (no dot), first 32 hex chars. */
export function pagesHash(bytes: Uint8Array, path: string): string {
  const dot = path.lastIndexOf(".");
  const extension = dot === -1 ? "" : path.slice(dot + 1);
  const input = new TextEncoder().encode(Buffer.from(bytes).toString("base64") + extension);
  return bytesToHex(blake3(input)).slice(0, 32);
}

const Envelope = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number(), message: z.string() })).default([]),
  result: z.unknown(),
});

/** The slice of fetch this target uses, so tests can pass a plain function. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PagesTargetOptions = {
  accountId: string;
  apiToken: string;
  project: string;
  fetch?: FetchLike;
};

export function pagesTarget(opts: PagesTargetOptions): PublishTarget {
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  // Content-addressed paths never change, so their hash is computed once per process.
  const hashCache = new Map<string, string>();
  const projectUrl = `${CF_API}/accounts/${opts.accountId}/pages/projects/${opts.project}`;

  async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const res = await doFetch(url, init);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Cloudflare ${res.status} from ${url}: not JSON`);
    }
    const env = Envelope.safeParse(json);
    if (!env.success) throw new Error(`Cloudflare ${res.status} from ${url}: unexpected body`);
    if (!res.ok || !env.data.success) {
      const detail = env.data.errors.map((e) => `${e.code} ${e.message}`).join("; ");
      throw new Error(`Cloudflare ${res.status} from ${url}: ${detail || "failed"}`);
    }
    return schema.parse(env.data.result);
  }

  function jsonPost(token: string, body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    async deploy(files) {
      const { jwt } = await call(
        `${projectUrl}/upload-token`,
        { headers: { authorization: `Bearer ${opts.apiToken}` } },
        z.object({ jwt: z.string().min(1) }),
      );

      let headersFile: string | null = null;
      const assets: { file: PublishFile; hash: string }[] = [];
      for (const file of files) {
        if (file.path === "_headers") {
          headersFile = new TextDecoder().decode(await file.bytes());
          continue;
        }
        const cached = hashCache.get(file.path);
        const hash = cached ?? pagesHash(await file.bytes(), file.path);
        if (!MUTABLE_PATHS.has(file.path)) hashCache.set(file.path, hash);
        assets.push({ file, hash });
      }
      const hashes = [...new Set(assets.map((a) => a.hash))];

      const missing = new Set(
        await call(
          `${CF_API}/pages/assets/check-missing`,
          jsonPost(jwt, { hashes }),
          z.array(z.string()),
        ),
      );

      const uploaded: string[] = [];
      const skipped: string[] = [];
      let batch: { key: string; value: string; metadata: { contentType: string }; base64: true }[] =
        [];
      let batchBytes = 0;
      const flush = async (): Promise<void> => {
        if (batch.length === 0) return;
        await call(`${CF_API}/pages/assets/upload`, jsonPost(jwt, batch), z.unknown());
        batch = [];
        batchBytes = 0;
      };
      const queued = new Set<string>();
      for (const { file, hash } of assets) {
        if (!missing.has(hash) || queued.has(hash)) {
          skipped.push(file.path);
          continue;
        }
        queued.add(hash);
        const value = Buffer.from(await file.bytes()).toString("base64");
        if (batchBytes + value.length > MAX_BATCH_BYTES || batch.length >= MAX_BATCH_FILES) {
          await flush();
        }
        batch.push({ key: hash, value, metadata: { contentType: file.contentType }, base64: true });
        batchBytes += value.length;
        uploaded.push(file.path);
      }
      await flush();
      await call(`${CF_API}/pages/assets/upsert-hashes`, jsonPost(jwt, { hashes }), z.unknown());

      const manifest = Object.fromEntries(assets.map((a) => [`/${a.file.path}`, a.hash]));
      const form = new FormData();
      form.append("manifest", JSON.stringify(manifest));
      if (headersFile !== null) form.append("_headers", new Blob([headersFile]), "_headers");
      await call(
        `${projectUrl}/deployments`,
        { method: "POST", headers: { authorization: `Bearer ${opts.apiToken}` }, body: form },
        z.object({ id: z.string() }),
      );
      return { uploaded, skipped };
    },
  };
}
