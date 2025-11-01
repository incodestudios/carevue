import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import PatientCaregiver from "../models/PatientCaregiver.js";
import User from "../models/User.js";
import Patient from "../models/Patient.js";

const router = Router();


// GET /api/agency/patients/:patientId/caregivers
router.get(
  "/patients/:patientId/caregivers",
  auth,
  agencyScope,
  async (req, res) => {
    const { patientId } = req.params;

    // verify patient belongs to this agency
    const patient = await Patient.findOne({
      _id: patientId,
      agencyId: req.agencyId,
    });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const assignments = await PatientCaregiver.find({
      agencyId: req.agencyId,
      patientId,
    })
      .populate("caregiverId", "firstName lastName email")
      .lean();

    // normalize for frontend
    const result = assignments.map((a) => ({
      _id: a._id,
      caregiverId: a.caregiverId._id,
      caregiver: a.caregiverId,
      isPrimary: a.isPrimary,
    }));

    res.json(result);
  }
);

// POST /api/agency/patients/:patientId/caregivers
router.post(
  "/patients/:patientId/caregivers",
  auth,
  agencyScope,
  async (req, res) => {
    const { patientId } = req.params;
    const { caregiverId, isPrimary } = req.body;

    // 1) check patient
    const patient = await Patient.findOne({
      _id: patientId,
      agencyId: req.agencyId,
    });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    // 2) check caregiver belongs to this agency
    const caregiver = await User.findOne({
      _id: caregiverId,
      agencyId: req.agencyId,
      role: "caregiver",
    });
    if (!caregiver)
      return res.status(400).json({ message: "Caregiver not in this agency" });

    // 3) if isPrimary, unset others
    if (isPrimary) {
      await PatientCaregiver.updateMany(
        { patientId, agencyId: req.agencyId, isPrimary: true },
        { $set: { isPrimary: false } }
      );
    }

    // 4) create assignment
    const assignment = await PatientCaregiver.create({
      agencyId: req.agencyId,
      patientId,
      caregiverId,
      isPrimary: !!isPrimary,
      createdBy: req.user.id,
    });

    res.status(201).json(assignment);
  }
);

// DELETE /api/agency/patients/:patientId/caregivers/:caregiverId
router.delete(
  "/patients/:patientId/caregivers/:caregiverId",
  auth,
  agencyScope,
  async (req, res) => {
    const { patientId, caregiverId } = req.params;

    const deleted = await PatientCaregiver.findOneAndDelete({
      agencyId: req.agencyId,
      patientId,
      caregiverId,
    });

    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  }
);

export default router;