"use client";

import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { DataTable, type DataTableColumn } from "mantine-datatable";
import { ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import {
  filterPortalAdvanceSearchResults,
  portalAdvanceSearchSectionLabel,
  type PortalAdvanceSearchResult,
  type PortalAdvanceSearchSection,
} from "@/lib/portal-advance-search";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";

export function PortalAdvanceSearchModal(props: {
  opened: boolean;
  onClose: () => void;
  results: PortalAdvanceSearchResult[];
  onSelect: (result: PortalAdvanceSearchResult) => void;
}) {
  const { opened, onClose, results, onSelect } = props;
  const isCompact = usePortalCompact();
  const [query, setQuery] = useState("");

  const filteredResults = useMemo(
    () => filterPortalAdvanceSearchResults(results, query),
    [query, results]
  );

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const handleSelect = (result: PortalAdvanceSearchResult) => {
    setQuery("");
    onSelect(result);
  };

  const columns = useMemo<DataTableColumn<PortalAdvanceSearchResult>[]>(
    () => [
      {
        accessor: "section",
        title: "Mục",
        width: 132,
        render: (result) => {
          const badge = getResultBadge(result);
          return (
            <Badge variant="light" color={badge.color}>
              {badge.label}
            </Badge>
          );
        },
      },
      {
        accessor: "title",
        title: "Tiêu đề",
        render: (result) => (
          <Text size="sm" fw={600}>
            {result.title}
          </Text>
        ),
      },
      {
        accessor: "subtitle",
        title: "Chi tiết",
        render: (result) => (
          <Text size="sm" c="dimmed">
            {result.subtitle}
          </Text>
        ),
      },
    ],
    []
  );

  return (
    <PortalStandardModal
      opened={opened}
      onClose={handleClose}
      title="Tìm kiếm nâng cao"
      size={isCompact ? "lg" : "xl"}
    >
      <Stack gap="md">
        <TextInputWithVoice
          label="Từ khóa"
          placeholder="Tên khách, bàn, SĐT, giờ đặt, khu vực, trạng thái…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          size={isCompact ? "md" : "sm"}
          voiceIconSize={isCompact ? "md" : "sm"}
          leftSection={<ScanSearch size={16} />}
          autoFocus
        />

        {query.trim() ? (
          filteredResults.length > 0 ? (
            isCompact ? (
              <Stack gap="xs">
                {filteredResults.map((result) => (
                  <PortalAdvanceSearchResultCard
                    key={result.id}
                    result={result}
                    onSelect={() => handleSelect(result)}
                  />
                ))}
              </Stack>
            ) : (
              <DataTable
                withTableBorder
                borderRadius="md"
                striped
                highlightOnHover
                records={filteredResults}
                columns={columns}
                idAccessor="id"
                minHeight={180}
                scrollAreaProps={portalDataTableScrollAreaProps}
                onRowClick={({ record }) => handleSelect(record)}
                rowStyle={() => ({ cursor: "pointer" })}
              />
            )
          ) : (
            <Text size="sm" c="dimmed">
              Không tìm thấy kết quả phù hợp.
            </Text>
          )
        ) : (
          <Text size="sm" c="dimmed">
            Nhập từ khóa để tìm trong Sơ đồ, Đặt bàn, Khách hàng và Quản lý bàn.
          </Text>
        )}
      </Stack>
    </PortalStandardModal>
  );
}

function PortalAdvanceSearchResultCard(props: {
  result: PortalAdvanceSearchResult;
  onSelect: () => void;
}) {
  const { result, onSelect } = props;
  const badge = getResultBadge(result);

  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Text size="sm" fw={600} style={{ flex: 1, minWidth: 0 }}>
            {result.title}
          </Text>
          <Badge variant="light" color={badge.color} size="sm">
            {badge.label}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {result.subtitle}
        </Text>
      </Stack>
    </Card>
  );
}

function getResultBadge(result: PortalAdvanceSearchResult): { label: string; color: string } {
  if (result.tableStatus) {
    return {
      label: tableStatusLabel[result.tableStatus],
      color: tableStatusColor[result.tableStatus],
    };
  }
  return {
    label: portalAdvanceSearchSectionLabel[result.section],
    color: sectionBadgeColor(result.section),
  };
}

function sectionBadgeColor(section: PortalAdvanceSearchSection): string {
  switch (section) {
    case "floor-map":
      return "grape";
    case "bookings":
      return "blue";
    case "customers":
      return "teal";
    case "tables":
      return "orange";
    default:
      return "gray";
  }
}
