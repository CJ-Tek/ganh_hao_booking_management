"use client";

import { Text } from "@mantine/core";
import { openPortalConfirmModal } from "@/lib/portal-confirm-modal";
import { isManagerViewOnlyBranch } from "@/lib/manager-branch-access";
import type { AppUser } from "@/lib/types";

type BranchConfirmInput = {
  user: AppUser | null | undefined;
  targetBranchId: string;
  targetBranchName: string;
  currentBranchId: string | undefined;
};

/** Header dropdown: switching active branch while already in the portal. */
export async function confirmBranchSwitch(input: BranchConfirmInput): Promise<boolean> {
  const { user, targetBranchId, targetBranchName, currentBranchId } = input;
  if (currentBranchId === targetBranchId) {
    return false;
  }

  const viewOnly = isManagerViewOnlyBranch(user, targetBranchId);

  return openPortalConfirmModal({
    title: "Chuyển chi nhánh",
    message: (
      <>
        <Text size="sm">
          Chuyển sang chi nhánh <strong>{targetBranchName}</strong>? Dữ liệu trên các trang sẽ theo
          chi nhánh mới.
        </Text>
        {viewOnly ? (
          <Text size="sm" mt="xs" c="orange">
            Bạn chỉ được xem, không thể chỉnh sửa.
          </Text>
        ) : null}
      </>
    ),
    confirmLabel: "Chuyển",
    cancelLabel: "Hủy",
  });
}

/** Select-branch page: confirming choice before entering the portal. */
export async function confirmBranchPick(input: BranchConfirmInput): Promise<boolean> {
  const { user, targetBranchId, targetBranchName } = input;
  const viewOnly = isManagerViewOnlyBranch(user, targetBranchId);

  if (viewOnly) {
    return openPortalConfirmModal({
      title: "Xem chi nhánh",
      message: (
        <Text size="sm">
          Mở chi nhánh <strong>{targetBranchName}</strong> ở chế độ chỉ xem? Bạn không thể tạo hay
          chỉnh sửa dữ liệu tại chi nhánh này.
        </Text>
      ),
      confirmLabel: "Xem chi nhánh",
      cancelLabel: "Quay lại",
    });
  }

  return openPortalConfirmModal({
    title: "Chọn chi nhánh làm việc",
    message: (
      <Text size="sm">
        Bắt đầu làm việc tại chi nhánh <strong>{targetBranchName}</strong>?
      </Text>
    ),
    confirmLabel: "Tiếp tục",
    cancelLabel: "Quay lại",
  });
}
