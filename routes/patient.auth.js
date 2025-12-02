import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Patient from "../models/Patient.js";

const router = Router();

// POST /api/patient/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, ...rest } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const existing = await Patient.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const patient = await Patient.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      ...rest,
      role: "patient",
      status: "active",
    });
    res.status(201).json({ message: "Patient registered", patient });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/patient/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }
    const patient = await Patient.findOne({ email: email.toLowerCase(), role: "patient" });
    if (!patient) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, patient.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: patient._id, role: patient.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Login successful", token, patient: { id: patient._id, email: patient.email, firstName: patient.firstName, lastName: patient.lastName, role: patient.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
