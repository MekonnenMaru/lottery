import { Router } from "express";
import { requireStaff } from "../../middleware/auth.js";
import { wrap } from "../../middleware/error-handler.js";
import * as controller from "./controller.js";

const router = Router();

router.get("/admin-customers.php", requireStaff, wrap(controller.list));
router.get("/admin-customer.php", requireStaff, wrap(controller.history));

export default router;
