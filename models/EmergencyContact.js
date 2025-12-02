import mongoose from "mongoose";

const EmergencyContactSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  phone: { type: String, trim: true },
  relation: { type: String, trim: true },
  passwordHash: { type: String, trim: true },
  status: {
    type: String,
    enum: ["active", "inactive", "invited", "suspended"],
    default: "active",
  },
  role: {
    type: String,
    enum: ["emergency_contact"],
    default: "emergency_contact",
    index: true,
  },
}, { timestamps: true });

export default mongoose.model("EmergencyContact", EmergencyContactSchema);
