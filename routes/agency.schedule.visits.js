import { Router } from "express";
import mongoose from "mongoose";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import Visit from "../models/Visit.js";
import Patient from "../models/Patient.js";
import User from "../models/User.js";

const router = Router();

const ADMIN_ROLES = ["super_admin", "agency_super_admin", "agency_admin"];

function isValidObjectId(id) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

// Helpers for time parsing
function isTimeOnly(str) {
  return typeof str === "string" && /^\d{1,2}:\d{2}$/.test(str);
}
function combineDateAndTime(dateStr, timeStr) {
  // Expects dateStr like YYYY-MM-DD and timeStr like HH:mm
  return new Date(`${dateStr}T${timeStr}`);
}

// Helper: check caregiver time conflicts within agency
async function hasConflict({ agencyId, caregiverId, startTime, endTime, excludeId }) {
  const overlap = await Visit.findOne({
    agencyId,
    caregiverId,
    _id: excludeId ? { $ne: excludeId } : { $exists: true },
    $or: [
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } }, // general overlap
    ],
  }).lean();
  return !!overlap;
}

// GET /api/agency/schedule/visits
// Optional filters: patientId, caregiverId, status, from, to, page, limit
router.get("/", auth, agencyScope, async (req, res) => {
  try {
    const { patientId, caregiverId, status, from, to, serviceType, page = 1, limit = 50 } = req.query;

    const q = { agencyId: req.agencyId };

    // Caregivers can only view their own visits
    if (req.user.role === "caregiver") {
      q.caregiverId = req.user.id;
    } else if (caregiverId && isValidObjectId(caregiverId)) {
      q.caregiverId = caregiverId;
    }

    if (patientId && isValidObjectId(patientId)) q.patientId = patientId;
  if (status) q.status = status;
  if (serviceType) q.serviceType = serviceType;

    if (from || to) {
      q.startTime = {};
      if (from) q.startTime.$gte = new Date(from);
      if (to) q.startTime.$lte = new Date(to);
    }

    const items = await Visit.find(q)
      .sort({ startTime: 1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate("patientId", "firstName lastName")
      .populate("caregiverId", "firstName lastName email")
      .lean();

    res.json(items);
  } catch (err) {
    console.error("Error listing visits:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/schedule/visits/:id
router.get("/:id", auth, agencyScope, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const visit = await Visit.findOne({ _id: id, agencyId: req.agencyId })
      .populate("patientId", "firstName lastName")
      .populate("caregiverId", "firstName lastName email")
      .lean();

    if (!visit) return res.status(404).json({ message: "Visit not found" });

    // Caregiver can only view own visit
    if (req.user.role === "caregiver" && String(visit.caregiverId?._id || visit.caregiverId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(visit);
  } catch (err) {
    console.error("Error fetching visit:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/agency/schedule/visits
router.post("/", auth, agencyScope, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

  const { patientId, caregiverId, startTime, endTime, title, location, serviceType, notes, status } = req.body || {};

    console.log("StartTime:", startTime, "EndTime:", endTime);

    if (!isValidObjectId(patientId) || !isValidObjectId(caregiverId)) {
      return res.status(400).json({ message: "Valid patientId and caregiverId are required" });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ message: "startTime and endTime are required" });
    }

    // Accept either full ISO datetimes OR HH:mm with an accompanying date (visitDate/date)
    let start, end;
    if (isTimeOnly(startTime) || isTimeOnly(endTime)) {
      const dateStr = req.body?.visitDate || req.body?.date;
      if (!dateStr) {
        return res.status(400).json({
          message:
            "When providing time-only values (HH:mm), include 'visitDate' (YYYY-MM-DD) in the request body, or send full ISO datetimes for startTime/endTime.",
        });
      }
      start = combineDateAndTime(dateStr, startTime);
      end = combineDateAndTime(dateStr, endTime);
    } else {
      start = new Date(startTime);
      end = new Date(endTime);
    }

    if (Number.isNaN(start?.getTime()) || Number.isNaN(end?.getTime()) || end <= start) {
      return res.status(400).json({ message: "Invalid time range" });
    }

    // Ensure patient and caregiver belong to agency
    const [patient, caregiver] = await Promise.all([
      Patient.findOne({ _id: patientId, agencyId: req.agencyId }).lean(),
      User.findOne({ _id: caregiverId, agencyId: req.agencyId, role: "caregiver" }).lean(),
    ]);
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    if (!caregiver) return res.status(404).json({ message: "Caregiver not found" });

    // Conflict check for caregiver
    const conflict = await hasConflict({ agencyId: req.agencyId, caregiverId, startTime: start, endTime: end });
    if (conflict) return res.status(409).json({ message: "Caregiver has overlapping visit" });

    const visit = await Visit.create({
      agencyId: req.agencyId,
      patientId,
      caregiverId,
      startTime: start,
      endTime: end,
      title,
      location,
      serviceType,
      status: status || "scheduled",
      notes,
      createdBy: req.user.id,
    });

    res.status(201).json(visit);
  } catch (err) {
    console.error("Error creating visit:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/agency/schedule/visits/:id
router.patch("/:id", auth, agencyScope, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const update = { ...req.body };
    // Protect immutable fields
    ["_id", "agencyId", "createdBy", "updatedBy"].forEach((k) => delete update[k]);

    // Validate times and conflict if changing time/caregiver
    let start, end, caregiverId;
    if (update.startTime) start = new Date(update.startTime);
    if (update.endTime) end = new Date(update.endTime);
    if (update.caregiverId) caregiverId = update.caregiverId;

    if ((start && isNaN(start)) || (end && isNaN(end))) {
      return res.status(400).json({ message: "Invalid time values" });
    }
    if (start && end && end <= start) {
      return res.status(400).json({ message: "Invalid time range" });
    }

    const existing = await Visit.findOne({ _id: id, agencyId: req.agencyId });
    if (!existing) return res.status(404).json({ message: "Visit not found" });

    const newStart = start || existing.startTime;
    const newEnd = end || existing.endTime;
    const newCaregiver = caregiverId || existing.caregiverId;

    const conflict = await hasConflict({
      agencyId: req.agencyId,
      caregiverId: newCaregiver,
      startTime: newStart,
      endTime: newEnd,
      excludeId: existing._id,
    });
    if (conflict) return res.status(409).json({ message: "Caregiver has overlapping visit" });

    update.updatedBy = req.user.id;
    const updated = await Visit.findOneAndUpdate(
      { _id: id, agencyId: req.agencyId },
      { $set: update },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error("Error updating visit:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/agency/schedule/visits/:id
router.delete("/:id", auth, agencyScope, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const deleted = await Visit.findOneAndDelete({ _id: id, agencyId: req.agencyId });
    if (!deleted) return res.status(404).json({ message: "Visit not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting visit:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
