import mongoose from "mongoose";

const ComplianceEvaluationSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    visitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VisitPlan",
      required: true,
      index: true,
    },
    predictiveScore: { type: Number, min: 0, max: 100, required: true, index: true },
    riskBucket: {
      type: String,
      enum: ["LIKELY_PASS", "RISK", "LIKELY_FAIL"],
      required: true,
      index: true,
    },
    failedRules: [
      {
        ruleId: { type: String, trim: true },
        severity: { type: String, trim: true },
        message: { type: String, trim: true },
      },
    ],
    calculatedAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ComplianceEvaluationSchema.index({ agencyId: 1, visitId: 1, calculatedAt: -1 });

export default mongoose.model("ComplianceEvaluation", ComplianceEvaluationSchema);
