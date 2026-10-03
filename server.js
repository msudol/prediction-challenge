"use strict";

const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(
  process.env.DATA_FILE || path.join(__dirname, "data", "guesses.csv"),
);
const RESULTS_USER = process.env.RESULTS_USER || "manager";
const RESULTS_PASSWORD = process.env.RESULTS_PASSWORD;
const MIN_GUESS = Number(process.env.MIN_GUESS || 25296099);
const MAX_GUESS = Number(process.env.MAX_GUESS || 50000000);
const SUBMISSIONS_CLOSE =
  process.env.SUBMISSIONS_CLOSE || "2026-12-01T00:00:00-05:00";
const NAME_RE = /^[A-Za-z0-9 ]{2,40}$/;

if (!RESULTS_PASSWORD || RESULTS_PASSWORD.length < 16) {
  console.error(
    "RESULTS_PASSWORD must be set and contain at least 16 characters.",
  );
  process.exit(1);
}
if (
  !Number.isSafeInteger(MIN_GUESS) ||
  !Number.isSafeInteger(MAX_GUESS) ||
  MIN_GUESS >= MAX_GUESS
) {
  console.error("MIN_GUESS and MAX_GUESS must be valid safe integers.");
  process.exit(1);
}
if (Number.isNaN(Date.parse(SUBMISSIONS_CLOSE))) {
  console.error("SUBMISSIONS_CLOSE must be a valid ISO 8601 date/time.");
  process.exit(1);
}

app.disable("x-powered-by");
// Set TRUST_PROXY=1 only when deployed behind exactly one trusted reverse proxy.
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  }),
);
app.use(
  express.urlencoded({ extended: false, limit: "2kb", parameterLimit: 5 }),
);
app.use(
  express.static(path.join(__dirname, "public"), {
    dotfiles: "deny",
    index: "index.html",
    maxAge: "1h",
  }),
);

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "Too many submission attempts. Please try again later.",
});
const resultsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}
function safeEqual(a, b) {
  const ah = crypto.createHash("sha256").update(String(a)).digest();
  const bh = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}
function basicAuth(req, res, next) {
  res.set("Cache-Control", "no-store");
  const header = req.get("authorization") || "";
  if (!header.startsWith("Basic ")) return deny();
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return deny();
  }
  const split = decoded.indexOf(":");
  if (split < 0) return deny();
  const user = decoded.slice(0, split);
  const password = decoded.slice(split + 1);
  if (!safeEqual(user, RESULTS_USER) || !safeEqual(password, RESULTS_PASSWORD))
    return deny();
  return next();
  function deny() {
    res.set(
      "WWW-Authenticate",
      'Basic realm="Prediction Challenge Results", charset="UTF-8"',
    );
    return res.status(401).send("Authentication required.");
  }
}
function sameOrigin(req) {
  const origin = req.get("origin");
  const host = req.get("host");
  if (!origin) return true; // permits non-browser clients; remove if browser-only is required
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs
      .writeFile(DATA_FILE, "submitted_at,name,guess\n", {
        mode: 0o600,
        flag: "wx",
      })
      .catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
  }
}
async function readRows() {
  await ensureDataFile();
  const text = await fs.readFile(DATA_FILE, "utf8");
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      // Safe for this app because validated names cannot contain commas or quotes.
      const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)"$/);
      return match
        ? { submittedAt: match[1], name: match[2], guess: Number(match[3]) }
        : null;
    })
    .filter(Boolean);
}

app.post("/submit", submitLimiter, async (req, res, next) => {
  try {
    if (!sameOrigin(req))
      return res.status(403).send("Invalid request origin.");
    if (Date.now() >= Date.parse(SUBMISSIONS_CLOSE))
      return res.status(403).send("Submissions are closed.");
    if (req.body.website) return res.status(400).send("Invalid submission."); // honeypot

    const name = String(req.body.name || "")
      .trim()
      .replace(/\s+/g, " ");
    const guessText = String(req.body.guess || "").trim();
    if (!NAME_RE.test(name))
      return res
        .status(400)
        .send(
          "Name must be 2-40 characters using letters, numbers, and spaces only.",
        );
    if (!/^\d{7,8}$/.test(guessText))
      return res.status(400).send("Guess must contain 7-8 digits only.");
    const guess = Number(guessText);
    if (
      !Number.isSafeInteger(guess) ||
      guess < MIN_GUESS ||
      guess > MAX_GUESS
    ) {
      return res
        .status(400)
        .send(
          `Guess must be between ${MIN_GUESS.toLocaleString()} and ${MAX_GUESS.toLocaleString()}.`,
        );
    }

    const rows = await readRows();
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).send("A submission already exists for that name.");
    }
    const line =
      [new Date().toISOString(), name, guess].map(csvCell).join(",") + "\n";
    await fs.appendFile(DATA_FILE, line, { encoding: "utf8", mode: 0o600 });
    return res
      .status(201)
      .sendFile(path.join(__dirname, "public", "thanks.html"));
  } catch (err) {
    next(err);
  }
});

app.get("/results", resultsLimiter, basicAuth, async (req, res, next) => {
  try {
    const rows = await readRows();
    const body = rows
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.name)}</td><td>${r.guess.toLocaleString()}</td><td>${escapeHtml(r.submittedAt)}</td></tr>`,
      )
      .join("");
    res
      .type("html")
      .send(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Prediction Challenge Results</title><link rel="stylesheet" href="/styles.css"><main><h1>Prediction Challenge Results</h1><p>${rows.length} submission(s)</p><table><thead><tr><th>Name</th><th>Guess</th><th>Submitted (UTC)</th></tr></thead><tbody>${body}</tbody></table></main></html>`,
      );
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("An unexpected error occurred.");
});

ensureDataFile()
  .then(() => app.listen(PORT, () => console.log(`Listening on port ${PORT}`)))
  .catch((err) => {
    console.error("Could not initialize data file:", err);
    process.exit(1);
  });
