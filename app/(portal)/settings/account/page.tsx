"use client";

import {
  Alert,
  Button,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Pencil } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import bookingDetailClasses from "@/components/booking-management/booking-order-detail-modal.module.css";
import { AppUserRoleBadge } from "@/components/settings/app-user-role-badge";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import {
  APP_USER_ROLE_COLOR,
  appUserBranchNames,
  formatAppUserAuditAt,
} from "@/lib/app-user-display";
import { usePortalCompact } from "@/lib/use-portal-compact";

function CompactDetailRow(props: { label: string; value: ReactNode }) {
  return (
    <div className={bookingDetailClasses.detailRow}>
      <span className={bookingDetailClasses.detailLabel}>{props.label}</span>
      <div className={bookingDetailClasses.detailValue}>{props.value}</div>
    </div>
  );
}

export default function AccountSettingsPage() {
  const { currentUser, state, updateOwnProfile, hasSupabase } = useAppContext();
  const isCompact = usePortalCompact();

  const [isEditing, setIsEditing] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const profileUser = useMemo(
    () => (currentUser ? state.users.find((user) => user.id === currentUser.id) ?? currentUser : null),
    [currentUser, state.users]
  );

  const resetEditForm = () => {
    setFullName(profileUser?.fullName ?? "");
    setChangePassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  useEffect(() => {
    if (!profileUser || isEditing) {
      return;
    }
    setFullName(profileUser.fullName);
  }, [profileUser, isEditing]);

  const branchLabel = useMemo(() => {
    if (!profileUser) {
      return "";
    }
    return appUserBranchNames(profileUser, state.branches);
  }, [profileUser, state.branches]);

  const branchCount = profileUser?.branchIds.length ?? 0;

  const handleStartEdit = () => {
    resetEditForm();
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    resetEditForm();
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      notifications.show({ color: "red", message: "Vui lòng nhập họ tên." });
      return;
    }
    if (!currentPassword) {
      notifications.show({ color: "red", message: "Vui lòng nhập mật khẩu hiện tại để xác nhận." });
      return;
    }
    if (changePassword) {
      if (!newPassword.trim()) {
        notifications.show({ color: "red", message: "Vui lòng nhập mật khẩu mới." });
        return;
      }
      if (newPassword !== confirmPassword) {
        notifications.show({ color: "red", message: "Mật khẩu mới và xác nhận không khớp." });
        return;
      }
    }

    setSaving(true);
    try {
      const result = await updateOwnProfile({
        currentPassword,
        fullName: fullName.trim(),
        newPassword: changePassword ? newPassword.trim() : undefined,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setIsEditing(false);
        resetEditForm();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <RouteGuard>
      <Stack gap="md">
        <PortalPageTitle>Tài khoản của tôi</PortalPageTitle>

        {!hasSupabase ? (
          <Alert color="red" title="Chưa kết nối cơ sở dữ liệu">
            Không thể cập nhật thông tin tài khoản khi chưa kết nối Supabase.
          </Alert>
        ) : null}

        <PortalSectionCard padding={0}>
          {profileUser ? (
            <div className={bookingDetailClasses.sheet}>
              <div
                className={bookingDetailClasses.hero}
                style={{
                  borderLeftColor: `var(--mantine-color-${APP_USER_ROLE_COLOR[profileUser.role]}-6)`,
                  margin: "var(--mantine-spacing-md)",
                  marginBottom: 0,
                }}
              >
                <div className={bookingDetailClasses.heroTop}>
                  <div style={{ minWidth: 0 }}>
                    <Text className={bookingDetailClasses.heroTime} fw={800} size="xl">
                      {profileUser.fullName}
                    </Text>
                    <Text className={bookingDetailClasses.heroDate} size="sm" c="dimmed">
                      @{profileUser.username}
                    </Text>
                  </div>
                  <AppUserRoleBadge role={profileUser.role} variant="filled" size="lg" />
                </div>

                <div
                  className={bookingDetailClasses.factGrid}
                  style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
                >
                  <div className={bookingDetailClasses.factCell}>
                    <span className={bookingDetailClasses.factLabel}>Tên đăng nhập</span>
                    <span className={bookingDetailClasses.factValue}>{profileUser.username}</span>
                  </div>
                  <div className={bookingDetailClasses.factCell}>
                    <span className={bookingDetailClasses.factLabel}>Chi nhánh</span>
                    <span className={bookingDetailClasses.factValue}>
                      {branchCount > 0 ? `${branchCount} khu` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {isEditing ? (
                <div
                  style={{
                    paddingInline: "var(--mantine-spacing-md)",
                  }}
                >
                  <div className={bookingDetailClasses.noteBox}>
                    <Stack gap="sm">
                      <TextInputWithVoice
                        label="Họ tên"
                        value={fullName}
                        onChange={(event) => setFullName(event.currentTarget.value)}
                        disabled={saving || !hasSupabase}
                        size={isCompact ? "md" : "sm"}
                      />

                      <PasswordInput
                        label="Mật khẩu hiện tại"
                        description="Bắt buộc khi lưu thay đổi"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                        disabled={saving || !hasSupabase}
                        size={isCompact ? "md" : "sm"}
                      />

                      <Button
                        type="button"
                        size={isCompact ? "md" : "sm"}
                        variant={changePassword ? "filled" : "default"}
                        disabled={saving || !hasSupabase}
                        w={{ base: "100%", sm: "fit-content" }}
                        onClick={() => {
                          setChangePassword((prev) => {
                            if (prev) {
                              setNewPassword("");
                              setConfirmPassword("");
                            }
                            return !prev;
                          });
                        }}
                      >
                        Đổi mật khẩu
                      </Button>

                      {changePassword ? (
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                          <PasswordInput
                            label="Mật khẩu mới"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.currentTarget.value)}
                            disabled={saving || !hasSupabase}
                            size={isCompact ? "md" : "sm"}
                          />
                          <PasswordInput
                            label="Xác nhận mật khẩu mới"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                            disabled={saving || !hasSupabase}
                            size={isCompact ? "md" : "sm"}
                          />
                        </SimpleGrid>
                      ) : null}
                    </Stack>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    paddingInline: "var(--mantine-spacing-md)",
                  }}
                >
                  <div className={bookingDetailClasses.detailsCard}>
                    <CompactDetailRow
                      label="Chi nhánh quản lý"
                      value={
                        branchLabel ? (
                          <Text size="sm">{branchLabel}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )
                      }
                    />
                    <CompactDetailRow
                      label="Cập nhật lần cuối"
                      value={
                        profileUser.updatedAt ? (
                          <Text size="sm">{formatAppUserAuditAt(profileUser.updatedAt)}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )
                      }
                    />
                  </div>
                </div>
              )}

              <div
                className={bookingDetailClasses.actions}
                style={{
                  position: "static",
                  marginTop: 0,
                  padding: "var(--mantine-spacing-md)",
                  paddingTop: "var(--mantine-spacing-sm)",
                }}
              >
                <div className="booking-row-actions-drawer">
                  {isEditing ? (
                    <div className="booking-row-actions-drawer-utilities">
                      <Button
                        size="sm"
                        loading={saving}
                        disabled={!hasSupabase}
                        onClick={() => void handleSave()}
                      >
                        Lưu thay đổi
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={saving}
                        onClick={handleCancelEdit}
                      >
                        Hủy
                      </Button>
                    </div>
                  ) : (
                    <div className="booking-row-actions-drawer-span">
                      <Button
                        size="sm"
                        leftSection={<Pencil size={16} />}
                        disabled={!hasSupabase}
                        onClick={handleStartEdit}
                      >
                        Chỉnh sửa
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </PortalSectionCard>
      </Stack>
    </RouteGuard>
  );
}
