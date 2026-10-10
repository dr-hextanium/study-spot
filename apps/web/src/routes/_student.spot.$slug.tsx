import { t } from "@perch/ui-logic";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Placeholder } from "../screens/student/Placeholder.tsx";

export const Route = createFileRoute("/_student/spot/$slug")({
  validateSearch: z.object({ via: z.literal("pick").optional() }),
  component: () => <Placeholder title={t("app.name")} />,
});
