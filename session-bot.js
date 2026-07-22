// ============================================================
// SESSION BOT — Génère une TG_SESSION GramJS via Telegram
// ------------------------------------------------------------
// Utilisation :
//   node session-bot.js
//
// Dans Telegram, envoie "start" au bot → il te guide étape par étape.
// La session générée est valide pour TG_SESSION dans render.yaml.
//
// Token utilisé : SESSION_BOT_TOKEN (variable d'environnement)
//   ou défini en dur ci-dessous pour usage local.
// ============================================================

require('dotenv').config();

const TelegramBot     = require('node-telegram-bot-api');
const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const { Api }            = require('telegram');

// ── Config ────────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.SESSION_BOT_TOKEN || '8627302352:AAF21Vn4bhLXk7PVzjZzHME9fZeZoQa5C18';
const API_ID    = parseInt(process.env.TG_API_ID   || '29177661', 10);
const API_HASH  = process.env.TG_API_HASH || 'a8639172fa8d35dbfd8ea46286d349ab';

if (!BOT_TOKEN) { console.error('[FATAL] SESSION_BOT_TOKEN manquant'); process.exit(1); }

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── État par utilisateur ───────────────────────────────────────────────────
// { chatId → { step, phone, hash, client } }
const sessions = new Map();

function getState(chatId) {
  if (!sessions.has(chatId)) sessions.set(chatId, { step: 'idle' });
  return sessions.get(chatId);
}

bot.getMe().then(me => console.log(`[SESSION-BOT] @${me.username} démarré`)).catch(console.error);

// ── /start ou "start" ─────────────────────────────────────────────────────
bot.onText(/^\/?(start)$/i, async (msg) => {
  const chatId = msg.chat.id;
  const s = getState(chatId);

  // Réinitialiser
  if (s.client) { try { await s.client.disconnect(); } catch(e) {} }
  sessions.set(chatId, { step: 'await_phone' });

  await bot.sendMessage(chatId,
    `👋 *Générateur de session Telegram*\n\n` +
    `Ce bot va générer une chaîne \`TG_SESSION\` pour configurer ton userbot.\n\n` +
    `📱 *Entre ton numéro de téléphone Telegram* (avec l'indicatif pays) :\n` +
    `Ex : \`+22995501564\``,
    { parse_mode: 'Markdown' }
  );
});

