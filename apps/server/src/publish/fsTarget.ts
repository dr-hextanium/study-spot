import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MUTABLE_PATHS, type PublishTarget } from "./target.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes the data site into a directory (tests, local dev, VPS fallback). Files
 * are written in the given order, each through a temp file and rename, so a
 * reader never sees a half-written pointer. Old bundles are kept.
 */
export function fsTarget(dir: string): PublishTarget {
  return {
    async deploy(files) {
      const uploaded: string[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        const dest = join(dir, file.path);
        if (!MUTABLE_PATHS.has(file.path) && (await exists(dest))) {
          skipped.push(file.path);
          continue;
        }
        await mkdir(dirname(dest), { recursive: true });
        const tmp = `${dest}.tmp-${process.pid}`;
        await writeFile(tmp, await file.bytes());
        await rename(tmp, dest);
        uploaded.push(file.path);
      }
      return { uploaded, skipped };
    },
  };
}
