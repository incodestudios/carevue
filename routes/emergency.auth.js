import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import EmergencyContact from "../models/EmergencyContact.js";

const router = Router();

// POST /api/emergency/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, patientId, phone, relation } = req.body;
    if (!email || !password || !name || !patientId) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const existing = await EmergencyContact.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const contact = await EmergencyContact.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      patientId,
      phone,
      relation,
      role: "emergency_contact",
      status: "active",
    });
    res.status(201).json({ message: "Emergency contact registered", contact });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/emergency/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }
    const contact = await EmergencyContact.findOne({ email: email.toLowerCase(), role: "emergency_contact" });
    if (!contact) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, contact.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: contact._id, role: contact.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Login successful", token, contact: { id: contact._id, email: contact.email, name: contact.name, role: contact.role, patientId: contact.patientId } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
