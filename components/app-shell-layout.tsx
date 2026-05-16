"use client";

import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Image,
  NavLink,
  Paper,
  Popover,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
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
import { formatNotificationTime } from "@/lib/format-notification-time";
import { usePortalCompact } from "@/lib/use-portal-compact";
import classes from "./app-shell-layout.module.css";

type NavItem = { label: string; href: string; icon: React.ReactNode; adminOnly?: boolean };

const MANAGER_SECTION_HREFS = ["/bookings", "/floor-map", "/customers"] as const;
const MANAGER_DOCK_HREFS = MANAGER_SECTION_HREFS;

const managerDockShortLabel: Record<(typeof MANAGER_DOCK_HREFS)[number], string> = {
  "/bookings": "Đặt bàn",
  "/floor-map": "Sơ đồ",
  "/customers": "Khách hàng",
};

const navItems: NavItem[] = [
  { label: "Tổng quan", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
  { label: "Sơ đồ", href: "/floor-map", icon: <Map size={20} /> },
  { label: "Đặt bàn", href: "/bookings", icon: <BookOpenText size={20} /> },
  { label: "Lịch đặt bàn", href: "/calendar", icon: <CalendarDays size={20} /> },
  { label: "Quản lý bàn", href: "/tables", icon: <SquareMenu size={20} /> },
  { label: "Khách hàng", href: "/customers", icon: <Users size={20} /> },
  { label: "Khu vực & bàn", href: "/settings/areas-tables", icon: <Settings size={20} /> },
  {
    label: "Cấu hình Booking hôm nay",
    href: "/settings/booking-rules",
    icon: <SlidersHorizontal size={20} />,
    adminOnly: true,
  },
  {
    label: "Thông tin chi nhánh",
    href: "/settings/branches",
    icon: <Building2 size={20} />,
    adminOnly: true,
  },
  {
    label: "Quản lý người dùng",
    href: "/settings/users",
    icon: <UserCog size={20} />,
    adminOnly: true,
  },
];

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const [desktopNavExpanded, { toggle: toggleDesktopNav }] = useDisclosure(true);
  const [managerMoreOpen, { open: openManagerMore, close: closeManagerMore }] = useDisclosure(false);
  const pathname = usePathname();
  const router = useRouter();
  const isCompact = usePortalCompact();
  const {
    currentUser,
    state,
    filteredBranchIds,
    setActiveBranchId,
    logout,
    markNotificationRead,
    markAllScopedNotificationsRead,
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

  const popoverPreviewCount = 8;
  const previewNotifications = useMemo(
    () =>
      [...scopedNotifications].sort((a, b) => {
        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [scopedNotifications]
  );
  const shownNavItems = useMemo(() => {
    if (currentUser?.role === "employee") {
      return navItems.filter((item) => item.href === "/floor-map");
    }
    if (currentUser?.role === "manager") {
      return navItems.filter((item) =>
        (MANAGER_SECTION_HREFS as readonly string[]).includes(item.href)
      );
    }
    const base =
      currentUser?.role === "admin" || currentUser?.role === "general_manager"
        ? navItems
        : navItems.filter((item) => !item.adminOnly);
    return base;
  }, [currentUser]);

  /** Bottom quick nav on narrow viewports (sync with `usePortalCompact` / navbar `breakpoint: "md"`).
   *  Enabled for branch managers, employees, general_manager, and admin. */
  const usesMobileDock =
    currentUser?.role === "manager" ||
    currentUser?.role === "employee" ||
    currentUser?.role === "general_manager" ||
    currentUser?.role === "admin";

  const dockHrefSet = useMemo(() => new Set<string>(MANAGER_DOCK_HREFS), []);

  const managerDockItems = useMemo(() => {
    if (!usesMobileDock) {
      return [];
    }
    return MANAGER_DOCK_HREFS.map((href) => shownNavItems.find((item) => item.href === href)).filter(
      (item): item is NavItem => Boolean(item)
    );
  }, [usesMobileDock, shownNavItems]);

  const managerMoreNavItems = useMemo(() => {
    if (!usesMobileDock) {
      return [];
    }
    return shownNavItems.filter((item) => !dockHrefSet.has(item.href));
  }, [usesMobileDock, dockHrefSet, shownNavItems]);

  // Avoid overlap: when mobile drawer is open, hide fixed bottom dock.
  const showManagerDock = usesMobileDock && isCompact && !opened;
  const portalLabel =
    currentUser?.role === "manager"
      ? "Cổng quản lý chi nhánh"
      : currentUser?.role === "employee"
        ? "Cổng nhân viên"
        : "Cổng quản lý tổng";

  return (
    <AppShell
      header={{ height: { base: 84, sm: 76 } }}
      navbar={{
        width: 320,
        breakpoint: "md",
        collapsed: { mobile: !opened, desktop: !desktopNavExpanded },
      }}
      padding={{ base: "sm", sm: "md" }}
    >
      <AppShell.Header
        px={{ base: "sm", sm: "md" }}
        style={{
          background: "var(--mantine-color-brand-filled)",
          color: "white",
        }}
      >
        <Stack justify="center" h="100%" gap={0}>
          <Group justify="space-between" wrap="nowrap" className={classes.headerRoot}>
            <Group gap="sm" wrap="nowrap">
              <Burger
                opened={opened}
                onClick={toggle}
                hiddenFrom="md"
                size="sm"
                color="white"
                aria-label="Mở hoặc đóng điều hướng"
              />
              <Burger
                opened={desktopNavExpanded}
                onClick={toggleDesktopNav}
                visibleFrom="md"
                size="sm"
                color="white"
                aria-label="Ẩn hoặc hiện thanh điều hướng"
              />
              <Image src="/logo/horizontal.png" alt="Logo Gành Hào" h={34} w="auto" />
              <Stack gap={0} className={classes.brandCopy}>
                <Group gap={6} wrap="nowrap">
                  <Title order={4} c="white">
                    Hệ thống quản lý đặt bàn
                  </Title>
                </Group>
                <Text size="xs" c="rgba(255,255,255,0.85)">
                  {portalLabel}
                </Text>
              </Stack>
            </Group>

            <Group gap="xs" wrap="nowrap">
              {currentUser?.role !== "manager" && currentUser?.role !== "employee" && (
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
              {currentUser?.role !== "employee" ? (
              <Popover width={380} position="bottom-end" withArrow shadow="md">
                <Popover.Target>
                  <Box className={classes.notificationBellWrap}>
                    <ActionIcon
                      variant="transparent"
                      color="white"
                      size="lg"
                      radius="md"
                      aria-label="Thông báo nội bộ"
                    >
                      <Bell size={20} strokeWidth={1.75} />
                    </ActionIcon>
                    {unreadNotifications.length > 0 ? (
                      <Badge
                        size="xs"
                        circle
                        variant="filled"
                        color="red"
                        className={classes.notificationBadge}
                      >
                        {unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}
                      </Badge>
                    ) : null}
                  </Box>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                <Stack gap="xs" mb="sm">
                  <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fw={700} size="sm" lh={1.3}>
                        Thông báo
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {unreadNotifications.length === 0
                          ? "Đã đọc hết trong phạm vi chi nhánh"
                          : `${unreadNotifications.length} chưa đọc`}
                      </Text>
                    </Stack>
                    <Button
                      variant="light"
                      size="compact-xs"
                      onClick={() => router.push("/notifications")}
                    >
                      Xem tất cả
                    </Button>
                  </Group>
                </Stack>

                <ScrollArea h={scopedNotifications.length === 0 ? 80 : 280} type="auto">
                  {scopedNotifications.length === 0 ? (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      Chưa có thông báo.
                    </Text>
                  ) : (
                    <Stack gap={6}>
                      {previewNotifications.slice(0, popoverPreviewCount).map((item) => {
                        const branch = item.branchId
                          ? state.branches.find((b) => b.id === item.branchId)
                          : null;
                        return (
                          <Box
                            key={item.id}
                            p="sm"
                            className={`${classes.notificationItem}${item.isRead ? "" : ` ${classes.notificationItemUnread}`}`}
                            onClick={() => void markNotificationRead(item.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                void markNotificationRead(item.id);
                              }
                            }}
                          >
                            <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                              <Text fw={600} size="sm" lineClamp={2} style={{ flex: 1, minWidth: 0 }}>
                                {item.title}
                              </Text>
                              {!item.isRead ? (
                                <Badge size="xs" variant="dot" color="brand" style={{ flexShrink: 0 }}>
                                  Mới
                                </Badge>
                              ) : null}
                            </Group>
                            <Text size="xs" c="dimmed" mt={6} lineClamp={3}>
                              {item.message}
                            </Text>
                            <Group justify="space-between" gap="xs" mt={8} wrap="nowrap">
                              <Text size="xs" c="dimmed">
                                {formatNotificationTime(item.createdAt)}
                              </Text>
                              {branch ? (
                                <Text size="xs" c="dimmed" lineClamp={1} maw={140} ta="right">
                                  {branch.name}
                                </Text>
                              ) : null}
                            </Group>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </ScrollArea>

                {scopedNotifications.length > popoverPreviewCount ? (
                  <Text size="xs" c="dimmed" ta="center" mt="xs">
                    +{scopedNotifications.length - popoverPreviewCount} thông báo khác trong danh sách
                  </Text>
                ) : null}

                {unreadNotifications.length > 0 ? (
                  <>
                    <Divider my="sm" />
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      fullWidth
                      onClick={() => void markAllScopedNotificationsRead()}
                    >
                      Đánh dấu tất cả đã đọc
                    </Button>
                  </>
                ) : null}
                </Popover.Dropdown>
              </Popover>
              ) : null}

              <Group gap="xs" wrap="nowrap" visibleFrom="md">
                <Avatar
                  radius="xl"
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.28)",
                  }}
                >
                  {currentUser?.fullName[0] ?? "U"}
                </Avatar>
                <Stack gap={0}>
                  <Text size="sm" fw={600} c="white">
                    {currentUser?.fullName}
                  </Text>
                  <Text size="xs" c="rgba(255,255,255,0.82)">
                    {currentUser?.username}
                  </Text>
                </Stack>
                {!hasSupabase && (
                  <Badge color="red" variant="light">
                    Chưa kết nối DB
                  </Badge>
                )}
                <ActionIcon
                  variant="filled"
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
        </Stack>
      </AppShell.Header>

      <AppShell.Navbar
        p="lg"
        style={{
          background: "var(--mantine-color-brand-filled)",
          borderRightColor: "rgba(255,255,255,0.2)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <Stack gap="lg">
          <Text fw={700} size="md" c="white">
            Điều hướng
          </Text>
          <Stack gap="sm">
            {shownNavItems.map((item) => (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                className={classes.blueNavLink}
                label={item.label}
                leftSection={item.icon}
                active={pathname.startsWith(item.href)}
                onClick={close}
                style={{
                  borderRadius: 12,
                  minHeight: 62,
                  paddingInline: 12,
                  fontSize: "1rem",
                  fontWeight: 700,
                }}
              />
            ))}
            {currentUser?.role === "employee" && currentUser.branchIds.length > 1 ? (
              <NavLink
                component={Link}
                href="/select-branch"
                className={classes.blueNavLink}
                label="Chọn chi nhánh"
                leftSection={<MapPin size={20} />}
                active={pathname.startsWith("/select-branch")}
                onClick={close}
                style={{
                  borderRadius: 12,
                  minHeight: 62,
                  paddingInline: 12,
                  fontSize: "1rem",
                  fontWeight: 700,
                }}
              />
            ) : null}
          </Stack>

          <Stack
            gap="sm"
            hiddenFrom="md"
            pt="lg"
            pb="max(var(--mantine-spacing-xl), calc(env(safe-area-inset-bottom, 0px) + var(--mantine-spacing-md)))"
          >
            <Divider color="rgba(255,255,255,0.25)" />
            <Group wrap="nowrap" align="flex-start">
              <Avatar color="brand" radius="xl" size="md">
                {currentUser?.fullName[0] ?? "U"}
              </Avatar>
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2} c="white">
                  {currentUser?.fullName}
                </Text>
                <Text size="xs" c="rgba(255,255,255,0.82)" lineClamp={1}>
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
              variant="white"
              color="dark"
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

      <AppShell.Main
        pb={
          showManagerDock
            ? "calc(66px + env(safe-area-inset-bottom, 0px))"
            : undefined
        }
      >
        {children}
      </AppShell.Main>

      {showManagerDock ? (
        <>
          <Paper
            component="nav"
            withBorder
            radius={0}
            px="xs"
            pt={8}
            pb="max(8px, env(safe-area-inset-bottom, 0px))"
            aria-label="Truy cập nhanh"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 200,
              background: "var(--mantine-color-brand-filled)",
              borderTopColor: "rgba(255,255,255,0.25)",
            }}
          >
            <Group justify="space-between" gap={4} wrap="nowrap" grow>
              {managerDockItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const shortLabel =
                  managerDockShortLabel[item.href as (typeof MANAGER_DOCK_HREFS)[number]] ??
                  item.label;
                return (
                  <UnstyledButton
                    key={item.href}
                    component={Link}
                    href={item.href}
                    onClick={() => {
                      close();
                      closeManagerMore();
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderRadius: 10,
                      minHeight: 52,
                      padding: "8px 4px",
                      background: active ? "rgba(255,255,255,0.2)" : undefined,
                      color: "white",
                    }}
                  >
                    <Stack gap={2} align="center">
                      <Box
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transform: "scale(1.1)",
                          opacity: active ? 1 : 0.85,
                        }}
                      >
                        {item.icon}
                      </Box>
                      <Text
                        size="12px"
                        fw={active ? 700 : 600}
                        c="white"
                        ta="center"
                        lineClamp={2}
                        lh={1.2}
                      >
                        {shortLabel}
                      </Text>
                    </Stack>
                  </UnstyledButton>
                );
              })}
              {managerMoreNavItems.length > 0 ? (
                <UnstyledButton
                  type="button"
                  onClick={() => {
                    openManagerMore();
                    close();
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 10,
                    minHeight: 52,
                    padding: "8px 4px",
                    color: "white",
                  }}
                >
                  <Stack gap={2} align="center">
                    <MoreHorizontal size={20} strokeWidth={2} />
                    <Text
                      size="12px"
                      fw={600}
                      c="white"
                      ta="center"
                      lineClamp={1}
                    >
                      Thêm
                    </Text>
                  </Stack>
                </UnstyledButton>
              ) : null}
            </Group>
          </Paper>

          <Drawer
            opened={managerMoreOpen}
            onClose={closeManagerMore}
            position="bottom"
            size="auto"
            title="Truy cập nhanh"
            padding="md"
            radius="md"
          >
            <Stack gap="xs">
              {managerMoreNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  component={Link}
                  href={item.href}
                  label={item.label}
                  leftSection={item.icon}
                  active={pathname.startsWith(item.href)}
                  onClick={() => closeManagerMore()}
                />
              ))}
              <NavLink
                component={Link}
                href="/notifications"
                label="Thông báo"
                leftSection={<Bell size={16} />}
                active={pathname.startsWith("/notifications")}
                onClick={() => closeManagerMore()}
              />
            </Stack>
          </Drawer>
        </>
      ) : null}
    </AppShell>
  );
}
