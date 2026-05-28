type WaitlistListener = () => void;

const waitlistListeners = new Set<WaitlistListener>();
const floorMapDayBookingsListeners = new Set<WaitlistListener>();

export function notifyWaitlistChanged() {
  for (const listener of waitlistListeners) {
    listener();
  }
}

export function subscribeWaitlistChanged(listener: WaitlistListener): () => void {
  waitlistListeners.add(listener);
  return () => {
    waitlistListeners.delete(listener);
  };
}

/** Booking/table sync changed — floor map should refresh the selected day's slice. */
export function notifyFloorMapDayBookingsChanged() {
  for (const listener of floorMapDayBookingsListeners) {
    listener();
  }
}

export function subscribeFloorMapDayBookingsChanged(listener: WaitlistListener): () => void {
  floorMapDayBookingsListeners.add(listener);
  return () => {
    floorMapDayBookingsListeners.delete(listener);
  };
}
