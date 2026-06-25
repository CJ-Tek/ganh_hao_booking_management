"use client";

import { Alert, Anchor } from "@mantine/core";
import { Eye } from "lucide-react";
import { useMemo } from "react";
import { useAppContext } from "@/contexts/app-context";

export function ViewOnlyBranchBanner() {
  const { state, currentUser, canEditActiveBranch, setActiveBranchId } = useAppContext();

  const assignedBranch = useMemo(() => {
    if (!currentUser) {
      return undefined;
    }
    const assignedId = currentUser.branchIds.find((id) =>
      state.branches.some((branch) => branch.id === id)
    );
    return assignedId != null
      ? state.branches.find((branch) => branch.id === assignedId)
      : undefined;
  }, [currentUser, state.branches]);

  if (canEditActiveBranch) {
    return null;
  }

  const branchName =
    state.activeBranchId != null
      ? state.branches.find((branch) => branch.id === state.activeBranchId)?.name
      : undefined;

  return (
    <Alert
      color="orange"
      variant="light"
      icon={<Eye size={18} />}
      mb="sm"
      title="Chế độ chỉ xem"
    >
      Đang xem <strong>{branchName ?? "chi nhánh này"}</strong> (chỉ xem).
      {assignedBranch ? (
        <>
          {" "}
          <Anchor
            component="button"
            type="button"
            size="sm"
            fw={600}
            onClick={() => setActiveBranchId(assignedBranch.id)}
          >
            Quay về {assignedBranch.name}
          </Anchor>{" "}
          để thao tác.
        </>
      ) : (
        " Chuyển về chi nhánh của bạn để thao tác."
      )}
    </Alert>
  );
}
