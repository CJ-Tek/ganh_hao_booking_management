/** Configured seats on a table = nominal slots. Real dining capacity allows this many guests per slot. */
export const TABLE_SLOT_COMPENSATION_RATE = 2;

export function getTableSlotCount(seats: number): number {
  return Math.max(0, Math.round(seats));
}

/** Max guests a single table can serve (slots × compensation). */
export function getTableEffectiveGuestCapacity(seats: number): number {
  const slots = getTableSlotCount(seats);
  if (slots <= 0) {
    return 0;
  }
  return slots * TABLE_SLOT_COMPENSATION_RATE;
}

/** Max guests for a merge group (sum of member slot counts, with compensation). */
export function getMergeGroupEffectiveGuestCapacity(totalSlotCount: number): number {
  return getTableEffectiveGuestCapacity(totalSlotCount);
}

export function tableFitsGuestCount(seats: number, guestCount: number): boolean {
  const maxGuests = getTableEffectiveGuestCapacity(seats);
  if (maxGuests <= 0) {
    return true;
  }
  return guestCount <= maxGuests;
}

export function mergeGroupFitsGuestCount(totalSlotCount: number, guestCount: number): boolean {
  return tableFitsGuestCount(totalSlotCount, guestCount);
}

/** User-facing capacity hint, e.g. "8 khách (4 ghế)". */
export function formatTableGuestCapacityHint(seats: number): string {
  const slots = getTableSlotCount(seats);
  const maxGuests = getTableEffectiveGuestCapacity(seats);
  if (slots <= 0) {
    return "không giới hạn";
  }
  if (maxGuests <= slots) {
    return `${slots} ghế`;
  }
  return `${maxGuests} khách (${slots} ghế)`;
}
