// controllers/userController.js

import User from "../models/User.js";
import Agency from "../models/Agency.js";
import bcrypt from "bcryptjs";

/**
 * @desc Get all users (Super Admin or Agency Super Admin only)
 * @route GET /api/users
 * @access Super Admin | Agency Super Admin
 */
exports.getUsers = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === "agency_super_admin" || req.user.role === "agency_admin") {
      query.agencyId = req.user.agencyId;
    } else if (req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const users = await User.find(query)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .lean();

    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc Get single user
 * @route GET /api/users/:id
 * @access Super Admin | Agency Super/Admin
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (
      req.user.role !== "super_admin" &&
      (!req.user.agencyId || user.agencyId?.toString() !== req.user.agencyId?.toString())
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc Create a new user (Super Admin or Agency Super Admin)
 * @route POST /api/users
 * @access Super Admin | Agency Super Admin
 */
exports.createUser = async (req, res) => {
  try {
    const { email, firstName, lastName, phone, role, password } = req.body;

    // Restrict who can create what roles
    if (req.user.role === "agency_super_admin" && role === "super_admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const agencyId =
      req.user.role === "super_admin" ? req.body.agencyId : req.user.agencyId;

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already in use" });

    const passwordHash = password
      ? await bcrypt.hash(password, 10)
      : await bcrypt.hash(Math.random().toString(36).slice(-8), 10);

    const newUser = await User.create({
      email,
      firstName,
      lastName,
      phone,
      role,
      agencyId: agencyId || null,
      passwordHash,
      status: "active",
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
        agencyId: newUser.agencyId,
      },
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc Update user info
 * @route PUT /api/users/:id
 * @access Super Admin | Agency Super/Admin
 */
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only Super Admin or same-agency admin can update
    if (
      req.user.role !== "super_admin" &&
      (!req.user.agencyId || user.agencyId?.toString() !== req.user.agencyId?.toString())
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const allowedUpdates = ["firstName", "lastName", "phone", "status", "role"];
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        user[key] = req.body[key];
      }
    }

    await user.save();

    res.json({ message: "User updated", user });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc Delete user
 * @route DELETE /api/users/:id
 * @access Super Admin | Agency Super/Admin
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (
      req.user.role !== "super_admin" &&
      (!req.user.agencyId || user.agencyId?.toString() !== req.user.agencyId?.toString())
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Server error" });
  }
};
