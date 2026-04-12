"use client";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import {
  createTheme,
  MantineColorsTuple,
  MantineProvider,
} from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
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

const theme = createTheme({
  primaryColor: "brand",
  colors: {
    brand: brandPalette,
  },
  fontFamily: "Inter, Arial, sans-serif",
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "vi" }}>
        <Notifications />
        <AppContextProvider>{children}</AppContextProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
