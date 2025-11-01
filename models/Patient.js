// models/Patient.js
import mongoose from "mongoose";

const PatientSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    dob: {
      type: Date,
    },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      zip: String,
    },
    contactPerson: {
      name: String,
      phone: String,
      email: String,
      relation: String,
    },
    notes: {
      type: String,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "discharged", "deceased"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Make name searches per-agency fast
PatientSchema.index({ lastName: 1 });
PatientSchema.index({ status: 1 });

export default mongoose.model("Patient", PatientSchema);