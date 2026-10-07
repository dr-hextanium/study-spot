import { createFileRoute } from "@tanstack/react-router";
import { NewSpot } from "../screens/NewSpot.tsx";

export const Route = createFileRoute("/survey/spots/new")({ component: NewSpot });
