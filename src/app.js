import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { publicDir, receiptDir, lotteryImageDir } from "./config/paths.js";
import { LOTTERY_BASE_PATH, rewritePublicPaths } from "./config/embed.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import adminRoutes from "./features/admin/routes.js";
import auditRoutes from "./features/audit/routes.js";
import authRoutes from "./features/auth/routes.js";
import customerRoutes from "./features/customers/routes.js";
import ocrScannerRoutes from "./features/OCR-scanner/routes.js";
import storefrontRoutes from "./features/storefront/routes.js";
import { buyerScript, publishBuyerBundle } from "./features/storefront/buyer-bundle.js";
import { branding } from "./features/settings/service.js";

function htmlPage(file, basePath) {
  const brand = branding();
  const raw = fs.readFileSync(path.join(publicDir, file), "utf8")
    .replaceAll("__APP_NAME__", brand.app_name)
    .replaceAll("__DEVELOPER_NAME__", brand.developer_name)
    .replaceAll("__DEVELOPER_URL__", brand.developer_url)
    .replaceAll("__CREDIT_PREFIX__", brand.credit_prefix);
  return rewritePublicPaths(raw, basePath);
}

function sendRewrittenJs(fileName) {
  return (req, res) => {
    const basePath = req.app.get("lotteryBasePath") || LOTTERY_BASE_PATH;
    const raw = fs.readFileSync(path.join(publicDir, fileName), "utf8");
    res.type("js").set("Cache-Control", "no-store").send(rewritePublicPaths(raw, basePath));
  };
}

/**
 * @param {{ basePath?: string, trustProxy?: boolean|number }} [options]
 */
export function createApp(options = {}) {
  const basePath = String(options.basePath || LOTTERY_BASE_PATH || "").replace(/\/+$/, "") || "";
  const embed = Boolean(env().isEmbed || options.embed);

  fs.mkdirSync(receiptDir, { recursive: true });
  fs.mkdirSync(lotteryImageDir, { recursive: true });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy ?? (embed ? 1 : false));
  app.set("lotteryBasePath", basePath);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https://images.pexels.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "https://oauth.telegram.org", "https://telegram.org", "https://static.cloudflareinsights.com"],
        connectSrc: ["'self'", "https://oauth.telegram.org", "https://cloudflareinsights.com"],
        formAction: ["'self'"],
        frameAncestors: ["'self'", "https://web.telegram.org", "https://telegram.org"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (!origin || req.method === "GET" || req.method === "HEAD") return next();
    let allowed = false;
    try {
      allowed = origin !== "null" && new URL(origin).host === req.get("host");
    } catch {
      allowed = false;
    }
    if (!allowed) return res.status(403).json({ error: "Cross-site request blocked" });
    next();
  });

  publishBuyerBundle();

  const api = express.Router();
  api.get("/health", (req, res) => {
    res.json({ ok: true, product: "lottery", basePath: basePath || "/" });
  });
  api.use(authRoutes);
  api.use(adminRoutes);
  api.use(auditRoutes);
  api.use(customerRoutes);
  api.use(ocrScannerRoutes);
  api.use(storefrontRoutes);
  app.use("/api", api);

  app.get("/assets/maraki.js", (req, res) => {
    const script = rewritePublicPaths(buyerScript(), basePath);
    res.type("js").set("Cache-Control", "no-store").send(script);
  });
  app.get("/time.js", sendRewrittenJs("time.js"));
  app.get("/telegram.js", sendRewrittenJs("telegram.js"));
  app.get("/tickets.js", sendRewrittenJs("tickets.js"));

  const manageTarget = basePath ? `${basePath}/manage` : "/manage";

  app.get("/", (req, res) => {
    res.type("html").set("Cache-Control", "no-store").send(htmlPage("index.html", basePath));
  });
  app.get(["/manage", "/manage/"], (req, res) => {
    res.type("html").set("Cache-Control", "no-store").send(htmlPage(path.join("manage", "index.html"), basePath));
  });
  app.get("/manage/index.html", (req, res) => {
    res.redirect(302, manageTarget);
  });
  app.get(["/admin", "/payment-status"], (req, res) => {
    res.redirect(302, manageTarget);
  });
  app.use("/manage", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // Rewrite root-absolute /api and asset paths inside JS/CSS when embedded under /lottery.
  app.use((req, res, next) => {
    if (!basePath) return next();
    if (!/\.(js|css)$/i.test(req.path)) return next();
    const file = path.normalize(path.join(publicDir, req.path));
    if (!file.startsWith(path.normalize(publicDir)) || !fs.existsSync(file)) return next();
    let body = fs.readFileSync(file, "utf8");
    if (req.path.endsWith(".js")) body = rewritePublicPaths(body, basePath);
    if (req.path.endsWith(".css")) body = body.replace(/url\(\//g, `url(${basePath}/`);
    res.type(req.path.endsWith(".css") ? "css" : "js").set("Cache-Control", "no-store").send(body);
  });

  app.use(express.static(publicDir, { index: false, dotfiles: "deny" }));
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use((req, res) => {
    res.status(404).type("text").send("Not found");
  });
  app.use(errorHandler);
  return app;
}
