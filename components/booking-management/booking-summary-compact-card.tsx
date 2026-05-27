"use client";

import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { Fragment, type CSSProperties } from "react";

export type BookingSummaryMetaSegment = {
  text: string;
  /** Highlights scan-friendly details (guest type, table, check-in, etc.). */
  emphasize?: boolean;
};

export function BookingSummaryCompactCard(props: {
  timeLabel?: string;
  /** When false, the leading time column is omitted (e.g. customer cards). */
  showTimeColumn?: boolean;
  title: string;
  /** Shown beside the title (e.g. guest count — only `bold` is emphasized). */
  titleSuffix?: { bold: string; normal: string };
  badge: { label: string; color: string };
  /** Trailing text on the meta row (e.g. Người nhận). */
  assigneeLabel?: string | null;
  metaSegments: BookingSummaryMetaSegment[];
  note?: string | null;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const {
    timeLabel = "",
    showTimeColumn = true,
    title,
    titleSuffix,
    badge,
    assigneeLabel,
    metaSegments,
    note,
    onClick,
    className,
    style,
  } = props;

  const hasMetaRow = metaSegments.length > 0 || Boolean(assigneeLabel);

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
        {showTimeColumn ? (
          <Text size="md" fw={700} lh={1.2} style={{ flexShrink: 0, minWidth: "2.75rem" }}>
            {timeLabel}
          </Text>
        ) : null}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap" gap="xs" align="center">
            <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              <Text fw={700} size="sm" c="brand" lineClamp={1} style={{ minWidth: 0 }}>
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
          {hasMetaRow ? (
            <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
              {metaSegments.length > 0 ? (
                <Text size="xs" lineClamp={1} lh={1.45} style={{ flex: 1, minWidth: 0 }}>
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
              ) : (
                <span style={{ flex: 1, minWidth: 0 }} />
              )}
              {assigneeLabel ? (
                <Text
                  size="xs"
                  c="dimmed"
                  fw={500}
                  ta="right"
                  lineClamp={1}
                  lh={1.45}
                  style={{ flexShrink: 0, maxWidth: "48%" }}
                >
                  {assigneeLabel}
                </Text>
              ) : null}
            </Group>
          ) : null}
          {note ? (
            <Text size="xs" lineClamp={1} lh={1.35}>
              <Text component="span" fw={700}>
                Ghi chú:{" "}
              </Text>
              <Text component="span" c="dimmed" fw={500}>
                {note}
              </Text>
            </Text>
          ) : null}
        </Stack>
      </Group>
    </Card>
  );
}
