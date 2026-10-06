import type { LinkProps } from "@tanstack/react-router";
import { useState } from "react";
import { useSyncHeader } from "../hooks/useOutbox.ts";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { SyncPostmark } from "../ui/SyncPostmark.tsx";
import { SyncSheet } from "./SyncSheet.tsx";

/** The ink band every survey screen starts with, carrying the sync postmark and its sheet. */
export function SurveyHeader(props: { title: string; back?: LinkProps }) {
  const header = useSyncHeader();
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderBand
        title={props.title}
        {...(props.back === undefined ? {} : { back: props.back })}
        trailing={<SyncPostmark header={header} onOpen={() => setOpen(true)} />}
      />
      <SyncSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
