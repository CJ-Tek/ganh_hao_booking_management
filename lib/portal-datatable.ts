import type { ScrollAreaProps } from "@mantine/core";

/** Passed to portal `DataTable` instances for predictable scrollbars on narrow viewports. */
export const portalDataTableScrollAreaProps = {
  type: "auto",
  scrollbarSize: 10,
  scrollHideDelay: 400,
  offsetScrollbars: "present",
} satisfies Omit<ScrollAreaProps, "classNames" | "styles" | "onScrollPositionChange">;

/** Default page-size choices for portal tables (`PortalDataTable`). */
export const PORTAL_DATA_TABLE_PAGE_SIZE_OPTIONS = [8, 10, 12, 16, 24, 32] as const;

export const PORTAL_DATA_TABLE_DEFAULT_PAGE_SIZE = 10;

export const PORTAL_DATA_TABLE_RECORDS_PER_PAGE_LABEL = "Số dòng mỗi trang";
