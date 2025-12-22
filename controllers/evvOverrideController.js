import mongoose from "mongoose";
import EvvOverride, {
  OVERRIDE_BILLABLE_DECISIONS,
  OVERRIDE_EXCEPTION_TYPES,
  OVERRIDE_REASON_CODES,
  OVERRIDE_SEVERITIES,
  OVERRIDE_STATUSES,
} from "../models/EvvOverride.js";
import EvvOverrideNote, { OVERRIDE_NOTE_TYPES } from "../models/EvvOverrideNote.js";
import EvvAuditEvent from "../models/EvvAuditEvent.js";
import User from "../models/User.js";
import Visit from "../models/Visit.js";
import {
  applyOverrideToVisit,
  createAuditEvent,
  isPayrollLocked,
  runWithOptionalTransaction,
} from "../services/evvOverrideService.js";

function isValidObjectId(id) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
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

function normalizeStatusFilter(status) {
  if (!status) return null;
  const list = Array.isArray(status) ? status : String(status).split(",");
  const statuses = list.map((value) => String(value).trim()).filter(Boolean);
  if (!statuses.length) return null;
  const invalid = statuses.filter((value) => !OVERRIDE_STATUSES.includes(value));
  if (invalid.length) {
    return { error: `Invalid status: ${invalid.join(", ")}` };
  }
  return { statuses };
}

