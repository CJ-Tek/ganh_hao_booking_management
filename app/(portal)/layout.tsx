import { AppShellLayout } from "@/components/app-shell-layout";
import { BranchPickGate } from "@/components/branch-pick-gate";
import { RouteGuard } from "@/components/route-guard";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <BranchPickGate>
        <AppShellLayout>{children}</AppShellLayout>
      </BranchPickGate>
    </RouteGuard>
  );
}
