"use client";

import dayjs from "dayjs";
import { Group, Loader, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TableBlockWaitlistTable } from "@/components/floor-map/table-block-waitlist-table";
import { BookingListFiltersToolbar } from "@/components/booking-management/booking-list-filters-toolbar";
import {
  WaitlistEntryModals,
  type WaitlistEntryModalMode,
} from "@/components/booking-management/waitlist-entry-modals";
import { WaitlistEntryDetailModal } from "@/components/booking-management/waitlist-entry-detail-modal";
import { WaitlistStatusFilterChips } from "@/components/booking-management/waitlist-status-filter-chips";
import { PortalListSectionDesktop } from "@/components/portal-list/portal-list-section-desktop";
import { PortalListSectionMobile } from "@/components/portal-list/portal-list-section-mobile";
import { useAppContext } from "@/contexts/app-context";
import {
  confirmWaitlistOfferInSupabase,
  listBranchWaitlistEntriesInSupabase,
} from "@/lib/supabase-store";
import { type BookingWaitlistEntry, type WaitlistStatus } from "@/lib/types";
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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filterDay, setFilterDay] = useState<string | null>(fixedDay ?? null);
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<BookingWaitlistEntry | null>(null);
  const [formModalEntry, setFormModalEntry] = useState<BookingWaitlistEntry | null>(null);
  const [formModalMode, setFormModalMode] = useState<WaitlistEntryModalMode | null>(null);

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

  const statusFilteredEntries = useMemo(
    () =>
      statusFilter ? entries.filter((entry) => entry.status === statusFilter) : entries,
    [entries, statusFilter]
  );

  const displayCount = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return statusFilteredEntries.length;
    }
    return statusFilteredEntries.filter((entry) => {
      const haystack = [
        entry.position,
        entry.partySize,
        entry.status,
        effectiveDay ? dayjs(effectiveDay).format("DD/MM/YYYY") : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }).length;
  }, [effectiveDay, searchQuery, statusFilteredEntries]);

  const sectionTitle = showHeader ? `Hàng chờ (${displayCount})` : "";

  const detailEntryLive = useMemo(() => {
    if (!detailEntry) {
      return null;
    }
    return entries.find((item) => item.id === detailEntry.id) ?? detailEntry;
  }, [detailEntry, entries]);

  const refreshAfterMutation = useCallback(async () => {
    await reload({ scope: "floor" });
    await loadEntries();
  }, [loadEntries, reload]);

  const closeDetail = useCallback(() => {
    setDetailEntry(null);
  }, []);

  const openDetail = useCallback((entry: BookingWaitlistEntry) => {
    setDetailEntry(entry);
  }, []);

  const openFormModal = (entry: BookingWaitlistEntry, mode: WaitlistEntryModalMode) => {
    closeDetail();
    setFormModalEntry(entry);
    setFormModalMode(mode);
  };

  const closeFormModal = () => {
    setFormModalEntry(null);
    setFormModalMode(null);
  };

  const handleConfirmOffer = async (entry: BookingWaitlistEntry) => {
    if (!hasSupabase || isEmployee) {
      return;
    }
    setActionLoadingId(entry.id);
    try {
      const result = await confirmWaitlistOfferInSupabase(entry.id);
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        closeDetail();
        await refreshAfterMutation();
      }
    } catch (error) {
      notifications.show({
        color: "red",
        message:
          error instanceof Error ? error.message : "Không xác nhận được suất hàng chờ.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const dateFilterControl =
    showDateFilter && !fixedDay ? (
      <DatePickerInput
        label="Lọc theo ngày đến"
        placeholder="Tất cả ngày"
        clearable
        value={filterDay}
        onChange={setFilterDay}
        valueFormat="DD/MM/YYYY"
        size={isCompact ? "md" : "sm"}
        w={isCompact ? undefined : 220}
      />
    ) : null;

  const waitlistTable = loading ? (
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
      actionLoadingId={actionLoadingId}
      onRowClick={openDetail}
      showLocationColumns
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      searchQuery={isCompact && !embedded ? searchQuery : undefined}
      onSearchQueryChange={
        isCompact && !embedded
          ? (value) => {
              setSearchQuery(value);
            }
          : undefined
      }
      hideToolbar={isCompact && !embedded}
    />
  );

  const overlays = (
    <>
      <WaitlistEntryDetailModal
        entry={detailEntryLive}
        opened={detailEntryLive != null}
        onClose={closeDetail}
        isEmployee={isEmployee}
        actionLoadingId={actionLoadingId}
        showLocation
        onConfirmOffer={handleConfirmOffer}
        onEdit={isEmployee ? undefined : (entry) => openFormModal(entry, "edit")}
        onPromote={isEmployee ? undefined : (entry) => openFormModal(entry, "promote")}
        onTransfer={isEmployee ? undefined : (entry) => openFormModal(entry, "transfer")}
      />
      <WaitlistEntryModals
        entry={formModalEntry}
        mode={formModalMode}
        onClose={closeFormModal}
        onSaved={refreshAfterMutation}
      />
    </>
  );

  if (embedded) {
    return (
      <Stack gap="sm">
        {dateFilterControl}
        {waitlistTable}
        {overlays}
      </Stack>
    );
  }

  if (isCompact) {
    return (
      <>
        <PortalListSectionMobile
          title={sectionTitle}
          headerFilters={
            <WaitlistStatusFilterChips
              value={statusFilter}
              onChange={setStatusFilter}
              size="xs"
            />
          }
          filtersToolbar={
            <BookingListFiltersToolbar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              searchPlaceholder="Khách, khung giờ, trạng thái..."
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              collapseFilters={dateFilterControl ?? <Text size="sm" c="dimmed">Không có bộ lọc thêm.</Text>}
            />
          }
        >
          {waitlistTable}
        </PortalListSectionMobile>
        {overlays}
      </>
    );
  }

  return (
    <>
      <PortalListSectionDesktop
        title={sectionTitle}
        headerFilters={
          <WaitlistStatusFilterChips value={statusFilter} onChange={setStatusFilter} />
        }
      >
        {dateFilterControl ? (
          <Stack gap="sm" mb="sm">
            {dateFilterControl}
          </Stack>
        ) : null}
        {waitlistTable}
      </PortalListSectionDesktop>
      {overlays}
    </>
  );
}
