/** Manager mobile bottom dock uses z-index 200 in app-shell-layout. */
export const MANAGER_DOCK_Z_INDEX = 200;

/** Mantine Modal/Drawer overlays must sit above the dock. */
export const PORTAL_MODAL_Z_INDEX = 600;

/** Booking detail drawer/modal stacked above another modal (e.g. day-list). */
export const PORTAL_MODAL_DETAIL_Z_INDEX = 620;

/**
 * Mantine ModalsProvider dialogs (confirm/alert) must stack above page `<Modal>` /
 * `PortalStandardModal` (600). Always open via `openPortalModalsConfirmModal` or
 * `openPortalConfirmModal` — never raw `modals.openConfirmModal`.
 */
export const PORTAL_MODAL_CONFIRM_Z_INDEX = 650;

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

/** Applied to DatePickerInput modal dropdowns — excluded from mobile fullscreen modal CSS. */
export const PORTAL_DATE_PICKER_MODAL_CONTENT_CLASS = "portal-date-picker-modal-content";

/** Confirm/alert and other compact dialogs — excluded from mobile fullscreen modal CSS. */
export const PORTAL_MINIMAL_MODAL_CONTENT_CLASS = "portal-minimal-modal-content";

const modalOverlayBlur = { backgroundOpacity: 0.55, blur: 4 } as const;

const portalMinimalModalClassNames = {
  content: PORTAL_MINIMAL_MODAL_CONTENT_CLASS,
  body: "portal-minimal-modal-body",
} as const;

/** Centered, content-sized modal on all viewports (confirm/alert via ModalsProvider). */
export const portalMinimalModalLayoutProps = {
  centered: true,
  fullScreen: false,
  classNames: portalMinimalModalClassNames,
} as const;

export const portalConfirmModalProps = {
  ...portalMinimalModalLayoutProps,
  zIndex: PORTAL_MODAL_CONFIRM_Z_INDEX,
  overlayProps: modalOverlayBlur,
} as const;

/** Compact page `<Modal>` (delete confirms, next-step prompts, etc.). */
export const portalMinimalPageModalProps = {
  ...portalMinimalModalLayoutProps,
  zIndex: PORTAL_MODAL_Z_INDEX,
  overlayProps: modalOverlayBlur,
} as const;

export const portalDatePickerModalProps = {
  centered: true,
  fullScreen: false,
  zIndex: PORTAL_MODAL_Z_INDEX,
  overlayProps: modalOverlayBlur,
  classNames: {
    content: PORTAL_DATE_PICKER_MODAL_CONTENT_CLASS,
    body: "portal-date-picker-modal-body",
  },
} as const;
