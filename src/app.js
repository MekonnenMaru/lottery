import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { publicDir, receiptDir, lotteryImageDir } from "./paths.js";
import storefrontRoutes from "./features/storefront/routes.js";
import { appName } from "./util.js";

let buyerBundle = null;

function photoFrame(gradientClass) {
  const shots = 'N.jsx("div",{"data-shots":"1",style:{display:"flex",height:"100%",width:"100%",overflowX:"auto",scrollSnapType:"x mandatory",scrollbarWidth:"none"},onScroll:z=>{const box=z.currentTarget,label=box.parentElement&&box.parentElement.querySelector("[data-shot-index]");if(!label)return;const w=box.clientWidth||1,total=box.querySelectorAll("img").length,index=Math.min(total,Math.max(1,Math.round(box.scrollLeft/w)+1));label.textContent=index+" / "+total},children:(()=>{const pics=(Array.isArray(t.images)&&t.images.length?t.images:[t.image]).filter(Boolean);return (pics.length?pics:[""]).map((src,idx)=>N.jsx("img",{src:src&&String(src).startsWith("http")?src:src?d5+"/"+String(src).replace(/^\\/+/,""):$p,alt:t.title,draggable:!1,style:{minWidth:"100%",width:"100%",height:"100%",objectFit:"cover",flex:"0 0 100%",scrollSnapAlign:"center"},onError:z=>{z.currentTarget.src=$p}},idx))})()})';
  const fade = `N.jsx("div",{className:"pointer-events-none absolute inset-0 ${gradientClass}"})`;
  const prev = '(Array.isArray(t.images)&&t.images.length>1?N.jsx("button",{type:"button","aria-label":"Previous image",onClick:z=>{z.stopPropagation();z.preventDefault();const box=z.currentTarget.parentElement.querySelector("[data-shots]");if(!box)return;const w=box.clientWidth||1,total=box.querySelectorAll("img").length,max=Math.max(0,(total-1)*w);let left=box.scrollLeft-w;if(left<-8)left=max;box.scrollTo({left,behavior:"smooth"})},style:{position:"absolute",left:"8px",top:"50%",transform:"translateY(-50%)",zIndex:30,width:"36px",height:"36px",display:"grid",placeItems:"center",border:0,borderRadius:"999px",background:"rgba(0,0,0,.72)",color:"#fff",padding:0,cursor:"pointer"},children:N.jsx("svg",{viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:N.jsx("path",{d:"m15 18-6-6 6-6"})})}):null)';
  const count = '(Array.isArray(t.images)&&t.images.length>1?N.jsx("span",{"data-shot-index":"1",style:{position:"absolute",bottom:"10px",left:"50%",transform:"translateX(-50%)",zIndex:30,color:"#fff",background:"rgba(0,0,0,.55)",borderRadius:"999px",padding:"3px 9px",fontSize:"12px",fontWeight:700,pointerEvents:"none"},children:"1 / "+t.images.length}):null)';
  const next = '(Array.isArray(t.images)&&t.images.length>1?N.jsx("button",{type:"button","aria-label":"Next image",onClick:z=>{z.stopPropagation();z.preventDefault();const box=z.currentTarget.parentElement.querySelector("[data-shots]");if(!box)return;const w=box.clientWidth||1,total=box.querySelectorAll("img").length,max=Math.max(0,(total-1)*w);let left=box.scrollLeft+w;if(left>max+8)left=0;box.scrollTo({left,behavior:"smooth"})},style:{position:"absolute",right:"8px",top:"50%",transform:"translateY(-50%)",zIndex:30,width:"36px",height:"36px",display:"grid",placeItems:"center",border:0,borderRadius:"999px",background:"rgba(0,0,0,.72)",color:"#fff",padding:0,cursor:"pointer"},children:N.jsx("svg",{viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:N.jsx("path",{d:"m9 18 6-6-6-6"})})}):null)';
  return [shots, fade, prev, count, next].join(",");
}

function publishBuyerBundle() {
  const body = buyerScript();
  fs.writeFileSync(path.join(publicDir, "assets", "maraki.js"), body);
  return body;
}

