const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());

const FILE = "/data/keys.json";
const API_SECRET = process.env.API_SECRET || "Sigmaboy";

// =====================
// ENSURE FILE EXISTS
// =====================
if (!fs.existsSync("/data")) {
  fs.mkdirSync("/data", { recursive: true });
  console.log("📁 /data folder dibuat");
}
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, "{}");
  console.log("📄 keys.json dibuat otomatis");
}

// =====================
// LOAD KEYS
// =====================
let keys = {};
try {
  keys = JSON.parse(fs.readFileSync(FILE));
} catch {
  keys = {};
}

// =====================
// SAVE KEYS
// =====================
function saveKeys() {
  fs.writeFileSync(FILE, JSON.stringify(keys, null, 2));
}

// =====================
// AUTO DELETE EXPIRED
// =====================
setInterval(() => {
  let changed = false;

  for (const key in keys) {
    const data = keys[key];

    if (data.expires && Date.now() > new Date(data.expires).getTime()) {
      delete keys[key];
      changed = true;
      console.log(`🗑️ Key expired & deleted: ${key}`);
    }
  }

  if (changed) saveKeys();
}, 60 * 1000);

// =====================
// SECRET CHECK
// =====================
function checkSecret(req, res, next) {
  if (!API_SECRET) return next();

  if (req.body.secret !== API_SECRET) {
    return res.status(403).json({ success: false, message: "Invalid secret" });
  }

  next();
}

// =====================
// ADD KEY
// =====================
app.post("/addkey", checkSecret, (req, res) => {
  const { key, duration } = req.body;

  if (!key) {
    return res.status(400).json({ success: false, message: "Key required" });
  }

  let expires = null;

  if (duration && duration !== -1) {
    expires = new Date(Date.now() + duration).toISOString();
  }

  keys[key] = {
    used: false,
    userId: null,
    hwid: null,
    expires,
    revoked: false,
    lastReset: 0,
    createdAt: new Date().toISOString(),
  };

  saveKeys();

  console.log("✅ Key created:", key);

  res.json({ success: true, key, expires });
});

// =====================
// EXTEND KEY
// =====================
app.post("/extendkey", checkSecret, (req, res) => {
  const { key, duration } = req.body;

  const data = keys[key];

  if (!data) {
    return res.json({ success: false, message: "Key not found" });
  }

  if (data.revoked) {
    return res.json({ success: false, message: "Key revoked" });
  }

  let baseTime = Date.now();

  if (data.expires && new Date(data.expires).getTime() > Date.now()) {
    baseTime = new Date(data.expires).getTime();
  }

  if (duration === -1) {
    data.expires = null;
  } else {
    data.expires = new Date(baseTime + duration).toISOString();
  }

  saveKeys();

  console.log("⏫ Key extended:", key);

  res.json({ success: true, expires: data.expires });
});

// =====================
// REDEEM SYSTEM
// =====================
app.post("/redeem", checkSecret, (req, res) => {
  const { key, userId } = req.body;

  const data = keys[key];

  if (!data) {
    return res.json({ success: false, message: "Key not found" });
  }

  if (data.revoked) {
    return res.json({ success: false, message: "Key revoked" });
  }

  if (data.expires && Date.now() > new Date(data.expires).getTime()) {
    delete keys[key];
    saveKeys();
    return res.json({ success: false, message: "Key expired" });
  }

  if (data.used) {
    return res.json({ success: false, message: "Key already redeemed" });
  }

  data.used = true;
  data.userId = userId;

  saveKeys();

  console.log(`🎟️ Redeemed: ${key} by ${userId}`);

  res.json({ success: true });
});

// =====================
// VERIFY KEY
// =====================
app.get("/verify", (req, res) => {
  const { key, hwid } = req.query;

  const data = keys[key];

  if (!data) return res.json({ valid: false, reason: "Key not found" });

  if (data.revoked) {
    return res.json({ valid: false, reason: "Key revoked" });
  }

  if (!data.used) {
    return res.json({ valid: false, reason: "Key not redeemed" });
  }

  if (data.expires && Date.now() > new Date(data.expires).getTime()) {
    delete keys[key];
    saveKeys();
    return res.json({ valid: false, reason: "Key expired" });
  }

  if (hwid && hwid !== "check") {
    if (!data.hwid) {
      data.hwid = hwid;
      saveKeys();
    } else if (data.hwid !== hwid) {
      return res.json({ valid: false, reason: "HWID mismatch" });
    }
  }

  res.json({
    valid: true,
    hwid: data.hwid,
    expires: data.expires,
    used: data.used || false,
    userId: data.userId || null,
  });
});

// =====================
// REVOKE KEY
// =====================
app.post("/revokekey", checkSecret, (req, res) => {
  const { key } = req.body;

  if (!keys[key]) {
    return res.json({ success: false, message: "Key not found" });
  }

  keys[key].revoked = true;
  saveKeys();

  console.log("🚫 Key revoked:", key);

  res.json({ success: true });
});

// =====================
// RESET HWID
// =====================
app.post("/resethwid", checkSecret, (req, res) => {
  const { key } = req.body;

  const data = keys[key];

  if (!data) {
    return res.json({ success: false, message: "Key not found" });
  }

  const now = Date.now();

  if (data.lastReset && now - data.lastReset < 86400000) {
    return res.json({
      success: false,
      message: "Reset limit (24h)",
      remaining: 86400000 - (now - data.lastReset),
    });
  }

  data.hwid = null;
  data.lastReset = now;

  saveKeys();

  console.log("🔄 HWID reset:", key);

  res.json({ success: true });
});

// =====================
// LIST KEYS
// =====================
app.get("/listkeys", (req, res) => {
  const sorted = Object.fromEntries(
    Object.entries(keys).sort(
      (a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt)
    )
  );

  res.json(sorted);
});

// =====================
// GENERATE KEY ENDPOINT
// =====================
app.post("/genkey", checkSecret, (req, res) => {
  const key = Math.random().toString(36).substring(2, 6).toUpperCase() +
              "-" +
              Math.random().toString(36).substring(2, 6).toUpperCase() +
              "-" +
              Math.random().toString(36).substring(2, 6).toUpperCase() +
              "-" +
              Math.random().toString(36).substring(2, 6).toUpperCase();

  keys[key] = {
    used: false,
    userId: null,
    hwid: null,
    expires: null,
    revoked: false,
    lastReset: 0,
    createdAt: new Date().toISOString(),
  };

  saveKeys();

  console.log("🆕 Generated key:", key);

  res.json({ success: true, key });
});

// =====================
// VALIDATE (Lua friendly)
// =====================
app.post("/validate", (req, res) => {
  const { key, hwid } = req.body;

  const data = keys[key];

  if (!data) {
    return res.json({ success: false, message: "Invalid key" });
  }

  if (data.revoked) {
    return res.json({ success: false, message: "Key revoked" });
  }

  if (data.expires && Date.now() > new Date(data.expires).getTime()) {
    return res.json({ success: false, message: "Key expired" });
  }

  if (data.hwid && data.hwid !== hwid) {
    return res.json({ success: false, message: "HWID mismatch" });
  }

  if (!data.hwid) {
    data.hwid = hwid;
    saveKeys();
  }

  res.json({ success: true, message: "Valid key" });
});

// =====================
// HEALTH CHECK
// =====================
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    keys: Object.keys(keys).length
  });
});

// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
