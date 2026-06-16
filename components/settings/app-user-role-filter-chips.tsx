"use client";

import { Button, Group } from "@mantine/core";
import { useEffect, useRef } from "react";
import {
  APP_USER_ROLE_COLOR,
  APP_USER_ROLE_LABEL,
  normalizeUserRoleFilters,
  toggleUserRoleFilter,
} from "@/lib/app-user-display";
import type { Role } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

type AppUserRoleFilterChipsProps = {
  value: readonly Role[];
  onChange: (value: Role[]) => void;
  roles: readonly Role[];
  size?: "xs" | "compact-sm" | "sm";
  locked?: boolean;
};

function isAllRolesSelected(value: readonly Role[], roles: readonly Role[]): boolean {
  return roles.length > 0 && roles.every((role) => value.includes(role));
}

export function AppUserRoleFilterChips(props: AppUserRoleFilterChipsProps) {
  const { value, onChange, roles, size: sizeProp, locked = false } = props;
  const isCompact = usePortalCompact();
  const size = sizeProp ?? (isCompact ? "xs" : "compact-sm");
  const allRoles = [...roles];
  const isAllSelected = isAllRolesSelected(value, roles);
  const selectionBeforeAllRef = useRef<Role[]>([...value]);

  useEffect(() => {
    if (!isAllSelected) {
      selectionBeforeAllRef.current = [...value];
    }
  }, [isAllSelected, value]);

  const handleToggleAll = () => {
    if (locked) {
      return;
    }
    if (isAllSelected) {
      onChange(normalizeUserRoleFilters(selectionBeforeAllRef.current));
      return;
    }
    selectionBeforeAllRef.current = [...value];
    onChange([...allRoles]);
  };

  const handleToggleRole = (role: Role) => {
    if (locked) {
      return;
    }
    const next = toggleUserRoleFilter(value, role);
    if (!isAllSelected && isAllRolesSelected(next, roles)) {
      selectionBeforeAllRef.current = [...value];
    }
    onChange(next);
  };

  const chipGroup = (
    <Group gap="xs" wrap={isCompact ? "nowrap" : "wrap"} role="group" aria-label="Lọc vai trò">
      {roles.map((role) => {
        const selected = value.includes(role);
        const color = APP_USER_ROLE_COLOR[role];
        return (
          <Button
            key={role}
            size={size}
            radius="xl"
            variant={selected ? "filled" : "outline"}
            color={color}
            aria-pressed={selected}
            disabled={locked}
            onClick={() => handleToggleRole(role)}
            styles={{
              root: selected
                ? {
                    borderWidth: 2,
                    borderStyle: "solid",
                    borderColor: `var(--mantine-color-${color}-7)`,
                  }
                : undefined,
            }}
          >
            {APP_USER_ROLE_LABEL[role]}
          </Button>
        );
      })}
      <Button
        key="all"
        size={size}
        radius="xl"
        variant={isAllSelected ? "filled" : "outline"}
        color="gray"
        aria-pressed={isAllSelected}
        disabled={locked}
        onClick={handleToggleAll}
        styles={{
          root: isAllSelected
            ? {
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: "var(--mantine-color-gray-7)",
              }
            : undefined,
        }}
      >
        Tất cả
      </Button>
    </Group>
  );

  if (isCompact) {
    return <div className="mobile-filter-chip-scroll">{chipGroup}</div>;
  }

  return chipGroup;
}
