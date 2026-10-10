import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../screens/student/Home.tsx";

export const Route = createFileRoute("/_student/")({ component: Home });
