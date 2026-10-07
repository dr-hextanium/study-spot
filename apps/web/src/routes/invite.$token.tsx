import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Invite } from "../screens/Invite.tsx";

/** `?relogin=1` comes from the server on links for an existing surveyor. */
const Search = z.object({ relogin: z.coerce.number().int().optional() });

export const Route = createFileRoute("/invite/$token")({
  validateSearch: Search,
  component: InviteRoute,
});

function InviteRoute() {
  const { token } = Route.useParams();
  const { relogin } = Route.useSearch();
  return <Invite token={token} relogin={relogin === 1} />;
}
