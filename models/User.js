// models/User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      default: null, // super_admin will have null
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: [
        "super_admin",
        "agency_super_admin",
        "agency_admin",
        "caregiver",
      ],
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    // Caregiver-specific fields moved to CaregiverProfile model.
    // (legacy data will remain in existing documents but new writes should use CaregiverProfile.)
    status: {
      type: String,
      enum: ["active", "inactive", "invited", "suspended"],
      default: "active",
    },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

// Index combinations for fast queries
UserSchema.index({ agencyId: 1, role: 1 });
UserSchema.index({ agencyId: 1, status: 1 });

export default mongoose.model("User", UserSchema);
