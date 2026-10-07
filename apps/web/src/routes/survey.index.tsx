import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../screens/Home.tsx";

export const Route = createFileRoute("/survey/")({ component: HomeRoute });

/** Spot rows become links and New spot appears once the spot screens exist (part 2). */
function HomeRoute() {
  return <Home />;
}
