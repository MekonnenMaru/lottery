import { Router } from "express";
import { wrap } from "../../middleware/error-handler.js";
import { siteLimiter } from "../../middleware/rate-limit.js";
import * as controller from "./controller.js";
import { requireStaff } from "./middleware.js";

const router = Router();

router.get("/admin-session", requireStaff, wrap(controller.session));
router.post("/admin-login", siteLimiter(10), wrap(controller.login));
router.post("/admin-logout", requireStaff, wrap(controller.logout));
router.post("/admin-password", requireStaff, siteLimiter(10), wrap(controller.changePassword));

export default router;
