// routes/super.agencies.js
import auth from "../middlewares/auth.js";
import requireRole from "../middlewares/requireRole.js";
import Agency from "../models/Agency.js";
import User from "../models/User.js";

import { Router } from "express";
const router = Router();

// GET /api/super/agencies
router.get("/", auth, requireRole("super_admin"), async (req, res) => {
  const agencies = await Agency.find().sort({ createdAt: -1 }).lean();
  res.json(agencies);
});

// GET /api/super/agencies/:id
router.get("/:id", auth, requireRole("super_admin"), async (req, res) => {
  const agency = await Agency.findById(req.params.id).lean();
  if (!agency) return res.status(404).json({ message: "Not found" });
  res.json(agency);
});

// POST /api/super/agencies  (manual create)
router.post("/", auth, requireRole("super_admin"), async (req, res) => {
  const { name, subdomain, ownerEmail, plan } = req.body;

  // 1) create agency_super_admin user (invited)
  const user = await User.create({
    email: ownerEmail,
    passwordHash: "TEMP", // you will send invite / reset
    role: "agency_super_admin",
    status: "invited",
  });

  // 2) create agency in pending_payment
  const agency = await Agency.create({
    name,
    subdomain,
    status: "pending_payment",
    billingStatus: "none",
    plan: plan || "pro",
    ownerUserId: user._id,
    createdBy: req.user.id,
  });

  // 3) update user with agencyId
  user.agencyId = agency._id;
  await user.save();

  // TODO: send billing link OR return it
  res.status(201).json(agency);
});

// PUT /api/super/agencies/:id/status
router.put("/:id/status", auth, requireRole("super_admin"), async (req, res) => {
  const { status } = req.body; // active | paused | suspended | deleted
  const agency = await Agency.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!agency) return res.status(404).json({ message: "Not found" });
  res.json(agency);
});

export default router;
