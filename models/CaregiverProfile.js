import mongoose from "mongoose";

const CaregiverProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true, // one profile per caregiver user
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    // Core identity extensions
    profileImage: { type: String, trim: true },
    middleName: { type: String, trim: true },
    dob: { type: Date },

    // Address
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    state: { type: String, trim: true },
    city: { type: String, trim: true },

    // Professional info
    qualification: { type: String, trim: true },
    additionalQualifications: [{ type: String, trim: true }],
    skills: [{ type: String, trim: true }],
    maxHours: { type: Number },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      // Note: Should be auto-filled from address via geocoding in route/controller
    },
    status: { type: String, trim: true },
    availability: {
      daysOfWeek: [{ type: Number }],
      timeWindows: [{ start: String, end: String }],
    },
    preferredShift: [{ type: String, trim: true }],
    travelRadiusMi: { type: Number },
    languages: [{ type: String, trim: true }],
    weeklyHours: { type: Number },
    familiarity: {
      type: Map,
      of: Number, // patientId: familiarity score
    },

    // Insurance / licensing
    hasAutoInsurance: { type: Boolean, default: false },
    driverLicenseNumber: { type: String, trim: true },
    hasInsurance: { type: Boolean, default: false },
    insuranceProvider: { type: String, trim: true },

    // Offered services
    services: [{ type: String, trim: true }],

    // Emergency contact
    emergencyContactName: { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },
    emergencyContactEmail: { type: String, trim: true, lowercase: true },

    // Scheduling preferences
    preferredDays: [{ type: String, trim: true }],
    preferredStartTime: { type: String, trim: true }, // HH:mm
    preferredEndTime: { type: String, trim: true },   // HH:mm

    // Notes
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Helpful composite indexes
CaregiverProfileSchema.index({ agencyId: 1, services: 1 });
CaregiverProfileSchema.index({ agencyId: 1, preferredDays: 1 });

export default mongoose.model("CaregiverProfile", CaregiverProfileSchema);
