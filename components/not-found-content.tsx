"use client";

import { Button, Center, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { useAppContext } from "@/contexts/app-context";

function resolveHomeHref(role: string | undefined): string {
  if (role === "employee") {
    return "/bookings";
  }
  if (role === "manager") {
    return "/bookings";
  }
  if (role === "admin" || role === "general_manager") {
    return "/select-branch";
  }
  return "/login";
}

export function NotFoundContent() {
  const { currentUser } = useAppContext();
  const homeHref = resolveHomeHref(currentUser?.role);
  const homeLabel = currentUser ? "Về trang chính" : "Về đăng nhập";

  return (
    <Center
      mih="100dvh"
      px="md"
      py="max(var(--mantine-spacing-md), env(safe-area-inset-top, 0px))"
      pb="max(var(--mantine-spacing-md), env(safe-area-inset-bottom, 0px))"
    >
      <Stack align="center" gap="md" maw={360}>
        <Title order={1}>404</Title>
        <Text c="dimmed" ta="center">
          Không tìm thấy trang bạn yêu cầu.
        </Text>
        <Button component={Link} href={homeHref}>
          {homeLabel}
        </Button>
      </Stack>
    </Center>
  );
}
