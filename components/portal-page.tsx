"use client";

import {
  Card,
  type CardProps,
  Group,
  type GroupProps,
  SimpleGrid,
  type SimpleGridProps,
  Title,
  type TitleProps,
} from "@mantine/core";
import { type PropsWithChildren } from "react";

type WithClassName = {
  className?: string;
};

function mergeClassName(base: string, custom?: string) {
  return custom ? `${base} ${custom}` : base;
}

export function PortalPageTitle({ className, children, ...props }: TitleProps & WithClassName) {
  return (
    <Title order={2} className={mergeClassName("portal-page-title", className)} {...props}>
      {children}
    </Title>
  );
}

export function PortalSectionCard({
  className,
  withBorder = true,
  children,
  ...props
}: CardProps & WithClassName) {
  return (
    <Card withBorder={withBorder} className={mergeClassName("portal-section-card", className)} {...props}>
      {children}
    </Card>
  );
}

export function PortalStickyPanel({
  className,
  withBorder = true,
  children,
  ...props
}: CardProps & WithClassName) {
  return (
    <Card
      withBorder={withBorder}
      className={mergeClassName("portal-section-card mobile-sticky-panel", className)}
      {...props}
    >
      {children}
    </Card>
  );
}

export function PortalStickyAction({ className, children }: PropsWithChildren<WithClassName>) {
  return <div className={mergeClassName("mobile-sticky-action", className)}>{children}</div>;
}

export function PortalMobileActionGrid({
  className,
  grow = true,
  children,
  ...props
}: GroupProps & WithClassName) {
  return (
    <Group grow={grow} className={mergeClassName("mobile-action-grid", className)} {...props}>
      {children}
    </Group>
  );
}

export function PortalStickyHeader({
  className,
  children,
  ...props
}: GroupProps & WithClassName) {
  return (
    <Group className={mergeClassName("mobile-sticky-panel", className)} {...props}>
      {children}
    </Group>
  );
}

export function PortalActionGrid({
  className,
  children,
  ...props
}: SimpleGridProps & WithClassName) {
  return (
    <SimpleGrid className={mergeClassName("mobile-action-grid", className)} {...props}>
      {children}
    </SimpleGrid>
  );
}
