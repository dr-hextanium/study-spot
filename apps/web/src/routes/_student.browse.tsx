import { createFileRoute } from "@tanstack/react-router";
import { Browse } from "../screens/student/Browse.tsx";

export const Route = createFileRoute("/_student/browse")({ component: Browse });
