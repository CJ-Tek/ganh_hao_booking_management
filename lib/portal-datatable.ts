import type { ScrollAreaProps } from "@mantine/core";

/** Passed to portal `DataTable` instances for predictable scrollbars on narrow viewports. */
export const portalDataTableScrollAreaProps = {
  type: "auto",
  scrollbarSize: 10,
  scrollHideDelay: 400,
  offsetScrollbars: "present",
} satisfies Omit<ScrollAreaProps, "classNames" | "styles" | "onScrollPositionChange">;
