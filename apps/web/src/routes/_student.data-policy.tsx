import { createFileRoute } from "@tanstack/react-router";
import { DataPolicy } from "../screens/student/DataPolicy.tsx";

export const Route = createFileRoute("/_student/data-policy")({ component: DataPolicy });
