import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SpotPage } from "../screens/student/SpotPage.tsx";

function SpotRoute() {
  const { slug } = Route.useParams();
  const { via } = Route.useSearch();
  return <SpotPage slug={slug} via={via} />;
}

export const Route = createFileRoute("/_student/spot/$slug")({
  validateSearch: z.object({ via: z.literal("pick").optional() }),
  component: SpotRoute,
});
