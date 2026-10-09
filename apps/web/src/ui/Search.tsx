import { Search as SearchIcon } from "lucide-react";
import { Icon } from "./Icon.tsx";

/** A search box. The label is the accessible name and the placeholder. */
export function Search(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  describedBy?: string | undefined;
}) {
  return (
    <label className="search">
      <Icon icon={SearchIcon} size={18} />
      <span className="visually-hidden">{props.label}</span>
      <input
        type="search"
        value={props.value}
        placeholder={props.placeholder ?? props.label}
        aria-describedby={props.describedBy}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
