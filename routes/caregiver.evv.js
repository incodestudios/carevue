import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import requireRole from "../middlewares/requireRole.js";
import { respondToExplanation } from "../controllers/evvController.js";

const router = Router();

// POST /api/caregiver/explanations/:exceptionId/respond
router.post(
  "/explanations/:exceptionId/respond",
  auth,
  agencyScope,
  requireRole("caregiver"),
  respondToExplanation
);

export default router;
