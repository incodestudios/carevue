import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/generateToken.js";

const router = Router();

// GET /api/agency/admin
// list agency admins in THIS agency
router.get("/", auth, agencyScope, async (req, res) => {
  // if you want to allow only agency_super_admin to view admins, uncomment:
  // if (req.user.role !== "agency_super_admin" && req.user.role !== "super_admin") {
  //   return res.status(403).json({ message: "Forbidden" });
  // }

  const admins = await User.find({
    agencyId: req.agencyId,
    role: "agency_admin",
  })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(admins);
});

// POST /api/agency/admin
// create a new agency admin inside this agency
router.post("/register", auth, agencyScope, async (req, res) => {
  // only agency_super_admin (or super_admin) should create admins
  if (req.user.role !== "agency_super_admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Only agency_super_admin can create agency admins" });
  }

  const { email, firstName, lastName, phone } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // check if user already exists
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(400).json({ message: "User with this email already exists" });
  }

  // temporary password (you can send invite later)
  const tempPassword = "TEMP_PASSWORD";
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const admin = await User.create({
    email: email.toLowerCase(),
    firstName,
    lastName,
    phone,
    role: "agency_admin",
    agencyId: req.agencyId,
    passwordHash,
    status: "invited",
  });

  if (!admin) {
    return res.status(400).json({ message: "Error creating agency admin" });
  }

  return res
    .status(201)
    .json({ message: "Agency admin created successfully", admin });
});

// POST /api/agency/admin/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    // find the user
    const user = await User.findOne({ email: email.toLowerCase(), role: "agency_admin" });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // compare password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    //if (user.status !== "active")
    //  return res.status(403).json({ message: "User account not active" });

    // generate JWT
    const token = generateToken(user);

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        agencyId: user.agencyId,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;