import { createFileRoute } from "@tanstack/react-router";
import { Me } from "../screens/student/Me.tsx";

export const Route = createFileRoute("/_student/me")({ component: Me });
