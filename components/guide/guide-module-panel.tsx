"use client";

import { Alert, Box, Image, List, Stack, Text, Title } from "@mantine/core";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { PortalSectionCard } from "@/components/portal-page";
import type { GuideModule } from "@/lib/guide/types";
import classes from "./guide-page.module.css";

type GuideModulePanelProps = {
  module: GuideModule;
  scrollable?: boolean;
};

export function GuideModulePanel({ module, scrollable = false }: GuideModulePanelProps) {
  const [imageError, setImageError] = useState(false);
  const showScreenshot = Boolean(module.screenshot) && !imageError;

  const body = (
    <Stack gap="lg">
        <Stack gap={6}>
          <Title order={3}>{module.title}</Title>
          <Text size="sm" c="dimmed">
            {module.intro}
          </Text>
        </Stack>

        {showScreenshot && module.screenshot ? (
          <Stack gap={6}>
            <Image
              src={module.screenshot}
              alt={module.screenshotCaption ?? module.title}
              radius="md"
              fit="contain"
              mah={420}
              onError={() => setImageError(true)}
            />
            {module.screenshotCaption ? (
              <Text size="xs" c="dimmed" ta="center">
                {module.screenshotCaption}
              </Text>
            ) : null}
          </Stack>
        ) : null}

        <Stack gap="sm">
          <Text fw={600} size="sm">
            Các bước thực hiện
          </Text>
          <List spacing="sm" type="ordered" withPadding>
            {module.steps.map((step) => (
              <List.Item key={step.title}>
                <Text fw={600} size="sm">
                  {step.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {step.body}
                </Text>
              </List.Item>
            ))}
          </List>
        </Stack>

        {module.tips.length > 0 ? (
          <Stack gap="xs">
            {module.tips.map((tip) => (
              <Alert key={tip} variant="light" color="yellow" icon={<Lightbulb size={16} />} title="Mẹo">
                {tip}
              </Alert>
            ))}
          </Stack>
        ) : null}
    </Stack>
  );

  if (!scrollable) {
    return <PortalSectionCard p="lg">{body}</PortalSectionCard>;
  }

  return (
    <PortalSectionCard p={0}>
      <Box className={classes.contentScroll} tabIndex={0} aria-label="Nội dung chủ đề hướng dẫn">
        {body}
      </Box>
    </PortalSectionCard>
  );
}
