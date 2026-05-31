import dayjs from "dayjs";
import { NextResponse } from "next/server";

import { isSupabaseStoreServerConfigured } from "@/lib/supabase-store-server";
import * as store from "@/lib/supabase-store-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoreRequest = {
  action?: string;
  payload?: unknown;
};

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      message: "Server store is not configured (SUPABASE_SERVICE_ROLE_KEY).",
    },
    { status: 503 }
  );
}

type StoreHandler = (payload: unknown) => Promise<unknown>;

const handlers: Record<string, StoreHandler> = {
  fetchSnapshot: (payload) =>
    store.fetchSnapshot(
      payload as { forceMaintenance?: boolean } | undefined
    ),
  fetchFloorMapSlice: (payload) => {
    const p = payload as { branchIds?: string[] };
    return store.fetchFloorMapSliceInSupabase(p?.branchIds ?? []);
  },
  fetchFloorMapDayBookings: (payload) => {
    const p = payload as { branchIds?: string[]; layoutDate?: string };
    return store.fetchFloorMapDayBookingsInSupabase(
      p?.branchIds ?? [],
      p?.layoutDate ?? dayjs().format("YYYY-MM-DD")
    );
  },
  updateBookingRuntimeSettings: (payload) =>
    store.updateBookingRuntimeSettingsInSupabase(payload as Parameters<typeof store.updateBookingRuntimeSettingsInSupabase>[0]),
  updateBranch: (payload) => {
    const p = payload as { branchId: string; input: { name: string; address: string } };
    return store.updateBranchInSupabase(p.branchId, p.input);
  },
  createBooking: (payload) =>
    store.createBookingInSupabase(payload as Parameters<typeof store.createBookingInSupabase>[0]),
  assignBookingToTable: (payload) =>
    store.assignBookingToTableInSupabase(payload as Parameters<typeof store.assignBookingToTableInSupabase>[0]),
  updateBookingGuestCount: (payload) => {
    const p = payload as { bookingId: string; guestCount: number };
    return store.updateBookingGuestCountInSupabase(p.bookingId, p.guestCount);
  },
  updateBookingOrder: (payload) =>
    store.updateBookingOrderInSupabase(payload as Parameters<typeof store.updateBookingOrderInSupabase>[0]),
  changeBookingTable: (payload) =>
    store.changeBookingTableInSupabase(
      payload as Parameters<typeof store.changeBookingTableInSupabase>[0]
    ),
  updateBookingStatus: (payload) => {
    const p = payload as { bookingId: string; status: Parameters<typeof store.updateBookingStatusInSupabase>[1] };
    return store.updateBookingStatusInSupabase(p.bookingId, p.status);
  },
  deleteCustomers: (payload) =>
    store.deleteCustomersInSupabase(payload as string[]),
  checkInBooking: (payload) =>
    store.checkInBookingInSupabase(payload as string),
  getTableBlockState: (payload) =>
    store.getTableBlockStateInSupabase(payload as Parameters<typeof store.getTableBlockStateInSupabase>[0]),
  createTableMergeGroup: (payload) =>
    store.createTableMergeGroupInSupabase(payload as Parameters<typeof store.createTableMergeGroupInSupabase>[0]),
  createTableSplitClone: (payload) =>
    store.createTableSplitCloneInSupabase(payload as Parameters<typeof store.createTableSplitCloneInSupabase>[0]),
  addTableToMergeGroup: (payload) =>
    store.addTableToMergeGroupInSupabase(payload as Parameters<typeof store.addTableToMergeGroupInSupabase>[0]),
  removeTableFromMergeGroup: (payload) =>
    store.removeTableFromMergeGroupInSupabase(
      payload as Parameters<typeof store.removeTableFromMergeGroupInSupabase>[0]
    ),
  releaseTableMergeGroup: (payload) =>
    store.releaseTableMergeGroupInSupabase(
      payload as Parameters<typeof store.releaseTableMergeGroupInSupabase>[0]
    ),
  updateTableMergeGroupDates: (payload) =>
    store.updateTableMergeGroupDatesInSupabase(
      payload as Parameters<typeof store.updateTableMergeGroupDatesInSupabase>[0]
    ),
  listTableMergeGroups: (payload) =>
    store.listTableMergeGroupsInSupabase(payload as string),
  runBookingMaintenance: () => store.runBookingMaintenanceInSupabase(),
  upsertTable: (payload) =>
    store.upsertTableInSupabase(payload as Parameters<typeof store.upsertTableInSupabase>[0]),
  upsertTablesBatch: (payload) =>
    store.upsertTablesBatchInSupabase(payload as Parameters<typeof store.upsertTablesBatchInSupabase>[0]),
  updateTableStatus: (payload) => {
    const p = payload as { tableId: string; status: Parameters<typeof store.updateTableStatusInSupabase>[1] };
    return store.updateTableStatusInSupabase(p.tableId, p.status);
  },
  deleteTable: (payload) => store.deleteTableInSupabase(payload as string),
  deleteTables: (payload) => store.deleteTablesInSupabase(payload as string[]),
  updateTablePosition: (payload) => {
    const p = payload as { tableId: string; x: number; y: number };
    return store.updateTablePositionInSupabase(p.tableId, p.x, p.y);
  },
  addArea: (payload) => {
    const p = payload as { branchId: string; name: string };
    return store.addAreaInSupabase(p.branchId, p.name);
  },
  updateArea: (payload) => {
    const p = payload as {
      areaId: string;
      input: { branchId?: string; name?: string };
    };
    return store.updateAreaInSupabase(p.areaId, p.input);
  },
  deleteArea: (payload) => store.deleteAreaInSupabase(payload as string),
  updateAreaFloorLayout: (payload) => {
    const p = payload as {
      areaId: string;
      input: Parameters<typeof store.updateAreaFloorLayoutInSupabase>[1];
      options?: Parameters<typeof store.updateAreaFloorLayoutInSupabase>[2];
    };
    return store.updateAreaFloorLayoutInSupabase(p.areaId, p.input, p.options);
  },
  saveFloorLayout: (payload) => {
    const p = payload as {
      areaId: string;
      input: Parameters<typeof store.saveFloorLayoutToSupabase>[1];
      options?: Parameters<typeof store.saveFloorLayoutToSupabase>[2];
    };
    return store.saveFloorLayoutToSupabase(p.areaId, p.input, p.options);
  },
  fetchAreaFloorLayoutForDate: (payload) => {
    const p = payload as { areaId: string; layoutDate: string };
    return store.fetchAreaFloorLayoutForDateInSupabase(p.areaId, p.layoutDate);
  },
  deleteAreaFloorLayoutForDate: (payload) => {
    const p = payload as { areaId: string; layoutDate: string };
    return store.deleteAreaFloorLayoutForDateInSupabase(p.areaId, p.layoutDate);
  },
  listFloorLayoutTemplates: (payload) =>
    store.listFloorLayoutTemplatesInSupabase(payload as string),
  createFloorLayoutTemplate: (payload) => {
    const p = payload as {
      areaId: string;
      name: string;
      snapshot: Parameters<typeof store.createFloorLayoutTemplateInSupabase>[2];
      createdByUserId: string;
    };
    return store.createFloorLayoutTemplateInSupabase(
      p.areaId,
      p.name,
      p.snapshot,
      p.createdByUserId
    );
  },
  deleteFloorLayoutTemplate: (payload) =>
    store.deleteFloorLayoutTemplateInSupabase(payload as string),
  applyFloorLayoutTemplateToDate: (payload) => {
    const p = payload as {
      templateId: string;
      areaId: string;
      layoutDate: string;
      updatedByUserId?: string | null;
    };
    return store.applyFloorLayoutTemplateToDateInSupabase(
      p.templateId,
      p.areaId,
      p.layoutDate,
      p.updatedByUserId
    );
  },
  tryAcquireFloorLayoutLock: (payload) => {
    const p = payload as { areaId: string; userId: string };
    return store.tryAcquireFloorLayoutLockInSupabase(p.areaId, p.userId);
  },
  renewFloorLayoutLock: (payload) => {
    const p = payload as { areaId: string; userId: string };
    return store.renewFloorLayoutLockInSupabase(p.areaId, p.userId);
  },
  releaseFloorLayoutLock: (payload) => {
    const p = payload as { areaId: string; userId: string };
    return store.releaseFloorLayoutLockInSupabase(p.areaId, p.userId);
  },
  getFloorLayoutLockInfo: (payload) =>
    store.getFloorLayoutLockInfoInSupabase(payload as string),
  addUser: (payload) =>
    store.addUserInSupabase(payload as Parameters<typeof store.addUserInSupabase>[0]),
  updateUser: (payload) => {
    const p = payload as {
      userId: string;
      input: Parameters<typeof store.updateUserInSupabase>[1];
    };
    return store.updateUserInSupabase(p.userId, p.input);
  },
  deleteUser: (payload) => store.deleteUserInSupabase(payload as string),
  markNotificationRead: (payload) =>
    store.markNotificationReadInSupabase(payload as string),
  markNotificationsReadBatch: (payload) =>
    store.markNotificationsReadBatchInSupabase(payload as string[]),
};

export async function POST(req: Request) {
  if (!isSupabaseStoreServerConfigured()) {
    return notConfigured();
  }

  let body: StoreRequest;
  try {
    body = (await req.json()) as StoreRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!action) {
    return NextResponse.json({ ok: false, message: "action is required." }, { status: 400 });
  }

  const handler = handlers[action];
  if (!handler) {
    return NextResponse.json({ ok: false, message: `Unknown action: ${action}` }, { status: 400 });
  }

  try {
    const result = await handler(body.payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Store action failed.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
