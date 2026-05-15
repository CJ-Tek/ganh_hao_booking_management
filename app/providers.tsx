"use client";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import {
  Button,
  Modal,
  createTheme,
  MantineColorsTuple,
  MantineProvider,
} from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { AppContextProvider } from "@/contexts/app-context";
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
        overlayProps: modalOverlayBlur,
      },
    }),
    Button: Button.extend({
      styles: {
        root: {
          height: "auto",
          minHeight: "var(--button-height)",
          maxWidth: "100%",
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
      },
    }),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "vi" }}>
        <ModalsProvider
          modalProps={{ centered: true, overlayProps: modalOverlayBlur }}
        >
          <Notifications />
          <AppContextProvider>{children}</AppContextProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
