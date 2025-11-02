import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/generateToken.js";

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
router.post("/register", auth, agencyScope, async (req, res) => {
  const { email, firstName, lastName, phone } = req.body;

  const password = "TEMP_PASSWORD";
  
  const passwordHash = await bcrypt.hash(password, 15);

  const caregiver = await User.create({
    email,
    firstName,
    lastName,
    phone,
    role: "caregiver",
    agencyId: req.agencyId,
    passwordHash: passwordHash, // send invite later
    status: "invited",
  });

  if (!caregiver) {
    return res.status(400).json({ message: "Error creating caregiver" });
  }

  res.status(201).json({ message: "Care giver created successfully" ,caregiver });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    // find the user
    const user = await User.findOne({ email: email.toLowerCase(), role: "caregiver" });
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
