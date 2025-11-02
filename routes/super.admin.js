// routes/super.agencies.js
import { createSuperAdmin, superAdminLogin } from "../controllers/createSuperAdmin.js";
import auth from "../middlewares/auth.js";
import requireRole from "../middlewares/requireRole.js";

import { Router } from "express";
const router = Router();

// POST /api/super/admin/createadmin
router.post("/createadmin", auth, requireRole("super_admin"), createSuperAdmin);

// POST /api/super/admin/create
router.post("/loginadmin", superAdminLogin);

export default router;

