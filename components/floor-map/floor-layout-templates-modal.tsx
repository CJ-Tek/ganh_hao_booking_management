"use client";

import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { LayoutTemplate, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import type { FloorLayoutSnapshot } from "@/lib/floor-layout-snapshot";
import type { FloorLayoutTemplate } from "@/lib/supabase-store";

type FloorLayoutTemplatesModalProps = {
  opened: boolean;
  onClose: () => void;
  areaId: string | null;
  layoutDateLabel: string;
  layoutDate: string;
  hasDayOverride: boolean;
  currentSnapshot: FloorLayoutSnapshot;
  listTemplates: (areaId: string) => Promise<FloorLayoutTemplate[]>;
  createTemplate: (
    areaId: string,
    name: string,
    snapshot: FloorLayoutSnapshot
  ) => Promise<FloorLayoutTemplate>;
  deleteTemplate: (templateId: string) => Promise<void>;
  applyTemplate: (
    templateId: string,
    areaId: string,
    layoutDate: string
  ) => Promise<unknown>;
  onClearDayLayout?: () => Promise<void>;
  onApplied: () => void;
};

export function FloorLayoutTemplatesModal({
  opened,
  onClose,
  areaId,
  layoutDateLabel,
  layoutDate,
  hasDayOverride,
  currentSnapshot,
  listTemplates,
  createTemplate,
  deleteTemplate,
  applyTemplate,
  onClearDayLayout,
  onApplied,
}: FloorLayoutTemplatesModalProps) {
  const [templates, setTemplates] = useState<FloorLayoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [clearingDayLayout, setClearingDayLayout] = useState(false);

  const refresh = useCallback(async () => {
    if (!areaId) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listTemplates(areaId);
      setTemplates(rows);
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không tải được mẫu sơ đồ.",
      });
    } finally {
      setLoading(false);
    }
  }, [areaId, listTemplates]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    void refresh();
  }, [opened, refresh]);

  const handleSaveTemplate = async () => {
    if (!areaId) {
      return;
    }
    setSaving(true);
    try {
      await createTemplate(areaId, newName, currentSnapshot);
      setNewName("");
      notifications.show({ color: "green", message: "Đã lưu mẫu sơ đồ." });
      await refresh();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không lưu được mẫu.",
      });
    } finally {
      setSaving(false);
    }
  };

  const runApply = async (templateId: string) => {
    if (!areaId) {
      return;
    }
    setApplyingId(templateId);
    try {
      await applyTemplate(templateId, areaId, layoutDate);
      notifications.show({
        color: "green",
        message: `Đã áp dụng mẫu cho ngày ${layoutDateLabel}.`,
      });
      onApplied();
      onClose();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không áp dụng được mẫu.",
      });
    } finally {
      setApplyingId(null);
    }
  };

  const handleApply = (template: FloorLayoutTemplate) => {
    if (!areaId) {
      return;
    }
    if (hasDayOverride) {
      modals.openConfirmModal({
        title: "Ghi đè sơ đồ riêng của ngày?",
        children: (
          <Text size="sm">
            Ngày {layoutDateLabel} đã có sơ đồ riêng. Áp dụng mẫu &quot;{template.name}&quot; sẽ
            thay thế bố cục hiện tại của ngày này.
          </Text>
        ),
        labels: { confirm: "Áp dụng", cancel: "Hủy" },
        confirmProps: { color: "orange" },
        onConfirm: () => void runApply(template.id),
      });
      return;
    }
    void runApply(template.id);
  };

  const handleClearDayLayout = () => {
    if (!onClearDayLayout || !hasDayOverride) {
      return;
    }
    modals.openConfirmModal({
      title: "Xóa sơ đồ riêng?",
      children: (
        <Text size="sm">
          Xóa sơ đồ riêng cho ngày {layoutDateLabel} và dùng lại sơ đồ mặc định chung? Các mẫu đã
          lưu không bị xóa.
        </Text>
      ),
      labels: { confirm: "Xóa sơ đồ riêng", cancel: "Hủy" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void (async () => {
          setClearingDayLayout(true);
          try {
            await onClearDayLayout();
            onApplied();
          } catch {
            /* Parent shows error notification. */
          } finally {
            setClearingDayLayout(false);
          }
        })();
      },
    });
  };

  const handleDelete = (template: FloorLayoutTemplate) => {
    modals.openConfirmModal({
      title: "Xóa mẫu sơ đồ?",
      children: (
        <Text size="sm">
          Xóa mẫu &quot;{template.name}&quot;? Các ngày đã áp dụng mẫu này không bị đổi.
        </Text>
      ),
      labels: { confirm: "Xóa", cancel: "Hủy" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void (async () => {
          try {
            await deleteTemplate(template.id);
            notifications.show({ color: "green", message: "Đã xóa mẫu sơ đồ." });
            await refresh();
          } catch (error) {
            notifications.show({
              color: "red",
              message: error instanceof Error ? error.message : "Không xóa được mẫu.",
            });
          }
        })();
      },
    });
  };

  return (
    <PortalStandardModal
      opened={opened}
      onClose={onClose}
      title="Mẫu sơ đồ"
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Lưu bố cục hiện (ngày {layoutDateLabel}) thành mẫu, áp dụng hoặc xóa mẫu, và quản lý sơ
          đồ riêng của ngày đang xem.
        </Text>

        {hasDayOverride && onClearDayLayout ? (
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Sơ đồ riêng của ngày
            </Text>
            <Text size="sm" c="dimmed">
              Ngày {layoutDateLabel} đang dùng bố cục khác sơ đồ mặc định chung.
            </Text>
            <Button
              variant="subtle"
              color="gray"
              loading={clearingDayLayout}
              disabled={!areaId}
              onClick={handleClearDayLayout}
            >
              Xóa sơ đồ riêng
            </Button>
          </Stack>
        ) : null}

        <Stack gap="xs">
          <TextInput
            label="Tên mẫu mới"
            placeholder="Ví dụ: Cuối tuần — sảnh trong"
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
          />
          <Button
            leftSection={<LayoutTemplate size={16} />}
            loading={saving}
            disabled={!areaId || !newName.trim()}
            onClick={() => void handleSaveTemplate()}
          >
            Lưu bố cục hiện làm mẫu
          </Button>
        </Stack>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Mẫu đã lưu
          </Text>
          {loading ? (
            <Text size="sm" c="dimmed">
              Đang tải…
            </Text>
          ) : templates.length === 0 ? (
            <Text size="sm" c="dimmed">
              Chưa có mẫu nào cho khu vực này.
            </Text>
          ) : (
            templates.map((template) => (
              <Group key={template.id} justify="space-between" wrap="nowrap" align="center">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {template.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {template.snapshot.tablePositions.length} bàn · lưới{" "}
                    {template.snapshot.floorGridColumns}×{template.snapshot.floorGridRows}
                  </Text>
                </div>
                <Group gap="xs" wrap="nowrap">
                  <Button
                    size="xs"
                    variant="light"
                    loading={applyingId === template.id}
                    onClick={() => handleApply(template)}
                  >
                    Áp dụng
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    aria-label={`Xóa mẫu ${template.name}`}
                    onClick={() => handleDelete(template)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </Group>
              </Group>
            ))
          )}
        </Stack>
      </Stack>
    </PortalStandardModal>
  );
}
