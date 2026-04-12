"use client";

import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type CSSProperties, type ChangeEvent, useRef, useState } from "react";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import classes from "./page.module.css";

export default function FloorMapPage() {
  const {
    state,
    currentUser,
    filteredBranchIds,
    moveTable,
    persistTablePosition,
    setFloorBackground,
  } = useAppContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);

  const availableAreas = state.areas.filter((area) => filteredBranchIds.includes(area.branchId));
  const areaId = activeAreaId ?? availableAreas[0]?.id;

  const tables = state.tables.filter((table) => table.areaId === areaId);

  const backgroundImage = areaId
    ? state.floorBackgrounds[`${currentUser?.id ?? "guest"}_${areaId}`]
    : undefined;

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0] || !areaId) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      void setFloorBackground(areaId, result);
      notifications.show({ color: "green", message: "Đã cập nhật ảnh nền sơ đồ." });
    };
    reader.readAsDataURL(event.target.files[0]);
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!draggingTableId || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left - 50, rect.width - 100));
    const y = Math.max(0, Math.min(clientY - rect.top - 30, rect.height - 60));
    moveTable(draggingTableId, x, y);
  };

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Sơ đồ nhà hàng tương tác</Title>
          <Text c="dimmed">Tải ảnh nền và kéo thả bàn theo vị trí thực tế từng khu vực.</Text>
        </div>
      </Group>

      <Card withBorder>
        <Group>
          <Select
            label="Khu vực"
            value={areaId}
            onChange={setActiveAreaId}
            data={availableAreas.map((area) => ({
              value: area.id,
              label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
            }))}
            w={460}
          />
          <Button component="label" mt={24}>
            Tải ảnh mặt bằng
            <input type="file" hidden accept="image/*" onChange={handleUpload} />
          </Button>
        </Group>
      </Card>

      <Card withBorder>
        <div
          ref={containerRef}
          onMouseMove={(event) => onMove(event.clientX, event.clientY)}
          onMouseUp={() => {
            if (draggingTableId) {
              void persistTablePosition(draggingTableId);
            }
            setDraggingTableId(null);
          }}
          onMouseLeave={() => {
            if (draggingTableId) {
              void persistTablePosition(draggingTableId);
            }
            setDraggingTableId(null);
          }}
          className={classes.floorMapCanvas}
          style={
            {
              "--floor-background-image": backgroundImage ? `url(${backgroundImage})` : "none",
            } as CSSProperties
          }
        >
          {!backgroundImage && (
            <Text c="dimmed" p="md">
              Chưa có ảnh nền cho khu vực này. Hãy tải ảnh để bố trí bàn trực quan.
            </Text>
          )}
          {tables.map((table) => (
            <div
              key={table.id}
              onMouseDown={() => setDraggingTableId(table.id)}
              className={classes.tableCard}
              style={
                {
                  "--table-left": `${table.positionX}px`,
                  "--table-top": `${table.positionY}px`,
                } as CSSProperties
              }
            >
              <Text fw={700} size="sm">
                {table.name}
              </Text>
              <Badge color={tableStatusColor[table.status]} size="xs" variant="light">
                {tableStatusLabel[table.status]}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </Stack>
  );
}
