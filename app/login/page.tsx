"use client";

import {
  Alert,
  Button,
  Card,
  Center,
  Container,
  Image,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/app-context";

function resolvePostLoginPath(role: string): string {
  if (role === "admin" || role === "general_manager") {
    return "/select-branch";
  }
  return "/bookings";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, currentUser, isLoading } = useAppContext();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || !currentUser) {
      return;
    }
    router.replace(resolvePostLoginPath(currentUser.role));
  }, [currentUser, isLoading, router]);

  const handleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    const user = await login(username.trim(), password);
    if (!user) {
      setError("Sai thông tin đăng nhập. Vui lòng thử lại.");
      setIsSubmitting(false);
      return;
    }
    try {
      router.replace(resolvePostLoginPath(user.role));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || currentUser) {
    return (
      <Center mih="100dvh">
        <Stack align="center" gap="sm">
          <Loader />
          <Text size="sm" c="dimmed">
            Đang khôi phục phiên đăng nhập...
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Center
      mih="100dvh"
      bg="linear-gradient(180deg, #f4f8fd 0%, #eaf2fb 100%)"
      px="md"
      py="max(var(--mantine-spacing-md), env(safe-area-inset-top, 0px))"
      pb="max(var(--mantine-spacing-md), env(safe-area-inset-bottom, 0px))"
    >
      <Container w={420} maw="100%">
        <Card shadow="lg" radius="lg" p="xl" withBorder>
          <Stack gap="md">
            <Center>
              <Image src="/logo/vertical.png" alt="Gành Hào" w={170} />
            </Center>
            <Title order={3} ta="center">
              Đăng nhập
            </Title>

            {error && (
              <Alert color="red" icon={<AlertCircle size={16} />}>
                {error}
              </Alert>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleLogin();
              }}
            >
              <Stack gap="sm">
                <TextInput
                  label="Tên đăng nhập"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.currentTarget.value)}
                  placeholder="Nhập tên đăng nhập…"
                />
                <PasswordInput
                  label="Mật khẩu"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder="Nhập mật khẩu…"
                />
                <Button type="submit" fullWidth loading={isSubmitting}>
                  Đăng nhập
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>
      </Container>
    </Center>
  );
}
