"use client";

import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { Fragment, type CSSProperties, type ReactNode } from "react";

export type BookingSummaryMetaSegment = {
  text: string;
  /** Highlights scan-friendly details (guest type, table, check-in, etc.). */
  emphasize?: boolean;
};

export type BookingSummaryCompactCardProps = {
  timeLabel?: string;
  /** When false, the leading time column is omitted (e.g. customer cards). */
  showTimeColumn?: boolean;
  title: string;
  /** Shown beside the title (e.g. guest count — only `bold` is emphasized). */
  titleSuffix?: { bold: string; normal: string };
  badge: { label: string; color: string };
  /** Creator on the meta row: bold name + " tạo đơn lúc [time]". */
  createdBy?: { name: string; time?: string } | null;
  /** Optional second line under assignee: [name] cập nhật lúc [time]. */
  updatedLabel?: { name: string; time: string } | null;
  metaSegments: BookingSummaryMetaSegment[];
  note?: string | null;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Optional control before the time column (e.g. selection checkbox). */
  leadingSlot?: ReactNode;
};

export function BookingSummaryCompactCard(props: BookingSummaryCompactCardProps) {
  const {
    timeLabel = "",
    showTimeColumn = true,
    title,
    titleSuffix,
    badge,
    createdBy,
    updatedLabel,
    metaSegments,
    note,
    onClick,
    className,
    style,
    leadingSlot,
  } = props;

  const isCompact = usePortalCompact();
  const hasMetaBlock =
    metaSegments.length > 0 || Boolean(createdBy) || Boolean(note);
  const creatorAlign = isCompact ? "flex-start" : "flex-end";
  const creatorTextAlign = isCompact ? "left" : "right";

  return (
    <Card
      withBorder
      radius="md"
      padding="xs"
      className={className}
      style={{ cursor: onClick ? "pointer" : undefined, ...style }}
      onClick={onClick}
    >
      <Group wrap="nowrap" align="flex-start" gap="sm">
        {leadingSlot}
        {showTimeColumn ? (
          <Text size="md" fw={700} lh={1.2} style={{ flexShrink: 0, minWidth: "2.75rem" }}>
            {timeLabel}
          </Text>
        ) : null}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="wrap" gap="xs" align="flex-start">
            <Group gap={6} wrap="wrap" align="center" style={{ flex: "1 1 12rem", minWidth: 0 }}>
              <Text fw={700} size="sm" c="brand" style={{ minWidth: 0, wordBreak: "break-word" }}>
                {title}
              </Text>
              {titleSuffix && (titleSuffix.bold || titleSuffix.normal) ? (
                <>
                  <Text component="span" c="dimmed" fw={500} style={{ flexShrink: 0 }}>
                    ·
                  </Text>
                  {titleSuffix.bold ? (
                    <Text component="span" fw={700} size="sm" style={{ flexShrink: 0 }}>
                      {titleSuffix.bold}
                    </Text>
                  ) : null}
                  {titleSuffix.normal ? (
                    <Text component="span" size="sm" fw={500} style={{ flexShrink: 0 }}>
                      {titleSuffix.normal}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </Group>
            <Badge color={badge.color} variant="filled" size="sm" style={{ flexShrink: 0 }}>
              {badge.label}
            </Badge>
          </Group>
          {hasMetaBlock ? (
            <Stack gap={4}>
              {metaSegments.length > 0 ? (
                <Text
                  size="xs"
                  lh={1.45}
                  style={{ minWidth: 0, wordBreak: "break-word" }}
                >
                  {metaSegments.map((segment, index) => (
                    <Fragment key={`${segment.text}-${index}`}>
                      {index > 0 ? (
                        <Text component="span" c="dimmed" fw={400}>
                          {" · "}
                        </Text>
                      ) : null}
                      <Text
                        component="span"
                        fw={segment.emphasize ? 700 : 500}
                        c={segment.emphasize ? undefined : "dimmed"}
                      >
                        {segment.text}
                      </Text>
                    </Fragment>
                  ))}
                </Text>
              ) : null}
              {note ? (
                <Text size="xs" lh={1.35} style={{ wordBreak: "break-word" }}>
                  <Text component="span" fw={700}>
                    Ghi chú:{" "}
                  </Text>
                  <Text component="span" c="dimmed" fw={500}>
                    {note}
                  </Text>
                </Text>
              ) : null}
              {createdBy ? (
                <Stack
                  gap={2}
                  align={creatorAlign}
                  style={{
                    alignSelf: isCompact ? "stretch" : "flex-end",
                    maxWidth: "100%",
                  }}
                >
                  <Text
                    size="xs"
                    c="dimmed"
                    fw={500}
                    ta={creatorTextAlign}
                    lh={1.45}
                    style={{ wordBreak: "break-word" }}
                  >
                    <Text component="span" fw={700}>
                      {createdBy.name}
                    </Text>{" "}
                    tạo đơn
                    {createdBy.time ? (
                      <>
                        {" "}
                        lúc{" "}
                        <Text component="span" fw={700}>
                          {createdBy.time}
                        </Text>
                      </>
                    ) : null}
                  </Text>
                  {updatedLabel ? (
                    <Text
                      size="xs"
                      c="dimmed"
                      ta={creatorTextAlign}
                      lh={1.45}
                      style={{ wordBreak: "break-word" }}
                    >
                      <Text component="span" fw={700}>
                        {updatedLabel.name}
                      </Text>{" "}
                      cập nhật lúc{" "}
                      <Text component="span" fw={700}>
                        {updatedLabel.time}
                      </Text>
                    </Text>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </Group>
    </Card>
  );
}
