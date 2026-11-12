import { Router } from "express";
import { requirePrivilege, requireStaff, requireSuper } from "../../middleware/auth.js";
import { wrap } from "../../middleware/error-handler.js";
import { siteLimiter } from "../../middleware/rate-limit.js";
import * as controller from "./controller.js";

const router = Router();
const logs = [requireStaff, requirePrivilege("logs")];

router.get("/admin-event-logs", ...logs, wrap(controller.list));
router.post("/admin-event-logs-clear", requireStaff, requireSuper, siteLimiter(10), wrap(controller.clear));

export default router;
