import EVVException from "../models/EVVException.js";
import Notification from "../models/Notification.js";
import Visit from "../models/Visit.js";

const DEFAULTS = {
  graceMins: 10,
  geofenceRadiusM: 150,
  missingClockOutMins: 30,
  missedVisitMins: 30,
  latePenaltyPct: 0.25,
};

const SEVERITY_RANK = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

const TYPE_SEVERITY = {
  LATE_CLOCK_IN: "MEDIUM",
  OUTSIDE_GEOFENCE_CLOCK_IN: "MEDIUM",
  OUTSIDE_GEOFENCE_CLOCK_OUT: "MEDIUM",
  MISSING_CLOCK_OUT: "HIGH",
  MISSED_VISIT: "HIGH",
};

const TYPE_MESSAGE = {
  LATE_CLOCK_IN: "Clock-in occurred after the grace window.",
  OUTSIDE_GEOFENCE_CLOCK_IN: "Clock-in occurred outside the geofence.",
  OUTSIDE_GEOFENCE_CLOCK_OUT: "Clock-out occurred outside the geofence.",
  MISSING_CLOCK_OUT: "Missing clock-out after the scheduled end time.",
  MISSED_VISIT: "Visit was missed with no clock-in recorded.",
};

function normalizeVisitTimes(visit) {
  const scheduledStartAt = visit.scheduledStartAt || visit.startTime;
  const scheduledEndAt = visit.scheduledEndAt || visit.endTime;
  const clockInAt = visit.clockInAt || visit.clockInTime;
  const clockOutAt = visit.clockOutAt || visit.clockOutTime;
  return { scheduledStartAt, scheduledEndAt, clockInAt, clockOutAt };
}

function buildException({ type, occurredAt, meta }) {
  const severity = TYPE_SEVERITY[type] || "LOW";
  return {
    type,
    severity,
    severityRank: SEVERITY_RANK[severity] || 1,
    message: TYPE_MESSAGE[type] || "EVV exception detected.",
    occurredAt,
    detectedAt: new Date(),
    meta,
  };
}

export function evaluateVisitEVV(visit, options = {}) {
  if (!visit) return [];
  const now = options.now || new Date();
  const graceMins = options.graceMins ?? DEFAULTS.graceMins;
  const geofenceRadiusM = options.geofenceRadiusM ?? DEFAULTS.geofenceRadiusM;
  const missingClockOutMins = options.missingClockOutMins ?? DEFAULTS.missingClockOutMins;
  const missedVisitMins = options.missedVisitMins ?? DEFAULTS.missedVisitMins;

  const { scheduledStartAt, scheduledEndAt, clockInAt, clockOutAt } =
    normalizeVisitTimes(visit);
  const exceptions = [];

  if (scheduledStartAt && clockInAt) {
    const graceMs = graceMins * 60 * 1000;
    if (clockInAt.getTime() > scheduledStartAt.getTime() + graceMs) {
      exceptions.push(
        buildException({
          type: "LATE_CLOCK_IN",
          occurredAt: clockInAt,
          meta: {
            scheduledStartAt,
            actualClockInAt: clockInAt,
            ruleThresholdMins: graceMins,
          },
        })
      );
    }
  }

  if (clockInAt && typeof visit.clockInDistanceM === "number") {
    if (visit.clockInDistanceM > geofenceRadiusM) {
      exceptions.push(
        buildException({
          type: "OUTSIDE_GEOFENCE_CLOCK_IN",
          occurredAt: clockInAt,
          meta: {
            actualClockInAt: clockInAt,
            distanceM: visit.clockInDistanceM,
            geofenceRadiusM,
          },
        })
      );
    }
  }

  if (clockOutAt && typeof visit.clockOutDistanceM === "number") {
    if (visit.clockOutDistanceM > geofenceRadiusM) {
      exceptions.push(
        buildException({
          type: "OUTSIDE_GEOFENCE_CLOCK_OUT",
          occurredAt: clockOutAt,
          meta: {
            actualClockOutAt: clockOutAt,
            distanceM: visit.clockOutDistanceM,
            geofenceRadiusM,
          },
        })
      );
    }
  }

  if (clockInAt && !clockOutAt && scheduledEndAt) {
    const cutoff = scheduledEndAt.getTime() + missingClockOutMins * 60 * 1000;
    if (now.getTime() > cutoff) {
      exceptions.push(
        buildException({
          type: "MISSING_CLOCK_OUT",
          occurredAt: scheduledEndAt,
          meta: {
            scheduledEndAt,
            actualClockInAt: clockInAt,
            ruleThresholdMins: missingClockOutMins,
          },
        })
      );
    }
  }

  if (!clockInAt && scheduledEndAt) {
    const cutoff = scheduledEndAt.getTime() + missedVisitMins * 60 * 1000;
    if (now.getTime() > cutoff) {
      exceptions.push(
        buildException({
          type: "MISSED_VISIT",
          occurredAt: scheduledEndAt,
          meta: {
            scheduledEndAt,
            ruleThresholdMins: missedVisitMins,
          },
        })
      );
    }
  }

  return exceptions;
}

