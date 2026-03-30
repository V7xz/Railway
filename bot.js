const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
} = require("discord.js");

require("dotenv").config();

// ================= ENV =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const API_URL = process.env.API_URL;
const API_SECRET = process.env.API_SECRET;

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ================= HELPERS =================
function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const block = () =>
    Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");

  return `${block()}-${block()}-${block()}-${block()}`;
}

function parseDuration(input) {
  if (!input) return null;
  if (input === "perm") return -1;

  const m = input.match(/^(\d+)([hdm])$/i);
  if (!m) return null;

  const v = parseInt(m[1]);
  const u = m[2].toLowerCase();

  if (u === "h") return v * 3600000;
  if (u === "d") return v * 86400000;
  if (u === "m") return v * 30 * 86400000;

  return null;
}

// ================= API =================
async function apiPost(path, body) {
  try {
    const res = await fetch(API_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, secret: API_SECRET }),
    });

    const text = await res.text();
    console.log(`[apiPost] ${path} →`, text);
    try {
      return JSON.parse(text);
    } catch {
      return { success: false };
    }
  } catch (err) {
    console.error(`[apiPost] ${path} ERROR:`, err.message);
    return { success: false };
  }
}

async function apiGet(path) {
  try {
    const res = await fetch(API_URL + path);
    const text = await res.text();
    console.log(`[apiGet] ${path} →`, text);
    return JSON.parse(text);
  } catch (err) {
    console.error(`[apiGet] ${path} ERROR:`, err.message);
    return {};
  }
}

// ================= ADMIN =================
function isAdmin(interaction) {
  return interaction.member?.permissions?.has(
    PermissionsBitField.Flags.Administrator
  );
}

// ================= LOG =================
async function sendLog(message) {
  try {
    if (!LOG_CHANNEL_ID) return;
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) ch.send(message);
  } catch {}
}

// ================= SCRIPT SLOT =================
const SCRIPT_SLOT = (key) => `
_G.KEY = "${key}"
loadstring(game:HttpGet("https://raw.githubusercontent.com/V7xz/Majesty-46.0/refs/heads/main/Majesty"))()
`;

