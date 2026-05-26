"use client";

import dayjs from "dayjs";
import { Group, Loader, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TableBlockWaitlistTable } from "@/components/floor-map/table-block-waitlist-table";
import { PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import {
  confirmWaitlistOfferInSupabase,
  listBranchWaitlistEntriesInSupabase,
} from "@/lib/supabase-store";
import { type BookingWaitlistEntry } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

export function BranchWaitlistSection(props: {
  branchIds: string[];
  /** When set, only entries for this calendar day. When omitted, user can filter by date or view all. */
  fixedDay?: string;
  isEmployee: boolean;
  showHeader?: boolean;
  showDateFilter?: boolean;
  embedded?: boolean;
}) {
  const {
    branchIds,
    fixedDay,
    isEmployee,
    showHeader = true,
    showDateFilter = true,
    embedded = false,
  } = props;
  const { hasSupabase, reload } = useAppContext();
  const isCompact = usePortalCompact();
  const [entries, setEntries] = useState<BookingWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmLoadingId, setConfirmLoadingId] = useState<string | null>(null);
  const [filterDay, setFilterDay] = useState<string | null>(fixedDay ?? null);

  const effectiveDay = fixedDay ?? filterDay ?? undefined;

  const loadEntries = useCallback(async () => {
    if (!hasSupabase || branchIds.length === 0) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listBranchWaitlistEntriesInSupabase({
        branchIds,
        day: effectiveDay,
      });
      setEntries(rows);
    } catch (error) {
      setEntries([]);
      notifications.show({
        color: "red",
        message:
          error instanceof Error ? error.message : "Không tải được danh sách hàng chờ.",
      });
    } finally {
      setLoading(false);
    }
  }, [branchIds, effectiveDay, hasSupabase]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const summary = useMemo(() => {
    const waiting = entries.filter((item) => item.status === "waiting").length;
    const offered = entries.filter((item) => item.status === "offered").length;
    return { waiting, offered, total: entries.length };
  }, [entries]);

  const handleConfirmOffer = async (entryId: string) => {
    if (!hasSupabase || isEmployee) {
      return;
    }
    setConfirmLoadingId(entryId);
    try {
      const result = await confirmWaitlistOfferInSupabase(entryId);
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        await reload({ scope: "floor" });
        await loadEntries();
      }
    } catch (error) {
      notifications.show({
        color: "red",
        message:
          error instanceof Error ? error.message : "Không xác nhận được suất hàng chờ.",
      });
    } finally {
      setConfirmLoadingId(null);
    }
  };

  const content = (
    <Stack gap="sm">
      {showHeader ? (
        <Stack gap={4}>
          <Text fw={600} size={isCompact ? "sm" : "md"}>
            Khách trong hàng chờ
          </Text>
          <Text size="sm" c="dimmed">
            {effectiveDay
              ? `Ngày ${dayjs(effectiveDay).format("DD/MM/YYYY")} · `
              : "Tất cả ngày · "}
            {summary.total} khách ({summary.waiting} đang chờ
            {summary.offered > 0 ? `, ${summary.offered} được mời` : ""})
          </Text>
        </Stack>
      ) : null}

      {showDateFilter && !fixedDay ? (
        <Group align="flex-end" wrap="wrap" gap="sm">
          <DatePickerInput
            label="Lọc theo ngày đến"
            placeholder="Tất cả ngày"
            clearable
            value={filterDay ? dayjs(filterDay).toDate() : null}
            onChange={(value) => {
              setFilterDay(value ? dayjs(value).format("YYYY-MM-DD") : null);
            }}
            valueFormat="DD/MM/YYYY"
            size={isCompact ? "md" : "sm"}
            w={isCompact ? "100%" : 220}
          />
        </Group>
      ) : null}

      {loading ? (
        <Group gap="xs" justify="center" py="lg">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Đang tải hàng chờ...
          </Text>
        </Group>
      ) : (
        <TableBlockWaitlistTable
          records={entries}
          isEmployee={isEmployee}
          confirmLoadingId={confirmLoadingId}
          onConfirmOffer={handleConfirmOffer}
          showLocationColumns
        />
      )}
    </Stack>
  );

  if (embedded) {
    return content;
  }

  return <PortalSectionCard>{content}</PortalSectionCard>;
}
