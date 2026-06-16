"use client";

import { Loader, Stack, Text } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/app-context";
import { isEmployeeUser } from "@/lib/employee-access";

const EMPLOYEE_HOME = "/floor-map";

const EMPLOYEE_ALLOWED_PREFIXES = [EMPLOYEE_HOME, "/settings/account"] as const;

function isEmployeeAllowedPath(pathname: string): boolean {
  return EMPLOYEE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Keeps employee accounts on allowed portal routes (floor map, account settings). */
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
    if (isEmployeeAllowedPath(pathname)) {
      return;
    }
    router.replace(EMPLOYEE_HOME);
  }, [currentUser, isLoading, pathname, router]);

  if (!isLoading && currentUser && isEmployeeUser(currentUser)) {
    if (!isEmployeeAllowedPath(pathname)) {
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
