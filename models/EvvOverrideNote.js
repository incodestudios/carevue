import mongoose from "mongoose";

export const OVERRIDE_NOTE_TYPES = [
  "COORDINATOR_NOTE",
  "CAREGIVER_EXPLANATION",
  "SYSTEM",
];

const EvvOverrideNoteSchema = new mongoose.Schema(
  {
    overrideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EvvOverride",
      required: true,
      index: true,
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    type: { type: String, enum: OVERRIDE_NOTE_TYPES, required: true },
    message: { type: String, required: true, trim: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

EvvOverrideNoteSchema.index({ agencyId: 1, overrideId: 1, createdAt: 1 });

export default mongoose.model("EvvOverrideNote", EvvOverrideNoteSchema);
