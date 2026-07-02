"use client";

import {
  Bell,
  BookOpenText,
  Building2,
  CalendarDays,
  CircleUser,
  GitBranch,
  LayoutDashboard,
  LayoutPanelLeft,
  Lightbulb,
  LogIn,
  Map,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareMenu,
  UserCircle,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { GuideIconName } from "@/lib/guide/types";

const GUIDE_ICONS: Record<GuideIconName, LucideIcon> = {
  Sparkles,
  UserCircle,
  LogIn,
  LayoutPanelLeft,
  LayoutDashboard,
  Map,
  BookOpenText,
  CalendarDays,
  SquareMenu,
  Users,
  Bell,
  Settings,
  SlidersHorizontal,
  Building2,
  UserCog,
  CircleUser,
  GitBranch,
  Lightbulb,
};

export function GuideModuleIcon({ name, size = 20 }: { name: GuideIconName; size?: number }) {
  const Icon = GUIDE_ICONS[name];
  return <Icon size={size} aria-hidden />;
}
