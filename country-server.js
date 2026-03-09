require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("better-sqlite3")("data-paradise.db");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const stripeLib = require("stripe");
const session = require("express-session");
const nodemailer = require("nodemailer");

const MasterEmail = "chrisprice5614@gmail.com"
const online = true;


async function sendEmail(to, subject, html) {
  if(!online)
    return

    let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.MAILNAME,
            pass: process.env.MAILSECRET
        },
        tls: {
            rejectUnauthorized: false
        }
    });


    let info = await transporter.sendMail({
        from: '"Chris Price Music" <info@chrispricemusic.net>',
        to: to,
        subject: subject,
        html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Countryside Paradise</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f2f1ed;
    }

    table {
      border-collapse: collapse;
    }

    @media only screen and (max-width: 600px) {
      .content {
        width: 100% !important;
      }
      .logo {
        width: 80px !important;
      }
    }
  </style>
</head>
<body>
  <!-- Main wrapper -->
  <table width="100%" bgcolor="#f2f1ed" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding: 24px;">
        <!-- Centered content table -->
        <table class="content" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; font-family: Georgia, serif; color: #333333; border-radius: 8px; max-width: 600px; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <!-- Title -->
          <tr>
            <td align="center" style="font-size: 26px; font-weight: bold; color: #4a6b3e; padding-bottom: 20px; font-family: Georgia, serif;">
              Countryside Paradise
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="font-size: 16px; line-height: 1.6; color: #444; font-family: Arial, sans-serif;">
              <p>${html}</p>

              <p style="margin-top: 32px; font-style: italic; color: #4a6b3e;">
                With warm regards,<br>
                <strong>Countryside Paradise</strong>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="font-size: 12px; color: #999999; padding-top: 32px; font-family: Arial, sans-serif;">
              © 2025 Countryside Paradise
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>


        `

    })

}

const STRIPE_SECRET = process.env.STRIPE_SECRET || "";
const STRIPE_PUB = process.env.STRIPE_PUB || "";
const DOWNPAYMENT_PERCENT = Number(process.env.DOWNPAYMENT_PERCENT || 25);
const BASE_URL = process.env.BASE_URL || "http://localhost:5013";

const UPLOAD_DIR = path.join(__dirname, "public/uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const stripe = STRIPE_SECRET ? stripeLib(STRIPE_SECRET) : null;

const app = express();
app.use(express.json({ limit: "10mb" }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
// serves /uploads/... and /img/...
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// --- DB helpers ---
// Run init_db.js once (or require it) to create tables if missing
try {
  require("./init_db");
} catch (e) {
  console.error("init_db import error (might already be created):", e.message);
}

function runQuery(sql, params = []) {
  return db.prepare(sql).run(params);
}
function get(sql, params = []) {
  return db.prepare(sql).get(params);
}
function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

// --- Mailer (simple) ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

// --- Auth (simple admin using JWT in cookie) ---
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";

function adminAuthMiddleware(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.redirect("/admin/login");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch (e) {
    return res.redirect("/admin/login");
  }
}

// --- Public pages ---
app.get("/", (req, res) => {
  const items = all("SELECT * FROM items");
  res.render("index", { items });
});
app.get("/events", (req, res) => {
  res.render("events");
});
app.get("/venue", (req, res) => {
  res.render("venue");
});
app.get("/gallery", (req,res) => {
  return res.render("gallery")
})

app.get("/book", (req,res) => {
  return res.render("book")
})

// Utility: build or reuse a per-session shuffled ID list
function getShuffledIds(req) {
  const refresh = req.query.refresh === "1";
  if (!Array.isArray(req.session.galleryOrder) || refresh) {
    const ids = db.prepare("SELECT id FROM gallery").all().map(r => r.id);

    // Fisher–Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    req.session.galleryOrder = ids;
  }
  return req.session.galleryOrder;
}

app.get("/api/gallery", (req, res) => {
  
  const page = Math.max(parseInt(req.query.page || "0", 10), 0);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || "20", 10), 1), 60);

  const order = getShuffledIds(req);
  const slice = order.slice(page * pageSize, page * pageSize + pageSize);
  if (slice.length === 0) return res.json([]);

  // Fetch rows for this slice, then return in the exact shuffled order
  const rows = db.prepare(`SELECT id, url, alt FROM gallery WHERE id IN (${slice.map(() => "?").join(",")})`).all(...slice);
  const byId = new Map(rows.map(r => [r.id, r]));
  const ordered = slice.map(id => byId.get(id)).filter(Boolean);

  res.json(ordered);
});


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // 10MB safety cap
  },
});

// ---- Helpers
const makeFileName = () =>
  `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;

// ---- Route: handle the form’s POST
app.post(
  "/upload-image",
  adminAuthMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).send("No file uploaded.");
      const { alt } = req.body;
      if (!alt) return res.status(400).send("Alt text is required.");

      // Process with Sharp: keep orientation, longest side <= 640
      const filename = makeFileName();
      const outPath = path.join(UPLOAD_DIR, filename);
      const publicUrl = `/uploads/${filename}`;

      // Resize so LONG side is 640 (fit: 'inside' enforces max box)
      await sharp(req.file.buffer)
        .rotate() // respect EXIF
        .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outPath);

      // Insert into DB
      const stmt = db.prepare("INSERT INTO gallery (url, alt) VALUES (?, ?)");
      const info = stmt.run(publicUrl, alt);

      return res.redirect("/admin");
    } catch (err) {
      console.error(err);
      return res.status(500).send("Upload failed.");
    }
  }
);

