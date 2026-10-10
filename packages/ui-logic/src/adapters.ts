/**
 * Platform adapters. apps/web implements these with browser APIs; a future
 * Expo app implements them with React Native modules. Shared code depends
 * only on these interfaces.
 */

/** Synchronous small key-value store (localStorage, MMKV). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Asynchronous larger store (IndexedDB, AsyncStorage). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every stored key starting with `prefix`, in any order. */
  keys(prefix: string): Promise<string[]>;
}

/** Asynchronous store for binary records such as photo bytes (IndexedDB). */
export interface BinaryCache {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Random RFC 4122 version 4 ids (crypto.randomUUID on web). */
export interface Ids {
  uuid(): string;
}

/** Relative timers (setTimeout on web). `after` returns a cancel function. */
export interface Timers {
  after(ms: number, fn: () => void): () => void;
}

/** Fires when the app returns to the foreground (visibilitychange on web, AppState on Expo). */
export interface Foreground {
  subscribe(listener: () => void): () => void;
}

/**
 * Mutual exclusion by name. `run` waits for the lock, runs `fn`, and releases
 * when `fn` settles. `createLocalLock` covers one JS context (one tab); apps/web
 * backs this with the Web Locks API so tabs sharing storage also take turns.
 */
export interface Lock {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Tells whether the context (a tab, an app process) that marked a write as
 * sending is still running. apps/web backs it with a Web Lock each tab holds
 * for its whole life, so a closed or crashed tab reads as gone at once.
 */
export interface Liveness {
  /** Marks this context as running until `release`. Resolves with its owner id, the same on every call. */
  hold(): Promise<string>;
  release(): void;
  /** False once the context holding `owner` ended or released it. */
  alive(owner: string): Promise<boolean>;
}

/** Tells other contexts sharing the queue's storage that it changed (BroadcastChannel on web). */
export interface QueueSignal {
  /** Reaches every other context's subscribers, never this one's. */
  post(): void;
  subscribe(listener: () => void): () => void;
}

export interface Clock {
  now(): Date;
}

export type LatLngFix = { lat: number; lng: number; accuracyMeters: number };

export interface GeolocationAdapter {
  /** Resolves null when permission is denied or no fix is available. */
  current(): Promise<LatLngFix | null>;
}

export interface Share {
  share(data: { title: string; url: string }): Promise<"shared" | "copied" | "failed">;
}

export interface NetworkStatus {
  online(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type FetchResponse = { status: number; text: string };

/** A GET response; `date` is the response's Date header, or null when not exposed. */
export type FetchTextResponse = FetchResponse & { date: string | null };

export interface Fetch {
  /** Rejects on network failure. Non-2xx statuses resolve normally. */
  getText(url: string): Promise<FetchTextResponse>;
}

export type HttpMethod = "GET" | "POST" | "PUT";
export type HttpFile = { field: string; filename: string; contentType: string; bytes: Uint8Array };
export type HttpBody =
  | { kind: "json"; json: string }
  | { kind: "multipart"; fields: Readonly<Record<string, string>>; file: HttpFile };
export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: HttpBody | null;
};

/**
 * JSON and multipart requests for the survey API. Rejects on network failure
 * or after the implementation's timeout; non-2xx statuses resolve normally.
 * Implementations set the multipart content type themselves.
 */
export interface Http {
  send(request: HttpRequest): Promise<FetchResponse>;
}
