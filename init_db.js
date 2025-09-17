const bcrypt = require("bcrypt");
const db = require("better-sqlite3")("data-paradise.db");
const fs = require("fs");

function run(sql) {
  db.exec(sql);
}

run(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  password_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS available_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE,
  max_bookings INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  price_cents INTEGER DEFAULT 0
);

`);

db.exec(`
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT,
  alt TEXT
  created_at TEXT DEFAULT (datetime('now'))
);
`);


// seed a default admin if none exists
const row = db.prepare("SELECT COUNT(*) as c FROM admins").get();
if (row.c === 0) {
  const pw = process.env.ADMIN_PASSWORD || "admin123";
  const hash = bcrypt.hashSync(pw, 10);
  db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run("admin@local", hash);
  console.log("Created default admin with password:", pw);
}

// seed some items if none exist
const r2 = db.prepare("SELECT COUNT(*) as c FROM items").get();
if (r2.c === 0) {
  db.prepare("INSERT INTO items (name, price_cents) VALUES (?, ?)")
    .run("Extra chairs (per 10)", 5000);
  db.prepare("INSERT INTO items (name, price_cents) VALUES (?, ?)")
    .run("Tables (per 5)", 7000);
  db.prepare("INSERT INTO items (name, price_cents) VALUES (?, ?)")
    .run("Caterer coordination flat fee", 15000);
  db.prepare("INSERT INTO items (name, price_cents) VALUES (?, ?)")
    .run("Pool access (per event)", 20000);
  console.log("Seeded sample items");
}

console.log("DB initialized.");
