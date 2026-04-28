"use client";

import {
  Alert,
  Button,
  Card,
  Center,
  Container,
  Group,
  Image,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppContext } from "@/contexts/app-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAppContext();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (user.role === "admin" || user.role === "general_manager") {
      router.replace("/select-branch");
    } else {
      router.replace("/dashboard");
    }
  };

  return (
    <Center mih="100dvh" bg="linear-gradient(180deg, #f4f8fd 0%, #eaf2fb 100%)">
      <Container w={420}>
        <Card shadow="lg" radius="lg" p="xl" withBorder>
          <Stack gap="md">
            <Center>
              <Image src="/logo/vertical.png" alt="Gành Hào" w={170} />
            </Center>
            <Title order={3} ta="center">
              Đăng nhập quản trị
            </Title>
            <Text c="dimmed" size="sm" ta="center">
              Hỗ trợ 2 cổng: Quản lý tổng và Quản lý chi nhánh
            </Text>

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
