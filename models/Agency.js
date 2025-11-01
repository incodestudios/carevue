// models/Agency.js
import mongoose from "mongoose";

const AgencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subdomain: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // allow null
    },
    status: {
      type: String,
      enum: ["active", "paused", "suspended", "deleted", "pending_payment"],
      default: "pending_payment",
    },
    billingStatus: {
      type: String,
      enum: ["paid", "past_due", "trialing", "canceled", "none"],
      default: "none",
    },
    plan: {
      type: String,
      default: "pro", // free | starter | pro | enterprise
    },
    stripeCustomerId: {
      type: String,
    },
    stripeSubscriptionId: {
      type: String,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // likely super_admin
    },
  },
  { timestamps: true }
);

// useful indexes
AgencySchema.index({ status: 1 });
AgencySchema.index({ plan: 1 });

export default mongoose.model("Agency", AgencySchema);
