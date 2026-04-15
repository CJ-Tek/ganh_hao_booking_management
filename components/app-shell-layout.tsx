"use client";

import dayjs from "dayjs";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  Image,
  NavLink,
  Popover,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  SquareMenu,
  Users,
  UserCog,
  BookOpenText,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { useAppContext } from "@/contexts/app-context";
import classes from "./app-shell-layout.module.css";

type NavItem = { label: string; href: string; icon: React.ReactNode; adminOnly?: boolean };

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={16} /> },
  { label: "Sơ đồ nhà hàng", href: "/floor-map", icon: <Map size={16} /> },
  { label: "Booking", href: "/bookings", icon: <BookOpenText size={16} /> },
  { label: "Lịch đặt bàn", href: "/calendar", icon: <CalendarDays size={16} /> },
  { label: "Quản lý bàn", href: "/tables", icon: <SquareMenu size={16} /> },
  { label: "Khách hàng", href: "/customers", icon: <Users size={16} /> },
  { label: "Khu vực & bàn", href: "/settings/areas-tables", icon: <Settings size={16} /> },
  {
    label: "Thông tin chi nhánh",
    href: "/settings/branches",
    icon: <Building2 size={16} />,
    adminOnly: true,
  },
  {
    label: "User management",
    href: "/settings/users",
    icon: <UserCog size={16} />,
    adminOnly: true,
  },
];

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    state,
    filteredBranchIds,
    setActiveBranchId,
    logout,
    markNotificationRead,
    hasSupabase,
  } = useAppContext();

  /** All branches this account may switch to (header); data scope uses `filteredBranchIds` only. */
  const branchSwitcherOptions = useMemo(
    () =>
      state.branches.filter((branch) =>
        currentUser ? currentUser.branchIds.includes(branch.id) : false
      ),
    [state.branches, currentUser]
  );

  const scopedNotifications = useMemo(
    () =>
      state.notifications.filter(
        (item) => !item.branchId || filteredBranchIds.includes(item.branchId)
      ),
    [filteredBranchIds, state.notifications]
  );
  const unreadNotifications = useMemo(
    () => scopedNotifications.filter((item) => !item.isRead),
    [scopedNotifications]
  );
  const shownNavItems = useMemo(() => {
    const base =
      currentUser?.role === "admin" || currentUser?.role === "general_manager"
        ? navItems
        : navItems.filter((item) => !item.adminOnly);
    if (currentUser?.role === "manager" && currentUser.branchIds.length > 1) {
      return [
        ...base,
        {
          label: "Chọn chi nhánh",
          href: "/select-branch",
          icon: <Building2 size={16} />,
        },
      ];
    }
    return base;
  }, [currentUser?.branchIds.length, currentUser?.role]);

  const portalLabel =
    currentUser?.role === "manager" ? "Cổng quản lý chi nhánh" : "Cổng quản lý tổng";

  return (
    <AppShell
      header={{ height: { base: 72, sm: 64 } }}
      navbar={{ width: 290, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding={{ base: "sm", sm: "md" }}
    >
      <AppShell.Header px={{ base: "sm", sm: "md" }}>
        <Group justify="space-between" h="100%" wrap="nowrap" className={classes.headerRoot}>
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
            <Image src="/logo/horizontal.png" alt="Logo Gành Hào" h={34} w="auto" />
            <Stack gap={0} className={classes.brandCopy}>
              <Title order={5}>Hệ thống quản lý đặt bàn</Title>
              <Text size="xs" c="dimmed">
                {portalLabel}
              </Text>
            </Stack>
          </Group>

          <Group gap="xs" wrap="nowrap">
            {currentUser?.role !== "manager" && (
              <Select
                size="xs"
                className={classes.branchSelect}
                value={state.activeBranchId}
                onChange={(value) => value && setActiveBranchId(value)}
                data={branchSwitcherOptions.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
              />
            )}
            <Popover width={340} position="bottom-end" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon variant="light" size="lg">
                  <Bell size={18} />
                  {unreadNotifications.length > 0 && (
                    <Badge size="xs" circle color="red" className={classes.notificationBadge}>
                      {unreadNotifications.length}
                    </Badge>
                  )}
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>Thông báo nội bộ</Text>
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    onClick={() => router.push("/notifications")}
                  >
                    Xem tất cả
                  </Button>
                </Group>
                <ScrollArea h={220}>
                  <Stack gap="xs">
                    {scopedNotifications.slice(0, 5).map((item) => (
                      <Box
                        key={item.id}
                        p="xs"
                        className={classes.notificationItem}
                        onClick={() => markNotificationRead(item.id)}
                      >
                        <Group justify="space-between" align="start">
                          <Text fw={600} size="sm">
                            {item.title}
                          </Text>
                          {!item.isRead && <Badge size="xs">Mới</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {item.message}
                        </Text>
                        <Text size="xs" c="dimmed" mt={4}>
                          {dayjs(item.createdAt).format("HH:mm DD/MM")}
                        </Text>
                      </Box>
                    ))}
                  </Stack>
                </ScrollArea>
              </Popover.Dropdown>
            </Popover>

            <Group gap="xs" wrap="nowrap" visibleFrom="md">
              <Avatar color="brand" radius="xl">
                {currentUser?.fullName[0] ?? "U"}
              </Avatar>
              <Stack gap={0}>
                <Text size="sm" fw={600}>
                  {currentUser?.fullName}
                </Text>
                <Text size="xs" c="dimmed">
                  {currentUser?.username}
                </Text>
              </Stack>
              {!hasSupabase && (
                <Badge color="red" variant="light">
                  Chưa kết nối DB
                </Badge>
              )}
              <ActionIcon
                variant="light"
                color="red"
                aria-label="Đăng xuất"
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
              >
                <LogOut size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="md">
          <Text fw={700} size="sm">
            Điều hướng
          </Text>
          <Stack gap={6}>
            {shownNavItems.map((item) => (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                label={item.label}
                leftSection={item.icon}
                active={pathname.startsWith(item.href)}
                onClick={close}
              />
            ))}
          </Stack>

          <Stack
            gap="sm"
            hiddenFrom="md"
            pt="lg"
            pb="max(var(--mantine-spacing-xl), calc(env(safe-area-inset-bottom, 0px) + var(--mantine-spacing-md)))"
          >
            <Divider />
            <Group wrap="nowrap" align="flex-start">
              <Avatar color="brand" radius="xl" size="md">
                {currentUser?.fullName[0] ?? "U"}
              </Avatar>
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {currentUser?.fullName}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {currentUser?.username}
                </Text>
              </Stack>
            </Group>
            {!hasSupabase && (
              <Badge color="red" variant="light" w="fit-content">
                Chưa kết nối DB
              </Badge>
            )}
            <Button
              fullWidth
              variant="light"
              color="red"
              leftSection={<LogOut size={16} />}
              onClick={() => {
                close();
                logout();
                router.replace("/login");
              }}
            >
              Đăng xuất
            </Button>
          </Stack>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
