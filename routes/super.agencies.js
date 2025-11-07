// routes/super.agencies.js
import auth from "../middlewares/auth.js";
import requireRole from "../middlewares/requireRole.js";
import Agency from "../models/Agency.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/generateToken.js";

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
  // Guard against missing/invalid JSON body
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      message: "Request body is required. Ensure 'Content-Type: application/json' is set.",
    });
  }

  const {
    agencyName,
    subdomain,
    plan,
    // New Agency model fields
    profileImage,
    firstName,
    middleName,
    lastName,
    dob,
    companyName,
    contactMobile,
    phone,
    email,
    addressLine1,
    addressLine2,
    zipCode,
    notes,
  } = req.body ?? {};

  // Basic required fields validation
  if (!agencyName || !subdomain) {
    return res.status(400).json({
      message: "Missing required fields",
      required: ["agencyName", "subdomain", "ownerEmail"],
    });
  }

  const password = "TEMP_PASSWORD";

  const passwordHash = await bcrypt.hash(password, 15);

  // 1) create agency_super_admin user (invited)
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash: passwordHash, // you will send invite / reset
    role: "agency_super_admin",
    status: "invited",
  });

  // 2) create agency in pending_payment
  const agency = await Agency.create({
    agencyName,
    subdomain,
    status: "pending_payment",
    billingStatus: "none",
    plan: plan || "pro",
    ownerUserId: user._id,
    createdBy: req.user.id,
    // Map new fields into Agency document
    profileImage,
    firstName,
    middleName,
    lastName,
    dob,
    companyName,
    contactMobile,
    phone,
    email,
    addressLine1,
    addressLine2,
    zipCode,
    notes,
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

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status !== "active" && user.status !== "invited") {
      return res.status(403).json({ message: "User is not active" });
    }

    const token = generateToken(user);

    res.json({
      message: "Agency Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
        agencyId: user.agencyId,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
