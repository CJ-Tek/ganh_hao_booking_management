"use client";

import { Badge, type BadgeProps } from "@mantine/core";
import type { CSSProperties } from "react";
import { APP_USER_ROLE_COLOR, APP_USER_ROLE_LABEL } from "@/lib/app-user-display";
import type { Role } from "@/lib/types";

export function AppUserRoleBadge(props: {
  role: Role;
  variant?: BadgeProps["variant"];
  size?: BadgeProps["size"];
  className?: string;
  style?: CSSProperties;
}) {
  const { role, variant = "light", size, className, style } = props;

  return (
    <Badge
      color={APP_USER_ROLE_COLOR[role]}
      variant={variant}
      size={size}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {APP_USER_ROLE_LABEL[role]}
    </Badge>
  );
}
