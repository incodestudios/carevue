// models/InviteToken.js
import mongoose from "mongoose";

const InviteTokenSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
    },
    role: {
      type: String,
      enum: [
        "agency_super_admin",
        "agency_admin",
        "caregiver",
      ],
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

InviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-clean

module.exports = mongoose.model("InviteToken", InviteTokenSchema);
