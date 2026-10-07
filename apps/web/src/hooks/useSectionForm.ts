import {
  type AttributeGroup,
  missingV0Fields,
  type SectionWrite,
  type SurveySection,
  type V0Field,
  v0InputOf,
} from "@study-spot/core";
import {
  initForm,
  type SectionDraft,
  type SectionForm,
  type SpotView,
  setField,
  submitForm,
} from "@study-spot/ui-logic";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

export type SaveOutcome =
  | { kind: "invalid" }
  /** Saving would take a published spot off the student app; ask first. */
  | { kind: "confirm"; fields: V0Field[] }
  | { kind: "saved"; clientWriteId: string };

/**
 * Required fields a section write would empty on a published spot. The server
 * accepts it and the spot silently drops out of the bundle (plan A ledger), so
 * the editor warns before saving.
 */
export function fieldsCleared(view: SpotView, write: SectionWrite): V0Field[] {
  if (view.spot.status !== "published") return [];
  if (write.section === "hours" || write.section === "estimates") return [];
  const after = missingV0Fields(v0InputOf({ ...view.spot, ...write.data }));
  return after.filter((f) => !view.spot.missing.includes(f));
}

export type SectionFormApi<S extends SurveySection> = {
  form: SectionForm<S>;
  set<K extends keyof SectionDraft<S>>(field: K, value: SectionDraft<S>[K]): void;
  save(opts?: { force: boolean }): Promise<SaveOutcome>;
  /** Stamps the section as checked without changing it. Null for estimates (no stamp). */
  verify: (() => Promise<string>) | null;
};

export function useSectionForm<S extends SurveySection>(
  section: S,
  view: SpotView,
): SectionFormApi<S> {
  const { outbox } = useDeps();
  const [form, setForm] = useState(() => initForm(section, view.spot));
  const spotId = view.spot.id;
  const group: AttributeGroup | null = section === "estimates" ? null : section;
  return {
    form,
    set(field, value) {
      setForm((f) => setField(f, field, value));
    },
    async save(opts) {
      const result = submitForm(form);
      if (!result.ok) {
        setForm(result.form);
        return { kind: "invalid" };
      }
      if (opts?.force !== true) {
        const cleared = fieldsCleared(view, result.write);
        if (cleared.length > 0) return { kind: "confirm", fields: cleared };
      }
      const clientWriteId = await outbox.enqueue(
        { kind: "spot.section", spot_id: spotId, payload: result.write },
        view.serverVersion,
      );
      return { kind: "saved", clientWriteId };
    },
    verify:
      group === null
        ? null
        : () =>
            outbox.enqueue(
              { kind: "spot.verify", spot_id: spotId, payload: { groups: [group] } },
              view.serverVersion,
            ),
  };
}
