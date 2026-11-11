import { Router } from "express";
import { requireStaff, requireSuper } from "../../middleware/auth.js";
import { wrap } from "../../middleware/error-handler.js";
import { siteLimiter } from "../../middleware/rate-limit.js";
import * as controller from "./controller.js";

const router = Router();

router.get("/admin-staff-options", requireStaff, requireSuper, wrap(controller.options));
router.get("/admin-staff", requireStaff, requireSuper, wrap(controller.list));
router.post("/admin-staff", requireStaff, requireSuper, siteLimiter(20), wrap(controller.create));
router.post("/admin-staff-update", requireStaff, requireSuper, siteLimiter(20), wrap(controller.update));

export default router;
