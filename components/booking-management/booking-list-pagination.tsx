"use client";

import { Button, Group, Select, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

const MOBILE_PAGE_SIZE_SELECT_WIDTH = "9.5rem";

export function BookingListPaginationNav(props: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const { page, totalPages, onPageChange } = props;

  return (
    <Group justify="center" gap="xs" wrap="nowrap">
      <Button
        variant="default"
        size="compact-sm"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Trước
      </Button>
      <Text size="sm" c="dimmed">
        {page}/{totalPages}
      </Text>
      <Button
        variant="default"
        size="compact-sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Sau
      </Button>
    </Group>
  );
}

export function BookingListPaginationBar(props: {
  pageSize: number;
  pageSizeSelectData: { value: string; label: string }[];
  onPageSizeChange: (size: number) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalBookings: number;
  summaryItemLabel?: string;
}) {
  const {
    pageSize,
    pageSizeSelectData,
    onPageSizeChange,
    page,
    totalPages,
    onPageChange,
    totalBookings,
    summaryItemLabel = "booking",
  } = props;

  if (totalBookings <= 0) {
    return null;
  }

  return (
    <Stack gap={4} align="stretch" w="100%">
      <Group align="center" wrap="nowrap" w="100%" gap="sm" justify="space-between">
        <Select
          aria-label="Số thẻ mỗi trang"
          size="sm"
          data={pageSizeSelectData}
          value={String(pageSize)}
          onChange={(value) => {
            if (!value) {
              return;
            }
            onPageSizeChange(Number(value));
          }}
          allowDeselect={false}
          w={MOBILE_PAGE_SIZE_SELECT_WIDTH}
          style={{ flexShrink: 0 }}
        />
        <BookingListPaginationNav page={page} totalPages={totalPages} onPageChange={onPageChange} />
      </Group>
      <Text size="xs" c="dimmed" ta="right">
        {totalBookings} {summaryItemLabel} · trang {page}/{totalPages}
      </Text>
    </Stack>
  );
}

export type BookingListPaginationBarProps = Parameters<typeof BookingListPaginationBar>[0];
