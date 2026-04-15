"use client";

import {
  Button,
  Card,
  Center,
  Container,
  Group,
  Image,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import { clearBranchPickRequired, isBranchPickRequired, shouldPickBranchOnLogin } from "@/lib/branch-pick";

export default function SelectBranchPage() {
  const { currentUser, state, setActiveBranchId } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    if (!shouldPickBranchOnLogin(currentUser.role)) {
      router.replace("/dashboard");
      return;
    }
    if (!isBranchPickRequired()) {
      router.replace("/dashboard");
      return;
    }
  }, [currentUser, router]);

  const branches =
    currentUser?.branchIds
      .map((id) => state.branches.find((b) => b.id === id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b)) ?? [];

  const handleSelect = (id: string) => {
    setActiveBranchId(id);
    clearBranchPickRequired();
    router.replace("/dashboard");
  };

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
                Chọn chi nhánh bạn muốn thao tác sau khi đăng nhập. Bạn có thể đổi chi nhánh trên
                thanh công cụ bất cứ lúc nào.
              </Text>
            </Stack>
            {branches.length === 0 ? (
              <Text ta="center" c="dimmed" size="sm">
                Chưa có chi nhánh được gán cho tài khoản. Liên hệ quản trị viên.
              </Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {branches.map((branch) => (
                  <Card key={branch.id} withBorder shadow="sm" radius="md" padding="lg">
                    <Stack gap="sm">
                      <Title order={4}>{branch.name}</Title>
                      <Group gap={6} align="flex-start" wrap="nowrap">
                        <MapPin size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                        <Text size="sm" c="dimmed">
                          {branch.address}
                        </Text>
                      </Group>
                      <Button fullWidth onClick={() => handleSelect(branch.id)}>
                        Làm việc tại đây
                      </Button>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            )}
          </Stack>
        </Container>
      </Center>
    </RouteGuard>
  );
}
