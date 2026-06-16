"use client";

import { Button, Drawer, Text } from "@mantine/core";
import type { ReactNode } from "react";
import bookingDetailClasses from "@/components/booking-management/booking-order-detail-modal.module.css";
import { AppUserRoleBadge } from "@/components/settings/app-user-role-badge";
import {
  APP_USER_ROLE_COLOR,
  appUserBranchNames,
  appUserDisplayName,
  formatAppUserAuditAt,
  formatAppUserPassword,
} from "@/lib/app-user-display";
import { PORTAL_MODAL_DETAIL_Z_INDEX } from "@/lib/portal-z-index";
import type { AppUser } from "@/lib/types";

function CompactDetailRow(props: { label: string; value: ReactNode }) {
  return (
    <div className={bookingDetailClasses.detailRow}>
      <span className={bookingDetailClasses.detailLabel}>{props.label}</span>
      <div className={bookingDetailClasses.detailValue}>{props.value}</div>
    </div>
  );
}

export function AppUserDetailDrawer(props: {
  user: AppUser | null;
  users: readonly Pick<AppUser, "id" | "fullName">[];
  branches: readonly { id: string; name: string }[];
  opened: boolean;
  onClose: () => void;
  disableActions?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { user, users, branches, opened, onClose, disableActions, onEdit, onDelete } = props;

  const branchText = user ? appUserBranchNames(user, branches) : "";
  const branchCount = user?.branchIds.length ?? 0;

  return (
    <Drawer
      opened={opened && user != null}
      onClose={onClose}
      title={user?.fullName ?? "Tài khoản"}
      position="bottom"
      size="auto"
      zIndex={PORTAL_MODAL_DETAIL_Z_INDEX}
      transitionProps={{ transition: "slide-up" }}
      classNames={{
        content: bookingDetailClasses.drawerContent,
        body: bookingDetailClasses.drawerBody,
        header: bookingDetailClasses.drawerHeader,
        title: bookingDetailClasses.drawerTitle,
      }}
    >
      {user ? (
      <div className={bookingDetailClasses.sheet}>
        <div className={bookingDetailClasses.handle} aria-hidden />

        <div
          className={bookingDetailClasses.hero}
          style={{ borderLeftColor: `var(--mantine-color-${APP_USER_ROLE_COLOR[user.role]}-6)` }}
        >
          <div className={bookingDetailClasses.heroTop}>
            <div style={{ minWidth: 0 }}>
              <Text className={bookingDetailClasses.heroTime} fw={800} size="xl">
                @{user.username}
              </Text>
              <Text className={bookingDetailClasses.heroDate} size="sm" c="dimmed">
                {branchCount > 0 ? `${branchCount} chi nhánh quản lý` : "Chưa gán chi nhánh"}
              </Text>
            </div>
            <AppUserRoleBadge role={user.role} variant="filled" size="lg" />
          </div>

          <div className={bookingDetailClasses.factGrid}>
            <div className={bookingDetailClasses.factCell}>
              <span className={bookingDetailClasses.factLabel}>Mật khẩu</span>
              <span className={bookingDetailClasses.factValue}>
                {formatAppUserPassword(user.password)}
              </span>
            </div>
            <div className={bookingDetailClasses.factCell}>
              <span className={bookingDetailClasses.factLabel}>Chi nhánh</span>
              <span className={bookingDetailClasses.factValue}>
                {branchCount > 0 ? `${branchCount} khu` : "—"}
              </span>
            </div>
            <div className={bookingDetailClasses.factCell}>
              <span className={bookingDetailClasses.factLabel}>Tài khoản</span>
              <span className={bookingDetailClasses.factValue}>{user.username}</span>
            </div>
          </div>
        </div>

        <div className={bookingDetailClasses.detailsCard}>
          <CompactDetailRow
            label="Chi nhánh quản lý"
            value={
              branchText ? (
                <Text size="sm">{branchText}</Text>
              ) : (
                <Text size="sm" c="dimmed">
                  —
                </Text>
              )
            }
          />
          <CompactDetailRow
            label="Tạo bởi"
            value={<Text size="sm">{appUserDisplayName(user.createdByUserId, users)}</Text>}
          />
          <CompactDetailRow
            label="Lúc tạo"
            value={<Text size="sm">{formatAppUserAuditAt(user.createdAt)}</Text>}
          />
          <CompactDetailRow
            label="Cập nhật bởi"
            value={<Text size="sm">{appUserDisplayName(user.updatedByUserId, users)}</Text>}
          />
          <CompactDetailRow
            label="Lúc cập nhật"
            value={<Text size="sm">{formatAppUserAuditAt(user.updatedAt)}</Text>}
          />
        </div>

        <div className={bookingDetailClasses.actions}>
          <div className="booking-row-actions-drawer">
            <div className="booking-row-actions-drawer-utilities">
              <Button
                size="sm"
                variant="default"
                disabled={disableActions}
                onClick={onEdit}
              >
                Sửa tài khoản
              </Button>
              <Button
                size="sm"
                variant="filled"
                color="red"
                disabled={disableActions}
                onClick={onDelete}
              >
                Xóa tài khoản
              </Button>
            </div>
          </div>
        </div>
      </div>
      ) : null}
    </Drawer>
  );
}
