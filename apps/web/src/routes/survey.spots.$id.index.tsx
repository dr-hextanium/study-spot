import { ClientWriteId } from "@perch/core";
import { SpotRef } from "@perch/ui-logic";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { Overview } from "../screens/Overview.tsx";

/** `?write=<client_write_id>` opens the conflict or failed view for that change. */
const Search = z.object({ write: ClientWriteId.optional() });

export const Route = createFileRoute("/survey/spots/$id/")({
  params: {
    parse: (raw) => {
      const id = SpotRef.safeParse(raw.id);
      if (!id.success) throw notFound();
      return { id: id.data };
    },
    stringify: (p) => ({ id: p.id }),
  },
  validateSearch: Search,
  component: OverviewRoute,
});

function OverviewRoute() {
  const { id } = Route.useParams();
  const { write } = Route.useSearch();
  // Keyed by id so a draft's move from its local id to the real one starts fresh.
  return <Overview key={id} id={id} write={write} />;
}
