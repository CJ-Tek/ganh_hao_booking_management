"use client";

import {
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { DataTable } from "mantine-datatable";
import { type CSSProperties, type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { type FloorLayoutBlock, type FloorLayoutTemplateSummary, type TableStatus } from "@/lib/types";
import classes from "./page.module.css";

const FLOOR_MAP_VIEW_KEY = "ganh_hao_floor_map_view_v1";
const FLOOR_MAP_ACTIVE_AREA_KEY = "ganh_hao_floor_map_active_area_v1";

function createBlockId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function FloorMapPage() {
  const {
    state,
    currentUser,
    filteredBranchIds,
    setFloorBackground,
    listFloorLayoutTemplates,
    deleteFloorLayoutTemplate,
    saveFloorLayoutTemplate,
    applyFloorLayoutTemplate,
    getLastSelectedFloorLayoutTemplate,
    setLastSelectedFloorLayoutTemplate,
  } = useAppContext();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [layoutBlocks, setLayoutBlocks] = useState<FloorLayoutBlock[]>([]);
  const [configuringBlockId, setConfiguringBlockId] = useState<string | null>(null);
  const [blockLabel, setBlockLabel] = useState("");
  const [blockSeats, setBlockSeats] = useState<number>(4);
  const [blockStatus, setBlockStatus] = useState<TableStatus>("available");
  const [newBlockTableId, setNewBlockTableId] = useState<string | null>(null);
  const [blockToRemoveId, setBlockToRemoveId] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState("");
  const [blockStatusFilter, setBlockStatusFilter] = useState<string>("all");
  const [blockSortMode, setBlockSortMode] = useState<string>("name-asc");
  const [backgroundScale, setBackgroundScale] = useState(100);
  const [backgroundPosX, setBackgroundPosX] = useState(50);
  const [backgroundPosY, setBackgroundPosY] = useState(50);
  const [templateName, setTemplateName] = useState("Mặc định");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FloorLayoutTemplateSummary[]>([]);
  const [pendingDeleteBlockId, setPendingDeleteBlockId] = useState<string | null>(null);
  const [pendingDeleteTemplateName, setPendingDeleteTemplateName] = useState<string | null>(null);
  const [lastRemovedBlock, setLastRemovedBlock] = useState<FloorLayoutBlock | null>(null);
  const templateLoadErrorShownRef = useRef(false);
  const autoAppliedTemplateRef = useRef<string>("");
  const hasRestoredAreaRef = useRef(false);
  const templateLoadRequestIdRef = useRef(0);

  const availableAreas = state.areas.filter((area) => filteredBranchIds.includes(area.branchId));
  const areaId = activeAreaId ?? availableAreas[0]?.id;
  const referenceTables = useMemo(
    () => state.tables.filter((table) => table.areaId === areaId),
    [areaId, state.tables]
  );

  const visibleBlocks = useMemo(() => {
    const keyword = blockSearch.trim().toLowerCase();
    const filtered = layoutBlocks.filter((item) => {
      const hitKeyword = !keyword || item.label.toLowerCase().includes(keyword);
      const hitStatus = blockStatusFilter === "all" || item.status === blockStatusFilter;
      return hitKeyword && hitStatus;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (blockSortMode === "name-desc") {
        return b.label.localeCompare(a.label, "vi");
      }
      if (blockSortMode === "seats-asc") {
        return a.seats - b.seats;
      }
      if (blockSortMode === "seats-desc") {
        return b.seats - a.seats;
      }
      return a.label.localeCompare(b.label, "vi");
    });
    return sorted;
  }, [blockSearch, blockSortMode, blockStatusFilter, layoutBlocks]);

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
      setLayoutBlocks([]);
      void setLastSelectedFloorLayoutTemplate(areaId, null);
      notifications.show({ color: "green", message: "Đã cập nhật ảnh nền sơ đồ." });
    };
    reader.readAsDataURL(event.target.files[0]);
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!isEditMode || !draggingBlockId || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left - 50, rect.width - 100));
    const y = Math.max(0, Math.min(clientY - rect.top - 30, rect.height - 60));
    setLayoutBlocks((prev) =>
      prev.map((item) =>
        item.id === draggingBlockId
          ? { ...item, positionX: Math.round(x), positionY: Math.round(y) }
          : item
      )
    );
  };

  const finishDragging = () => {
    setDraggingBlockId(null);
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
        setLayoutBlocks([]);
        return;
      }
      try {
        const items = await listFloorLayoutTemplates(areaId);
        if (cancelled || requestId !== templateLoadRequestIdRef.current) {
          return;
        }
        setTemplates(items);
        templateLoadErrorShownRef.current = false;
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
              setLayoutBlocks(result.blocks);
            }
          }
        } else {
          setLayoutBlocks([]);
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

  const openBlockConfig = (block: FloorLayoutBlock) => {
    setConfiguringBlockId(block.id);
    setBlockLabel(block.label);
    setBlockSeats(block.seats);
    setBlockStatus(block.status);
  };

  const closeBlockConfig = () => {
    setConfiguringBlockId(null);
  };

  const handleSaveBlockConfig = () => {
    if (!configuringBlockId || !blockLabel.trim()) {
      notifications.show({ color: "red", message: "Vui lòng nhập nhãn block hợp lệ." });
      return;
    }
    setLayoutBlocks((prev) =>
      prev.map((item) =>
        item.id === configuringBlockId
          ? {
              ...item,
              label: blockLabel.trim(),
              seats: blockSeats,
              status: blockStatus,
            }
          : item
      )
    );
    notifications.show({ color: "green", message: "Đã cập nhật cấu hình block." });
    closeBlockConfig();
  };

  const handleCreateNewTemplate = () => {
    setSelectedTemplate(null);
    setTemplateName("Template mới");
    setBackgroundScale(100);
    setBackgroundPosX(50);
    setBackgroundPosY(50);
    setLayoutBlocks([]);
    setIsEditMode(true);
    if (areaId) {
      void setLastSelectedFloorLayoutTemplate(areaId, null);
    }
    notifications.show({
      color: "blue",
      message: "Đã tạo template mới, các block bàn cũ đã được xóa khỏi template hiện tại.",
    });
  };

  const handleAddBlock = () => {
    if (!newBlockTableId) {
      notifications.show({ color: "red", message: "Vui lòng chọn bàn tham chiếu để thêm block." });
      return;
    }
    const sourceTable = referenceTables.find((table) => table.id === newBlockTableId);
    if (!sourceTable) {
      notifications.show({ color: "red", message: "Không tìm thấy bàn tham chiếu trong khu vực hiện tại." });
      return;
    }
    setLayoutBlocks((prev) => [
      ...prev,
      {
        id: createBlockId(),
        referenceTableId: sourceTable.id,
        label: sourceTable.name,
        seats: sourceTable.seats,
        status: sourceTable.status,
        positionX: 40,
        positionY: 40,
      },
    ]);
    setNewBlockTableId(null);
    notifications.show({ color: "green", message: "Đã thêm block bàn vào template hiện tại." });
  };

  const handleRemoveBlockById = (blockId: string) => {
    const targetBlock = layoutBlocks.find((item) => item.id === blockId);
    if (targetBlock) {
      setLastRemovedBlock(targetBlock);
    }
    setLayoutBlocks((prev) => prev.filter((item) => item.id !== blockId));
    if (blockToRemoveId === blockId) {
      setBlockToRemoveId(null);
    }
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  const requestRemoveBlock = (blockId?: string) => {
    const resolvedId = blockId ?? blockToRemoveId;
    if (!resolvedId) {
      notifications.show({ color: "red", message: "Vui lòng chọn block cần xóa." });
      return;
    }
    setPendingDeleteBlockId(resolvedId);
  };

  const confirmRemoveBlock = () => {
    if (!pendingDeleteBlockId) {
      return;
    }
    handleRemoveBlockById(pendingDeleteBlockId);
    setPendingDeleteBlockId(null);
    notifications.show({ color: "green", message: "Đã xóa block khỏi template hiện tại." });
  };

  const handleUndoRemoveBlock = () => {
    if (!lastRemovedBlock) {
      return;
    }
    setLayoutBlocks((prev) => [...prev, lastRemovedBlock]);
    setSelectedBlockId(lastRemovedBlock.id);
    setLastRemovedBlock(null);
    notifications.show({ color: "green", message: "Đã hoàn tác xóa block." });
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
        blocks: layoutBlocks,
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
      setLayoutBlocks(result.blocks);
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

  const requestRemoveTemplate = () => {
    if (!areaId || !selectedTemplate) {
      notifications.show({ color: "red", message: "Vui lòng chọn template cần xóa." });
      return;
    }
    setPendingDeleteTemplateName(selectedTemplate);
  };

  const confirmRemoveTemplate = async () => {
    if (!areaId || !pendingDeleteTemplateName) {
      setPendingDeleteTemplateName(null);
      return;
    }
    const targetTemplateName = pendingDeleteTemplateName;
    setPendingDeleteTemplateName(null);
    try {
      await deleteFloorLayoutTemplate(areaId, targetTemplateName);
      const items = await listFloorLayoutTemplates(areaId);
      setTemplates(items);
      setTemplateName("Mặc định");
      setSelectedTemplate(null);
      setLayoutBlocks([]);
      await setLastSelectedFloorLayoutTemplate(areaId, null);
      notifications.show({
        color: "green",
        message: `Đã xóa template "${targetTemplateName}".`,
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

  useEffect(() => {
    if (!isEditMode || !selectedBlockId) {
      return;
    }
    const moveByKeyboard = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1;
      const moveX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const moveY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      if (moveX === 0 && moveY === 0) {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          setPendingDeleteBlockId(selectedBlockId);
        }
        return;
      }
      event.preventDefault();
      setLayoutBlocks((prev) =>
        prev.map((item) =>
          item.id === selectedBlockId
            ? {
                ...item,
                positionX: Math.max(0, Math.min(item.positionX + moveX, 900)),
                positionY: Math.max(0, Math.min(item.positionY + moveY, 500)),
              }
            : item
        )
      );
    };
    window.addEventListener("keydown", moveByKeyboard);
    return () => window.removeEventListener("keydown", moveByKeyboard);
  }, [isEditMode, selectedBlockId]);

  return (
    <Stack>
      <Group justify="space-between" align="end">
        <div>
          <PortalPageTitle>Sơ đồ nhà hàng</PortalPageTitle>
          <Text c="dimmed">
            Tối ưu theo workflow: chọn khu vực, quản lý template, thêm block tham chiếu, rồi kéo thả trực quan.
          </Text>
        </div>
        <Badge color={isEditMode ? "orange" : "green"} variant="light">
          Chế độ: {isEditMode ? "Chỉnh sửa" : "Xem"}
        </Badge>
      </Group>

      <PortalStickyPanel>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Select
              label="Khu vực"
              value={areaId}
              onChange={setActiveAreaId}
              data={availableAreas.map((area) => ({
                value: area.id,
                label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
              }))}
              searchable
            />
            <SegmentedControl
              value={isEditMode ? "edit" : "view"}
              onChange={(value) => {
                setIsEditMode(value === "edit");
                setDraggingBlockId(null);
              }}
              data={[
                { label: "Xem", value: "view" },
                { label: "Chỉnh sửa", value: "edit" },
              ]}
            />
            <Button component="label" variant="light">
              Tải ảnh mặt bằng
              <input type="file" hidden accept="image/*" onChange={handleUpload} />
            </Button>
            <Button variant="light" onClick={handleCreateNewTemplate}>
              Tạo template mới
            </Button>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
            <TextInput
              label="Tên template"
              value={templateName}
              onChange={(event) => setTemplateName(event.currentTarget.value)}
            />
            <Select
              label="Template đã lưu"
              value={selectedTemplate}
              onChange={setSelectedTemplate}
              data={templates.map((item) => ({
                value: item.name,
                label: `${item.name} (${dayjs(item.updatedAt).format("DD/MM HH:mm")})`,
              }))}
              searchable
            />
            <Button mt={{ base: 0, lg: 26 }} onClick={() => void handleSaveTemplate()}>
              Lưu template
            </Button>
            <Button mt={{ base: 0, lg: 26 }} variant="light" onClick={() => void handleApplyTemplate()}>
              Áp dụng template
            </Button>
            <Button mt={{ base: 0, lg: 26 }} color="red" variant="light" onClick={requestRemoveTemplate}>
              Xóa template
            </Button>
          </SimpleGrid>
        </Stack>
      </PortalStickyPanel>

      <PortalSectionCard>
        <Stack gap="md">
          <Group justify="space-between" align="end">
            <Text fw={600}>Quản lý block trong template</Text>
            <Text size="sm" c="dimmed">
              Tổng block: {layoutBlocks.length} - Đang hiển thị: {visibleBlocks.length}
            </Text>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Select
              label="Thêm block từ bàn tham chiếu"
              placeholder="Chọn bàn từ danh sách Quản lý bàn"
              value={newBlockTableId}
              onChange={setNewBlockTableId}
              data={referenceTables.map((table) => ({
                value: table.id,
                label: `${table.name} (${table.seats} ghế)`,
              }))}
              searchable
            />
            <Button mt={{ base: 0, lg: 26 }} onClick={handleAddBlock} disabled={!isEditMode}>
              Thêm block
            </Button>
            <Select
              label="Xóa block theo tên"
              placeholder="Chọn block"
              value={blockToRemoveId}
              onChange={setBlockToRemoveId}
              data={layoutBlocks.map((item) => ({ value: item.id, label: item.label }))}
              searchable
            />
            <Button mt={{ base: 0, lg: 26 }} color="red" variant="light" onClick={() => requestRemoveBlock()} disabled={!isEditMode}>
              Xóa block
            </Button>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            <TextInput
              label="Tìm block"
              value={blockSearch}
              onChange={(event) => setBlockSearch(event.currentTarget.value)}
              placeholder="Tên hiển thị block"
            />
            <Select
              label="Lọc trạng thái"
              value={blockStatusFilter}
              onChange={(value) => setBlockStatusFilter(value ?? "all")}
              data={[
                { value: "all", label: "Tất cả trạng thái" },
                ...(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => ({
                  value: status,
                  label: tableStatusLabel[status],
                })),
              ]}
            />
            <Select
              label="Sắp xếp"
              value={blockSortMode}
              onChange={(value) => setBlockSortMode(value ?? "name-asc")}
              data={[
                { value: "name-asc", label: "Tên A-Z" },
                { value: "name-desc", label: "Tên Z-A" },
                { value: "seats-asc", label: "Ghế tăng dần" },
                { value: "seats-desc", label: "Ghế giảm dần" },
              ]}
            />
          </SimpleGrid>
        </Stack>
      </PortalSectionCard>

      <PortalSectionCard>
        <Stack gap="sm">
          <Group justify="space-between" align="end">
            <Text fw={600}>Không gian bố trí trực quan</Text>
            <Text size="sm" c="dimmed">
              {isEditMode
                ? "Kéo block hoặc dùng phím mũi tên (Shift = bước lớn) để canh chỉnh."
                : "Bấm block để chỉnh nhanh thông tin."}
            </Text>
          </Group>

          {lastRemovedBlock && (
            <Group justify="space-between" className={classes.undoBanner}>
              <Text size="sm">Đã xóa block &quot;{lastRemovedBlock.label}&quot;.</Text>
              <Button size="compact-sm" variant="subtle" onClick={handleUndoRemoveBlock}>
                Hoàn tác
              </Button>
            </Group>
          )}

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
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
          </SimpleGrid>

          <Divider />

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
            {visibleBlocks.map((block) => (
              <div
                key={block.id}
                onMouseDown={() => isEditMode && setDraggingBlockId(block.id)}
                onTouchStart={() => isEditMode && setDraggingBlockId(block.id)}
                onClick={() => {
                  setSelectedBlockId(block.id);
                  if (!isEditMode) {
                    openBlockConfig(block);
                  }
                }}
                className={`${classes.tableCard} ${isEditMode ? classes.tableCardEdit : classes.tableCardView} ${
                  selectedBlockId === block.id ? classes.tableCardSelected : ""
                }`}
                style={
                  {
                    "--table-left": `${block.positionX}px`,
                    "--table-top": `${block.positionY}px`,
                  } as CSSProperties
                }
              >
                <Text fw={700} size="sm" lineClamp={1}>
                  {block.label}
                </Text>
                <Badge color={tableStatusColor[block.status]} size="xs" variant="light">
                  {tableStatusLabel[block.status]}
                </Badge>
              </div>
            ))}
          </div>
        </Stack>
      </PortalSectionCard>

      <PortalSectionCard>
        <Text fw={600} mb="sm">
          Danh sách block trong template hiện tại
        </Text>
        <DataTable
          minHeight={220}
          withTableBorder
          records={visibleBlocks}
          noRecordsText="Không có block nào phù hợp với bộ lọc."
          columns={[
            { accessor: "label", title: "Nhãn block" },
            { accessor: "seats", title: "Số ghế" },
            {
              accessor: "status",
              title: "Trạng thái",
              render: (row) => (
                <Badge color={tableStatusColor[row.status]} variant="light">
                  {tableStatusLabel[row.status]}
                </Badge>
              ),
            },
            {
              accessor: "referenceTableId",
              title: "Bàn tham chiếu",
              render: (row) =>
                referenceTables.find((table) => table.id === row.referenceTableId)?.name ?? "-",
            },
            {
              accessor: "actions",
              title: "Thao tác",
              render: (row) => (
                <Group gap={6}>
                  <Button size="compact-xs" variant="light" onClick={() => openBlockConfig(row)}>
                    Sửa
                  </Button>
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="light"
                    onClick={() => requestRemoveBlock(row.id)}
                    disabled={!isEditMode}
                  >
                    Xóa
                  </Button>
                </Group>
              ),
            },
          ]}
        />
      </PortalSectionCard>

      <Modal opened={Boolean(configuringBlockId)} onClose={closeBlockConfig} title="Cấu hình block" centered>
        <Stack>
          <TextInput
            label="Nhãn hiển thị"
            value={blockLabel}
            onChange={(event) => setBlockLabel(event.currentTarget.value)}
          />
          <NumberInput
            label="Số ghế"
            value={blockSeats}
            min={1}
            onChange={(value) => setBlockSeats(Number(value || 1))}
          />
          <Select
            label="Trạng thái"
            value={blockStatus}
            onChange={(value) => value && setBlockStatus(value as TableStatus)}
            data={(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => ({
              value: status,
              label: tableStatusLabel[status],
            }))}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={closeBlockConfig}>
              Hủy
            </Button>
            <Button onClick={handleSaveBlockConfig}>Lưu</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(pendingDeleteBlockId)}
        onClose={() => setPendingDeleteBlockId(null)}
        title="Xác nhận xóa block"
        centered
      >
        <Stack>
          <Text size="sm">Bạn có chắc muốn xóa block này khỏi template hiện tại?</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setPendingDeleteBlockId(null)}>
              Hủy
            </Button>
            <Button color="red" onClick={confirmRemoveBlock}>
              Xóa block
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(pendingDeleteTemplateName)}
        onClose={() => setPendingDeleteTemplateName(null)}
        title="Xác nhận xóa template"
        centered
      >
        <Stack>
          <Text size="sm">
            Bạn có chắc muốn xóa template &quot;{pendingDeleteTemplateName}&quot;? Hành động này chỉ xóa template bố trí.
          </Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setPendingDeleteTemplateName(null)}>
              Hủy
            </Button>
            <Button color="red" onClick={() => void confirmRemoveTemplate()}>
              Xóa template
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
