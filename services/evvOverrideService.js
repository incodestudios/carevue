import mongoose from "mongoose";
import EvvAuditEvent from "../models/EvvAuditEvent.js";
import Visit from "../models/Visit.js";

const VISIT_OVERRIDE_FIELDS = new Set([
  "clockInTime",
  "clockOutTime",
  "clockInLocation",
  "clockOutLocation",
  "clockInDistanceM",
  "clockOutDistanceM",
  "startTime",
  "endTime",
]);

export async function runWithOptionalTransaction(workFn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    });
    return result;
  } catch (err) {
    const msg = String(err?.message || "");
    const isTxnUnsupported =
      msg.includes("Transaction numbers are only allowed") ||
      msg.includes("replica set") ||
      msg.includes("transaction") ||
      msg.includes("does not support");
    if (isTxnUnsupported) {
      return workFn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
}

export async function createAuditEvent({ event, session }) {
  if (session) {
    await EvvAuditEvent.create([event], { session });
  } else {
    await EvvAuditEvent.create(event);
  }
}

export async function isPayrollLocked() {
  return false;
}

export async function applyOverrideToVisit(override, session) {
  const field = override?.requestedChange?.field;
  if (!field || !VISIT_OVERRIDE_FIELDS.has(field)) return null;

  const update = { [field]: override.requestedChange.after };
  const updated = await Visit.findOneAndUpdate(
    { _id: override.visitId, agencyId: override.agencyId },
    { $set: update },
    { new: true, session }
  ).lean();

  return { updated, appliedField: field, appliedValue: override.requestedChange.after };
}
