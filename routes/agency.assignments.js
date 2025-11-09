import { Router } from "express";
import mongoose from "mongoose";
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

    // 4) prevent duplicate assignment of same caregiver to same patient
    const existing = await PatientCaregiver.findOne({
      agencyId: req.agencyId,
      patientId,
      caregiverId,
    });
    if (existing) {
      return res.status(400).json({ message: "Caregiver already assigned to patient" });
    }

    // 5) create assignment
    const assignment = await PatientCaregiver.create({
      agencyId: req.agencyId,
      patientId,
      caregiverId,
      isPrimary: !!isPrimary,
      createdBy: req.user.id,
    });

    // 6) reflect on Patient document (caregiversCount & primaryCaregiverId)
    const inc = 1;
    const update = { $inc: { caregiversCount: inc } };
    if (isPrimary) {
      update.$set = { primaryCaregiverId: caregiverId };
    }
    await Patient.updateOne({ _id: patientId }, update);

    res.status(201).json(assignment);
  }
);

// DELETE /api/agency/patients/:patientId/caregivers/:caregiverId
router.delete(
  "/patients/:patientId/caregivers/:caregiverId",
  auth,
  agencyScope,
  async (req, res) => {
    try {
      const { patientId, caregiverId } = req.params;

      // Validate ObjectId formats
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({ message: "Invalid patientId" });
      }
      if (!mongoose.Types.ObjectId.isValid(caregiverId)) {
        return res.status(400).json({ message: "Invalid caregiverId" });
      }

      // Ensure patient exists within agency
      const patient = await Patient.findOne({ _id: patientId, agencyId: req.agencyId });
      if (!patient) {
        return res.status(404).json({ message: "Patient not found in this agency" });
      }

      // NOTE: We don't need to fetch the caregiver separately.
      // If an assignment exists scoped by agencyId, patientId, caregiverId,
      // then we can safely remove it even if the caregiver's role changed
      // or the caregiver record is missing (cleanup scenario).

      // Attempt deletion of the assignment
      /*const deleted = await PatientCaregiver.findOneAndDelete({

        agencyId: req.agencyId,
        patientId,
        caregiverId,
      });*/

      // Support deleting by either assignment _id OR caregiverId (user id)
      const oid = new mongoose.Types.ObjectId(caregiverId);
      const deleted = await PatientCaregiver.findOneAndDelete({
        agencyId: req.agencyId,
        patientId,
        $or: [{ _id: oid }, { caregiverId: oid }],
      });

      if (!deleted) {
        // Provide additional context for easier debugging on the client
        const existingAssignments = await PatientCaregiver.countDocuments({
          agencyId: req.agencyId,
          patientId,
        });
        return res.status(404).json({
          message: "Assignment not found",
          info: {
            assignmentsForPatient: existingAssignments,
          },
        });
      }

      // adjust patient reflection fields
      const patientUpdate = { $inc: { caregiversCount: -1 } };
      if (deleted.isPrimary) {
        patientUpdate.$unset = { primaryCaregiverId: "" };
      }
      await Patient.updateOne({ _id: patientId }, patientUpdate);
      return res.json({ message: "Assignment removed successfully", success: true });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// PATCH /api/agency/patients/:patientId/caregivers/:caregiverId/primary
// Sets this caregiver as primary (unsets others)
router.patch(
  "/patients/:patientId/caregivers/:caregiverId/primary",
  auth,
  agencyScope,
  async (req, res) => {
    const { patientId, caregiverId } = req.params;

    // verify patient & caregiver belong to agency
    const assignment = await PatientCaregiver.findOne({
      agencyId: req.agencyId,
      patientId,
      caregiverId,
    });
    if (!assignment)
      return res.status(404).json({ message: "Assignment not found" });

    // unset existing primary
    await PatientCaregiver.updateMany(
      { agencyId: req.agencyId, patientId, isPrimary: true },
      { $set: { isPrimary: false } }
    );

    assignment.isPrimary = true;
    await assignment.save();

    // reflect primaryCaregiverId in patient
    await Patient.updateOne(
      { _id: patientId },
      { $set: { primaryCaregiverId: caregiverId } }
    );

    return res.json({ success: true, assignment });
  }
);

export default router;
