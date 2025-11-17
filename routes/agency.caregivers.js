import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import User from "../models/User.js";
import CaregiverProfile from "../models/CaregiverProfile.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/generateToken.js";

const router = Router();

// GET /api/agency/caregivers
router.get("/", auth, agencyScope, async (req, res) => {
  try {
    const users = await User.find({
      agencyId: req.agencyId,
      role: "caregiver",
    })
      .sort({ createdAt: -1 })
      .lean();

    const profiles = await CaregiverProfile.find({
      agencyId: req.agencyId,
      userId: { $in: users.map(u => u._id) }
    }).lean();

    const profileMap = new Map(profiles.map(p => [String(p.userId), p]));
    const combined = users.map(u => ({
      ...u,
      profile: profileMap.get(String(u._id)) || null,
    }));

    res.json(combined);
  } catch (err) {
    console.error("Error listing caregivers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id", auth, agencyScope, async (req, res) => {
  const { id } = req.params;
  try {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid caregiver id" });
    }

    const user = await User.findOne({
      _id: id,
      agencyId: req.agencyId,
      role: "caregiver",
    }).lean();
    if (!user) {
      return res.status(404).json({ message: "Caregiver not found" });
    }

    const profile = await CaregiverProfile.findOne({ userId: user._id }).lean();
    return res.json({ ...user, ...profile });
  } catch (err) {
    console.error("Error fetching caregiver:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/agency/caregivers
router.post("/register", auth, agencyScope, async (req, res) => {
  try {
    const {
      email,
      confirmemail,
      firstName,
      lastName,
      phone,
      // profile fields
      profileImage,
      middleName,
      dob,
      addressLine1,
      addressLine2,
      zipCode,
      state,
      city,
      notes,
      qualification,
      additionalQualifications,
      hasAutoInsurance,
      driverLicenseNumber,
      hasInsurance,
      insuranceProvider,
      services,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactEmail,
      preferredDays,
      preferredStartTime,
      preferredEndTime,
    } = req.body || {};

    if (!email || !confirmemail) {
      return res.status(400).json({ message: "email and confirmemail are required" });
    }
    if (String(email).toLowerCase() !== String(confirmemail).toLowerCase()) {
      return res.status(400).json({ message: "Email addresses do not match" });
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ message: "firstName and lastName are required" });
    }

    const password = "TEMP_PASSWORD";
    const passwordHash = await bcrypt.hash(password, 15);

    const user = await User.create({
      email: email.toLowerCase().trim(),
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      phone: phone?.trim(),
      role: "caregiver",
      agencyId: req.agencyId,
      passwordHash,
      status: "invited",
    });

    // Normalize arrays
    const servicesArr = Array.isArray(services) ? services : services ? [services] : [];
    const preferredDaysArr = Array.isArray(preferredDays) ? preferredDays : preferredDays ? [preferredDays] : [];
    const additionalQualificationsArr = Array.isArray(additionalQualifications) ? additionalQualifications : additionalQualifications ? [additionalQualifications] : [];

    const profile = await CaregiverProfile.create({
      userId: user._id,
      agencyId: req.agencyId,
      profileImage,
      middleName: middleName?.trim(),
      dob: dob ? new Date(dob) : undefined,
      addressLine1,
      addressLine2,
      zipCode,
      state,
      city,
      notes,
      qualification,
      additionalQualifications: additionalQualificationsArr,
      hasAutoInsurance: !!hasAutoInsurance,
      driverLicenseNumber,
      hasInsurance: !!hasInsurance,
      insuranceProvider,
      services: servicesArr,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactEmail,
      preferredDays: preferredDaysArr,
      preferredStartTime,
      preferredEndTime,
    });

    return res.status(201).json({
      message: "Caregiver created successfully",
      caregiver: { ...user.toObject(), profile },
    });
  } catch (err) {
    console.error("Error registering caregiver:", err);
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email already in use" });
    }
    return res.status(500).json({ message: "Server error" });
  }
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

    const profile = await CaregiverProfile.findOne({ userId: user._id }).lean();
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
        profile: profile || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", auth, agencyScope, async (req, res) => {
  const { id } = req.params;
  try {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid caregiver id" });
    }

    const user = await User.findOne({
      _id: id,
      agencyId: req.agencyId,
      role: "caregiver",
    });
    if (!user) {
      return res.status(404).json({ message: "Caregiver not found" });
    }

    await CaregiverProfile.deleteOne({ userId: user._id });
    await User.deleteOne({ _id: user._id });

    return res.json({ message: "Caregiver deleted successfully" });
  } catch (err) {
    console.error("Error deleting caregiver:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
