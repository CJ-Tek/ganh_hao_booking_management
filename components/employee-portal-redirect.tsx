"use client";

import { Loader, Stack, Text } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/app-context";
import { isEmployeeUser } from "@/lib/employee-access";

const EMPLOYEE_HOME = "/floor-map";

/** Keeps accounts with role `employee` on the floor map route only. */
export function EmployeePortalRedirect({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, isLoading } = useAppContext();

  useEffect(() => {
    if (isLoading || !currentUser) {
      return;
    }
    if (!isEmployeeUser(currentUser)) {
      return;
    }
    if (pathname === EMPLOYEE_HOME || pathname.startsWith(`${EMPLOYEE_HOME}/`)) {
      return;
    }
    router.replace(EMPLOYEE_HOME);
  }, [currentUser, isLoading, pathname, router]);

  if (!isLoading && currentUser && isEmployeeUser(currentUser)) {
    if (pathname !== EMPLOYEE_HOME && !pathname.startsWith(`${EMPLOYEE_HOME}/`)) {
      return (
        <Stack align="center" justify="center" mih="50vh" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Đang chuyển tới Sơ đồ…
          </Text>
        </Stack>
      );
    }
  }

  return <>{children}</>;
}
