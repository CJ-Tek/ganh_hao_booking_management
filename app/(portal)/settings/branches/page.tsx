"use client";

import { Alert, Button, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import { Branch } from "@/lib/types";

function BranchEditor({
  branch,
  onSave,
}: {
  branch: Branch;
  onSave: (id: string, input: { name: string; address: string }) => Promise<void>;
}) {
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(branch.name);
    setAddress(branch.address);
  }, [branch.id, branch.name, branch.address]);

  return (
    <PortalSectionCard>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Mã: {branch.id}
        </Text>
        <TextInput
          label="Tên chi nhánh"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TextInput
          label="Địa chỉ"
          value={address}
          onChange={(e) => setAddress(e.currentTarget.value)}
        />
        <Button
          fullWidth
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(branch.id, {
                name: name.trim(),
                address: address.trim(),
              });
            } finally {
              setSaving(false);
            }
          }}
          mt="xs"
        >
          Lưu thông tin chi nhánh
        </Button>
      </Stack>
    </PortalSectionCard>
  );
}

export default function BranchSettingsPage() {
  const { state, updateBranch, filteredBranchIds } = useAppContext();

  const activeBranchId = filteredBranchIds[0];
  const activeBranch = activeBranchId
    ? state.branches.find((b) => b.id === activeBranchId)
    : undefined;

  const handleSave = async (id: string, input: { name: string; address: string }) => {
    if (!input.name) {
      notifications.show({ color: "red", message: "Vui lòng nhập tên chi nhánh." });
      return;
    }
    const result = await updateBranch(id, input);
    notifications.show({
      color: result.ok ? "green" : "red",
      message: result.message,
    });
  };

  return (
    <RouteGuard allowedRoles={["admin", "general_manager"]}>
      <Stack gap="md">
        <PortalPageTitle>Thông tin chi nhánh</PortalPageTitle>
        <Text size="sm" c="dimmed">
          Chỉnh sửa tên và địa chỉ (metadata) của chi nhánh đang chọn. Để sửa chi nhánh khác, hãy đổi
          chi nhánh trên thanh công cụ phía trên.
        </Text>
        {!activeBranch ? (
          <Alert color="yellow" title="Chưa chọn chi nhánh">
            Vui lòng chọn chi nhánh trên thanh công cụ để chỉnh sửa thông tin.
          </Alert>
        ) : (
          <BranchEditor branch={activeBranch} onSave={handleSave} />
        )}
      </Stack>
    </RouteGuard>
  );
}
