// ============================================================
// USERBOT (GramJS / MTProto) — Scan des membres EXISTANTS d'un canal
// ------------------------------------------------------------
// Un bot à token (node-telegram-bot-api) ne peut JAMAIS lister les membres
// existants d'un canal : Telegram l'interdit pour tous les bots. Seul un
// vrai compte Telegram (connecté avec un numéro de téléphone) le peut, via
// l'API MTProto — c'est ce module qui s'en charge, avec la librairie GramJS.
//
// Configuration requise (variables d'environnement, JAMAIS en dur dans le code) :
//   TG_API_ID    → depuis https://my.telegram.org
//   TG_API_HASH  → depuis https://my.telegram.org
//   TG_SESSION   → généré une seule fois en local avec generate-session.js
//
// Si TG_SESSION n'est pas configuré, ce module reste inactif sans planter
// le reste de l'application (fallback : bouton d'activation manuelle dans
// le canal, déjà en place dans server.js).
// ============================================================

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");

const API_ID    = parseInt(process.env.TG_API_ID || "0", 10);
const API_HASH  = process.env.TG_API_HASH || "";
const SESSION   = process.env.TG_SESSION || "";

let client = null;
let ready  = false;

async function initUserbot() {
  if (!API_ID || !API_HASH || !SESSION) {
    console.log("[USERBOT] TG_API_ID / TG_API_HASH / TG_SESSION non configurés — scan automatique des membres existants désactivé (le bouton d'activation manuelle reste disponible).");
    return null;
  }
  try {
    client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
      connectionRetries: 5,
    });
    await client.connect();
    const me = await client.getMe();
    ready = true;
    console.log(`[USERBOT] Connecté en tant que ${me.username || me.firstName || me.id}.`);
    return client;
  } catch (e) {
    console.error("[USERBOT-INIT-ERR]", e.message);
    ready = false;
    return null;
  }
}

// Convertit un ID de canal format Bot API (-1001234567890) en entité GramJS
async function resolveChannelEntity(channelIdRaw) {
  const idStr = String(channelIdRaw);
  try {
    // GramJS résout directement la plupart des IDs -100xxxx s'il les a déjà "vus"
    return await client.getEntity(idStr);
  } catch (e) {
    // Repli : chercher le canal parmi les dialogues du compte userbot
    // (le compte doit être membre/admin du canal pour que ça fonctionne)
    const bare = idStr.startsWith("-100") ? idStr.slice(4) : idStr.replace("-", "");
    const dialogs = await client.getDialogs({});
    const found = dialogs.find(d => String(d.entity?.id) === bare);
    if (found) return found.entity;
    throw new Error(`Canal introuvable côté userbot (${channelIdRaw}). Vérifie que le compte userbot est bien membre/admin de ce canal.`);
  }
}

/**
 * Scanne tous les membres existants d'un canal et applique grantFn à chacun.
 * @param {string} channelIdRaw - ID du canal au format Bot API (ex: "-1001234567890")
 * @param {function} grantFn - async (tgUser) => résultat de grantOrDenyTrial
 */
async function scanExistingMembers(channelIdRaw, grantFn) {
  if (!ready || !client) return { ok: false, reason: "userbot_non_configure" };
  try {
    const entity = await resolveChannelEntity(channelIdRaw);
    const participants = await client.getParticipants(entity, { limit: 10000 });

    let scanned = 0, granted = 0, skipped = 0, errors = 0;
    for (const p of participants) {
      if (p.bot || p.deleted || p.self) { skipped++; continue; }
      scanned++;
      try {
        const result = await grantFn({
          id: Number(p.id),
          username: p.username || null,
          first_name: p.firstName || p.username || null,
        });
        if (result && result.status === "granted") granted++;
      } catch (e) {
        errors++;
        console.error("[USERBOT-GRANT-ERR]", p.id, e.message);
      }
    }
    return { ok: true, total: participants.length, scanned, granted, skipped, errors };
  } catch (e) {
    console.error("[USERBOT-SCAN-ERR]", e.message);
    return { ok: false, reason: e.message };
  }
}

function isUserbotReady() { return ready; }

module.exports = { initUserbot, scanExistingMembers, isUserbotReady };
