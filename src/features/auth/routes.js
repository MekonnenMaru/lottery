import { Router } from "express";
import { wrap } from "../../middleware/error-handler.js";
import { siteLimiter } from "../../middleware/rate-limit.js";
import * as controller from "./controller.js";
import { requireStaff } from "./middleware.js";

const router = Router();

router.get("/admin-session.php", requireStaff, wrap(controller.session));
router.post("/admin-login.php", siteLimiter(10), wrap(controller.login));
router.post("/admin-logout.php", requireStaff, wrap(controller.logout));
router.post("/admin-password.php", requireStaff, siteLimiter(10), wrap(controller.changePassword));

export default router;
