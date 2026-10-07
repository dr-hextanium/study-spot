import type { LinkProps } from "@tanstack/react-router";

/** Builds the link a spot row opens. */
export type SpotLinkFor = (spotId: string) => LinkProps;
