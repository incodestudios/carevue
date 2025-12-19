import { Router } from "express";
import mongoose from "mongoose";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import Visit from "../models/Visit.js";
import Patient from "../models/Patient.js";
import User from "../models/User.js";
import { sendCaregiverScheduleEmail, sendCaregiverNotificationEmail } from "../utils/sendCaregiverScheduleEmail.js";

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
    let { patientId, caregiverId, status, from, to, serviceType, page = 1, limit = 10 } = req.query;

    // Set different limits based on role
    if (req.user.role === "caregiver") {
      limit = 500;
    } else {
      limit = 500;
    }

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
      //console.error("Error listing visits:", err);
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
    //console.error("Error fetching visit:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/agency/schedule/visits
router.post("/", auth, agencyScope, async (req, res) => {
  try {
    
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const {
      patientId,
      caregiverId,
      startTime,
      endTime,
      title,
      location,
      serviceType,
      notes,
      status,
      clockInTime,
      clockOutTime,
      visitDate,
      date,
      notifyCaregiver,
    } = req.body || {};

    if (!isValidObjectId(patientId) || !isValidObjectId(caregiverId)) {
      return res.status(400).json({ message: "Valid patientId and caregiverId are required" });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ message: "startTime and endTime are required" });
    }

    // Accept either full ISO datetimes OR HH:mm with an accompanying date (visitDate/date)
    let start, end;
    const dateStr = visitDate || date;

    if (isTimeOnly(startTime) || isTimeOnly(endTime)) {
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

    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
    if (start < tenMinutesFromNow) {
      return res.status(400).json({
        message: "Cannot schedule a visit in the past. Start time must be at least 10 minutes from now.",
      });
    }

    // Optional clock-in/out times (accepts full datetime or HH:mm with provided date)
    const parseClockTime = (value) => {
      if (!value) return undefined;
      if (isTimeOnly(value)) {
        if (!dateStr) return null;
        return combineDateAndTime(dateStr, value);
      }
      return new Date(value);
    };

    const clockIn = parseClockTime(clockInTime);
    const clockOut = parseClockTime(clockOutTime);
    if (clockIn === null || clockOut === null || Number.isNaN(clockIn?.getTime()) || Number.isNaN(clockOut?.getTime())) {
      return res.status(400).json({
        message:
          "Invalid clockInTime/clockOutTime. Provide full datetime or HH:mm with visitDate/date (YYYY-MM-DD).",
      });
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
      clockInTime: clockIn,
      clockOutTime: clockOut,
      createdBy: req.user.id,
    });

    // Notify caregiver if requested and visit is in the future
    if (notifyCaregiver && start > new Date()) {
      try {
        await sendCaregiverScheduleEmail({
          caregiver,
          patient,
          visit,
          agency: req.agencyId,
        });
      } catch (e) {
       // console.error("Failed to send caregiver schedule email:", e);
      }
    }

    res.status(201).json({visit, message: "Visit created successfully" });
  } catch (err) {
    //console.error("Error creating visit:", err);
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
    const dateStr = update.visitDate || update.date;
    // Protect immutable fields
    ["_id", "agencyId", "createdBy", "updatedBy"].forEach((k) => delete update[k]);

    // Parse times (supports HH:mm with visitDate/date)
    const parseTimeValue = (value) => {
      if (!value) return undefined;
      if (isTimeOnly(value)) {
        if (!dateStr) return null;
        return combineDateAndTime(dateStr, value);
      }
      return new Date(value);
    };

    const isDataUrl = (value) =>
      typeof value === "string" && value.startsWith("data:image/") && value.length <= 5 * 1024 * 1024; // cap ~5MB string

    let start = parseTimeValue(update.startTime);
    let end = parseTimeValue(update.endTime);
    const clockIn = parseTimeValue(update.clockInTime);
    const clockOut = parseTimeValue(update.clockOutTime);
    let caregiverId;
    if (update.caregiverId) caregiverId = update.caregiverId;

    if ([start, end, clockIn, clockOut].some((t) => t === null || Number.isNaN(t?.getTime()))) {
      return res.status(400).json({
        message:
          "Invalid time values. Provide full datetime or HH:mm with visitDate/date (YYYY-MM-DD).",
      });
    }
    if (start && end && end <= start) {
      return res.status(400).json({ message: "Invalid time range" });
    }
    if (update.signatureDataUrl !== undefined) {
      if (clockOut === undefined) {
        return res.status(400).json({ message: "signatureDataUrl can only be sent with clockOutTime." });
      }
      if (!isDataUrl(update.signatureDataUrl)) {
        return res.status(400).json({ message: "Invalid signatureDataUrl (must be data:image/* and <= 5MB)." });
      }
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
    if (start) update.startTime = start;
    if (end) update.endTime = end;
    if (clockIn !== undefined) update.clockInTime = clockIn;
    if (clockOut !== undefined) update.clockOutTime = clockOut;
    ["visitDate", "date"].forEach((k) => delete update[k]);
    const updated = await Visit.findOneAndUpdate(
      { _id: id, agencyId: req.agencyId },
      { $set: update },
      { new: true }
    );

    // Notify caregiver if requested and visit is in the future
    if (req.body.notifyCaregiver && newStart > new Date()) {
      try {
        const caregiver = await User.findOne({ _id: newCaregiver, agencyId: req.agencyId, role: "caregiver" }).lean();
        await sendCaregiverScheduleEmail({
          caregiver,
          visit: updated,
          agency: req.agencyId,
        });
      } catch (e) {
       // console.error("Failed to send caregiver schedule email here as expected:", e);
      }
    }
    res.json(updated);
  } catch (err) {
    //console.error("Error updating visit:", err);
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

    // Notify caregiver if visit was in the future
    if (deleted.caregiverId && deleted.startTime > new Date()) {
      try {
        const caregiver = await User.findOne({ _id: deleted.caregiverId, agencyId: req.agencyId, role: "caregiver" }).lean();
        if (caregiver) {
          await sendCaregiverScheduleEmail({
            caregiver,
            visit: deleted,
            agency: req.agencyId,
          });
        }
      } catch (e) {
       // console.error("Failed to send caregiver schedule email on delete:", e);
      }
    }

    res.json({ success: true });
  } catch (err) {
    // console.error("Error deleting visit:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Caregiver clock-in/out route
// POST /api/agency/schedule/visits/:id/clock
router.post("/:id/clock", auth, agencyScope, async (req, res) => {
  try {
    // Only caregivers can use this route
    if (req.user.role !== "caregiver" && req.user.role !== "agency_super_admin" && req.user.role !== "agency_admin") {
      return res.status(403).json({ message: "Only caregivers can clock in/out" });
    }
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid visit id" });

    const visit = await Visit.findOne({ _id: id, agencyId: req.agencyId, caregiverId: req.user.id });
    if (!visit) return res.status(404).json({ message: "Visit not found or not assigned to you" });

    const {
      clockInTime,
      clockOutTime,
      note,
      geofenceNotes,
      visitDate,
      date,
      clockInLocation,
      clockOutLocation,
      signatureDataUrl,
    } = req.body || {};

    const dateStr = visitDate || date;
    const parseTimeValue = (value) => {
      if (!value) return undefined;
      if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value)) {
        if (!dateStr) return null;
        return new Date(`${dateStr}T${value}`);
      }
      return new Date(value);
    };
    const clockIn = parseTimeValue(clockInTime);
    const clockOut = parseTimeValue(clockOutTime);
    if ([clockIn, clockOut].some((t) => t === null || Number.isNaN(t?.getTime()))) {
      return res.status(400).json({ message: "Invalid clockInTime/clockOutTime. Provide full datetime or HH:mm with visitDate/date (YYYY-MM-DD)." });
    }

    const isSafeText = (value) => typeof value === "string" && !/[<>$]/.test(value);
    const isDataUrl = (value) =>
      typeof value === "string" && value.startsWith("data:image/") && value.length <= 5 * 1024 * 1024; // cap ~5MB string
    const normalizeLocation = (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      //const trimmed = value.trim();
      return value;
    };

    // Only update provided fields
    const update = {};
    if (clockIn !== undefined) update.clockInTime = clockIn;
    if (clockOut !== undefined) update.clockOutTime = clockOut;
    if (note && note.length) { 
       if(!isSafeText(note)) {
         return res.status(400).json({ message: "Invalid note content." });
       }
       update.notes = note.replace(/['";\\]/g, "\\$&");
      }

    if (clockIn !== undefined) {
      if (geofenceNotes && geofenceNotes.length) {
        if (!isSafeText(geofenceNotes)) {
          return res.status(400).json({ message: "Invalid geofenceNotes content." });
        }
        update.geofenceNotes = geofenceNotes.replace(/['";\\]/g, "\\$&");
        update.geofenceNotesClockIn = geofenceNotes;
      }
    }
    if (clockOut !== undefined) {
      
      if (geofenceNotes && geofenceNotes.length) {
        if (!isSafeText(geofenceNotes)) {
          return res.status(400).json({ message: "Invalid geofenceNotes content." });
        }
        update.geofenceNotes = geofenceNotes.replace(/['";\\]/g, "\\$&");
        update.geofenceNotesClockOut = geofenceNotes;
      }
    }

    const normalizedClockInLocation = normalizeLocation(clockInLocation);
    if (normalizedClockInLocation === null) {
      return res.status(400).json({ message: "Invalid clockInLocation content (must be a string up to 500 chars)." });
    }
    if (normalizedClockInLocation !== undefined) {
      update.clockInLocation = normalizedClockInLocation;
    }

    const normalizedClockOutLocation = normalizeLocation(clockOutLocation);
    if (normalizedClockOutLocation === null) {
      return res.status(400).json({ message: "Invalid clockOutLocation content (must be a string up to 500 chars)." });
    }
    if (normalizedClockOutLocation !== undefined) {
      update.clockOutLocation = normalizedClockOutLocation;
    }

    if (signatureDataUrl !== undefined) {
      if (clockOut === undefined) {
        return res.status(400).json({ message: "signatureDataUrl can only be sent with clockOutTime." });
      }
      if (!isDataUrl(signatureDataUrl)) {
        return res.status(400).json({ message: "Invalid signatureDataUrl (must be data:image/* and <= 5MB)." });
      }
      update.signatureDataUrl = signatureDataUrl;
    }

    update.updatedBy = req.user.id;

    const updated = await Visit.findOneAndUpdate(
      { _id: id, agencyId: req.agencyId, caregiverId: req.user.id },
      { $set: update },
      { new: true }
    );
    res.json({ message: "Clock-in/out updated", visit: updated });
  } catch (err) {
    // console.error("Error clocking in/out:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/agency/schedule/visits/:id/notify-clock-in
// Sends a reminder email to the assigned caregiver to clock in
router.post("/:id/notify-clock-in", auth, agencyScope, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid visit id" });

    const visit = await Visit.findOne({ _id: id, agencyId: req.agencyId })
      .populate("caregiverId", "firstName lastName email")
      .populate("patientId", "firstName lastName addressLine1 addressLine2 city state zipCode")
      .lean();
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const caregiver = visit.caregiverId;
    const patient = visit.patientId;
    const isOwnVisit = String(caregiver?._id || caregiver) === String(req.user.id);
    const isAdmin = ADMIN_ROLES.includes(req.user.role);
    if (!isAdmin && !(req.user.role === "caregiver" && isOwnVisit)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const startTime = new Date(visit.startTime);
    const startLabel = Number.isNaN(startTime.getTime()) ? "your upcoming visit" : startTime.toLocaleString();
    const patientName =
      patient && (patient.firstName || patient.lastName)
        ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim()
        : "your patient";

    const message =
      `Hi ${caregiver.firstName},\n\n` +
      `It's time to clock in for your visit with ${patientName} scheduled for ${startLabel}.\n` +
      `Please log into CareVue to complete your clock-in.\n\n` +
      `Thank you,\nCareVue Team`;

    await sendCaregiverNotificationEmail({
      caregiver,
      subject: "Time to clock in",
      text: message,
    });

    res.json({ message: "Clock-in notification sent" });
  } catch (err) {
    // console.error("Error sending clock-in email:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/schedule/visits/caregivers/:caregiverId/clocked-in
// Returns { clockedIn: true/false, visit } for the caregiver
router.get("/caregivers/:caregiverId/clocked-in", auth, agencyScope, async (req, res) => {
  try {
    const { caregiverId } = req.params;
    if (!isValidObjectId(caregiverId)) return res.status(400).json({ message: "Invalid caregiver id" });

    // Only allow self or admin roles
    if (
      req.user.role === "caregiver" && String(req.user.id) !== String(caregiverId)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const now = new Date();
    const visit = await Visit.findOne({
      caregiverId,
      agencyId: req.agencyId,
      clockInTime: { $ne: null },
      clockOutTime: null,
      startTime: { $lte: now },
      endTime: { $gte: now },
    })
      .populate("patientId", "firstName lastName")
      .lean();

    res.json({ clockedIn: !!visit, visit });
  } catch (err) {
    // console.error("Error checking caregiver clock-in status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/schedule/visits/caregivers/:caregiverId/clocked-out
// Returns { clockedOut: true/false, activeVisit } for the caregiver
router.get("/caregivers/:caregiverId/clocked-out", auth, agencyScope, async (req, res) => {
  try {
    const { caregiverId } = req.params;
    if (!isValidObjectId(caregiverId)) return res.status(400).json({ message: "Invalid caregiver id" });

    // Only allow self or admin roles
    if (
      req.user.role === "caregiver" && String(req.user.id) !== String(caregiverId)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const now = new Date();
    // Find any active visit (clocked in, not clocked out, and now within visit window)
    const activeVisit = await Visit.findOne({
      caregiverId,
      agencyId: req.agencyId,
      clockInTime: { $ne: null },
      clockOutTime: null,
      startTime: { $lte: now },
      endTime: { $gte: now },
    })
      .populate("patientId", "firstName lastName")
      .lean();

    // If no active visit, user is clocked out
    res.json({ clockedOut: !activeVisit, activeVisit });
  } catch (err) {
    // console.error("Error checking caregiver clock-out status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/schedule/visits/caregivers/:caregiverId/visit/:visitId/note
// Returns the note for a caregiver and visit on a specific date
router.get("/caregivers/:caregiverId/visit/:visitId/note", auth, agencyScope, async (req, res) => {
  try {
  const { caregiverId, visitId } = req.params;
    if (!isValidObjectId(caregiverId) || !isValidObjectId(visitId)) {
      return res.status(400).json({ message: "Invalid caregiver or visit id" });
    }
    // Only allow self or admin roles
    if (
      req.user.role === "caregiver" && String(req.user.id) !== String(caregiverId)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    // Find the visit for this caregiver, visitId, and agency
    const visit = await Visit.findOne({
      _id: visitId,
      caregiverId,
      agencyId: req.agencyId,
    }).lean();
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    // Require clock-in and clock-out before returning note
    if (!visit.clockInTime || !visit.clockOutTime) {
      return res.status(403).json({ message: "Caregiver must be clocked in and clocked out for this visit before viewing the note." });
    }

    // Return note (not notes)
    res.json({ note: visit.notes || "" });
  } catch (err) {
    // console.error("Error fetching visit note:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/schedule/visits/caregivers/:caregiverId/patients
// Returns patients that have visits with the given caregiver (scoped to agency)
router.get("/caregivers/:caregiverId/patients", auth, agencyScope, async (req, res) => {
  try {
    const { caregiverId } = req.params;
    if (!isValidObjectId(caregiverId)) return res.status(400).json({ message: "Invalid caregiver id" });

    // Caregivers can only view their own assignments
    if (req.user.role === "caregiver" && String(req.user.id) !== String(caregiverId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Ensure caregiver belongs to agency
    const caregiver = await User.findOne({ _id: caregiverId, agencyId: req.agencyId, role: "caregiver" }).lean();
    if (!caregiver) return res.status(404).json({ message: "Caregiver not found" });

    const patientIds = await Visit.find({ agencyId: req.agencyId, caregiverId }).distinct("patientId");
    if (!patientIds.length) return res.json([]);

    const patients = await Patient.find({ _id: { $in: patientIds }, agencyId: req.agencyId })
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    res.json(patients);
  } catch (err) {
    // console.error("Error fetching patients for caregiver:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
