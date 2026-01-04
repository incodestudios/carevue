import mongoose from "mongoose";
import EVVException from "../models/EVVException.js";
import EVVExceptionAudit from "../models/EVVExceptionAudit.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Visit from "../models/Visit.js";
import VisitPlan from "../models/VisitPlan.js";
import AdjudicationSubmission from "../models/AdjudicationSubmission.js";
import ComplianceEvaluation from "../models/ComplianceEvaluation.js";
import {
  calculateVisitValueCents,
  createAdminNotificationsForNewExceptions,
  getRiskPctForExceptions,
} from "../services/evvService.js";
import { createUserNotification } from "../services/notificationService.js";
import { enqueueVisitSubmission } from "../queues/evvSubmissionQueue.js";
import { computePredictiveComplianceScore } from "../services/complianceEngine.js";

const ALLOWED_EXCEPTION_TYPES = [
  "LATE_CLOCK_IN",
  "OUTSIDE_GEOFENCE_CLOCK_IN",
  "OUTSIDE_GEOFENCE_CLOCK_OUT",
  "MISSING_CLOCK_OUT",
  "MISSED_VISIT",
  "MANUAL_OVERRIDE",
];
const DEFAULT_LIST_ALL_EXCEPTION_TYPES = [
  "MISSED_VISIT",
  "LATE_CLOCK_IN",
  "OUTSIDE_GEOFENCE_CLOCK_OUT",
  "OUTSIDE_GEOFENCE_CLOCK_IN",
];

function isValidObjectId(id) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