function buyerScript() {
  if (!buyerBundle) {
    const name = appName();
    const file = path.join(publicDir, "assets", "index-DnQ-JC9S.js");
    buyerBundle = fs.readFileSync(file, "utf8")
      .replaceAll("https://gechcarsale.com", "")
      .replaceAll("Getachew Fikadu Jirata", name)
      .replaceAll("Getachew Fikadu", name)
      .replaceAll("ጌች መኪና ዕጣ", name)
      .replaceAll("Gech Car Lottery", name)
      .replaceAll("Gech Car Ekub", name)
      .replaceAll("Gech Car Sale", name)
      .replaceAll('"home.activeLotteries":"Active Lotteries"', '"home.activeLotteries":"Lotteries"')
      .replaceAll("Winner announced on draw day", "Winner announced on lottery day")
      .replaceAll("Past Draws", "Past lotteries")
      .replaceAll("Draw ended", "Lottery ended")
      .replaceAll("Draw in progress — good luck!", "Lottery in progress — good luck!")
      .replaceAll("e.g., Lucky Draw", "e.g., Hilux")
      .replaceAll(
        'new URLSearchParams(window.location.search).get("phone")||""',
        'new URLSearchParams(window.location.search).get("phone")||localStorage.getItem("maraki_phone")||""',
      )
      .replaceAll(
        'a=m5()||"Phone number not available"',
        "a=m5()",
      )
      .replaceAll(
        'className:"space-y-6 flex-1",children:N.jsx(me.div,{initial:{opacity:0,y:-10}',
        'className:"space-y-6 flex-1",children:a?N.jsx(me.div,{initial:{opacity:0,y:-10}',
      )
      .replaceAll(
        'children:a})]})]})})}),N.jsx(me.div,{initial:{opacity:0}',
        'children:a})]})]})}):null}),N.jsx(me.div,{initial:{opacity:0}',
      )
      .replaceAll(
        'children:"User Phone Number"',
        'children:localStorage.getItem("maraki_name")||"User Phone Number"',
      )
      .replaceAll(
        '[b,p]=re.useState(""),[y,g]=re.useState(Vp)',
        '[b,p]=re.useState(localStorage.getItem("maraki_name")||""),[y,g]=re.useState(Vp)',
      )
      .replaceAll(
        'p(""),g(Vp())',
        'p(localStorage.getItem("maraki_name")||""),g(Vp())',
      )
      .replaceAll(
        'N.jsx(me.img,{src:t.image,alt:t.title,className:"w-full h-full object-cover",animate:{scale:[1,1.03,1]},transition:{duration:8,repeat:1/0,ease:"easeInOut"}}),N.jsx("div",{className:"absolute inset-0 bg-gradient-to-t from-[#0d2e1f] via-transparent to-transparent"})',
        photoFrame("bg-gradient-to-t from-[#0d2e1f] via-transparent to-transparent"),
      )
      .replaceAll(
        'N.jsx("img",{src:t.image,alt:t.title,className:"w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"}),N.jsx("div",{className:"absolute inset-0 bg-gradient-to-t from-[#121212] via-[#12121240] to-transparent"})',
        photoFrame("bg-gradient-to-t from-[#121212] via-[#12121240] to-transparent"),
      )
      .replaceAll(
        'N.jsx(me.img,{initial:{scale:1.1},animate:{scale:1},transition:{duration:.6},src:j(t.image_url||t.image),alt:t.title,className:"w-full h-full object-cover",onError:z=>{z.currentTarget.src=$p}}),N.jsx("div",{className:"absolute inset-0 bg-gradient-to-t from-[#050505] via-[#05050540] to-transparent"})',
        'N.jsx("div",{"data-shots":"1",className:"flex h-full w-full overflow-x-auto no-scrollbar",style:{display:"flex",height:"100%",width:"100%",overflowX:"auto",scrollSnapType:"x mandatory",scrollbarWidth:"none"},onScroll:z=>{const box=z.currentTarget,label=box.parentElement&&box.parentElement.querySelector("[data-shot-index]");if(!label)return;const w=box.clientWidth||1,total=box.querySelectorAll("img").length,index=Math.min(total,Math.max(1,Math.round(box.scrollLeft/w)+1));label.textContent=index+" / "+total},children:(()=>{const pics=(Array.isArray(t.images)&&t.images.length?t.images:[t.image_url||t.image]).filter(Boolean);return (pics.length?pics:[""]).map((src,idx)=>N.jsx(me.img,{initial:{scale:1.1},animate:{scale:1},transition:{duration:.6},src:j(src),alt:t.title,className:"h-full object-cover",style:{minWidth:"100%",height:"100%",objectFit:"cover",flex:"0 0 100%",scrollSnapAlign:"center"},onError:z=>{z.currentTarget.src=$p}},idx))})()}),N.jsx("div",{className:"pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505] via-[#05050540] to-transparent"}),(Array.isArray(t.images)&&t.images.length>1?N.jsx("button",{type:"button","aria-label":"Previous image",onClick:z=>{const box=z.currentTarget.parentElement.querySelector("[data-shots]");if(!box)return;const w=box.clientWidth||1,total=box.querySelectorAll("img").length,max=Math.max(0,(total-1)*w);let left=box.scrollLeft-w;if(left<-8)left=max;box.scrollTo({left,behavior:"smooth"})},style:{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",zIndex:30,width:"40px",height:"40px",display:"grid",placeItems:"center",border:0,borderRadius:"999px",background:"rgba(0,0,0,.7)",color:"#fff",padding:0},children:N.jsx("svg",{viewBox:"0 0 24 24",width:"20",height:"20",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:N.jsx("path",{d:"m15 18-6-6 6-6"})})}):null),(Array.isArray(t.images)&&t.images.length>1?N.jsx("span",{"data-shot-index":"1",style:{position:"absolute",top:"52px",left:"50%",transform:"translateX(-50%)",zIndex:30,color:"#fff",background:"rgba(0,0,0,.55)",borderRadius:"999px",padding:"4px 10px",fontSize:"13px",fontWeight:700},children:"1 / "+t.images.length}):null),(Array.isArray(t.images)&&t.images.length>1?N.jsx("button",{type:"button","aria-label":"Next image",onClick:z=>{const box=z.currentTarget.parentElement.querySelector("[data-shots]");if(!box)return;const w=box.clientWidth||1,total=box.querySelectorAll("img").length,max=Math.max(0,(total-1)*w);let left=box.scrollLeft+w;if(left>max+8)left=0;box.scrollTo({left,behavior:"smooth"})},style:{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",zIndex:30,width:"40px",height:"40px",display:"grid",placeItems:"center",border:0,borderRadius:"999px",background:"rgba(0,0,0,.7)",color:"#fff",padding:0},children:N.jsx("svg",{viewBox:"0 0 24 24",width:"20",height:"20",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:N.jsx("path",{d:"m9 18 6-6-6-6"})})}):null)',
      );
  }
  return buyerBundle;
}

function htmlPage(file) {
  const name = appName();
  return fs.readFileSync(path.join(publicDir, file), "utf8").replaceAll("__APP_NAME__", name);
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

  app.get(["/assets/maraki.js", "/assets/index-DnQ-JC9S.js"], (req, res) => {
    res.type("js").set("Cache-Control", "no-store").send(buyerScript());
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
