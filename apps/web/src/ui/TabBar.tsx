import { t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { CircleUser, House, List } from "lucide-react";
import { Icon } from "./Icon.tsx";

const TABS = [
  { to: "/", label: "student.nav.home", icon: House, exact: true },
  { to: "/browse", label: "student.nav.browse", icon: List, exact: false },
  { to: "/me", label: "student.nav.me", icon: CircleUser, exact: false },
] as const;

/** Bottom navigation for student mode: paper bar, top hairline, ink when current. Never red. */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label={t("student.nav.label")}>
      <ul className="tabbar__inner">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              className="tabbar__item"
              activeOptions={{ exact: tab.exact }}
              activeProps={{ "aria-current": "page" }}
            >
              <Icon icon={tab.icon} />
              <span>{t(tab.label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
