import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createContext, type ReactNode, useContext } from "react";
import { ToastProvider } from "../hooks/useToasts.tsx";
import { type AppDeps, CACHE_BUSTER, CACHE_MAX_AGE_MS } from "./deps.ts";
import { shouldPersistQuery } from "./serverCache.ts";

const DepsContext = createContext<AppDeps | null>(null);

export function AppProvider(props: { deps: AppDeps; children: ReactNode }) {
  const { deps } = props;
  return (
    <DepsContext.Provider value={deps}>
      <PersistQueryClientProvider
        client={deps.queryClient}
        persistOptions={{
          persister: deps.persister,
          maxAge: CACHE_MAX_AGE_MS,
          buster: CACHE_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistQuery,
          },
        }}
      >
        <ToastProvider>{props.children}</ToastProvider>
      </PersistQueryClientProvider>
    </DepsContext.Provider>
  );
}

export function useDeps(): AppDeps {
  const deps = useContext(DepsContext);
  if (deps === null) throw new Error("useDeps outside AppProvider");
  return deps;
}
