export function maintenanceSecrets(): string[] {
  return [process.env.BOOKING_MAINTENANCE_SECRET, process.env.CRON_SECRET].filter(
    (value): value is string => Boolean(value)
  );
}

export function isMaintenanceCronAuthorized(req: Request): boolean {
  const secrets = maintenanceSecrets();
  if (secrets.length === 0) {
    return false;
  }
  const headerValue = req.headers.get("x-booking-maintenance-secret");
  if (headerValue && secrets.includes(headerValue)) {
    return true;
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    return secrets.includes(token);
  }
  return false;
}

export function maintenanceSecretsMissingResponse() {
  return {
    ok: false as const,
    message: "BOOKING_MAINTENANCE_SECRET or CRON_SECRET is not configured.",
  };
}
