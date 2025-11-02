// controllers/superAdminController.js

import User from "../models/User.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/generateToken.js";

/**
 * @desc Create initial Super Admin
 * @route POST /api/super-admin/create
 * @access Protected (Setup Token or Super Admin)
 */
 export const createSuperAdmin  = async (req, res) => {
  try {
    const { email, password, firstName, lastName, setupToken } = req.body;

    const count = await User.countDocuments({ role: "super_admin" });

    if (count > 0) {
        return res.status(403).json({ message: "Forbidden" });
    }

    // Optional security: require setup token from env
    if (process.env.SETUP_TOKEN && setupToken !== process.env.SETUP_TOKEN) {
      return res.status(403).json({ message: "Invalid setup token" });
    }

    // Prevent duplicates
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 15);

    const superAdmin = await User.create({
      email,
      firstName,
      lastName,
      passwordHash,
      role: "super_admin",
      status: "active",
      agencyId: null,
    });

    // generate token immediately
    const token = generateToken(superAdmin);

    res.status(201).json({
      message: "Super Admin created successfully",
      token,
      user: {
        id: superAdmin._id,
        email: superAdmin.email,
        role: superAdmin.role,
        createdAt: superAdmin.createdAt,
      },
    });
  } catch (err) {
    console.error("Error creating super admin:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const superAdminLogin = async (req, res) => {

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
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        agencyId: user.agencyId,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};