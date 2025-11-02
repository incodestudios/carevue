import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import Patient from "../models/Patient.js";
import PatientCaregiver from "../models/PatientCaregiver.js";

const router = Router();

// GET /api/agency/patients
router.get("/", auth, agencyScope, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;

    // If caregiver, return only assigned patients
    if (req.user.role === "caregiver") {
      const assignments = await PatientCaregiver.find({
        caregiverId: req.user.id,
        agencyId: req.agencyId,
      }).select("patientId");

      const patientIds = assignments.map((a) => a.patientId);

      const patients = await Patient.find({
        _id: { $in: patientIds },
        agencyId: req.agencyId,
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean();

      return res.json(patients);
    }

    // Otherwise (admins/super_admins), return all agency patients
    const patients = await Patient.find({ agencyId: req.agencyId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    return res.json(patients);
  } catch (err) {
    console.error("Error fetching patients:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/patients/:id
router.get("/:id", auth, agencyScope, async (req, res) => {
  try {
    // 🧩 1. If caregiver, check assignment
    if (req.user.role === "caregiver") {
      const assignment = await PatientCaregiver.findOne({
        caregiverId: req.user.id,
        patientId: req.params.id,
        agencyId: req.agencyId,
      });

      // if no assignment, deny access
      if (!assignment) {
        return res.status(403).json({ message: "Access denied — not assigned to this patient" });
      }
    }

    // 🧩 2. Fetch patient within same agency
    const patient = await Patient.findOne({
      _id: req.params.id,
      agencyId: req.agencyId,
    }).lean();

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // 🧩 3. Return the patient data
    return res.json(patient);
  } catch (err) {
    console.error("Error fetching patient:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/agency/patients
router.post("/", auth, agencyScope, async (req, res) => {
  const { firstName, lastName, dob, address, contactPerson, notes } = req.body;

  // allow only admin-level roles
  const allowedRoles = ["super_admin", "agency_super_admin", "agency_admin"];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: "You are not allowed to add patients" });
  }

  const patient = await Patient.create({
    agencyId: req.agencyId,
    firstName,
    lastName,
    dob,
    address,
    contactPerson,
    notes,
    createdBy: req.user.id
  });

  res.status(201).json(patient);
});

// PUT /api/agency/patients/:id
router.put("/:id", auth, agencyScope, async (req, res) => {
  const updated = await Patient.findOneAndUpdate(
    { _id: req.params.id, agencyId: req.agencyId },
    req.body,
    { new: true }
  );
  if (!updated) return res.status(404).json({ message: "Not found" });
  res.json(updated);
});

export default router;