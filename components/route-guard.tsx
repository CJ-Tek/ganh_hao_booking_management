"use client";

import { Loader, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/app-context";
import { Role } from "@/lib/types";

export function RouteGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Role[];
}) {
  const router = useRouter();
  const { currentUser, isLoading } = useAppContext();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
      const fallback = currentUser.role === "employee" ? "/floor-map" : "/dashboard";
      router.replace(fallback);
    }
  }, [allowedRoles, currentUser, isLoading, router]);

  if (isLoading || !currentUser) {
    return (
      <Stack align="center" justify="center" h="100vh">
        <Loader />
        <Text size="sm" c="dimmed">
          Đang kiểm tra phiên đăng nhập...
        </Text>
      </Stack>
    );
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return null;
  }

  return <>{children}</>;
}