app.post("/book", (req, res) => {
  const { firstname, lastname, phone, email, message } = req.body;

  // Build the HTML content for the email
  const htmlContent = `
    <h2>New Contact Submission</h2>
    <p><strong>Name:</strong> ${firstname} ${lastname}</p>
    <p><strong>Phone:</strong> ${phone}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong></p>
    <p>${message.replace(/\n/g, "<br>")}</p>
  `;

  // Send the email
  sendEmail("countrysideparadise509@gmail.com", "Contact Submission", htmlContent);

  // Redirect to thank you page
  res.redirect("/thank-you");
});

// Example thank-you route (you can also make this render a template)
app.get("/thank-you", (req, res) => {
  return res.render("thanks")
});



// --- ADMIN routes ---
app.get("/admin/login", (req, res) => {
  res.render("admin/login");
});

app.post("/admin/login", async (req, res) => {
  const { password } = req.body;
  // check admin password stored in table admins (one row). On first run, insert default admin with password "admin123" hashed if table empty.
  const adminRow = get("SELECT * FROM admins LIMIT 1");
  if (!adminRow) return res.send("Admin not initialized. Run init_db.js or create an admin.");
  const ok = await bcrypt.compare(password, adminRow.password_hash);
  if (!ok) return res.render("admin/login", { error: "Invalid password" });
  const token = jwt.sign({ id: adminRow.id, email: adminRow.email || "admin@local" }, JWT_SECRET, { expiresIn: "8h" });
  res.cookie("admin_token", token, { httpOnly: true });
  res.redirect("/admin");
});

// GET paginated gallery
app.get("/gallery-admin", adminAuthMiddleware, (req, res) => {
  const page = parseInt(req.query.page || "0", 10);
  const pageSize = 12;
  const rows = db
    .prepare("SELECT * FROM gallery ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(pageSize, page * pageSize);
  res.json(rows);
});

// DELETE image by id
app.delete("/gallery/:id", adminAuthMiddleware, (req, res) => {
  const id = req.params.id;
  const row = db.prepare("SELECT * FROM gallery WHERE id = ?").get(id);
  if (!row) return res.status(404).send("Not found");

  // Delete file from disk
  try {
    const filePath = path.join(__dirname, "public", row.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("File delete error:", err);
  }

  db.prepare("DELETE FROM gallery WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/admin/logout", (req, res) => {
  res.clearCookie("admin_token");
  res.redirect("/admin/login");
});

app.get("/admin", adminAuthMiddleware, (req, res) => {
  res.render("admin/dashboard");
});

// manage available dates
app.get("/admin/avail-dates", adminAuthMiddleware, (req, res) => {
  const dates = all("SELECT * FROM available_dates ORDER BY date");
  res.render("admin/avail_dates", { dates });
});
app.post("/admin/avail-dates/add", adminAuthMiddleware, (req, res) => {
  const { date, max_bookings } = req.body;
  runQuery("INSERT INTO available_dates (date, max_bookings) VALUES (?, ?)", [date, Number(max_bookings || 1)]);
  res.redirect("/admin/avail-dates");
});
app.post("/admin/avail-dates/delete", adminAuthMiddleware, (req, res) => {
  const { id } = req.body;
  runQuery("DELETE FROM available_dates WHERE id = ?", [id]);
  res.redirect("/admin/avail-dates");
});

// manage items
app.get("/admin/items", adminAuthMiddleware, (req, res) => {
  const items = all("SELECT * FROM items ORDER BY id");
  res.render("admin/items", { items });
});
app.post("/admin/items/add", adminAuthMiddleware, (req, res) => {
  const { name, price_dollars } = req.body;
  const price_cents = Math.round(Number(price_dollars || 0) * 100);
  runQuery("INSERT INTO items (name, price_cents) VALUES (?, ?)", [name, price_cents]);
  res.redirect("/admin/items");
});
app.post("/admin/items/delete", adminAuthMiddleware, (req, res) => {
  const { id } = req.body;
  runQuery("DELETE FROM items WHERE id = ?", [id]);
  res.redirect("/admin/items");
});

app.listen(process.env.PORT || 5013, () => {
  console.log("Server running on port", process.env.PORT || 5013);
});
