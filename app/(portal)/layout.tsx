import { AppShellLayout } from "@/components/app-shell-layout";
import { BranchPickGate } from "@/components/branch-pick-gate";
import { EmployeePortalRedirect } from "@/components/employee-portal-redirect";
import { RouteGuard } from "@/components/route-guard";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <BranchPickGate>
        <EmployeePortalRedirect>
          <AppShellLayout>{children}</AppShellLayout>
        </EmployeePortalRedirect>
      </BranchPickGate>
    </RouteGuard>
  );
}
