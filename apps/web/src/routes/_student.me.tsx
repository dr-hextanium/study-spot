import { t } from "@perch/ui-logic";
import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "../screens/student/Placeholder.tsx";

export const Route = createFileRoute("/_student/me")({
  component: () => <Placeholder title={t("student.me.title")} />,
});