async function runWithOptionalTransaction(workFn) {
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

function normalizeTypeFilter(type) {
  if (!type) return null;
  const rawList = Array.isArray(type) ? type : String(type).split(",");
  const types = rawList.map((value) => String(value).trim()).filter(Boolean);
  if (!types.length) return null;
  const invalid = types.filter((value) => !ALLOWED_EXCEPTION_TYPES.includes(value));
  if (invalid.length) {
    return { error: `Invalid exception type: ${invalid.join(", ")}` };
  }
  return { types };
}

function getDateRange(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function normalizeAdjudicator(value) {
  if (!value) return "HHAX";
  const normalized = String(value).toUpperCase();
  if (normalized === "HHAX" || normalized === "SANDATA") return normalized;
  return null;
}

export async function listExceptions(req, res) {
  try {
    const {
      date,
      startDate,
      endDate,
      startdate,
      enddate,
      status,
      type,
      caregiverId,
      clientId,
      page = 1,
      limit = 50,
    } = req.query;

    const q = { agencyId: req.agencyId };
    const startParam = startDate || startdate;
    const endParam = endDate || enddate;
    const hasRange = !!(startParam || endParam);
    if (date && hasRange) {
      return res
        .status(400)
        .json({ message: "Use date or startDate/endDate, not both." });
    }
    if (hasRange) {
      const startRange = startParam ? getDateRange(startParam) : null;
      const endRange = endParam ? getDateRange(endParam) : null;
      if ((startParam && !startRange) || (endParam && !endRange)) {
        return res
          .status(400)
          .json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      if (startRange && endRange && endRange.start < startRange.start) {
        return res
          .status(400)
          .json({ message: "endDate must be on or after startDate." });
      }
      q.occurredAt = {
        ...(startRange ? { $gte: startRange.start } : {}),
        ...(endRange ? { $lt: endRange.end } : {}),
      };
    } else {
      const range = getDateRange(date);
      if (date && !range) {
        return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      if (range) {
        q.occurredAt = { $gte: range.start, $lt: range.end };
      }
    }
    if (status) q.status = status;
    if (type) {
      const typeFilter = normalizeTypeFilter(type);
      if (typeFilter?.error) {
        return res.status(400).json({ message: typeFilter.error });
      }
      if (typeFilter?.types?.length === 1) {
        q.type = typeFilter.types[0];
      } else if (typeFilter?.types?.length) {
        q.type = { $in: typeFilter.types };
      }
    }
    if (caregiverId) {
      if (!isValidObjectId(caregiverId)) {
        return res.status(400).json({ message: "Invalid caregiverId." });
      }
      q.caregiverId = caregiverId;
    }
    if (clientId) {
      if (!isValidObjectId(clientId)) {
        return res.status(400).json({ message: "Invalid clientId." });
      }
      q.clientId = clientId;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const total = await EVVException.countDocuments(q);

    const items = await EVVException.find(q)
      .sort({ severityRank: -1, occurredAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate(
        "visitId",
        "startTime endTime patientId caregiverId status billingRateCents scheduledStartAt scheduledEndAt clockInTime clockOutTime clockInAt clockOutAt evvStatus"
      )
      .lean();

    res.json({
      page: pageNum,
      limit: limitNum,
      total,
      items,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function listAllExceptions(req, res) {
  try {
    const {
      date,
      startDate,
      endDate,
      startdate,
      enddate,
      status,
      type,
      caregiverId,
      clientId,
      page = 1,
      limit = 50,
    } = req.query;
    const typeParam = type || DEFAULT_LIST_ALL_EXCEPTION_TYPES.join(",");

    const q = { agencyId: req.agencyId };
    const startParam = startDate || startdate;
    const endParam = endDate || enddate;
    const hasRange = !!(startParam || endParam);
    if (date && hasRange) {
      return res
        .status(400)
        .json({ message: "Use date or startDate/endDate, not both." });
    }
    if (hasRange) {
      const startRange = startParam ? getDateRange(startParam) : null;
      const endRange = endParam ? getDateRange(endParam) : null;
      if ((startParam && !startRange) || (endParam && !endRange)) {
        return res
          .status(400)
          .json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      if (startRange && endRange && endRange.start < startRange.start) {
        return res
          .status(400)
          .json({ message: "endDate must be on or after startDate." });
      }
      q.occurredAt = {
        ...(startRange ? { $gte: startRange.start } : {}),
        ...(endRange ? { $lt: endRange.end } : {}),
      };
    } else {
      const range = getDateRange(date);
      if (date && !range) {
        return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      if (range) {
        q.occurredAt = { $gte: range.start, $lt: range.end };
      }
    }
    if (status) q.status = status;
    if (typeParam) {
      const typeFilter = normalizeTypeFilter(typeParam);
      if (typeFilter?.error) {
        return res.status(400).json({ message: typeFilter.error });
      }
      if (typeFilter?.types?.length === 1) {
        q.type = typeFilter.types[0];
      } else if (typeFilter?.types?.length) {
        q.type = { $in: typeFilter.types };
      }
    }
    if (caregiverId) {
      if (!isValidObjectId(caregiverId)) {
        return res.status(400).json({ message: "Invalid caregiverId." });
      }
      q.caregiverId = caregiverId;
    }
    if (clientId) {
      if (!isValidObjectId(clientId)) {
        return res.status(400).json({ message: "Invalid clientId." });
      }
      q.clientId = clientId;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const total = await EVVException.countDocuments(q);

    const items = await EVVException.find(q)
      .sort({ severityRank: -1, occurredAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate(
        "visitId",
        "startTime endTime patientId caregiverId status billingRateCents scheduledStartAt scheduledEndAt clockInTime clockOutTime clockInAt clockOutAt evvStatus"
      )
      .lean();

    res.json({
      page: pageNum,
      limit: limitNum,
      total,
      items,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getException(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const exception = await EVVException.findOne({
      _id: id,
      agencyId: req.agencyId,
    })
      .populate(
        "visitId",
        "startTime endTime patientId caregiverId status billingRateCents scheduledStartAt scheduledEndAt clockInTime clockOutTime clockInAt clockOutAt evvStatus"
      )
      .populate("caregiverId", "firstName lastName email")
      .populate("clientId", "firstName lastName")
      .lean();

    if (!exception) return res.status(404).json({ message: "Exception not found" });
    res.json(exception);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateReviewed(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { reviewed } = req.body || {};
    if (typeof reviewed !== "boolean") {
      return res.status(400).json({ message: "reviewed must be boolean" });
    }

    const exception = await EVVException.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    const now = new Date();
    const update = {
      reviewed,
      reviewedAt: reviewed ? now : null,
      reviewedBy: reviewed ? req.user.id : null,
    };

    const result = await runWithOptionalTransaction(async (session) => {
      const updated = await EVVException.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: update },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "evv_exception",
        entityId: id,
        action: "MARK_REVIEWED",
        before: {
          reviewed: exception.reviewed,
          reviewedAt: exception.reviewedAt,
          reviewedBy: exception.reviewedBy,
        },
        after: update,
        actorId: req.user.id,
        actorRole: req.user.role,
      };
      if (session) {
        await EVVExceptionAudit.create([audit], { session });
      } else {
        await EVVExceptionAudit.create(audit);
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function requestExplanation(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { message, dueAt } = req.body || {};
    if (message && typeof message !== "string") {
      return res.status(400).json({ message: "message must be a string" });
    }

    let dueAtDate;
    if (dueAt) {
      dueAtDate = new Date(dueAt);
      if (Number.isNaN(dueAtDate.getTime())) {
        return res.status(400).json({ message: "Invalid dueAt" });
      }
      if (dueAtDate <= new Date()) {
        return res.status(400).json({ message: "dueAt must be in the future" });
      }
    }

    const exception = await EVVException.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    const now = new Date();
    const update = {
      "explanationRequest.status": "requested",
      "explanationRequest.requestedAt": now,
      "explanationRequest.requestedBy": req.user.id,
      "explanationRequest.caregiverId": exception.caregiverId,
      "explanationRequest.message": message || null,
      "explanationRequest.dueAt": dueAtDate || null,
      "explanationRequest.response": null,
    };

    const result = await runWithOptionalTransaction(async (session) => {
      const updated = await EVVException.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: update },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "evv_exception",
        entityId: id,
        action: "REQUEST_EXPLANATION",
        before: { explanationRequest: exception.explanationRequest || { status: "none" } },
        after: {
          status: "requested",
          requestedAt: now,
          requestedBy: req.user.id,
          caregiverId: exception.caregiverId,
          message: message || null,
          dueAt: dueAtDate || null,
        },
        actorId: req.user.id,
        actorRole: req.user.role,
      };
      if (session) {
        await EVVExceptionAudit.create([audit], { session });
      } else {
        await EVVExceptionAudit.create(audit);
      }

      return updated;
    });

    try {
      await createUserNotification({
        agencyId: req.agencyId,
        recipientUserId: exception.caregiverId,
        type: "EVV_EXPLANATION_REQUESTED",
        title: "Explanation requested",
        body: message ? message : "An explanation was requested for a visit.",
        payload: {
          exceptionId: id,
          visitId: exception.visitId,
          dueAt: dueAtDate || null,
          requestedBy: req.user.id,
        },
        senderUserId: req.user.id,
        visitId: exception.visitId,
        exceptionId: id,
      });
    } catch (e) {
      // console.error("Failed to create explanation notification:", e);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function addCoordinatorNote(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ message: "text is required" });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ message: "text must be <= 1000 characters" });
    }

    const exception = await EVVException.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    const note = {
      text: text.trim(),
      createdAt: new Date(),
      createdBy: req.user.id,
    };

    const result = await runWithOptionalTransaction(async (session) => {
      const updated = await EVVException.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $push: { coordinatorNotes: note } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "evv_exception",
        entityId: id,
        action: "ADD_NOTE",
        before: { notesCount: exception.coordinatorNotes?.length || 0 },
        after: { notesCount: (exception.coordinatorNotes?.length || 0) + 1, note },
        actorId: req.user.id,
        actorRole: req.user.role,
      };
      if (session) {
        await EVVExceptionAudit.create([audit], { session });
      } else {
        await EVVExceptionAudit.create(audit);
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function setBillingStatus(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { billingStatus, billingReason } = req.body || {};
    if (!["billable", "non_billable", "needs_review"].includes(billingStatus)) {
      return res.status(400).json({ message: "Invalid billingStatus" });
    }
    if (billingStatus === "non_billable") {
      if (!billingReason || typeof billingReason !== "string" || !billingReason.trim()) {
        return res.status(400).json({ message: "billingReason is required" });
      }
    }

    const exception = await EVVException.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    const update = {
      billingStatus,
      billingReason: billingStatus === "non_billable" ? billingReason.trim() : null,
    };

    const result = await runWithOptionalTransaction(async (session) => {
      const updated = await EVVException.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: update },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "evv_exception",
        entityId: id,
        action: "SET_BILLING_STATUS",
        before: {
          billingStatus: exception.billingStatus,
          billingReason: exception.billingReason || null,
        },
        after: update,
        actorId: req.user.id,
        actorRole: req.user.role,
      };
      if (session) {
        await EVVExceptionAudit.create([audit], { session });
      } else {
        await EVVExceptionAudit.create(audit);
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function assignOwner(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { ownerId } = req.body || {};
    if (!isValidObjectId(ownerId)) {
      return res.status(400).json({ message: "Invalid ownerId" });
    }

    const [exception, owner] = await Promise.all([
      EVVException.findOne({ _id: id, agencyId: req.agencyId }).lean(),
      User.findOne({ _id: ownerId, agencyId: req.agencyId }).lean(),
    ]);
    if (!exception) return res.status(404).json({ message: "Exception not found" });
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    const now = new Date();
    const update = {
      ownerId,
      ownerAssignedAt: now,
      ownerAssignedBy: req.user.id,
    };

    const result = await runWithOptionalTransaction(async (session) => {
      const updated = await EVVException.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: update },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "evv_exception",
        entityId: id,
        action: "ASSIGN_OWNER",
        before: {
          ownerId: exception.ownerId || null,
          ownerAssignedAt: exception.ownerAssignedAt || null,
          ownerAssignedBy: exception.ownerAssignedBy || null,
        },
        after: update,
        actorId: req.user.id,
        actorRole: req.user.role,
      };
      if (session) {
        await EVVExceptionAudit.create([audit], { session });
      } else {
        await EVVExceptionAudit.create(audit);
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getExceptionAudit(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const items = await EVVExceptionAudit.find({
      agencyId: req.agencyId,
      entityType: "evv_exception",
      entityId: id,
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function listExplanationResponses(req, res) {
  try {
    const { date, startDate, endDate, page = 1, limit = 50 } = req.query;
    const startParam = startDate;
    const endParam = endDate;
    const hasRange = !!(startParam || endParam);

    const q = {
      agencyId: req.agencyId,
      "explanationRequest.status": "received",
      "explanationRequest.response": { $ne: null },
    };

    if (date && hasRange) {
      return res
        .status(400)
        .json({ message: "Use date or startDate/endDate, not both." });
    }
    if (hasRange) {
      const startRange = startParam ? getDateRange(startParam) : null;
      const endRange = endParam ? getDateRange(endParam) : null;
      if ((startParam && !startRange) || (endParam && !endRange)) {
        return res
          .status(400)
          .json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      if (startRange && endRange && endRange.start < startRange.start) {
        return res
          .status(400)
          .json({ message: "endDate must be on or after startDate." });
      }
      q["explanationRequest.response.respondedAt"] = {
        ...(startRange ? { $gte: startRange.start } : {}),
        ...(endRange ? { $lt: endRange.end } : {}),
      };
    } else if (date) {
      const range = getDateRange(date);
      if (!range) {
        return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      q["explanationRequest.response.respondedAt"] = {
        $gte: range.start,
        $lt: range.end,
      };
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const total = await EVVException.countDocuments(q);

    const items = await EVVException.find(q)
      .sort({ "explanationRequest.response.respondedAt": -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("caregiverId", "firstName lastName email")
      .populate("clientId", "firstName lastName")
      .populate(
        "visitId",
        "startTime endTime patientId caregiverId status scheduledStartAt scheduledEndAt"
      )
      .lean();

    res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function listCaregiverExplanationRequests(req, res) {
  try {
    const { status, date, startDate, endDate, page = 1, limit = 50 } = req.query;
    const startParam = startDate;
    const endParam = endDate;
    const hasRange = !!(startParam || endParam);

    const allowedStatuses = ["requested", "overdue", "received", "none"];
    const statusList = status
      ? String(status)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : ["requested", "overdue"];

    const invalidStatuses = statusList.filter((value) => !allowedStatuses.includes(value));
    if (invalidStatuses.length) {
      return res
        .status(400)
        .json({ message: `Invalid status: ${invalidStatuses.join(", ")}` });
    }

    const q = {
      agencyId: req.agencyId,
      caregiverId: req.user.id,
    };
    if (statusList.length === 1) {
      q["explanationRequest.status"] = statusList[0];
    } else if (statusList.length) {
      q["explanationRequest.status"] = { $in: statusList };
    }

    if (date && hasRange) {
      return res
        .status(400)
        .json({ message: "Use date or startDate/endDate, not both." });
    }
    if (hasRange) {
      const startRange = startParam ? getDateRange(startParam) : null;
      const endRange = endParam ? getDateRange(endParam) : null;
      if ((startParam && !startRange) || (endParam && !endRange)) {
        return res
          .status(400)
          .json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      if (startRange && endRange && endRange.start < startRange.start) {
        return res
          .status(400)
          .json({ message: "endDate must be on or after startDate." });
      }
      q["explanationRequest.requestedAt"] = {
        ...(startRange ? { $gte: startRange.start } : {}),
        ...(endRange ? { $lt: endRange.end } : {}),
      };
    } else if (date) {
      const range = getDateRange(date);
      if (!range) {
        return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
      }
      q["explanationRequest.requestedAt"] = {
        $gte: range.start,
        $lt: range.end,
      };
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const total = await EVVException.countDocuments(q);

    const items = await EVVException.find(q)
      .sort({ "explanationRequest.requestedAt": -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("clientId", "firstName lastName")
      .populate(
        "visitId",
        "startTime endTime patientId caregiverId status scheduledStartAt scheduledEndAt"
      )
      .lean();

    res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function respondToExplanation(req, res) {
  try {
    const { exceptionId } = req.params;
    if (!isValidObjectId(exceptionId)) {
      return res.status(400).json({ message: "Invalid exceptionId" });
    }

    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ message: "text is required" });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ message: "text must be <= 1000 characters" });
    }

    const exception = await EVVException.findOne({
      _id: exceptionId,
      agencyId: req.agencyId,
      caregiverId: req.user.id,
    }).lean();
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    const currentStatus = exception.explanationRequest?.status;
    if (!["requested", "overdue"].includes(currentStatus)) {
      return res.status(400).json({ message: "No active explanation request" });
    }

    const now = new Date();
    const update = {
      "explanationRequest.status": "received",
      "explanationRequest.response": { text: text.trim(), respondedAt: now },
    };

    const result = await runWithOptionalTransaction(async (session) => {
      const updated = await EVVException.findOneAndUpdate(
        { _id: exceptionId, agencyId: req.agencyId, caregiverId: req.user.id },
        { $set: update },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "evv_exception",
        entityId: exceptionId,
        action: "RESPOND_EXPLANATION",
        before: { explanationRequest: exception.explanationRequest || { status: "none" } },
        after: {
          status: "received",
          response: { text: text.trim(), respondedAt: now },
        },
        actorId: req.user.id,
        actorRole: req.user.role,
      };
      if (session) {
        await EVVExceptionAudit.create([audit], { session });
      } else {
        await EVVExceptionAudit.create(audit);
      }

      return updated;
    });

    await Notification.updateMany(
      {
        agencyId: req.agencyId,
        recipientType: "user",
        recipientUserId: req.user.id,
        type: "EVV_EXPLANATION_REQUESTED",
        exceptionId: exceptionId,
        status: "unread",
      },
      { $set: { status: "read", readAt: new Date() } }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function resolveException(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { action, reasonCode, note } = req.body || {};
    if (!action || !["OVERRIDE", "DISMISS"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }
    if (!reasonCode || typeof reasonCode !== "string") {
      return res.status(400).json({ message: "reasonCode is required" });
    }

    const exception = await EVVException.findOne({
      _id: id,
      agencyId: req.agencyId,
    });
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    const now = new Date();
    const status = action === "DISMISS" ? "DISMISSED" : "RESOLVED";
    const resolution = {
      resolvedByUserId: req.user.id,
      resolvedAt: now,
      action,
      reasonCode,
      note,
    };

    const update = {
      status,
      resolution,
    };

    if (action === "OVERRIDE") {
      update.meta = {
        ...(exception.meta || {}),
        manualOverride: {
          at: now,
          byUserId: req.user.id,
          reasonCode,
          note,
        },
      };
    }

    await EVVException.updateOne(
      { _id: exception._id },
      {
        $set: update,
        $push: {
          audit: {
            at: now,
            byUserId: req.user.id,
            action: action === "OVERRIDE" ? "MANUAL_OVERRIDE" : "DISMISS",
            changes: { status },
          },
        },
      }
    );

    const openExceptions = await EVVException.find({
      agencyId: req.agencyId,
      visitId: exception.visitId,
      status: "OPEN",
    })
      .sort({ severityRank: -1, occurredAt: -1 })
      .lean();

    const resolvedCount = await EVVException.countDocuments({
      agencyId: req.agencyId,
      visitId: exception.visitId,
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
      { _id: exception.visitId, agencyId: req.agencyId },
      { $set: { evvStatus, evvExceptions: evvExceptionsSummary } }
    );

    const updated = await EVVException.findOne({ _id: exception._id }).lean();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function createManualException(req, res) {
  try {
    const { visitId, type, severity, reasonCode, note, occurredAt } = req.body || {};
    if (!isValidObjectId(visitId)) {
      return res.status(400).json({ message: "Invalid visitId" });
    }
    if (!ALLOWED_EXCEPTION_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid exception type" });
    }
    if (!reasonCode || typeof reasonCode !== "string") {
      return res.status(400).json({ message: "reasonCode is required" });
    }
    if (severity && !["LOW", "MEDIUM", "HIGH"].includes(severity)) {
      return res.status(400).json({ message: "Invalid severity" });
    }

    const when = occurredAt ? new Date(occurredAt) : new Date();
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: "Invalid occurredAt" });
    }

    const visit = await Visit.findOne({ _id: visitId, agencyId: req.agencyId }).lean();
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const severityRank = severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 1;
    const existing = await EVVException.findOne({
      agencyId: req.agencyId,
      visitId,
      type,
      status: "OPEN",
    });

    const now = new Date();
    if (existing) {
      await EVVException.updateOne(
        { _id: existing._id },
        {
          $set: {
            severity: severity || existing.severity,
            severityRank: severity ? severityRank : existing.severityRank,
            occurredAt: when,
            meta: {
              ...(existing.meta || {}),
              reasonCode,
              note,
              reportedByUserId: req.user.id,
            },
          },
          $push: {
            audit: {
              at: now,
              byUserId: req.user.id,
              action: "MANUAL_REPORTED",
              changes: { reasonCode, note },
            },
          },
        }
      );
      const updated = await EVVException.findOne({ _id: existing._id }).lean();
      return res.json(updated);
    }

    const created = await EVVException.create({
      agencyId: req.agencyId,
      visitId,
      caregiverId: visit.caregiverId,
      clientId: visit.patientId,
      type,
      status: "OPEN",
      severity: severity || "HIGH",
      severityRank,
      message: "Manually reported EVV exception.",
      occurredAt: when,
      detectedAt: now,
      meta: {
        reasonCode,
        note,
        reportedByUserId: req.user.id,
      },
      audit: [
        {
          at: now,
          byUserId: req.user.id,
          action: "MANUAL_REPORTED",
        },
      ],
    });

    const openExceptions = await EVVException.find({
      agencyId: req.agencyId,
      visitId,
      status: "OPEN",
    })
      .sort({ severityRank: -1, occurredAt: -1 })
      .lean();

    const evvExceptionsSummary = openExceptions.map((ex) => ({
      type: ex.type,
      severity: ex.severity,
      message: ex.message,
      occurredAt: ex.occurredAt,
      meta: ex.meta,
    }));

    await Visit.updateOne(
      { _id: visitId, agencyId: req.agencyId },
      { $set: { evvStatus: "exception", evvExceptions: evvExceptionsSummary } }
    );

    await createAdminNotificationsForNewExceptions([created]);

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function deleteException(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const exception = await EVVException.findOne({
      _id: id,
      agencyId: req.agencyId,
    }).lean();
    if (!exception) return res.status(404).json({ message: "Exception not found" });

    await EVVException.deleteOne({ _id: id, agencyId: req.agencyId });

    const openExceptions = await EVVException.find({
      agencyId: req.agencyId,
      visitId: exception.visitId,
      status: "OPEN",
    })
      .sort({ severityRank: -1, occurredAt: -1 })
      .lean();

    const resolvedCount = await EVVException.countDocuments({
      agencyId: req.agencyId,
      visitId: exception.visitId,
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
      { _id: exception.visitId, agencyId: req.agencyId },
      { $set: { evvStatus, evvExceptions: evvExceptionsSummary } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const updated = await Notification.findOneAndUpdate(
      { _id: id, agencyId: req.agencyId },
      { $set: { status: "read", readAt: new Date() } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Notification not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getSummary(req, res) {
  try {
    const { date } = req.query;
    const range = getDateRange(date);
    if (date && !range) {
      return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
    }

    const visitQuery = { agencyId: req.agencyId };
    if (range) {
      visitQuery.startTime = { $gte: range.start, $lt: range.end };
    }

    const visits = await Visit.find(visitQuery).lean();
    const totalVisits = visits.length;
    const compliantVisits = visits.filter((v) => v.evvStatus === "compliant").length;
    const compliancePct = totalVisits
      ? Math.round((compliantVisits / totalVisits) * 100)
      : 0;

    const visitIds = visits.map((v) => v._id);
    const openExceptions = visitIds.length
      ? await EVVException.find({
          agencyId: req.agencyId,
          status: "OPEN",
          visitId: { $in: visitIds },
        }).lean()
      : [];

    const exceptionsCount = openExceptions.length;
    const breakdown = {
      lateClockIns: 0,
      outsideGeofence: 0,
      missedVisits: 0,
      missingClockOuts: 0,
      manualOverrides: 0,
    };

    for (const ex of openExceptions) {
      if (ex.type === "LATE_CLOCK_IN") breakdown.lateClockIns += 1;
      if (
        ex.type === "OUTSIDE_GEOFENCE_CLOCK_IN" ||
        ex.type === "OUTSIDE_GEOFENCE_CLOCK_OUT"
      ) {
        breakdown.outsideGeofence += 1;
      }
      if (ex.type === "MISSED_VISIT") breakdown.missedVisits += 1;
      if (ex.type === "MISSING_CLOCK_OUT") breakdown.missingClockOuts += 1;
    }

    const manualOverridesCount = await EVVException.countDocuments({
      agencyId: req.agencyId,
      "meta.manualOverride": { $exists: true },
      ...(range ? { occurredAt: { $gte: range.start, $lt: range.end } } : {}),
    });
    breakdown.manualOverrides = manualOverridesCount;

    const exceptionsByVisit = new Map();
    for (const ex of openExceptions) {
      const key = String(ex.visitId);
      if (!exceptionsByVisit.has(key)) exceptionsByVisit.set(key, []);
      exceptionsByVisit.get(key).push(ex);
    }

    let revenueAtRiskCents = 0;
    let visitsAtRisk = 0;
    for (const visit of visits) {
      const exList = exceptionsByVisit.get(String(visit._id));
      if (!exList || !exList.length) continue;
      const riskPct = getRiskPctForExceptions(exList);
      if (riskPct <= 0) continue;
      const value = calculateVisitValueCents(visit);
      if (value <= 0) continue;
      visitsAtRisk += 1;
      revenueAtRiskCents += Math.round(value * riskPct);
    }

    res.json({
      compliancePct,
      exceptionsCount,
      breakdown,
      visitsAffected: exceptionsByVisit.size,
      revenueAtRiskCents,
      visitsAtRisk,
      totalVisits,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function submitVisitForAdjudication(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const adjudicator = normalizeAdjudicator(req.body?.adjudicator || req.query?.adjudicator);
    if (!adjudicator) {
      return res.status(400).json({ message: "Invalid adjudicator" });
    }

    const visitPlan = await VisitPlan.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!visitPlan) {
      const visit = await Visit.findOne({ _id: id, agencyId: req.agencyId }).lean();
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      await VisitPlan.findByIdAndUpdate(
        id,
        {
          $set: {
            agencyId: visit.agencyId,
            scheduledStartUtc: visit.scheduledStartAt || visit.startTime,
            scheduledEndUtc: visit.scheduledEndAt || visit.endTime,
            caregiverId: visit.caregiverId,
            patientId: visit.patientId,
            payerProgram: visit.payerProgram,
            serviceCode: visit.serviceType,
            procedureCode: visit.procedureCode,
            expectedServiceLocation: visit.location
              ? { address: visit.location }
              : undefined,
          },
        },
        { upsert: true }
      );
    }

    await enqueueVisitSubmission({ visitId: id, adjudicator });
    res.json({ success: true, queued: true, adjudicator });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getVisitAdjudication(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const adjudicator = normalizeAdjudicator(req.query?.adjudicator);
    if (!adjudicator) {
      return res.status(400).json({ message: "Invalid adjudicator" });
    }

    const submission = await AdjudicationSubmission.findOne({
      agencyId: req.agencyId,
      visitId: id,
      adjudicator,
    })
      .sort({ submittedAt: -1 })
      .lean();

    res.json({ submission: submission || null });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getVisitCompliance(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    let evaluation = await ComplianceEvaluation.findOne({
      agencyId: req.agencyId,
      visitId: id,
    })
      .sort({ calculatedAt: -1 })
      .lean();

    if (!evaluation) {
      const computed = await computePredictiveComplianceScore(id, {
        agencyId: req.agencyId,
      });
      evaluation = computed?.record || computed || null;
    }

    res.json({ evaluation });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}