// ================= COMMANDS =================
const commands = [

  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate license key (ADMIN ONLY)")
    .addStringOption(o =>
      o.setName("time")
        .setDescription("Key duration")
        .setRequired(true)
        .addChoices(
          { name: "1 Hour", value: "1h" },
          { name: "3 Hours", value: "3h" },
          { name: "12 Hours", value: "12h" },
          { name: "1 Day", value: "1d" },
          { name: "3 Days", value: "3d" },
          { name: "7 Days", value: "7d" },
          { name: "1 Month", value: "1m" },
          { name: "Permanent", value: "perm" }
        )
    ),

  new SlashCommandBuilder()
    .setName("extendkey")
    .setDescription("Extend key (ADMIN ONLY)")
    .addStringOption(o =>
      o.setName("key")
        .setDescription("Key to extend")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("time")
        .setDescription("Extend duration")
        .setRequired(true)
        .addChoices(
          { name: "1 Hour", value: "1h" },
          { name: "3 Hours", value: "3h" },
          { name: "12 Hours", value: "12h" },
          { name: "1 Day", value: "1d" },
          { name: "3 Days", value: "3d" },
          { name: "7 Days", value: "7d" },
          { name: "1 Month", value: "1m" }
        )
    ),

  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Reset HWID (ADMIN ONLY)")
    .addStringOption(o =>
      o.setName("key")
        .setDescription("Key to reset")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Revoke key (ADMIN ONLY)")
    .addStringOption(o =>
      o.setName("key")
        .setDescription("Key to revoke")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("checkkey")
    .setDescription("Check key info (ADMIN ONLY)")
    .addStringOption(o =>
      o.setName("key")
        .setDescription("Key to check")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("keylist")
    .setDescription("Show all keys (ADMIN ONLY)"),

].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ BOT READY");
})();

// ================= MAIN =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ================= GENKEY =================
  if (interaction.commandName === "genkey") {
    if (!isAdmin(interaction))
      return interaction.reply({ content: "❌ Admin only", flags: 64 });

    const key = generateKey();
    const time = interaction.options.getString("time");

    const res = await apiPost("/addkey", {
      key,
      duration: parseDuration(time),
    });

    if (res.success) {
      // Auto mark as used so no redeem needed
      await apiPost("/redeem", {
        key,
        userId: "auto",
      });
      sendLog(`🔑 GENKEY ${interaction.user.tag} → ${key} (${time})`);
    }

    return interaction.reply({
      content: res.success
        ? `🔑 KEY:\n\`${key}\`\n\n\`\`\`lua\n${SCRIPT_SLOT(key)}\`\`\``
        : "❌ FAILED",
      flags: 64,
    });
  }

  // ================= EXTEND =================
  if (interaction.commandName === "extendkey") {
    if (!isAdmin(interaction))
      return interaction.reply({ content: "❌ Admin only", flags: 64 });

    const key = interaction.options.getString("key");
    const time = interaction.options.getString("time");

    const res = await apiPost("/extendkey", {
      key,
      duration: parseDuration(time),
    });

    return interaction.reply({
      content: res.success ? `⏫ EXTENDED (+${time})` : "❌ FAILED",
      flags: 64,
    });
  }

  // ================= RESET HWID =================
  if (interaction.commandName === "resethwid") {
    if (!isAdmin(interaction))
      return interaction.reply({ content: "❌ Admin only", flags: 64 });

    const key = interaction.options.getString("key");

    const res = await apiPost("/resethwid", { key });

    return interaction.reply({
      content: res.success ? "🔄 HWID RESET" : "❌ FAILED",
      flags: 64,
    });
  }

  // ================= REVOKE =================
  if (interaction.commandName === "revokekey") {
    if (!isAdmin(interaction))
      return interaction.reply({ content: "❌ Admin only", flags: 64 });

    const key = interaction.options.getString("key");

    const res = await apiPost("/revokekey", { key });

    return interaction.reply({
      content: res.success ? "🚫 REVOKED" : "❌ FAILED",
      flags: 64,
    });
  }

  // ================= CHECK KEY =================
  if (interaction.commandName === "checkkey") {
    if (!isAdmin(interaction))
      return interaction.reply({ content: "❌ Admin only", flags: 64 });

    const key = interaction.options.getString("key");
    const allKeys = await apiGet(`/listkeys`);
    const keyData = allKeys[key];

    if (!keyData) {
      return interaction.reply({
        content: "❌ KEY NOT FOUND",
        flags: 64,
      });
    }

    return interaction.reply({
      content: `✅ KEY INFO\nKey: \`${key}\`\nHWID: ${keyData.hwid || "none"}\nExpires: ${keyData.expires || "never"}\nRevoked: ${keyData.revoked}`,
      flags: 64,
    });
  }

  // ================= KEYLIST =================
  if (interaction.commandName === "keylist") {
    if (!isAdmin(interaction))
      return interaction.reply({ content: "❌ Admin only", flags: 64 });

    const allKeys = await apiGet(`/listkeys`);

    if (!allKeys || Object.keys(allKeys).length === 0) {
      return interaction.reply({
        content: "📭 No keys found",
        flags: 64,
      });
    }

    const formatted = Object.entries(allKeys)
      .map(([key, data]) => {
        return `🔑 ${key}\nHWID: ${data.hwid || "none"}\nExpires: ${data.expires || "never"}\nRevoked: ${data.revoked}`;
      })
      .join("\n\n");

    return interaction.reply({
      content: `📋 KEY LIST\n\n\`\`\`\n${formatted.slice(0, 3500)}\n\`\`\``,
      flags: 64,
    });
  }

});

client.login(TOKEN);
