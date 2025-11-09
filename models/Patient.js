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
    middleName: {
      type: String,
      required: false,
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
    // New demographic & identity fields
    bloodGroup: { type: String, trim: true }, // e.g. A+, O-
    age: { type: Number, min: 0 }, // optional; can be derived from dob
    patientType: { type: String, enum: ["In Patient", "Out Patient", "Homecare"], default: "Homecare" },
    gender: { type: String, enum: ["Male", "Female", "Other"], trim: true },
    companyName: { type: String, trim: true },
    maritalStatus: { type: String, enum: ["Single", "Married", "Divorced", "Widowed", "Separated", "Other", "Unmarried", "Domestic Partnership", "Civil Union", "Registered Partnership"], trim: true },
    phone: { type: String, trim: true },
    emergencyPhone: { type: String, trim: true },
    guardianName: { type: String, trim: true },

    // Flattened address & location (retain legacy address object for backward compatibility)
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    country: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },

    // Referral & department
    referredBy: { type: String, trim: true },
    referredOn: { type: Date },
    department: { type: String, trim: true },

    // Clinical notes (general)
    temperature: { type: Number },
    pulse: { type: Number },
    respiratoryRate: { type: Number },
    spo2: { type: Number, min: 0, max: 100 },
    height: { type: Number }, // cm
    weight: { type: Number }, // kg
    bmi: { type: Number },
    waist: { type: Number }, // cm
    bsa: { type: Number }, // Body surface area
    vitalsNotes: { type: String, trim: true },

    // Medical history slots 1 & 2 (simple structured capture)
    mh1Type: { type: String, trim: true },
    mh1Reason: { type: String, trim: true },
    mh1Date: { type: Date },
    mh1Hospital: { type: String, trim: true },
    mh1Assessment: { type: String, trim: true },
    mh1Notes: { type: String, trim: true },
    mh2Type: { type: String, trim: true },
    mh2Reason: { type: String, trim: true },
    mh2Date: { type: Date },
    mh2Hospital: { type: String, trim: true },
    mh2Assessment: { type: String, trim: true },
    mh2Notes: { type: String, trim: true },

    // Health conditions & allergies
    overallHealthCondition: { type: String, trim: true },
    hasHealthCondition: { type: Boolean, default: false },
    healthConditionDetails: { type: String, trim: true },
    hasAllergies: { type: Boolean, default: false },
    allergyDetails: { type: String, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Caregiver assignment reflection (denormalized helpers)
    primaryCaregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    caregiversCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Make name searches per-agency fast
PatientSchema.index({ lastName: 1 });
PatientSchema.index({ status: 1 });

export default mongoose.model("Patient", PatientSchema);