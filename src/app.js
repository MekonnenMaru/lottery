import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { publicDir, receiptDir, lotteryImageDir } from "./paths.js";
import storefrontRoutes from "./features/storefront/routes.js";
import { buyerScript, publishBuyerBundle } from "./features/storefront/buyer-bundle.js";
import { branding } from "./features/settings/service.js";

function htmlPage(file) {
  const brand = branding();
  return fs.readFileSync(path.join(publicDir, file), "utf8")
    .replaceAll("__APP_NAME__", brand.app_name)
    .replaceAll("__DEVELOPER_NAME__", brand.developer_name)
    .replaceAll("__DEVELOPER_URL__", brand.developer_url)
    .replaceAll("__CREDIT_PREFIX__", brand.credit_prefix);
}

export function createApp() {
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.mkdirSync(lotteryImageDir, { recursive: true });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://images.pexels.com"],
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
    res.json({ ok: true });
  });
  api.use(storefrontRoutes);
  app.use("/api", api);

  app.get("/assets/maraki.js", (req, res) => {
    res.type("js").set("Cache-Control", "no-store").send(buyerScript());
  });
  app.get("/time.js", (req, res) => {
    res.type("js").set("Cache-Control", "no-store").sendFile(path.join(publicDir, "time.js"));
  });
  app.get("/telegram.js", (req, res) => {
    res.type("js").set("Cache-Control", "no-store").sendFile(path.join(publicDir, "telegram.js"));
  });
  app.get("/tickets.js", (req, res) => {
    res.type("js").set("Cache-Control", "no-store").sendFile(path.join(publicDir, "tickets.js"));
  });
  app.get("/", (req, res) => {
    res.type("html").set("Cache-Control", "no-store").send(htmlPage("index.html"));
  });
  app.get(["/manage", "/manage/"], (req, res) => {
    res.type("html").set("Cache-Control", "no-store").send(htmlPage(path.join("manage", "index.html")));
  });
  app.get("/manage/index.html", (req, res) => {
    res.redirect(302, "/manage");
  });
  app.get(["/admin", "/payment-status"], (req, res) => {
    res.redirect(302, "/manage");
  });
  app.use("/manage", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.static(publicDir, { index: false, dotfiles: "deny" }));
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use((req, res) => {
    res.status(404).type("text").send("Not found");
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: "Upload a JPEG, PNG, or WebP image under 5 MB" });
      return;
    }
    if (err.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? "Something went wrong" : err.message });
  });
  return app;
}
