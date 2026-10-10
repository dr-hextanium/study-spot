import type { FetchResponse, Http, HttpRequest } from "@perch/ui-logic";

/** Render's free tier can take most of a minute to wake, so JSON calls wait longer than that. */
export const JSON_TIMEOUT_MS = 75_000;
/** A 1.5 MB photo on a weak campus signal. */
export const UPLOAD_TIMEOUT_MS = 120_000;

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

function bodyOf(request: HttpRequest): BodyInit | null {
  const body = request.body;
  if (body === null) return null;
  if (body.kind === "json") return body.json;
  const form = new FormData();
  for (const [name, value] of Object.entries(body.fields)) form.append(name, value);
  // A copy is ArrayBuffer-backed, which Blob requires (a Uint8Array may view a SharedArrayBuffer).
  const blob = new Blob([new Uint8Array(body.file.bytes)], { type: body.file.contentType });
  form.append(body.file.field, blob, body.file.filename);
  return form;
}

/**
 * The survey API over fetch. Network failures and timeouts reject; every HTTP
 * status resolves. FormData sets the multipart boundary, so no content type is
 * sent for uploads.
 */
export function createFetchHttp(fetchFn: FetchFn = (i, init) => fetch(i, init)): Http {
  return {
    async send(request) {
      const timeout = request.body?.kind === "multipart" ? UPLOAD_TIMEOUT_MS : JSON_TIMEOUT_MS;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetchFn(request.url, {
          method: request.method,
          headers: request.headers,
          body: bodyOf(request),
          signal: controller.signal,
          cache: "no-store",
        });
        const out: FetchResponse = { status: res.status, text: await res.text() };
        return out;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
