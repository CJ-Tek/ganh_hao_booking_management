import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";

dayjs.extend(relativeTime);
dayjs.locale("vi");

/** Gần đây → relative (vi); xa hơn → giờ + ngày. */
export function formatNotificationTime(iso: string): string {
  const d = dayjs(iso);
  const cut = dayjs().subtract(48, "hour");
  if (d.isAfter(cut)) {
    return d.fromNow();
  }
  return d.format("HH:mm DD/MM/YYYY");
}
