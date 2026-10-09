import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "../hooks/useSession.ts";
import { Home } from "../screens/Home.tsx";

export const Route = createFileRoute("/survey/")({ component: HomeRoute });

function HomeRoute() {
  const { me } = useSession();
  return (
    <Home
      isAdmin={me?.role === "admin"}
      spotLink={(id) => ({ to: "/survey/spots/$id", params: { id } })}
    />
  );
}
