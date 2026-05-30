/** Manager mobile bottom dock uses z-index 200 in app-shell-layout. */
export const MANAGER_DOCK_Z_INDEX = 200;

/** Mantine Modal/Drawer overlays must sit above the dock. */
export const PORTAL_MODAL_Z_INDEX = 600;

/** Select/combobox popovers opened from modals. */
export const PORTAL_MODAL_POPOVER_Z_INDEX = 700;

/** Shared props for portaled overlays (Select dropdown, Menu, Popover, date pickers). */
export const portaledOverlayProps = {
  withinPortal: true,
  zIndex: PORTAL_MODAL_POPOVER_Z_INDEX,
} as const;

export const portaledComboboxProps = {
  comboboxProps: portaledOverlayProps,
} as const;

export const portaledPopoverFieldProps = {
  popoverProps: portaledOverlayProps,
} as const;
