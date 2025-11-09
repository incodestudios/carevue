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
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/agency/patients/with-caregivers
// Returns patients along with assigned caregivers (primary flagged)
router.get("/with-caregivers", auth, agencyScope, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;

    // caregiver role sees only assigned patients
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

      const caregiversByPatient = await PatientCaregiver.find({
        agencyId: req.agencyId,
        patientId: { $in: patients.map((p) => p._id) },
      })
        .populate("caregiverId", "firstName lastName email")
        .lean();

      const grouped = patients.map((p) => {
        const assns = caregiversByPatient
          .filter((a) => String(a.patientId) === String(p._id))
          .map((a) => ({
            caregiverId: a.caregiverId?._id,
            firstName: a.caregiverId?.firstName,
            lastName: a.caregiverId?.lastName,
            email: a.caregiverId?.email,
            isPrimary: a.isPrimary,
          }));
        const primary = assns.find((a) => a.isPrimary) || assns[0] || null;
        return { ...p, caregivers: assns, primaryCaregiver: primary };
      });

      return res.json(grouped);
    }

    // admins: all patients in agency
    const patients = await Patient.find({ agencyId: req.agencyId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const caregiversByPatient = await PatientCaregiver.find({
      agencyId: req.agencyId,
      patientId: { $in: patients.map((p) => p._id) },
    })
      .populate("caregiverId", "firstName lastName email")
      .lean();

    const grouped = patients.map((p) => {
      const assns = caregiversByPatient
        .filter((a) => String(a.patientId) === String(p._id))
        .map((a) => ({
          caregiverId: a.caregiverId?._id,
          firstName: a.caregiverId?.firstName,
          lastName: a.caregiverId?.lastName,
          email: a.caregiverId?.email,
          isPrimary: a.isPrimary,
        }));
      const primary = assns.find((a) => a.isPrimary) || assns[0] || null;
      return { ...p, caregivers: assns, primaryCaregiver: primary };
    });

    return res.json(grouped);
  } catch (err) {
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
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/agency/patients
router.post("/register", auth, agencyScope, async (req, res) => {
  try {
    // allow only admin-level roles
    const allowedRoles = ["super_admin", "agency_super_admin", "agency_admin"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You are not allowed to add patients" });
    }

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ message: "Request body is required and must be JSON" });
    }

    const {
      // identity
      firstName,
      middleName,
      lastName,
      bloodGroup,
      age,
      dob,
      patientType,
      gender,
      companyName,
      maritalStatus,
      phone,
      emergencyPhone,
      guardianName,
      // address (flattened) + legacy address + contact
      addressLine1,
      addressLine2,
      country,
      city,
      state,
      zipCode,
      address,
      contactPerson,
      // referral & dept
      referredBy,
      referredOn,
      department,
      notes,
      // vitals
      temperature,
      pulse,
      respiratoryRate,
      spo2,
      height,
      weight,
      bmi,
      waist,
      bsa,
      vitalsNotes,
      // medical history 1 & 2
      mh1Type,
      mh1Reason,
      mh1Date,
      mh1Hospital,
      mh1Assessment,
      mh1Notes,
      mh2Type,
      mh2Reason,
      mh2Date,
      mh2Hospital,
      mh2Assessment,
      mh2Notes,
      // health conditions & allergies
      overallHealthCondition,
      hasHealthCondition,
      healthConditionDetails,
      hasAllergies,
      allergyDetails,
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "firstName and lastName are required" });
    }

    const patient = await Patient.create({
      agencyId: req.agencyId,
      createdBy: req.user.id,
      // identity
      firstName,
      middleName,
      lastName,
      bloodGroup,
      age,
      dob,
      patientType,
      gender,
      companyName,
      maritalStatus,
      phone,
      emergencyPhone,
      guardianName,
      // address & contact
      addressLine1,
      addressLine2,
      country,
      city,
      state,
      zipCode,
      address, // keep legacy nested support
      contactPerson,
      // referral & dept
      referredBy,
      referredOn,
      department,
      notes,
      // vitals
      temperature,
      pulse,
      respiratoryRate,
      spo2,
      height,
      weight,
      bmi,
      waist,
      bsa,
      vitalsNotes,
      // medical history
      mh1Type,
      mh1Reason,
      mh1Date,
      mh1Hospital,
      mh1Assessment,
      mh1Notes,
      mh2Type,
      mh2Reason,
      mh2Date,
      mh2Hospital,
      mh2Assessment,
      mh2Notes,
      // health conditions & allergies
      overallHealthCondition,
      hasHealthCondition,
      healthConditionDetails,
      hasAllergies,
      allergyDetails,
    });

    return res.status(201).json(patient);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
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

// PATCH /api/agency/patients/:id (partial update)
router.patch("/:id", auth, agencyScope, async (req, res) => {
  try {
    // allow only admin-level roles
    const allowedRoles = ["super_admin", "agency_super_admin", "agency_admin"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You are not allowed to update patients" });
    }

    if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "Request body must contain at least one field" });
    }

    // Prevent changes to protected/derived fields
    const update = { ...req.body };
    const disallowed = ["_id", "agencyId", "createdBy", "caregiversCount", "primaryCaregiverId"];
    disallowed.forEach((k) => {
      if (k in update) delete update[k];
    });

    // Auto-calculate BMI if height (cm) and weight (kg) present but bmi omitted
    if (update.height && update.weight && !update.bmi) {
      const hMeters = Number(update.height) / 100;
      const wKg = Number(update.weight);
      if (hMeters > 0 && wKg > 0) {
        update.bmi = Number((wKg / (hMeters * hMeters)).toFixed(2));
      }
    }

    const updated = await Patient.findOneAndUpdate(
      { _id: req.params.id, agencyId: req.agencyId },
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;