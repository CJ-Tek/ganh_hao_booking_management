"use client";

import { Box, Grid, Group, Stack, Text, TextInput } from "@mantine/core";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppUserRoleBadge } from "@/components/settings/app-user-role-badge";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { getGuideModulesForRole, resolveGuideModuleId } from "@/lib/guide/get-modules-for-role";
import { searchGuideModules } from "@/lib/guide/search-guide-modules";
import type { GuideModuleId } from "@/lib/guide/types";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { GuideModuleNav, GuideModuleNavHint } from "./guide-module-nav";
import { GuideModulePanel } from "./guide-module-panel";
import { GuideSearchResultButtons } from "./guide-search-results";
import classes from "./guide-page.module.css";

export function GuidePage() {
  const { currentUser } = useAppContext();
  const isCompact = usePortalCompact();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const role = currentUser?.role ?? "employee";

  const modules = useMemo(() => getGuideModulesForRole(role), [role]);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredModules = useMemo(
    () => searchGuideModules(modules, searchQuery),
    [modules, searchQuery]
  );

  const requestedModule = searchParams.get("module");
  const resolvedId = resolveGuideModuleId(filteredModules, requestedModule);
  const [activeId, setActiveId] = useState<GuideModuleId>(resolvedId);

  const activeModule = useMemo(
    () => filteredModules.find((module) => module.id === activeId) ?? filteredModules[0],
    [filteredModules, activeId]
  );

  const selectModule = useCallback(
    (id: GuideModuleId) => {
      setActiveId(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("module", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    setActiveId(resolvedId);
  }, [resolvedId]);

  useEffect(() => {
    if (filteredModules.length === 0) {
      return;
    }
    if (!filteredModules.some((module) => module.id === activeId)) {
      selectModule(filteredModules[0].id);
    }
  }, [filteredModules, activeId, selectModule]);

  if (!currentUser) {
    return null;
  }

  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <PortalPageTitle order={isCompact ? 3 : 2}>
          Hướng dẫn sử dụng
        </PortalPageTitle>
        <Group gap={6} align="center" wrap="wrap">
          <Text size="sm" c="dimmed">
            Xin chào, <strong>{currentUser.fullName}</strong>. Dưới đây là hướng dẫn dành cho
          </Text>
          <AppUserRoleBadge role={currentUser.role} />
          <Text size="sm" c="dimmed">
            .
          </Text>
        </Group>
        <GuideModuleNavHint moduleCount={modules.length} />
        <TextInput
          placeholder="Tìm chủ đề, ví dụ: đặt bàn, check-in, đổi mật khẩu…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          leftSection={<Search size={16} />}
          aria-label="Tìm chủ đề hướng dẫn"
        />
        {isCompact ? (
          <GuideSearchResultButtons
            modules={filteredModules}
            activeId={activeId}
            onSelect={selectModule}
            query={searchQuery}
          />
        ) : null}
      </Stack>

      {isCompact ? (
        <Stack gap="md">
          {!searchQuery.trim() ? (
            <PortalSectionCard p="md">
              <GuideModuleNav
                modules={modules}
                activeId={activeId}
                onSelect={selectModule}
                compact
              />
            </PortalSectionCard>
          ) : null}
          {activeModule ? <GuideModulePanel module={activeModule} /> : null}
        </Stack>
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 4 }} className={classes.sidebarCol}>
            <PortalSectionCard p={0} className={classes.sidebarSticky}>
              <Box className={classes.sidebarScroll} tabIndex={0} aria-label="Danh sách chủ đề hướng dẫn">
                <GuideModuleNav
                  modules={filteredModules}
                  activeId={activeId}
                  onSelect={selectModule}
                  compact={false}
                />
              </Box>
            </PortalSectionCard>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }} className={classes.contentCol}>
            {activeModule ? (
              <GuideModulePanel module={activeModule} scrollable />
            ) : (
              <PortalSectionCard p="lg">
                <Text size="sm" c="dimmed" ta="center">
                  Không tìm thấy chủ đề phù hợp. Thử từ khóa khác.
                </Text>
              </PortalSectionCard>
            )}
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
