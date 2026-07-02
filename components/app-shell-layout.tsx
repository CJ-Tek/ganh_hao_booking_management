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
import { useBusyId } from "@/lib/use-busy-id";
import { MANAGER_DOCK_RESERVE_CSS } from "@/lib/portal-layout";
import { MANAGER_DOCK_Z_INDEX } from "@/lib/portal-z-index";
import type { CSSProperties } from "react";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  SquareMenu,
  Users,
  UserCog,
  UserCircle,
  BookOpenText,
  Building2,
  CircleHelp,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { CreateBookingModal } from "@/components/booking-management/create-booking-modal";
import { ViewOnlyBranchBanner } from "@/components/view-only-branch-banner";
import { confirmBranchSwitch } from "@/lib/confirm-branch-switch";
import { getBranchSwitcherBranches } from "@/lib/manager-branch-access";
import { useAppContext } from "@/contexts/app-context";
import { buildFloorMapHref } from "@/lib/floor-map-routes";
import { formatNotificationTime } from "@/lib/format-notification-time";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";
import classes from "./app-shell-layout.module.css";

type NavItem = { label: string; href: string; icon: React.ReactNode; adminOnly?: boolean };

const MANAGER_SECTION_HREFS = ["/dashboard", "/calendar", "/floor-map", "/bookings", "/customers"] as const;
const MANAGER_DOCK_HREFS = ["/calendar", "/floor-map", "/bookings"] as const;

const managerDockShortLabel: Record<(typeof MANAGER_DOCK_HREFS)[number], string> = {
  "/calendar": "Lịch đặt bàn",
  "/floor-map": "Sơ đồ",
  "/bookings": "Đặt bàn",
};