export async function createAdminNotificationsForNewExceptions(exceptions) {
  if (!exceptions || !exceptions.length) return [];
  const notifications = [];
  for (const exception of exceptions) {
    const title = "EVV exception detected";
    const body = `${exception.type.replace(/_/g, " ")} for visit ${exception.visitId}`;
    notifications.push(
      {
        agencyId: exception.agencyId,
        type: "EVV_EXCEPTION",
        toRole: "admin",
        visitId: exception.visitId,
        exceptionId: exception._id,
        title,
        body,
      },
      {
        agencyId: exception.agencyId,
        type: "EVV_EXCEPTION",
        toRole: "scheduler",
        visitId: exception.visitId,
        exceptionId: exception._id,
        title,
        body,
      }
    );
  }
  return Notification.insertMany(notifications);
}

export async function upsertVisitExceptions(visit, options = {}) {
  if (!visit || !visit._id || !visit.agencyId) {
    return { exceptions: [], evvStatus: "compliant", newExceptions: [] };
  }

  const now = options.now || new Date();
  const detected = evaluateVisitEVV(visit, options);
  const agencyId = visit.agencyId;
  const visitId = visit._id;
  const caregiverId = visit.caregiverId;
  const clientId = visit.clientId || visit.patientId;
  const detectedTypes = new Set(detected.map((ex) => ex.type));

 /* const existingOpen = await EVVException.find({
    agencyId,
    visitId,
    status: "OPEN",
  }).lean();

  const toResolveIds = existingOpen
    .filter((ex) => !detectedTypes.has(ex.type))
    .map((ex) => ex._id);

  if (toResolveIds.length) {
    await EVVException.updateMany(
      { _id: { $in: toResolveIds } },
      {
        $set: {
          status: "RESOLVED",
          resolution: {
            resolvedByUserId: options.byUserId || null,
            resolvedAt: now,
            action: "FIXED",
          },
        },
        $push: {
          audit: {
            at: now,
            byUserId: options.byUserId || null,
            action: "AUTO_RESOLVE",
            changes: { status: "RESOLVED" },
          },
        },
      }
    );
  }  */

  const newExceptions = [];
  for (const detectedEx of detected) {
    /*const existing = await EVVException.findOne({
      agencyId,
      visitId,
      type: detectedEx.type,
      status: "OPEN",
    });

    if (existing) {
      await EVVException.updateOne(
        { _id: existing._id },
        {
          $set: {
            caregiverId,
            clientId,
            severity: detectedEx.severity,
            severityRank: detectedEx.severityRank,
            message: detectedEx.message,
            detectedAt: detectedEx.detectedAt,
            meta: detectedEx.meta,
          },
        }
      );
      continue;
    } */

    const created = await EVVException.create({
      agencyId,
      visitId,
      caregiverId,
      clientId,
      type: detectedEx.type,
      status: "OPEN",
      severity: detectedEx.severity,
      severityRank: detectedEx.severityRank,
      message: detectedEx.message,
      occurredAt: detectedEx.occurredAt,
      detectedAt: detectedEx.detectedAt,
      meta: detectedEx.meta,
      audit: [
        {
          at: now,
          byUserId: options.byUserId || null,
          action: "DETECTED",
        },
      ],
    });
    newExceptions.push(created);
  }

  const openExceptions = await EVVException.find({
    agencyId,
    visitId,
    status: "OPEN",
  })
    .sort({ severityRank: -1, occurredAt: -1 })
    .lean();

  const resolvedCount = await EVVException.countDocuments({
    agencyId,
    visitId,
    status: { $in: ["RESOLVED", "DISMISSED"] },
  });

  const evvStatus =
    openExceptions.length > 0 ? "exception" : resolvedCount > 0 ? "resolved" : "compliant";

  const evvExceptionsSummary = openExceptions.map((ex) => ({
    type: ex.type,
    severity: ex.severity,
    message: ex.message,
    occurredAt: ex.occurredAt,
    meta: ex.meta,
  }));

  await Visit.updateOne(
    { _id: visitId, agencyId },
    { $set: { evvStatus, evvExceptions: evvExceptionsSummary } }
  );

  await createAdminNotificationsForNewExceptions(newExceptions);

  return { exceptions: openExceptions, evvStatus, newExceptions };
}

export function calculateVisitValueCents(visit) {
  if (!visit) return 0;
  if (typeof visit.billingRateCents === "number") return visit.billingRateCents;
  const rate = typeof visit.payRatePerHour === "number" ? visit.payRatePerHour : 0;
  const scheduledStartAt = visit.scheduledStartAt || visit.startTime;
  const scheduledEndAt = visit.scheduledEndAt || visit.endTime;
  if (!scheduledStartAt || !scheduledEndAt || rate <= 0) return 0;
  const hours = Math.max(0, (scheduledEndAt - scheduledStartAt) / 36e5);
  return Math.round(hours * rate * 100);
}

export function getRiskPctForExceptions(exceptions) {
  if (!exceptions || !exceptions.length) return 0;
  const types = new Set(exceptions.map((ex) => ex.type));
  if (types.has("MISSED_VISIT") || types.has("MISSING_CLOCK_OUT")) return 1;
  if (
    types.has("OUTSIDE_GEOFENCE_CLOCK_IN") ||
    types.has("OUTSIDE_GEOFENCE_CLOCK_OUT") ||
    types.has("LATE_CLOCK_IN")
  ) {
    return DEFAULTS.latePenaltyPct;
  }
  return 0;
}
