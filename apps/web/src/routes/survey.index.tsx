import { t } from "@study-spot/ui-logic";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Home } from "../screens/Home.tsx";

export const Route = createFileRoute("/survey/")({ component: HomeRoute });

function HomeRoute() {
  return (
    <Home
      spotLink={(id) => ({ to: "/survey/spots/$id", params: { id } })}
      action={
        <Link to="/survey/spots/new" className="btn btn--primary btn--wide">
          <Plus aria-hidden="true" size={20} strokeWidth={2.5} />
          <span className="btn__label">{t("home.new_spot")}</span>
        </Link>
      }
    />
  );
}
