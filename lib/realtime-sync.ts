type WaitlistListener = () => void;

const waitlistListeners = new Set<WaitlistListener>();

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
