/**
 * Platform adapters. apps/web implements these with browser APIs; a future
 * Expo app implements them with React Native modules. Shared code depends
 * only on these interfaces.
 */

/** Synchronous small key-value store (localStorage, MMKV). */
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Asynchronous larger store (IndexedDB, AsyncStorage). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export type LatLngFix = { lat: number; lng: number; accuracyMeters: number };

export interface Geolocation {
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

export interface Fetch {
  /** Rejects on network failure. Non-2xx statuses resolve normally. */
  getText(url: string): Promise<FetchResponse>;
}
