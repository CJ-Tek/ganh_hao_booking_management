"use client";

import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { type CSSProperties, type ChangeEvent, useEffect, useRef, useState } from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { type DiningTable, type FloorLayoutTemplateSummary, type TableStatus } from "@/lib/types";
import classes from "./page.module.css";

const FLOOR_MAP_VIEW_KEY = "ganh_hao_floor_map_view_v1";
const FLOOR_MAP_ACTIVE_AREA_KEY = "ganh_hao_floor_map_active_area_v1";

export default function FloorMapPage() {
  const {
    state,
    currentUser,
    filteredBranchIds,
    moveTable,
    persistTablePosition,
    setFloorBackground,
    upsertTable,
    deleteTable,
    listFloorLayoutTemplates,
    deleteFloorLayoutTemplate,
    saveFloorLayoutTemplate,
    applyFloorLayoutTemplate,
    getLastSelectedFloorLayoutTemplate,
    setLastSelectedFloorLayoutTemplate,
  } = useAppContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [configuringTableId, setConfiguringTableId] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [tableSeats, setTableSeats] = useState<number>(4);
  const [tableStatus, setTableStatus] = useState<TableStatus>("available");
  const [newTableName, setNewTableName] = useState("");
  const [newTableSeats, setNewTableSeats] = useState<number>(4);
  const [tableToRemoveId, setTableToRemoveId] = useState<string | null>(null);
  const [backgroundScale, setBackgroundScale] = useState(100);
  const [backgroundPosX, setBackgroundPosX] = useState(50);
  const [backgroundPosY, setBackgroundPosY] = useState(50);
  const [templateName, setTemplateName] = useState("Mặc định");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FloorLayoutTemplateSummary[]>([]);
  const [configuredTableIds, setConfiguredTableIds] = useState<string[]>([]);
  const templateLoadErrorShownRef = useRef(false);
  const autoAppliedTemplateRef = useRef<string>("");
  const hasRestoredAreaRef = useRef(false);
  const templateLoadRequestIdRef = useRef(0);

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
      setSelectedTemplate(null);
      setConfiguredTableIds([]);
      void setLastSelectedFloorLayoutTemplate(areaId, null);
      notifications.show({ color: "green", message: "Đã cập nhật ảnh nền sơ đồ." });
    };
    reader.readAsDataURL(event.target.files[0]);
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!isEditMode || !draggingTableId || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left - 50, rect.width - 100));
    const y = Math.max(0, Math.min(clientY - rect.top - 30, rect.height - 60));
    moveTable(draggingTableId, x, y);
  };

  const finishDragging = () => {
    if (isEditMode && draggingTableId) {
      void persistTablePosition(draggingTableId);
      setConfiguredTableIds((prev) => (prev.includes(draggingTableId) ? prev : [...prev, draggingTableId]));
    }
    setDraggingTableId(null);
  };

  useEffect(() => {
    hasRestoredAreaRef.current = false;
  }, [currentUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || availableAreas.length === 0 || hasRestoredAreaRef.current) {
      return;
    }
    const userId = currentUser?.id ?? "guest";
    const raw = window.localStorage.getItem(`${FLOOR_MAP_ACTIVE_AREA_KEY}_${userId}`);
    const restoredAreaId = raw && availableAreas.some((area) => area.id === raw) ? raw : null;
    setActiveAreaId(restoredAreaId ?? availableAreas[0]?.id ?? null);
    hasRestoredAreaRef.current = true;
  }, [availableAreas, currentUser?.id]);

  useEffect(() => {
    if (!areaId || typeof window === "undefined") {
      return;
    }
    const userId = currentUser?.id ?? "guest";
    window.localStorage.setItem(`${FLOOR_MAP_ACTIVE_AREA_KEY}_${userId}`, areaId);
  }, [areaId, currentUser?.id]);

  useEffect(() => {
    if (!areaId || typeof window === "undefined") {
      return;
    }
    const userId = currentUser?.id ?? "guest";
    const raw = window.localStorage.getItem(`${FLOOR_MAP_VIEW_KEY}_${userId}`);
    if (!raw) {
      setBackgroundScale(100);
      setBackgroundPosX(50);
      setBackgroundPosY(50);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<
        string,
        { scale?: number; posX?: number; posY?: number }
      >;
      const areaView = parsed[areaId];
      setBackgroundScale(areaView?.scale ?? 100);
      setBackgroundPosX(areaView?.posX ?? 50);
      setBackgroundPosY(areaView?.posY ?? 50);
    } catch {
      setBackgroundScale(100);
      setBackgroundPosX(50);
      setBackgroundPosY(50);
    }
  }, [areaId, currentUser?.id]);

  useEffect(() => {
    if (!areaId || typeof window === "undefined") {
      return;
    }
    const userId = currentUser?.id ?? "guest";
    const key = `${FLOOR_MAP_VIEW_KEY}_${userId}`;
    const raw = window.localStorage.getItem(key);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, { scale?: number; posX?: number; posY?: number }>)
      : {};
    parsed[areaId] = {
      scale: backgroundScale,
      posX: backgroundPosX,
      posY: backgroundPosY,
    };
    window.localStorage.setItem(key, JSON.stringify(parsed));
  }, [areaId, backgroundScale, backgroundPosX, backgroundPosY, currentUser?.id]);

  useEffect(() => {
    templateLoadRequestIdRef.current += 1;
    const requestId = templateLoadRequestIdRef.current;
    let cancelled = false;

    const loadTemplates = async () => {
      if (!areaId) {
        if (cancelled || requestId !== templateLoadRequestIdRef.current) {
          return;
        }
        setTemplates([]);
        setSelectedTemplate(null);
        return;
      }
      try {
        const items = await listFloorLayoutTemplates(areaId);
        if (cancelled || requestId !== templateLoadRequestIdRef.current) {
          return;
        }
        setTemplates(items);
        templateLoadErrorShownRef.current = false;
        setConfiguredTableIds(tables.map((table) => table.id));
        const lastTemplateName = await getLastSelectedFloorLayoutTemplate(areaId);
        if (cancelled || requestId !== templateLoadRequestIdRef.current) {
          return;
        }
        const resolvedTemplate =
          lastTemplateName && items.some((item) => item.name === lastTemplateName)
            ? lastTemplateName
            : null;
        setSelectedTemplate((prev) => (prev === resolvedTemplate ? prev : resolvedTemplate));

        if (resolvedTemplate) {
          const applyKey = `${areaId}:${resolvedTemplate}`;
          if (autoAppliedTemplateRef.current !== applyKey) {
            autoAppliedTemplateRef.current = applyKey;
            const result = await applyFloorLayoutTemplate(areaId, resolvedTemplate);
            if (cancelled || requestId !== templateLoadRequestIdRef.current) {
              return;
            }
            if (result) {
              setBackgroundScale(result.backgroundScale);
              setConfiguredTableIds(result.tableIds);
            }
          }
        }
      } catch (error) {
        if (cancelled || requestId !== templateLoadRequestIdRef.current) {
          return;
        }
        if (templateLoadErrorShownRef.current) {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : "";
        if (errorMessage.includes("AbortError")) {
          return;
        }
        const isMissingTemplateTable = errorMessage.includes("floor_layout_templates");
        notifications.show({
          color: "red",
          message: isMissingTemplateTable
            ? "Chưa có bảng floor_layout_templates trong DB. Vui lòng chạy cập nhật schema."
            : "Không tải được danh sách template.",
        });
        templateLoadErrorShownRef.current = true;
      }
    };
    void loadTemplates();

    return () => {
      cancelled = true;
    };
  // list/get/apply template functions are intentionally omitted because context functions are not memoized.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  const openTableConfig = (table: DiningTable) => {
    setConfiguringTableId(table.id);
    setTableName(table.name);
    setTableSeats(table.seats);
    setTableStatus(table.status);
  };

  const closeTableConfig = () => {
    setConfiguringTableId(null);
  };

  const handleSaveTableConfig = async () => {
    if (!configuringTableId) {
      return;
    }
    const table = state.tables.find((item) => item.id === configuringTableId);
    if (!table || !tableName.trim()) {
      notifications.show({ color: "red", message: "Vui lòng nhập tên bàn hợp lệ." });
      return;
    }
    await upsertTable({
      id: table.id,
      branchId: table.branchId,
      areaId: table.areaId,
      name: tableName.trim(),
      seats: tableSeats,
      status: tableStatus,
      positionX: table.positionX,
      positionY: table.positionY,
    });
    setConfiguredTableIds((prev) => (prev.includes(table.id) ? prev : [...prev, table.id]));
    notifications.show({ color: "green", message: "Đã cập nhật cấu hình bàn." });
    closeTableConfig();
  };

  const handleCreateNewTemplate = () => {
    setSelectedTemplate(null);
    setTemplateName("Template mới");
    setBackgroundScale(100);
    setBackgroundPosX(50);
    setBackgroundPosY(50);
    setConfiguredTableIds([]);
    setIsEditMode(true);
    if (areaId) {
      void setLastSelectedFloorLayoutTemplate(areaId, null);
    }
    notifications.show({
      color: "blue",
      message: "Đã tạo template mới, các block bàn cũ đã được xóa khỏi template hiện tại.",
    });
  };

  const handleAddTable = async () => {
    if (!areaId || !newTableName.trim()) {
      notifications.show({ color: "red", message: "Vui lòng nhập tên bàn để thêm." });
      return;
    }
    const area = state.areas.find((item) => item.id === areaId);
    if (!area) {
      notifications.show({ color: "red", message: "Không tìm thấy khu vực để thêm bàn." });
      return;
    }
    await upsertTable({
      branchId: area.branchId,
      areaId,
      name: newTableName.trim(),
      seats: newTableSeats,
      status: "available",
      positionX: 40,
      positionY: 40,
    });
    setNewTableName("");
    setNewTableSeats(4);
    notifications.show({ color: "green", message: "Đã thêm bàn mới vào sơ đồ." });
  };

  const handleRemoveTable = async () => {
    if (!tableToRemoveId) {
      notifications.show({ color: "red", message: "Vui lòng chọn bàn cần xóa." });
      return;
    }
    await deleteTable(tableToRemoveId);
    setConfiguredTableIds((prev) => prev.filter((id) => id !== tableToRemoveId));
    setTableToRemoveId(null);
    notifications.show({ color: "green", message: "Đã xóa bàn khỏi sơ đồ và danh sách bàn." });
  };

  const handleSaveTemplate = async () => {
    if (!areaId || !templateName.trim()) {
      notifications.show({ color: "red", message: "Vui lòng chọn khu vực và nhập tên template." });
      return;
    }
    try {
      await saveFloorLayoutTemplate({
        areaId,
        name: templateName.trim(),
        backgroundImageDataUrl: backgroundImage,
        backgroundScale,
        tables: tables.filter((table) => configuredTableIds.includes(table.id)),
      });
      const items = await listFloorLayoutTemplates(areaId);
      setTemplates(items);
      setSelectedTemplate(templateName.trim());
      await setLastSelectedFloorLayoutTemplate(areaId, templateName.trim());
      notifications.show({ color: "green", message: "Đã lưu template bố trí." });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const isMissingTemplateTable = errorMessage.includes("floor_layout_templates");
      notifications.show({
        color: "red",
        message: isMissingTemplateTable
          ? "DB chưa có bảng floor_layout_templates. Vui lòng chạy script schema mới trong Supabase."
          : "Không thể lưu template. Vui lòng thử lại.",
      });
    }
  };

  const handleApplyTemplate = async () => {
    if (!areaId || !selectedTemplate) {
      notifications.show({ color: "red", message: "Vui lòng chọn template để áp dụng." });
      return;
    }
    try {
      const result = await applyFloorLayoutTemplate(areaId, selectedTemplate);
      if (!result) {
        notifications.show({ color: "red", message: "Không tìm thấy template đã chọn." });
        return;
      }
      setBackgroundScale(result.backgroundScale);
      setConfiguredTableIds(result.tableIds);
      await setLastSelectedFloorLayoutTemplate(areaId, selectedTemplate);
      notifications.show({
        color: "green",
        message: `Đã áp dụng template "${selectedTemplate}" lúc ${dayjs().format("HH:mm")}.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const isMissingTemplateTable = errorMessage.includes("floor_layout_templates");
      notifications.show({
        color: "red",
        message: isMissingTemplateTable
          ? "DB chưa có bảng floor_layout_templates. Vui lòng chạy script schema mới trong Supabase."
          : errorMessage || "Không thể áp dụng template. Vui lòng thử lại.",
      });
    }
  };

  const handleRemoveTemplate = async () => {
    if (!areaId || !selectedTemplate) {
      notifications.show({ color: "red", message: "Vui lòng chọn template cần xóa." });
      return;
    }
    try {
      await deleteFloorLayoutTemplate(areaId, selectedTemplate);
      const items = await listFloorLayoutTemplates(areaId);
      setTemplates(items);
      setTemplateName("Mặc định");
      setSelectedTemplate(null);
      setConfiguredTableIds([]);
      await setLastSelectedFloorLayoutTemplate(areaId, null);
      notifications.show({
        color: "green",
        message: `Đã xóa template "${selectedTemplate}".`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const isMissingTemplateTable = errorMessage.includes("floor_layout_templates");
      notifications.show({
        color: "red",
        message: isMissingTemplateTable
          ? "DB chưa có bảng floor_layout_templates. Vui lòng chạy script schema mới trong Supabase."
          : errorMessage || "Không thể xóa template. Vui lòng thử lại.",
      });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <PortalPageTitle>Sơ đồ nhà hàng tương tác</PortalPageTitle>
          <Text c="dimmed">Tải ảnh nền và kéo thả bàn theo vị trí thực tế từng khu vực.</Text>
        </div>
      </Group>

      <PortalSectionCard>
        <Stack gap="md">
          <Group className={classes.toolbarRow} align="end">
            <Select
              label="Khu vực"
              value={areaId}
              onChange={setActiveAreaId}
              data={availableAreas.map((area) => ({
                value: area.id,
                label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
              }))}
              className={classes.areaSelect}
            />
            <Button
              variant={isEditMode ? "filled" : "light"}
              onClick={() => {
                setIsEditMode((prev) => !prev);
                setDraggingTableId(null);
              }}
            >
              {isEditMode ? "Chỉnh sửa" : "Xem"}
            </Button>
            <Button component="label" variant="light">
              Tải ảnh mặt bằng
              <input type="file" hidden accept="image/*" onChange={handleUpload} />
            </Button>
            <Button variant="light" onClick={handleCreateNewTemplate}>
              Tạo mới
            </Button>
          </Group>

          <Group className={classes.toolbarRow} align="end">
            <div className={classes.sliderControl}>
              <Text size="xs" fw={500} mb={4}>
                Tỷ lệ nền: {backgroundScale}%
              </Text>
              <Slider
                value={backgroundScale}
                min={50}
                max={200}
                step={5}
                onChange={setBackgroundScale}
                disabled={!isEditMode}
              />
            </div>
            <div className={classes.sliderControl}>
              <Text size="xs" fw={500} mb={4}>
                Vị trí ngang nền: {backgroundPosX}%
              </Text>
              <Slider
                value={backgroundPosX}
                min={0}
                max={100}
                step={1}
                onChange={setBackgroundPosX}
                disabled={!isEditMode}
              />
            </div>
            <div className={classes.sliderControl}>
              <Text size="xs" fw={500} mb={4}>
                Vị trí dọc nền: {backgroundPosY}%
              </Text>
              <Slider
                value={backgroundPosY}
                min={0}
                max={100}
                step={1}
                onChange={setBackgroundPosY}
                disabled={!isEditMode}
              />
            </div>
          </Group>

          <Group className={classes.toolbarRow} align="end">
            <TextInput
              label="Tên template"
              value={templateName}
              onChange={(event) => setTemplateName(event.currentTarget.value)}
              className={classes.templateNameInput}
            />
            <Button onClick={() => void handleSaveTemplate()}>Lưu template</Button>
            <Select
              label="Template đã lưu"
              value={selectedTemplate}
              onChange={setSelectedTemplate}
              data={templates.map((item) => ({
                value: item.name,
                label: `${item.name} (${dayjs(item.updatedAt).format("DD/MM HH:mm")})`,
              }))}
              className={classes.templateSelect}
            />
            <Button variant="light" onClick={() => void handleApplyTemplate()}>
              Áp dụng template
            </Button>
            <Button color="red" variant="light" onClick={() => void handleRemoveTemplate()}>
              Xóa template
            </Button>
          </Group>

          <Group className={classes.toolbarRow} align="end">
            <TextInput
              label="Tên bàn mới"
              value={newTableName}
              onChange={(event) => setNewTableName(event.currentTarget.value)}
              className={classes.tableNameInput}
            />
            <NumberInput
              label="Số ghế"
              value={newTableSeats}
              min={1}
              onChange={(value) => setNewTableSeats(Number(value || 1))}
              w={120}
            />
            <Button onClick={() => void handleAddTable()} disabled={!isEditMode}>
              Thêm bàn
            </Button>
            <Select
              label="Xóa bàn"
              placeholder="Chọn bàn"
              value={tableToRemoveId}
              onChange={setTableToRemoveId}
              data={tables.map((table) => ({ value: table.id, label: table.name }))}
              className={classes.tableSelect}
            />
            <Button color="red" variant="light" onClick={() => void handleRemoveTable()} disabled={!isEditMode}>
              Xóa bàn
            </Button>
          </Group>
        </Stack>
      </PortalSectionCard>

      <PortalSectionCard>
        <div
          ref={containerRef}
          onMouseMove={(event) => onMove(event.clientX, event.clientY)}
          onMouseUp={finishDragging}
          onMouseLeave={finishDragging}
          onTouchMove={(event) => {
            const touch = event.touches[0];
            if (!touch) {
              return;
            }
            onMove(touch.clientX, touch.clientY);
          }}
          onTouchEnd={finishDragging}
          onTouchCancel={finishDragging}
          className={`${classes.floorMapCanvas} ${isEditMode ? classes.floorMapCanvasEdit : ""}`}
          style={
            {
              "--floor-background-image": backgroundImage ? `url(${backgroundImage})` : "none",
              "--floor-background-size": `${backgroundScale}%`,
              "--floor-background-position-x": `${backgroundPosX}%`,
              "--floor-background-position-y": `${backgroundPosY}%`,
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
              onMouseDown={() => isEditMode && setDraggingTableId(table.id)}
              onTouchStart={() => isEditMode && setDraggingTableId(table.id)}
              onClick={() => {
                if (!isEditMode) {
                  openTableConfig(table);
                }
              }}
              className={`${classes.tableCard} ${isEditMode ? classes.tableCardEdit : classes.tableCardView}`}
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
      </PortalSectionCard>
      <Modal opened={Boolean(configuringTableId)} onClose={closeTableConfig} title="Cấu hình bàn" centered>
        <Stack>
          <TextInput
            label="Tên bàn"
            value={tableName}
            onChange={(event) => setTableName(event.currentTarget.value)}
          />
          <NumberInput
            label="Số ghế"
            value={tableSeats}
            min={1}
            onChange={(value) => setTableSeats(Number(value || 1))}
          />
          <Select
            label="Trạng thái"
            value={tableStatus}
            onChange={(value) => value && setTableStatus(value as TableStatus)}
            data={(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => ({
              value: status,
              label: tableStatusLabel[status],
            }))}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={closeTableConfig}>
              Hủy
            </Button>
            <Button onClick={() => void handleSaveTableConfig()}>Lưu</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
