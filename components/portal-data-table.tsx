"use client";

import { Group, Stack } from "@mantine/core";
import {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableSortStatus,
} from "mantine-datatable";
import { useMemo, useState, type ReactNode } from "react";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import {
  PORTAL_DATA_TABLE_DEFAULT_PAGE_SIZE,
  PORTAL_DATA_TABLE_PAGE_SIZE_OPTIONS,
  PORTAL_DATA_TABLE_RECORDS_PER_PAGE_LABEL,
  portalDataTableScrollAreaProps,
} from "@/lib/portal-datatable";

function defaultGetRecordSearchValue<T>(record: T, columns: DataTableColumn<T>[]): string {
  const parts: string[] = [];
  for (const column of columns) {
    const accessor = column.accessor;
    if (typeof accessor !== "string") {
      continue;
    }
    const value = (record as Record<string, unknown>)[accessor];
    if (value != null && value !== "") {
      parts.push(String(value));
    }
  }
  return parts.join(" ").toLowerCase();
}

function defaultSortRecords<T>(records: T[], sortStatus: DataTableSortStatus<T>): T[] {
  const accessor = sortStatus.columnAccessor;
  if (!accessor || typeof accessor !== "string") {
    return records;
  }
  const dir = sortStatus.direction === "asc" ? 1 : -1;
  return [...records].sort((left, right) => {
    const leftValue = (left as Record<string, unknown>)[accessor];
    const rightValue = (right as Record<string, unknown>)[accessor];
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return dir * (leftValue - rightValue);
    }
    return dir * String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "vi");
  });
}

export type PortalDataTableProps<T> = {
  records: T[];
  columns: DataTableColumn<T>[];
  /** Extra filter controls rendered beside search (Select, SegmentedControl, etc.). */
  filters?: ReactNode;
  /** Custom searchable text per row; defaults to stringified sortable accessors. */
  getRecordSearchValue?: (record: T) => string;
  /** Custom sort for computed columns; defaults to primitive accessor compare. */
  sortRecords?: (records: T[], sortStatus: DataTableSortStatus<T>) => T[];
  defaultSort?: DataTableSortStatus<T>;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Controlled search query; omit for internal state. */
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  /** Controlled sort; omit for internal state. */
  sortStatus?: DataTableSortStatus<T>;
  onSortStatusChange?: (status: DataTableSortStatus<T>) => void;
  /** Controlled page index (1-based); omit for internal state. */
  page?: number;
  onPageChange?: (page: number) => void;
  /** Controlled page size; omit for internal state. */
  recordsPerPage?: number;
  onRecordsPerPageChange?: (size: number) => void;
  recordsPerPageOptions?: readonly number[];
  defaultRecordsPerPage?: number;
  withToolbar?: boolean;
  hideSearch?: boolean;
} & Omit<
  DataTableProps<T>,
  | "records"
  | "columns"
  | "scrollAreaProps"
  | "sortStatus"
  | "onSortStatusChange"
  | "totalRecords"
  | "recordsPerPage"
  | "page"
  | "onPageChange"
  | "recordsPerPageOptions"
  | "recordsPerPageLabel"
  | "onRecordsPerPageChange"
>;

/**
 * Standard portal table: mantine-datatable with search toolbar, optional filters, sort, and pagination.
 */
export function PortalDataTable<T>(props: PortalDataTableProps<T>) {
  const {
    records,
    columns,
    filters,
    getRecordSearchValue,
    sortRecords = defaultSortRecords,
    defaultSort,
    searchPlaceholder = "Tìm kiếm...",
    searchLabel = "Tìm kiếm",
    searchQuery: controlledSearchQuery,
    onSearchQueryChange,
    sortStatus: controlledSortStatus,
    onSortStatusChange,
    page: controlledPage,
    onPageChange,
    recordsPerPage: controlledRecordsPerPage,
    onRecordsPerPageChange,
    recordsPerPageOptions = PORTAL_DATA_TABLE_PAGE_SIZE_OPTIONS,
    defaultRecordsPerPage = PORTAL_DATA_TABLE_DEFAULT_PAGE_SIZE,
    withToolbar = true,
    hideSearch = false,
    minHeight = 260,
    withTableBorder = true,
    noRecordsText = "Không có dữ liệu phù hợp.",
    ...dataTableProps
  } = props;

  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = controlledSearchQuery ?? internalSearchQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearchQuery;

  const [internalSortStatus, setInternalSortStatus] = useState<DataTableSortStatus<T>>(
    () =>
      defaultSort ??
      ({
        columnAccessor: (columns.find((column) => column.sortable)?.accessor ??
          columns[0]?.accessor ??
          "") as keyof T & string,
        direction: "asc",
      } as DataTableSortStatus<T>)
  );
  const [internalPage, setInternalPage] = useState(1);
  const [internalRecordsPerPage, setInternalRecordsPerPage] = useState(defaultRecordsPerPage);

  const sortStatus = controlledSortStatus ?? internalSortStatus;
  const setSortStatus = onSortStatusChange ?? setInternalSortStatus;
  const page = controlledPage ?? internalPage;
  const setPage = onPageChange ?? setInternalPage;
  const recordsPerPage = controlledRecordsPerPage ?? internalRecordsPerPage;
  const setRecordsPerPage = onRecordsPerPageChange ?? setInternalRecordsPerPage;

  const resolveSearchValue =
    getRecordSearchValue ?? ((record: T) => defaultGetRecordSearchValue(record, columns));

  const searchedRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return records;
    }
    return records.filter((record) => resolveSearchValue(record).toLowerCase().includes(q));
  }, [records, resolveSearchValue, searchQuery]);

  const sortedRecords = useMemo(
    () => sortRecords(searchedRecords, sortStatus),
    [searchedRecords, sortRecords, sortStatus]
  );

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / recordsPerPage));
  const pageSafe = Math.min(page, totalPages);

  const pagedRecords = useMemo(
    () =>
      sortedRecords.slice((pageSafe - 1) * recordsPerPage, pageSafe * recordsPerPage),
    [pageSafe, recordsPerPage, sortedRecords]
  );

  const showToolbar = withToolbar && (!hideSearch || filters);

  return (
    <Stack gap="sm">
      {showToolbar ? (
        <Group align="flex-end" wrap="wrap" gap="sm">
          {!hideSearch ? (
            <TextInputWithVoice
              label={searchLabel}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                setPage(1);
              }}
              size="sm"
              style={{ flex: "1 1 12rem", minWidth: 0 }}
              voiceIconSize="sm"
            />
          ) : null}
          {filters}
        </Group>
      ) : null}
      <DataTable
        minHeight={minHeight}
        scrollAreaProps={portalDataTableScrollAreaProps}
        withTableBorder={withTableBorder}
        records={pagedRecords}
        columns={columns}
        totalRecords={sortedRecords.length}
        recordsPerPage={recordsPerPage}
        recordsPerPageOptions={[...recordsPerPageOptions]}
        recordsPerPageLabel={PORTAL_DATA_TABLE_RECORDS_PER_PAGE_LABEL}
        onRecordsPerPageChange={(next) => {
          setRecordsPerPage(next);
          if (controlledPage === undefined) {
            setPage(1);
          } else {
            onPageChange?.(1);
          }
        }}
        page={pageSafe}
        onPageChange={setPage}
        sortStatus={sortStatus}
        onSortStatusChange={(next) => {
          setSortStatus(next);
          if (controlledPage === undefined) {
            setPage(1);
          } else {
            onPageChange?.(1);
          }
        }}
        noRecordsText={noRecordsText}
        {...dataTableProps}
      />
    </Stack>
  );
}