export async function listOverrides(req, res) {
  try {
    const {
      status,
      exceptionType,
      caregiverId,
      clientId,
      visitId,
      assignedOwnerUserId,
      requestedByUserId,
      billableDecision,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy,
      sortDir,
    } = req.query;

    const q = { agencyId: req.agencyId };

    if (req.user.role === "caregiver") {
      q.caregiverId = req.user.id;
    } else if (caregiverId) {
      if (!isValidObjectId(caregiverId)) {
        return res.status(400).json({ message: "Invalid caregiverId" });
      }
      q.caregiverId = caregiverId;
    }

    if (clientId) {
      if (!isValidObjectId(clientId)) {
        return res.status(400).json({ message: "Invalid clientId" });
      }
      q.clientId = clientId;
    }

    if (visitId) {
      if (!isValidObjectId(visitId)) {
        return res.status(400).json({ message: "Invalid visitId" });
      }
      q.visitId = visitId;
    }

    if (assignedOwnerUserId) {
      if (!isValidObjectId(assignedOwnerUserId)) {
        return res.status(400).json({ message: "Invalid assignedOwnerUserId" });
      }
      q.assignedOwnerUserId = assignedOwnerUserId;
    }

    if (requestedByUserId) {
      if (!isValidObjectId(requestedByUserId)) {
        return res.status(400).json({ message: "Invalid requestedByUserId" });
      }
      q.requestedByUserId = requestedByUserId;
    }

    if (billableDecision) {
      if (!OVERRIDE_BILLABLE_DECISIONS.includes(billableDecision)) {
        return res.status(400).json({ message: "Invalid billableDecision" });
      }
      q.billableDecision = billableDecision;
    }

    if (exceptionType) {
      const list = Array.isArray(exceptionType)
        ? exceptionType
        : String(exceptionType).split(",");
      const types = list.map((value) => String(value).trim()).filter(Boolean);
      const invalid = types.filter((value) => !OVERRIDE_EXCEPTION_TYPES.includes(value));
      if (invalid.length) {
        return res.status(400).json({ message: `Invalid exceptionType: ${invalid.join(", ")}` });
      }
      q.exceptionType = types.length === 1 ? types[0] : { $in: types };
    }

    if (status) {
      const statusFilter = normalizeStatusFilter(status);
      if (statusFilter?.error) {
        return res.status(400).json({ message: statusFilter.error });
      }
      if (statusFilter?.statuses?.length === 1) {
        q.status = statusFilter.statuses[0];
      } else if (statusFilter?.statuses?.length) {
        q.status = { $in: statusFilter.statuses };
      }
    }

    const startRange = startDate ? getDateRange(startDate) : null;
    const endRange = endDate ? getDateRange(endDate) : null;
    if ((startDate && !startRange) || (endDate && !endRange)) {
      return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
    }
    if (startRange || endRange) {
      q.createdAt = {
        ...(startRange ? { $gte: startRange.start } : {}),
        ...(endRange ? { $lt: endRange.end } : {}),
      };
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const sortField = ["createdAt", "updatedAt", "status"].includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = String(sortDir).toLowerCase() === "asc" ? 1 : -1;

    const total = await EvvOverride.countDocuments(q);
    const items = await EvvOverride.find(q)
      .sort({ [sortField]: sortDirection })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getOverride(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    if (req.user.role === "caregiver" && String(override.caregiverId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [notes, auditEvents] = await Promise.all([
      EvvOverrideNote.find({ overrideId: id, agencyId: req.agencyId }).sort({ createdAt: 1 }).lean(),
      EvvAuditEvent.find({ entityType: "OVERRIDE", entityId: id, agencyId: req.agencyId })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    res.json({ ...override, notes, auditEvents });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function createOverride(req, res) {
  try {
    const {
      visitId,
      exceptionType,
      severity,
      requestedChange,
      reasonCode,
      reasonText,
    } = req.body || {};

    if (!isValidObjectId(visitId)) {
      return res.status(400).json({ message: "Invalid visitId" });
    }
    if (!OVERRIDE_EXCEPTION_TYPES.includes(exceptionType)) {
      return res.status(400).json({ message: "Invalid exceptionType" });
    }
    if (severity && !OVERRIDE_SEVERITIES.includes(severity)) {
      return res.status(400).json({ message: "Invalid severity" });
    }
    if (!requestedChange?.field || typeof requestedChange.field !== "string") {
      return res.status(400).json({ message: "requestedChange.field is required" });
    }
    if (!OVERRIDE_REASON_CODES.includes(reasonCode)) {
      return res.status(400).json({ message: "Invalid reasonCode" });
    }

    const visit = await Visit.findOne({ _id: visitId, agencyId: req.agencyId }).lean();
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const now = new Date();
    const override = {
      agencyId: req.agencyId,
      visitId,
      clientId: visit.patientId,
      caregiverId: visit.caregiverId,
      exceptionType,
      severity: severity || "medium",
      status: "PENDING",
      requestedByUserId: req.user.id,
      requestedChange: {
        field: requestedChange.field,
        before: requestedChange.before,
        after: requestedChange.after,
      },
      reasonCode,
      reasonText: reasonText ? String(reasonText).trim() : null,
      billableDecision: "UNDECIDED",
      coordinatorNotesCount: 0,
    };

    const created = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.create([override], { session });
      const createdOverride = doc[0];

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: createdOverride._id,
        action: "CREATED",
        actorUserId: req.user.id,
        before: null,
        after: {
          status: createdOverride.status,
          exceptionType: createdOverride.exceptionType,
          requestedChange: createdOverride.requestedChange,
        },
        createdAt: now,
      };
      await createAuditEvent({ event: audit, session });

      return createdOverride.toObject();
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function assignOverrideOwner(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { assignedOwnerUserId } = req.body || {};
    if (!isValidObjectId(assignedOwnerUserId)) {
      return res.status(400).json({ message: "Invalid assignedOwnerUserId" });
    }

    const [override, owner] = await Promise.all([
      EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean(),
      User.findOne({ _id: assignedOwnerUserId, agencyId: req.agencyId }).lean(),
    ]);
    if (!override) return res.status(404).json({ message: "Override not found" });
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: { assignedOwnerUserId } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "ASSIGNED",
        actorUserId: req.user.id,
        before: { assignedOwnerUserId: override.assignedOwnerUserId || null },
        after: { assignedOwnerUserId },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function requestOverrideExplanation(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { message } = req.body || {};
    const noteMessage = message ? String(message).trim() : "Explanation requested.";

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: { status: "NEEDS_INFO" } },
        { new: true, session }
      ).lean();

      const note = {
        overrideId: id,
        agencyId: req.agencyId,
        type: "SYSTEM",
        message: noteMessage,
        createdByUserId: req.user.id,
        createdAt: new Date(),
      };
      if (session) {
        await EvvOverrideNote.create([note], { session });
      } else {
        await EvvOverrideNote.create(note);
      }

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "NEEDS_INFO",
        actorUserId: req.user.id,
        before: { status: override.status },
        after: { status: "NEEDS_INFO" },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function addOverrideNote(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { message, type } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "message is required" });
    }

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const isCaregiver = req.user.role === "caregiver";
    if (isCaregiver && String(override.caregiverId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const noteType = isCaregiver ? "CAREGIVER_EXPLANATION" : type || "COORDINATOR_NOTE";
    if (!OVERRIDE_NOTE_TYPES.includes(noteType)) {
      return res.status(400).json({ message: "Invalid note type" });
    }

    const note = {
      overrideId: id,
      agencyId: req.agencyId,
      type: noteType,
      message: message.trim(),
      createdByUserId: req.user.id,
      createdAt: new Date(),
    };

    const updated = await runWithOptionalTransaction(async (session) => {
      if (session) {
        await EvvOverrideNote.create([note], { session });
      } else {
        await EvvOverrideNote.create(note);
      }

      let doc = override;
      if (noteType === "COORDINATOR_NOTE") {
        doc = await EvvOverride.findOneAndUpdate(
          { _id: id, agencyId: req.agencyId },
          { $inc: { coordinatorNotesCount: 1 } },
          { new: true, session }
        ).lean();
      }

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "NOTE_ADDED",
        actorUserId: req.user.id,
        before: { noteType },
        after: { noteType, message: note.message },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function setOverrideBillable(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { billableDecision } = req.body || {};
    if (!OVERRIDE_BILLABLE_DECISIONS.includes(billableDecision)) {
      return res.status(400).json({ message: "Invalid billableDecision" });
    }

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: { billableDecision } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "BILLABLE_SET",
        actorUserId: req.user.id,
        before: { billableDecision: override.billableDecision },
        after: { billableDecision },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function approveOverride(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    if (await isPayrollLocked()) {
      return res.status(409).json({ message: "Payroll is locked for this period" });
    }

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: { status: "APPROVED" } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "APPROVED",
        actorUserId: req.user.id,
        before: { status: override.status },
        after: { status: "APPROVED" },
      };
      await createAuditEvent({ event: audit, session });

      const visitResult = await applyOverrideToVisit(override, session);
      if (visitResult?.updated) {
        const visitAudit = {
          agencyId: req.agencyId,
          entityType: "VISIT",
          entityId: override.visitId,
          action: "APPROVED",
          actorUserId: req.user.id,
          before: { [visitResult.appliedField]: override.requestedChange.before },
          after: { [visitResult.appliedField]: visitResult.appliedValue },
        };
        await createAuditEvent({ event: visitAudit, session });
      }

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function rejectOverride(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: { status: "REJECTED" } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "REJECTED",
        actorUserId: req.user.id,
        before: { status: override.status },
        after: { status: "REJECTED" },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function markOverrideReviewed(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $set: { status: "REVIEWED" } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "REVIEWED",
        actorUserId: req.user.id,
        before: { status: override.status },
        after: { status: "REVIEWED" },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function addOverrideAttachment(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { attachment } = req.body || {};
    if (!attachment?.id || !attachment?.filename || !attachment?.url) {
      return res.status(400).json({ message: "attachment id, filename, and url are required" });
    }

    const override = await EvvOverride.findOne({ _id: id, agencyId: req.agencyId }).lean();
    if (!override) return res.status(404).json({ message: "Override not found" });

    const newAttachment = {
      id: String(attachment.id),
      filename: String(attachment.filename),
      url: String(attachment.url),
      uploadedByUserId: req.user.id,
      uploadedAt: new Date(),
    };

    const updated = await runWithOptionalTransaction(async (session) => {
      const doc = await EvvOverride.findOneAndUpdate(
        { _id: id, agencyId: req.agencyId },
        { $push: { attachments: newAttachment } },
        { new: true, session }
      ).lean();

      const audit = {
        agencyId: req.agencyId,
        entityType: "OVERRIDE",
        entityId: id,
        action: "NOTE_ADDED",
        actorUserId: req.user.id,
        before: { attachmentsCount: override.attachments?.length || 0 },
        after: { attachmentsCount: (override.attachments?.length || 0) + 1 },
      };
      await createAuditEvent({ event: audit, session });

      return doc;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getOverrideSummary(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const match = { agencyId: req.agencyId };

    const startRange = startDate ? getDateRange(startDate) : null;
    const endRange = endDate ? getDateRange(endDate) : null;
    if ((startDate && !startRange) || (endDate && !endRange)) {
      return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)." });
    }
    if (startRange || endRange) {
      match.createdAt = {
        ...(startRange ? { $gte: startRange.start } : {}),
        ...(endRange ? { $lt: endRange.end } : {}),
      };
    }

    if (req.user.role === "caregiver") {
      match.caregiverId = new mongoose.Types.ObjectId(req.user.id);
    }

    const [byStatus, byReasonCode, byCaregiver] = await Promise.all([
      EvvOverride.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      EvvOverride.aggregate([
        { $match: match },
        { $group: { _id: "$reasonCode", count: { $sum: 1 } } },
      ]),
      EvvOverride.aggregate([
        { $match: match },
        { $group: { _id: "$caregiverId", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({ byStatus, byReasonCode, byCaregiver });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}
