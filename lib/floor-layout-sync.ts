/** While true, Supabase realtime handlers should not call `reload()` so draft floor edits are not overwritten. */
let floorLayoutRealtimeReloadBlocked = false;

export function setFloorLayoutRealtimeReloadBlocked(block: boolean) {
  floorLayoutRealtimeReloadBlocked = block;
}

export function isFloorLayoutRealtimeReloadBlocked() {
  return floorLayoutRealtimeReloadBlocked;
}
