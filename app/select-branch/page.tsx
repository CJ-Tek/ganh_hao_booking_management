"use client";

import {
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Image,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import { confirmBranchPick } from "@/lib/confirm-branch-switch";
import {
  clearBranchPickRequired,
  isBranchPickRequired,
  shouldPickBranchOnLogin,
} from "@/lib/branch-pick";
import { getBranchSwitcherBranches } from "@/lib/manager-branch-access";

export default function SelectBranchPage() {
  const { currentUser, state, setActiveBranchId } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    if (shouldPickBranchOnLogin(currentUser.role)) {
      if (!isBranchPickRequired()) {
        router.replace("/dashboard");
      }
      return;
    }
    if (currentUser.role === "employee" && currentUser.branchIds.length <= 1) {
      router.replace("/bookings");
      return;
    }
    if (currentUser.role === "manager") {
      const switcherBranches = getBranchSwitcherBranches(currentUser, state.branches);
      if (switcherBranches.length <= 1) {
        router.replace("/bookings");
      }
      return;
    }
  }, [currentUser, router, state.branches]);

  const branches = useMemo(
    () => getBranchSwitcherBranches(currentUser, state.branches),
    [currentUser, state.branches]
  );

  const handleSelect = async (id: string) => {
    const branch = branches.find((item) => item.id === id);
    const confirmed = await confirmBranchPick({
      user: currentUser,
      targetBranchId: id,
      targetBranchName: branch?.name ?? id,
      currentBranchId: state.activeBranchId,
    });
    if (!confirmed) {
      return;
    }

    setActiveBranchId(id);
    if (currentUser && shouldPickBranchOnLogin(currentUser.role)) {
      clearBranchPickRequired();
    }
    router.replace(
      currentUser?.role === "employee"
        ? "/bookings"
        : currentUser?.role === "manager"
          ? "/bookings"
          : "/dashboard"
    );
  };

  const isAssignedBranch = (branchId: string) =>
    currentUser?.branchIds.includes(branchId) ?? false;

  return (
    <RouteGuard>
      <Center mih="100dvh" bg="linear-gradient(180deg, #f4f8fd 0%, #eaf2fb 100%)">
        <Container size="md" py="xl">
          <Stack gap="xl">
            <Center>
              <Image src="/logo/vertical.png" alt="Gành Hào" w={140} />
            </Center>
            <Stack gap="xs" ta="center">
              <Title order={2}>Chọn chi nhánh làm việc</Title>
              <Text c="dimmed" size="sm">
                {currentUser?.role === "manager"
                  ? "Chọn chi nhánh để làm việc hoặc xem. Đổi nhanh bằng menu trên thanh công cụ."
                  : "Chọn chi nhánh bạn muốn thao tác. Quản lý tổng đổi nhanh trên thanh công cụ."}
              </Text>
            </Stack>
            {branches.length === 0 ? (
              <Text ta="center" c="dimmed" size="sm">
                Chưa có chi nhánh. Liên hệ quản trị viên.
              </Text>
            ) : (
              <Stack gap="md">
                {branches.map((branch) => {
                  const assigned = isAssignedBranch(branch.id);
                  return (
                    <Card key={branch.id} withBorder shadow="sm" radius="md" padding="lg">
                      <Stack gap="sm">
                        <Group justify="space-between" wrap="nowrap">
                          <Title order={4}>{branch.name}</Title>
                          {currentUser?.role === "manager" && !assigned ? (
                            <Badge color="orange" variant="light">
                              Chỉ xem
                            </Badge>
                          ) : null}
                        </Group>
                        <Group gap={6} align="flex-start" wrap="nowrap">
                          <MapPin size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                          <Text size="sm" c="dimmed">
                            {branch.address}
                          </Text>
                        </Group>
                        <Button fullWidth onClick={() => void handleSelect(branch.id)}>
                          {currentUser?.role === "manager" && !assigned
                            ? "Xem chi nhánh"
                            : "Làm việc tại đây"}
                        </Button>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Container>
      </Center>
    </RouteGuard>
  );
}
