"use client";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import {
  Autocomplete,
  Badge,
  Button,
  Drawer,
  Menu,
  Modal,
  MultiSelect,
  Popover,
  Select,
  Tooltip,
  createTheme,
  MantineColorsTuple,
  MantineProvider,
} from "@mantine/core";
import { DatePickerInput, DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { AppContextProvider } from "@/contexts/app-context";
import {
  PORTAL_MODAL_POPOVER_Z_INDEX,
  PORTAL_MODAL_Z_INDEX,
  portaledComboboxProps,
  portaledOverlayProps,
  portaledPopoverFieldProps,
} from "@/lib/portal-z-index";
import "mantine-datatable/styles.css";

const brandPalette: MantineColorsTuple = [
  "#ecf6fe",
  "#d8e9f7",
  "#abd1f0",
  "#7db9eb",
  "#59a4e7",
  "#4597e5",
  "#3a90e5",
  "#2e7dcc",
  "#236fb7",
  "#0c61a4",
];

const modalOverlayBlur = { backgroundOpacity: 0.55, blur: 4 } as const;

const theme = createTheme({
  primaryColor: "brand",
  colors: {
    brand: brandPalette,
  },
  fontFamily: "Inter, Arial, sans-serif",
  components: {
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        overlayProps: modalOverlayBlur,
        zIndex: PORTAL_MODAL_Z_INDEX,
      },
    }),
    Drawer: Drawer.extend({
      defaultProps: {
        zIndex: PORTAL_MODAL_Z_INDEX,
      },
    }),
    Select: Select.extend({
      defaultProps: portaledComboboxProps,
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: portaledComboboxProps,
    }),
    Autocomplete: Autocomplete.extend({
      defaultProps: portaledComboboxProps,
    }),
    Menu: Menu.extend({
      defaultProps: portaledOverlayProps,
    }),
    Popover: Popover.extend({
      defaultProps: portaledOverlayProps,
    }),
    Tooltip: Tooltip.extend({
      defaultProps: portaledOverlayProps,
    }),
    DatePickerInput: DatePickerInput.extend({
      defaultProps: portaledPopoverFieldProps,
    }),
    Badge: Badge.extend({
      styles: {
        root: {
          fontWeight: 500,
          textTransform: "none",
          boxShadow: "none",
        },
      },
    }),
    Button: Button.extend({
      styles: (theme, props) => {
        const variant = props.variant ?? "filled";
        const emphasized =
          variant === "filled" ||
          variant === "default" ||
          variant === "outline" ||
          variant === "light";

        return {
          root: {
            height: "auto",
            minHeight: "var(--button-height)",
            maxWidth: "100%",
            fontWeight: 600,
            ...(emphasized && {
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
            }),
            ...(variant === "outline" && {
              borderWidth: 2,
              backgroundColor: theme.white,
            }),
            ...(variant === "light" && {
              border: `1px solid ${theme.colors.gray[3]}`,
            }),
          },
          inner: {
            minWidth: 0,
            maxWidth: "100%",
          },
          label: {
            minWidth: 0,
            whiteSpace: "normal",
            overflowWrap: "break-word",
            wordBreak: "break-word",
            textAlign: "center",
            lineHeight: 1.35,
          },
        };
      },
    }),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "vi" }}>
        <ModalsProvider
          modalProps={{
            centered: true,
            overlayProps: modalOverlayBlur,
            zIndex: PORTAL_MODAL_Z_INDEX,
          }}
        >
          <Notifications zIndex={PORTAL_MODAL_POPOVER_Z_INDEX + 100} />
          <AppContextProvider>{children}</AppContextProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
