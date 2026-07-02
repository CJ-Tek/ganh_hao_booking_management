import type { Role } from "@/lib/types";

export type GuideModuleId =
  | "start"
  | "your-role"
  | "login-branch"
  | "interface"
  | "dashboard"
  | "floor-map"
  | "bookings"
  | "calendar"
  | "tables"
  | "customers"
  | "notifications"
  | "areas"
  | "booking-rules"
  | "branches"
  | "users"
  | "account"
  | "workflows"
  | "tips";

export type GuideIconName =
  | "Sparkles"
  | "UserCircle"
  | "LogIn"
  | "LayoutPanelLeft"
  | "LayoutDashboard"
  | "Map"
  | "BookOpenText"
  | "CalendarDays"
  | "SquareMenu"
  | "Users"
  | "Bell"
  | "Settings"
  | "SlidersHorizontal"
  | "Building2"
  | "UserCog"
  | "CircleUser"
  | "GitBranch"
  | "Lightbulb";

export type GuideStep = {
  title: string;
  body: string;
};

export type GuideModuleMeta = {
  id: GuideModuleId;
  title: string;
  summary: string;
  icon: GuideIconName;
  roles: Role[];
  readMinutes: number;
  screenshot?: string;
  screenshotCaption?: string;
};

export type GuideModuleContent = {
  intro: string;
  steps: GuideStep[];
  tips: string[];
};

export type GuideModule = GuideModuleMeta & GuideModuleContent;
