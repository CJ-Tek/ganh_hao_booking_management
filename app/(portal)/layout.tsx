import { AppShellLayout } from "@/components/app-shell-layout";
import { RouteGuard } from "@/components/route-guard";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <AppShellLayout>{children}</AppShellLayout>
    </RouteGuard>
  );
}
