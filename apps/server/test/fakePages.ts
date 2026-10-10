import { z } from "zod";
import type { DataSite } from "../src/publish/dataSite.ts";
import { CF_API, type FetchLike, pagesTarget } from "../src/publish/pagesTarget.ts";

const PROJECT = `${CF_API}/accounts/acc/pages/projects/perch-data`;
const Hashes = z.object({ hashes: z.array(z.string()) });
const Uploads = z.array(z.object({ key: z.string(), value: z.string() }));

/**
 * A stateful Cloudflare Pages project: an asset store that remembers uploads,
 * deployments that each replace the whole site with their manifest, and the
 * live site read back over "HTTP". The live site keeps its own copy of each
 * served file, so the asset store can forget a hash while the site still serves it.
 */
export function fakePages() {
  const assets = new Map<string, Uint8Array>();
  let live = new Map<string, Uint8Array>();
  const deployments: Record<string, string>[] = [];
  const uploadedKeys: string[] = [];
  const ok = (result: unknown) =>
    new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
  const fetch: FetchLike = async (url, init) => {
    if (url === `${PROJECT}/upload-token`) return ok({ jwt: "jwt" });
    if (url === `${CF_API}/pages/assets/check-missing`) {
      const { hashes } = Hashes.parse(JSON.parse(String(init.body)));
      return ok(hashes.filter((h) => !assets.has(h)));
    }
    if (url === `${CF_API}/pages/assets/upload`) {
      for (const u of Uploads.parse(JSON.parse(String(init.body)))) {
        assets.set(u.key, new Uint8Array(Buffer.from(u.value, "base64")));
        uploadedKeys.push(u.key);
      }
      return ok(null);
    }
    if (url === `${CF_API}/pages/assets/upsert-hashes`) return ok(null);
    if (url === `${PROJECT}/deployments`) {
      const form = init.body;
      if (!(form instanceof FormData)) throw new Error("deployment body is not FormData");
      const manifest = z
        .record(z.string(), z.string())
        .parse(JSON.parse(String(form.get("manifest"))));
      const next = new Map<string, Uint8Array>();
      for (const [path, hash] of Object.entries(manifest)) {
        const bytes = assets.get(hash);
        if (!bytes) {
          return new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 8000000, message: `missing ${hash}` }],
              result: null,
            }),
            { status: 400 },
          );
        }
        next.set(path.slice(1), bytes);
      }
      live = next;
      deployments.push(manifest);
      return ok({ id: `dep-${deployments.length}` });
    }
    throw new Error(`unexpected ${url}`);
  };
  const reads = { count: 0 };
  const site: DataSite = {
    async get(path) {
      reads.count += 1;
      return live.get(path) ?? null;
    },
  };
  return {
    fetch,
    site,
    reads,
    deployments,
    uploadedKeys,
    lastManifest: () => deployments.at(-1) ?? {},
    servedBytes: (path: string) => live.get(path) ?? null,
    forgetAsset: (hash: string) => assets.delete(hash),
    dropFromSite: (path: string) => live.delete(path),
    corrupt: (path: string) => live.set(path, new Uint8Array([1, 2, 3])),
  };
}

export type Pages = ReturnType<typeof fakePages>;

export function target(pages: Pages) {
  return pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: pages.fetch,
  });
}
