type FloorMapDayBookingsListener = () => void;

const floorMapDayBookingsListeners = new Set<FloorMapDayBookingsListener>();

/** Booking/table sync changed — floor map should refresh the selected day's slice. */
export function notifyFloorMapDayBookingsChanged() {
  for (const listener of floorMapDayBookingsListeners) {
    listener();
  }
}

export function subscribeFloorMapDayBookingsChanged(
  listener: FloorMapDayBookingsListener
): () => void {
  floorMapDayBookingsListeners.add(listener);
  return () => {
    floorMapDayBookingsListeners.delete(listener);
  };
}
