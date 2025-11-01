import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import Patient from "../models/Patient.js";

const router = Router();

// GET /api/agency/patients
router.get("/", auth, agencyScope, async (req, res) => {
  const { limit = 50, page = 1 } = req.query;
  const patients = await Patient.find({ agencyId: req.agencyId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json(patients);
});

// GET /api/agency/patients/:id
router.get("/:id", auth, agencyScope, async (req, res) => {
  const patient = await Patient.findOne({
    _id: req.params.id,
    agencyId: req.agencyId,
  }).lean();
  if (!patient) return res.status(404).json({ message: "Not found" });
  res.json(patient);
});

// POST /api/agency/patients
router.post("/", auth, agencyScope, async (req, res) => {
  const { firstName, lastName, dob, address, contactPerson, notes } = req.body;

  const patient = await Patient.create({
    agencyId: req.agencyId,
    firstName,
    lastName,
    dob,
    address,
    contactPerson,
    notes,
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