// ── Messages texte ────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const text   = msg.text.trim();
  const s      = getState(chatId);

  // Ignorer les commandes /start déjà traitées
  if (/^\/?(start)$/i.test(text)) return;

  // ── Étape 1 : numéro de téléphone ──────────────────────────────────────
  if (s.step === 'await_phone') {
    const phone = text.startsWith('+') ? text : '+' + text;
    s.phone = phone;
    s.step  = 'connecting';

    await bot.sendMessage(chatId, `⏳ Connexion à Telegram et envoi du code sur *${phone}*...`, { parse_mode: 'Markdown' });

    try {
      const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });
      await client.connect();
      const r = await client.invoke(new Api.auth.SendCode({
        phoneNumber: phone,
        apiId:       API_ID,
        apiHash:     API_HASH,
        settings:    new Api.CodeSettings({}),
      }));
      s.client = client;
      s.hash   = r.phoneCodeHash;
      s.step   = 'await_code';

      await bot.sendMessage(chatId,
        `✅ Code envoyé sur *${phone}* via l'application Telegram !\n\n` +
        `🔑 Entre le code avec le préfixe \`aa\`\n` +
        `Ex : si le code est \`12345\`, envoie \`aa12345\``,
        { parse_mode: 'Markdown' }
      );
    } catch(e) {
      s.step = 'await_phone';
      await bot.sendMessage(chatId, `❌ Erreur : ${e.message}\n\nRéessaie avec ton numéro.`);
    }
    return;
  }

  // ── Étape 2 : code de vérification (préfixe aa) ────────────────────────
  if (s.step === 'await_code' && text.toLowerCase().startsWith('aa')) {
    const code = text.slice(2).trim();
    s.step = 'signing_in';

    await bot.sendMessage(chatId, `⏳ Vérification du code...`);

    try {
      await s.client.invoke(new Api.auth.SignIn({
        phoneNumber:   s.phone,
        phoneCodeHash: s.hash,
        phoneCode:     code,
      }));
      const me  = await s.client.getMe();
      const str = s.client.session.save();
      s.step = 'done';

      await bot.sendMessage(chatId,
        `✅ *Connecté avec succès !*\n\n` +
        `👤 Compte : *${me.firstName || ''} ${me.username ? '@'+me.username : ''}*\n` +
        `🆔 ID : \`${me.id}\`\n\n` +
        `🔐 *Ta TG\\_SESSION à copier dans Render :*`,
        { parse_mode: 'Markdown' }
      );
      // Envoyer la session dans un message séparé pour faciliter le copier-coller
      await bot.sendMessage(chatId, str);
      await bot.sendMessage(chatId,
        `📋 *Instructions :*\n` +
        `1. Copie la chaîne ci-dessus\n` +
        `2. Render → ton service → *Environment*\n` +
        `3. Clé : \`TG_SESSION\` → colle la valeur\n` +
        `4. *Save* et redémarre le service`,
        { parse_mode: 'Markdown' }
      );
      await s.client.disconnect();
    } catch(e) {
      if (e.message.includes('SESSION_PASSWORD_NEEDED')) {
        s.step = 'await_2fa';
        await bot.sendMessage(chatId,
          `🔒 *Authentification 2FA requise*\n\n` +
          `Entre ton mot de passe Telegram avec le préfixe \`aa\`\n` +
          `Ex : \`aaTonMotDePasse\``,
          { parse_mode: 'Markdown' }
        );
      } else if (e.message.includes('PHONE_CODE_EXPIRED')) {
        s.step = 'await_phone';
        await bot.sendMessage(chatId,
          `⏰ Code expiré. Envoie à nouveau ton numéro de téléphone pour recevoir un nouveau code.`
        );
      } else if (e.message.includes('PHONE_CODE_INVALID')) {
        s.step = 'await_code';
        await bot.sendMessage(chatId,
          `❌ Code invalide. Vérifie et renvoie \`aa\` suivi du bon code.\n` +
          `Ex : \`aa12345\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        s.step = 'await_phone';
        await bot.sendMessage(chatId, `❌ Erreur : ${e.message}`);
      }
    }
    return;
  }

  // ── Étape 3 : mot de passe 2FA (préfixe aa) ────────────────────────────
  if (s.step === 'await_2fa' && text.toLowerCase().startsWith('aa')) {
    const password = text.slice(2);
    s.step = 'signing_in_2fa';

    await bot.sendMessage(chatId, `⏳ Vérification du mot de passe 2FA...`);

    try {
      const pwInfo = await s.client.invoke(new Api.account.GetPassword());
      const { computeCheck } = require('telegram/Password');
      const check = await computeCheck(pwInfo, password);
      await s.client.invoke(new Api.auth.CheckPassword({ password: check }));

      const me  = await s.client.getMe();
      const str = s.client.session.save();
      s.step = 'done';

      await bot.sendMessage(chatId,
        `✅ *Connecté avec succès (2FA) !*\n\n` +
        `👤 Compte : *${me.firstName || ''} ${me.username ? '@'+me.username : ''}*\n\n` +
        `🔐 *Ta TG\\_SESSION :*`,
        { parse_mode: 'Markdown' }
      );
      await bot.sendMessage(chatId, str);
      await bot.sendMessage(chatId,
        `📋 Copie cette chaîne dans Render → Environment → \`TG_SESSION\``,
        { parse_mode: 'Markdown' }
      );
      await s.client.disconnect();
    } catch(e) {
      s.step = 'await_2fa';
      await bot.sendMessage(chatId, `❌ Mot de passe incorrect. Réessaie avec \`aaTonMotDePasse\`.`, { parse_mode: 'Markdown' });
    }
    return;
  }

  // ── Message hors contexte ───────────────────────────────────────────────
  if (s.step === 'idle' || s.step === 'done') {
    await bot.sendMessage(chatId, `Envoie \`start\` pour générer une nouvelle session.`, { parse_mode: 'Markdown' });
  }
});

bot.on('polling_error', e => console.error('[BOT-ERR]', e.message));
process.once('SIGTERM', () => bot.stopPolling());
process.once('SIGINT',  () => { bot.stopPolling(); process.exit(0); });

console.log('[SESSION-BOT] En attente de messages...');
