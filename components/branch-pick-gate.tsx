"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/app-context";
import { isBranchPickRequired, shouldPickBranchOnLogin } from "@/lib/branch-pick";

/** Redirects Admin / Quản lý tổng to the branch intro flow when required (portal routes only). */
export function BranchPickGate({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    if (!shouldPickBranchOnLogin(currentUser.role)) {
      return;
    }
    if (!isBranchPickRequired()) {
      return;
    }
    router.replace("/select-branch");
  }, [currentUser, router]);

  return <>{children}</>;
}
