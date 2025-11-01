import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import User from "../models/User.js";

const router = Router();

// GET /api/agency/caregivers
router.get("/", auth, agencyScope, async (req, res) => {
  const caregivers = await User.find({
    agencyId: req.agencyId,
    role: "caregiver",
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json(caregivers);
});

// POST /api/agency/caregivers
router.post("/", auth, agencyScope, async (req, res) => {
  const { email, firstName, lastName, phone } = req.body;

  const caregiver = await User.create({
    email,
    firstName,
    lastName,
    phone,
    role: "caregiver",
    agencyId: req.agencyId,
    passwordHash: "TEMP", // send invite later
    status: "invited",
  });

  res.status(201).json(caregiver);
});

export default router;
