import { Button, Center, Stack, Text, Title } from "@mantine/core";

export default function NotFound() {
  return (
    <Center h="100vh">
      <Stack align="center">
        <Title order={1}>404</Title>
        <Text c="dimmed">Không tìm thấy trang bạn yêu cầu.</Text>
        <Button component="a" href="/dashboard">
          Quay về dashboard
        </Button>
      </Stack>
    </Center>
  );
}
