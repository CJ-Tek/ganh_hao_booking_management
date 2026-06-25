"use client";

import { Button, Group, Menu } from "@mantine/core";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import classes from "./floor-map-booking-toolbar.module.css";

const ACTION_MIN_WIDTHS_PX = [92, 132, 120, 148, 148] as const;
const MORE_BUTTON_MIN_WIDTH_PX = 104;
const TOOLBAR_GAP_PX = 8;

type BookingToolbarAction = {
  id: "create" | "dayList" | "lateList" | "mergeGroups" | "splitClones";
  label: string;
  color?: string;
  variant?: "default" | "filled" | "light" | "outline" | "subtle" | "transparent";
  disabled?: boolean;
  onClick: () => void;
};

export type FloorMapBookingToolbarProps = {
  isCompact: boolean;
  isEditMode: boolean;
  activeAreaBranchId: string | null | undefined;
  canCreateBooking?: boolean;
  onCreateBooking: () => void;
  onOpenDayList: () => void;
  onOpenLateList: () => void;
  onOpenMergeGroups: () => void;
  onOpenSplitClones: () => void;
};

function getVisibleActionCount(containerWidth: number): number {
  if (containerWidth <= 0) {
    return ACTION_MIN_WIDTHS_PX.length;
  }

  for (let visibleCount = ACTION_MIN_WIDTHS_PX.length; visibleCount >= 1; visibleCount -= 1) {
    const overflowCount = ACTION_MIN_WIDTHS_PX.length - visibleCount;
    const slotCount = visibleCount + (overflowCount > 0 ? 1 : 0);
    const availablePerSlot =
      (containerWidth - TOOLBAR_GAP_PX * (slotCount - 1)) / slotCount;
    const visibleMinWidth = Math.max(...ACTION_MIN_WIDTHS_PX.slice(0, visibleCount));

    if (availablePerSlot < visibleMinWidth) {
      continue;
    }
    if (overflowCount > 0 && availablePerSlot < MORE_BUTTON_MIN_WIDTH_PX) {
      continue;
    }
    return visibleCount;
  }

  return 1;
}

export function FloorMapBookingToolbar({
  isCompact,
  isEditMode,
  activeAreaBranchId,
  canCreateBooking = true,
  onCreateBooking,
  onOpenDayList,
  onOpenLateList,
  onOpenMergeGroups,
  onOpenSplitClones,
}: FloorMapBookingToolbarProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(ACTION_MIN_WIDTHS_PX.length);

  const actions = useMemo<BookingToolbarAction[]>(
    () => [
      ...(canCreateBooking
        ? [
            {
              id: "create" as const,
              label: "Tạo booking",
              color: "brand",
              disabled: isEditMode,
              onClick: onCreateBooking,
            },
          ]
        : []),
      {
        id: "dayList",
        label: "Danh sách booking",
        variant: "default",
        disabled: isEditMode,
        onClick: onOpenDayList,
      },
      {
        id: "lateList",
        label: "Danh sách trễ",
        variant: "default",
        disabled: isEditMode,
        onClick: onOpenLateList,
      },
      {
        id: "mergeGroups",
        label: "Danh sách bàn gộp",
        variant: "default",
        disabled: isEditMode || !activeAreaBranchId,
        onClick: onOpenMergeGroups,
      },
      {
        id: "splitClones",
        label: "Danh sách bàn tách",
        variant: "default",
        disabled: isEditMode || !activeAreaBranchId,
        onClick: onOpenSplitClones,
      },
    ],
    [
      activeAreaBranchId,
      canCreateBooking,
      isEditMode,
      onCreateBooking,
      onOpenDayList,
      onOpenLateList,
      onOpenMergeGroups,
      onOpenSplitClones,
    ]
  );

  useEffect(() => {
    const element = rowRef.current;
    if (!element) {
      return;
    }

    const updateVisibleCount = () => {
      setVisibleCount(getVisibleActionCount(element.clientWidth));
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visibleActions = actions.slice(0, visibleCount);
  const overflowActions = actions.slice(visibleCount);
  const buttonSize = isCompact ? "xs" : "compact-sm";

  return (
    <Group ref={rowRef} gap={8} wrap="nowrap" className={classes.row}>
      {visibleActions.map((action) => (
        <Button
          key={action.id}
          color={action.color}
          variant={action.variant}
          size={buttonSize}
          className={classes.actionBtn}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      {overflowActions.length > 0 ? (
        <div className={classes.moreBtnTarget}>
          <Menu shadow="md" width={220} withinPortal position="bottom-end">
            <Menu.Target>
              <Button
                variant="default"
                size={buttonSize}
                className={classes.moreBtn}
                justify="center"
                disabled={isEditMode}
                rightSection={<ChevronDown size={16} />}
              >
                Xem thêm
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {overflowActions.map((action) => (
                <Menu.Item key={action.id} disabled={action.disabled} onClick={action.onClick}>
                  {action.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      ) : null}
    </Group>
  );
}