const navItems: NavItem[] = [
  { label: "Tổng quan", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
  { label: "Sơ đồ", href: "/floor-map", icon: <Map size={20} /> },
  { label: "Đặt bàn", href: "/bookings", icon: <BookOpenText size={20} /> },
  { label: "Lịch đặt bàn", href: "/calendar", icon: <CalendarDays size={20} /> },
  { label: "Quản lý bàn", href: "/tables", icon: <SquareMenu size={20} /> },
  { label: "Khách hàng", href: "/customers", icon: <Users size={20} /> },
  { label: "Hướng dẫn", href: "/guide", icon: <CircleHelp size={20} /> },
  { label: "Khu vực", href: "/settings/areas-tables", icon: <Settings size={20} /> },
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
  const [createBookingModalOpened, setCreateBookingModalOpened] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isCompact = usePortalCompact();
  const {
    currentUser,
    state,
    filteredBranchIds,
    setActiveBranchId,
    reload,
    logout,
    markNotificationRead,
    markAllScopedNotificationsRead,
    hasSupabase,
    canEditActiveBranch,
  } = useAppContext();

  /** All branches this account may switch to (header); data scope uses `filteredBranchIds` only. */
  const branchSwitcherOptions = useMemo(
    () => getBranchSwitcherBranches(currentUser, state.branches),
    [state.branches, currentUser]
  );

  const handleBranchSwitch = async (value: string | null) => {
    if (!value || value === state.activeBranchId) {
      return;
    }
    const branch = branchSwitcherOptions.find((item) => item.id === value);
    const confirmed = await confirmBranchSwitch({
      user: currentUser,
      targetBranchId: value,
      targetBranchName: branch?.name ?? value,
      currentBranchId: state.activeBranchId,
    });
    if (confirmed) {
      setActiveBranchId(value);
    }
  };

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
  const { isBusy: isNotificationBusy, run: runNotificationAction } = useBusyId();
  const [isMarkingAllNotifications, setIsMarkingAllNotifications] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    if (isManualRefreshing) {
      return;
    }
    setIsManualRefreshing(true);
    try {
      await reload({ forceMaintenance: true });
    } finally {
      setIsManualRefreshing(false);
    }
  };

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
    const guideItem = navItems.find((item) => item.href === "/guide");
    if (currentUser?.role === "employee") {
      return navItems.filter((item) => item.href === "/bookings" || item.href === "/guide");
    }
    if (currentUser?.role === "manager") {
      const managerItems = MANAGER_SECTION_HREFS.map((href) =>
        navItems.find((item) => item.href === href)
      ).filter((item): item is NavItem => Boolean(item));
      return guideItem ? [...managerItems, guideItem] : managerItems;
    }
    const base =
      currentUser?.role === "admin" || currentUser?.role === "general_manager"
        ? navItems
        : navItems.filter((item) => !item.adminOnly);
    return base;
  }, [currentUser]);

  /** Bottom quick nav on narrow viewports (sync with `usePortalCompact` / navbar `breakpoint: "md"`).
   *  Enabled for branch managers, general_manager, and admin — not employees (single Đặt bàn page). */
  const usesMobileDock =
    currentUser?.role === "manager" ||
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

  const dockLeftCount = Math.ceil(managerDockItems.length / 2);
  const leftManagerDockItems = managerDockItems.slice(0, dockLeftCount);
  const rightManagerDockItems = managerDockItems.slice(dockLeftCount);

  const openCreateBookingFromDock = () => {
    closeManagerMore();
    setCreateBookingModalOpened(true);
  };

  const focusExistingBookingFromDock = (booking: Booking) => {
    const params = new URLSearchParams({
      tab: "list",
      focusBooking: booking.id,
    });
    router.push(`/bookings?${params.toString()}`);
  };

  const viewCreatedBookingInFloorMapFromDock = (payload: {
    bookingId: string;
    bookingAt: string;
  }) => {
    router.push(
      buildFloorMapHref(dayjs(payload.bookingAt), { focusBookingId: payload.bookingId })
    );
  };

  const renderManagerDockLink = (item: NavItem) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const shortLabel =
      managerDockShortLabel[item.href as (typeof MANAGER_DOCK_HREFS)[number]] ?? item.label;
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
          <Text size="12px" fw={active ? 700 : 600} c="white" ta="center" lineClamp={2} lh={1.2}>
            {shortLabel}
          </Text>
        </Stack>
      </UnstyledButton>
    );
  };

  // Avoid overlap: when mobile drawer is open, hide fixed bottom dock.
  const showManagerDock = usesMobileDock && isCompact && !opened;
  const portalLabel =
    currentUser?.role === "manager"
      ? "Cổng quản lý chi nhánh"
      : currentUser?.role === "employee"
        ? "Cổng nhân viên"
        : "Cổng quản lý tổng";

  return (
    <>
      <a href="#portal-main-content" className="portal-skip-link">
        Bỏ qua đến nội dung
      </a>
    <AppShell
      header={{ height: { base: 72, sm: 76 } }}
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
              {currentUser?.role !== "employee" && branchSwitcherOptions.length > 1 ? (
                <Select
                  size="xs"
                  className={classes.branchSelect}
                  value={state.activeBranchId}
                  onChange={(value) => void handleBranchSwitch(value)}
                  data={branchSwitcherOptions.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  }))}
                />
              ) : null}
              <ActionIcon
                variant="transparent"
                color="white"
                size="lg"
                radius="md"
                aria-label="Làm mới dữ liệu ngay"
                title="Làm mới dữ liệu ngay"
                loading={isManualRefreshing}
                onClick={() => {
                  void handleManualRefresh();
                }}
              >
                <RefreshCw size={20} strokeWidth={1.75} />
              </ActionIcon>
              {currentUser?.role !== "employee" ? (
              isCompact ? (
                <Box className={classes.notificationBellWrap}>
                  <ActionIcon
                    variant="transparent"
                    color="white"
                    size="lg"
                    radius="md"
                    aria-label="Thông báo nội bộ"
                    onClick={() => router.push("/notifications")}
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
              ) : (
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
                      variant="filled"
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
                            style={
                              isNotificationBusy(item.id)
                                ? { opacity: 0.65, pointerEvents: "none" }
                                : undefined
                            }
                            onClick={() => {
                              if (item.isRead || isNotificationBusy(item.id)) {
                                return;
                              }
                              void runNotificationAction(item.id, () =>
                                markNotificationRead(item.id)
                              );
                            }}
                            role="button"
                            tabIndex={item.isRead || isNotificationBusy(item.id) ? -1 : 0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                if (item.isRead || isNotificationBusy(item.id)) {
                                  return;
                                }
                                void runNotificationAction(item.id, () =>
                                  markNotificationRead(item.id)
                                );
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
                      loading={isMarkingAllNotifications}
                      disabled={isMarkingAllNotifications}
                      onClick={() => {
                        setIsMarkingAllNotifications(true);
                        void markAllScopedNotificationsRead().finally(() =>
                          setIsMarkingAllNotifications(false)
                        );
                      }}
                    >
                      Đánh dấu tất cả đã đọc
                    </Button>
                  </>
                ) : null}
                </Popover.Dropdown>
              </Popover>
              )
              ) : null}

              <Group gap="xs" wrap="nowrap" visibleFrom="md">
                <UnstyledButton
                  component={Link}
                  href="/settings/account"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Group gap="xs" wrap="nowrap">
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
                  </Group>
                </UnstyledButton>
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
            <NavLink
              component={Link}
              href="/settings/account"
              className={classes.blueNavLink}
              label="Tài khoản của tôi"
              leftSection={<UserCircle size={20} />}
              active={pathname.startsWith("/settings/account")}
              onClick={close}
              style={{
                borderRadius: 12,
                minHeight: 62,
                paddingInline: 12,
                fontSize: "1rem",
                fontWeight: 700,
              }}
            />
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
            <UnstyledButton
              component={Link}
              href="/settings/account"
              onClick={close}
              style={{ color: "inherit", width: "100%" }}
            >
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
            </UnstyledButton>
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
        id="portal-main-content"
        tabIndex={-1}
        pb={showManagerDock ? MANAGER_DOCK_RESERVE_CSS : undefined}
        style={
          showManagerDock
            ? ({
                ["--manager-dock-reserve" as string]: MANAGER_DOCK_RESERVE_CSS,
              } as CSSProperties)
            : undefined
        }
      >
        <ViewOnlyBranchBanner />
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
            className={classes.managerDockRoot}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: MANAGER_DOCK_Z_INDEX,
              background: "var(--mantine-color-brand-filled)",
              borderTopColor: "rgba(255,255,255,0.25)",
            }}
          >
            <UnstyledButton
              type="button"
              aria-label="Tạo booking"
              title="Tạo booking"
              className={classes.managerDockCreateButton}
              onClick={openCreateBookingFromDock}
              style={canEditActiveBranch ? undefined : { display: "none" }}
            >
              <Plus size={28} strokeWidth={2.5} aria-hidden />
            </UnstyledButton>
            <Group justify="space-between" gap={4} wrap="nowrap" grow>
              {leftManagerDockItems.map(renderManagerDockLink)}
              <Box className={classes.managerDockCenterSpacer} aria-hidden />
              {rightManagerDockItems.map(renderManagerDockLink)}
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

          <CreateBookingModal
            opened={createBookingModalOpened}
            onClose={() => setCreateBookingModalOpened(false)}
            onFocusExistingBooking={focusExistingBookingFromDock}
            onViewCreatedBookingInFloorMap={viewCreatedBookingInFloorMapFromDock}
          />

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
    </>
  );
}
