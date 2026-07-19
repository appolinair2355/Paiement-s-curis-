// ============================================================
// SOSSOU KOUAMÉ — Serveur Express complet
// Login + Dashboard + Paiement Money Fusion + Crypto + BDD Render
// ============================================================

const express    = require("express");
const path       = require("path");
const { Pool }   = require("pg");
const bcrypt     = require("bcrypt");
const session    = require("express-session");
const nodemailer = require("nodemailer");

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── BASE DE DONNÉES ──────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: 'postgresql://bonjour_user:WzeZsFKlKWU180iOFxngBEaThdG1kKUR@dpg-d962464s728c73e8p250-a.oregon-postgres.render.com/bonjour',
  ssl: { rejectUnauthorized: false }
});

// ─── EMAIL (nodemailer / Gmail) ───────────────────────────────────────────
const gmailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: 'sossoukouam@gmail.com',
    pass: 'gcwbgdpqntabwlud',
  },
});

async function sendPaymentEmail(userId, details) {
  if (!'sossoukouam@gmail.com' || !'gcwbgdpqntabwlud') return;
  try {
    const r = await pool.query(
      "SELECT username, first_name, last_name, email FROM users WHERE id = $1",
      [userId]
    );
    if (!r.rows.length) return;
    const u = r.rows[0];
    const toEmail = u.email || `${u.username}@gmail.com`;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;
    const subject = `✅ Paiement confirmé — ${details.label}`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0f1e;color:#fff;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#F0C040,#C9A030);padding:28px 32px;text-align:center">
    <h1 style="margin:0;font-size:1.4rem;color:#000">Sossou Kouamé Shopping Boutique</h1>
  </div>
  <div style="padding:32px">
    <h2 style="color:#F0C040;margin-top:0">Bonjour ${name} 👋</h2>
    <p style="color:rgba(255,255,255,0.8);font-size:1rem;line-height:1.6">
      Votre paiement a bien été <strong style="color:#10B981">confirmé et validé</strong>.<br>
      Merci pour votre confiance !
    </p>
    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(240,192,64,0.3);border-radius:10px;padding:20px;margin:20px 0">
      <table style="width:100%;border-collapse:collapse;font-size:.92rem">
        <tr><td style="color:rgba(255,255,255,0.5);padding:6px 0">Service</td><td style="color:#fff;font-weight:700;text-align:right">${details.label}</td></tr>
        ${details.amount ? `<tr><td style="color:rgba(255,255,255,0.5);padding:6px 0">Montant</td><td style="color:#F0C040;font-weight:700;text-align:right">${details.amount}</td></tr>` : ""}
        ${details.duration ? `<tr><td style="color:rgba(255,255,255,0.5);padding:6px 0">Durée</td><td style="color:#fff;text-align:right">${details.duration}</td></tr>` : ""}
        <tr><td style="color:rgba(255,255,255,0.5);padding:6px 0">Statut</td><td style="color:#10B981;font-weight:700;text-align:right">✓ Validé</td></tr>
      </table>
    </div>
    <p style="color:rgba(255,255,255,0.6);font-size:.88rem">
      Pour toute question, répondez à cet email ou contactez-nous directement.
    </p>
    <div style="text-align:center;margin-top:24px">
      <span style="color:#F0C040;font-size:.8rem">© 2026 Sossou Kouamé Shopping Boutique</span>
    </div>
  </div>
</div>`;
    await gmailTransport.sendMail({
      from: `"Sossou Kouamé" <${'sossoukouam@gmail.com'}>`,
      to: toEmail,
      subject,
      html,
    });
    console.log("[EMAIL] Envoyé à", toEmail);
  } catch (e) {
    console.error("[EMAIL-ERR]", e.message);
  }
}

// ─── MONEY FUSION ─────────────────────────────────────────────────────────
const CONFIG = {
  API_URL:    "https://pay.moneyfusion.net/Paiements_m/7da7654df194be93/pay/",
  STATUS_URL: "https://pay.moneyfusion.net/paiementNotif",
  API_KEY:    'moneyfusion_v1_69777b802181d4ebf71e2bde_9F8AA2BB17ED57E9EE1835A9C1AEE6A03012A677E40C93636A5458C6AE798852',
};

// ─── PLANS D'ABONNEMENT (lus depuis la BDD en temps réel) ────────────────
const DEFAULT_PLANS = [
  { id: "1j",  label: "1 Jour",    duration_minutes:  1440, amount_usd:  1.08, price_xof:   656, price_eur:  1 },
  { id: "15j", label: "15 Jours",  duration_minutes: 21600, amount_usd: 12.96, price_xof:  7872, price_eur: 12 },
  { id: "30j", label: "30 Jours",  duration_minutes: 43200, amount_usd: 32.40, price_xof: 19680, price_eur: 30 },
];

async function getPlans() {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'subscription_plans'");
    if (r.rows.length > 0) return JSON.parse(r.rows[0].value);
  } catch (e) { console.error("[PLANS-DB]", e.message); }
  return DEFAULT_PLANS;
}


// ─── PALIERS DE SOUTIEN (lus depuis support_packs en temps réel) ─────────
async function getSupportTiers() {
  try {
    const r = await pool.query(
      "SELECT id, label, amount_usd FROM support_packs WHERE enabled = true ORDER BY sort_order ASC NULLS LAST, id ASC"
    );
    // La colonne amount_usd contient les montants en XOF (FCFA)
    return r.rows.map(row => ({
      id:        `sup_${row.id}`,
      label:     row.label,
      price_xof: Number(row.amount_usd),
    }));
  } catch (e) {
    console.error("[SUPPORT-TIERS-DB]", e.message);
    return [];
  }
}

// ─── PRIX DES STRATÉGIES (lus depuis settings en temps réel) ─────────────
async function getStrategyPrices() {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'strategy_prices'");
    if (r.rows.length > 0) return JSON.parse(r.rows[0].value);
  } catch (e) { console.error("[STRAT-PRICES-DB]", e.message); }
  return { default_combo: 15000, default_standard: 10000 };
}

// ─── WALLETS CRYPTO ───────────────────────────────────────────────────────
const CRYPTO_WALLETS = [
  { id: "USDT_TRC20", name: "Tether TRC20", symbol: "USDT", icon: "₮", network: "TRON",     address: "T9zZ123xABCdef456GHIjkl789mnoPQRst", min: "10 USDT" },
  { id: "USDT_ERC20", name: "Tether ERC20", symbol: "USDT", icon: "₮", network: "Ethereum", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", min: "10 USDT" },
  { id: "BTC",        name: "Bitcoin",      symbol: "BTC",  icon: "₿", network: "Bitcoin",  address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", min: "0.001 BTC" },
  { id: "ETH",        name: "Ethereum",     symbol: "ETH",  icon: "Ξ", network: "Ethereum", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", min: "0.01 ETH" },
];

// ─── TAUX DE CHANGE TEMPS RÉEL (cache 1h) ────────────────────────────────
let _rateCache = { data: null, ts: 0 };
async function getExchangeRates() {
  const now = Date.now();
  if (_rateCache.data && now - _rateCache.ts < 3_600_000) return _rateCache.data;
  try {
    const [fiatRes, cryptoRes] = await Promise.all([
      fetch("https://open.er-api.com/v6/latest/USD"),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"),
    ]);
    const fiat   = await fiatRes.json();
    const crypto = await cryptoRes.json();
    const data = {
      usd_to_xof: Math.round(fiat.rates?.XOF  || 656),
      usd_to_eur: parseFloat((fiat.rates?.EUR  || 0.93).toFixed(4)),
      btc_usd:    Math.round(crypto.bitcoin?.usd  || 60000),
      eth_usd:    Math.round(crypto.ethereum?.usd || 3000),
      updated_at: new Date().toISOString(),
    };
    _rateCache = { data, ts: now };
    console.log("[RATES]", JSON.stringify(data));
    return data;
  } catch (e) {
    console.error("[RATES-ERR]", e.message);
    const fallback = { usd_to_xof: 656, usd_to_eur: 0.93, btc_usd: 60000, eth_usd: 3000 };
    if (!_rateCache.data) _rateCache = { data: fallback, ts: now - 3_500_000 };
    return _rateCache.data;
  }
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'sossou-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Non authentifié" });
  next();
}


async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Non authentifié" });
  try {
    const r = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.session.userId]);
    if (r.rows.length === 0 || !r.rows[0].is_admin) {
      return res.status(403).json({ error: "Accès réservé à l'administrateur" });
    }
    next();
  } catch (e) {
    console.error("[ADMIN-MW]", e);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── STATIC FILES ─────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ─── ROUTE: Racine → login ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── ROUTE: Connexion ─────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Identifiant et mot de passe requis" });

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1",
      [username.trim()]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });

    const user = result.rows[0];

    if (user.is_banned)
      return res.status(403).json({ error: "Ce compte est banni" });

    let valid = false;
    if (user.password_hash) valid = await bcrypt.compare(password, user.password_hash);
    if (!valid && user.plain_password) valid = (password === user.plain_password);

    if (!valid)
      return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });

    req.session.userId   = user.id;
    req.session.username = user.username;

    // Mise à jour last_seen
    await pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error("[LOGIN]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Déconnexion ───────────────────────────────────────────────────
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ─── ROUTE: Profil utilisateur ────────────────────────────────────────────
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, is_premium, is_pro,
              subscription_expires_at, subscription_duration_minutes, account_type, is_admin
       FROM users WHERE id = $1`,
      [req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable" });

    const user = result.rows[0];
    const now  = new Date();
    let remaining_ms   = 0;
    let is_active      = false;

    if (user.subscription_expires_at) {
      remaining_ms = Math.max(0, new Date(user.subscription_expires_at) - now);
      is_active    = remaining_ms > 0;
    }

    const plans = await getPlans();
    res.json({ ...user, remaining_ms, is_active, plans, crypto_wallets: CRYPTO_WALLETS });
  } catch (err) {
    console.error("[ME]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Taux de change ────────────────────────────────────────────────
app.get("/api/rates", requireAuth, async (req, res) => {
  res.json(await getExchangeRates());
});

// ─── ROUTE: Plans (depuis la BDD en temps réel) ───────────────────────────
app.get("/api/plans", async (req, res) => {
  const plans = await getPlans();
  res.json({ plans, crypto_wallets: CRYPTO_WALLETS });
});

// ─── ROUTE: Boutique (stratégies depuis settings + idées depuis DB) ──────
app.get("/api/shop", requireAuth, async (req, res) => {
  try {
    const items = [];

    // 1. Stratégies depuis settings.strategy_shop_desc ──────────────
    const settRes = await pool.query(
      "SELECT value FROM settings WHERE key = 'strategy_shop_desc'"
    );
    if (settRes.rows.length > 0) {
      try {
        const shopDesc = JSON.parse(settRes.rows[0].value);
        const stratPrices = await getStrategyPrices();
        let sortIdx = 1;
        for (const [id, stats] of Object.entries(shopDesc)) {
          // Prix selon catégorie (Combo = C, Standard = S) — lus depuis la BDD
          const price_xof = id.startsWith("C") ? stratPrices.default_combo : stratPrices.default_standard;
          const price_usd = parseFloat((price_xof / 650).toFixed(2));
          items.push({
            id:          `strat_${id}`,
            name:        `Stratégie ${id}`,
            description: `Taux de victoire : ${stats.winRate}% — ${stats.total} parties (${stats.wins}W / ${stats.losses}L)`,
            price_xof,
            price_usd,
            winRate:     stats.winRate,
            is_paid:     true,
            category:    "strategy",
            sort_order:  sortIdx++,
          });
        }
      } catch (e) { console.error("[SHOP-PARSE]", e.message); }
    }

    // 2. Idées de stratégie depuis strategy_ideas ───────────────────
    const ideasRes = await pool.query(
      `SELECT id, name, description, is_paid, price_usd, sort_order
       FROM strategy_ideas WHERE enabled = true
       ORDER BY sort_order ASC NULLS LAST, id ASC`
    );
    for (const row of ideasRes.rows) {
      items.push({
        ...row,
        id:       `idea_${row.id}`,
        price_xof: Math.round((row.price_usd || 0) * 650),
        category: "idea",
      });
    }

    res.json({ items });
  } catch (err) {
    console.error("[SHOP]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Acheter un article de la boutique (stratégie ou idée) ─────────
app.post("/api/buy-item", requireAuth, async (req, res) => {
  const { item_id, item_name, price_xof, numeroSend } = req.body;

  if (!item_id)   return res.status(400).json({ error: "Produit requis" });
  if (!item_name) return res.status(400).json({ error: "Nom du produit requis" });
  if (!price_xof || Number(price_xof) <= 0)
    return res.status(400).json({ error: "Prix invalide" });
  if (!numeroSend || String(numeroSend).trim().length < 8)
    return res.status(400).json({ error: "Numéro de téléphone requis (min 8 chiffres)" });

  try {
    // Nom du client depuis la BDD
    const userRes = await pool.query(
      "SELECT first_name, last_name, username FROM users WHERE id = $1",
      [req.session.userId]
    );
    const u = userRes.rows[0];
    const nomclient = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

    const price_usd = parseFloat((Number(price_xof) / 650).toFixed(2));

    // Enregistrement (plan_id = item_id tel quel : "strat_C1" ou "idea_3")
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status, phone_number)
       VALUES ($1,$2,$3,$4,0,'mobile_money','pending',$5) RETURNING id`,
      [req.session.userId, item_id, item_name, price_usd, String(numeroSend).trim()]
    );
    const payReqId = dbRes.rows[0].id;

    const origin     = req.headers.origin || `http://localhost:${PORT}`;
    const return_url = `${origin}/success.html?req=${payReqId}&type=item`;

    const paymentData = {
      totalPrice: parseInt(price_xof, 10),
      article:    [{ [item_name]: parseInt(price_xof, 10) }],
      numeroSend: String(numeroSend).trim(),
      nomclient,
      return_url,
    };

    console.log("[BUY-ITEM] Appel Money Fusion:", JSON.stringify(paymentData));

    const mfRes = await fetch(CONFIG.API_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify(paymentData),
    });
    const data = await mfRes.json();
    console.log("[BUY-ITEM] Réponse:", JSON.stringify(data));

    const mfToken = data.token || data.tokenPay || null;
    if (mfToken) {
      await pool.query(
        "UPDATE payment_requests SET transaction_id = $1 WHERE id = $2",
        [mfToken, payReqId]
      );
    }

    res.json({ ...data, payment_req_id: payReqId });
  } catch (err) {
    console.error("[BUY-ITEM]", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard" });
  }
});

// ─── ROUTE: Créer paiement Mobile Money ──────────────────────────────────
app.post("/api/create-payment", requireAuth, async (req, res) => {
  const { totalPrice, article, numeroSend, plan_id } = req.body;

  if (!totalPrice || totalPrice <= 0)
    return res.status(400).json({ error: "Montant requis" });

  // Récupérer le nom depuis la base de données
  const userRes = await pool.query(
    "SELECT first_name, last_name, username FROM users WHERE id = $1",
    [req.session.userId]
  );
  const u = userRes.rows[0];
  const nomclient = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

  const plans = await getPlans();
  const plan = plans.find(p => p.id === plan_id) || null;
  const phoneNum = numeroSend ? String(numeroSend).trim() : null;

  try {
    // Enregistrement en base (statut: pending)
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status, phone_number)
       VALUES ($1,$2,$3,$4,$5,'mobile_money','pending',$6) RETURNING id`,
      [req.session.userId,
       plan ? plan.id : "custom",
       plan ? plan.label : "Personnalisé",
       plan ? plan.amount_usd : 0,
       plan ? plan.duration_minutes : 0,
       phoneNum]
    );
    const payReqId = dbRes.rows[0].id;

    const origin     = req.headers.origin || `http://localhost:${PORT}`;
    const return_url = `${origin}/success.html?req=${payReqId}`;

    const paymentData = {
      totalPrice: parseInt(String(totalPrice), 10),
      article:    article || [{ Abonnement: parseInt(String(totalPrice), 10) }],
      nomclient,
      return_url,
      ...(phoneNum ? { numeroSend: phoneNum } : {}),
    };

    console.log("[PROXY] Appel Money Fusion:", JSON.stringify(paymentData));

    const mfRes  = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify(paymentData),
    });
    const data = await mfRes.json();
    console.log("[PROXY] Réponse Money Fusion:", JSON.stringify(data));

    // Stocker le token Money Fusion
    const mfToken = data.token || data.tokenPay || null;
    if (mfToken) {
      await pool.query(
        "UPDATE payment_requests SET transaction_id = $1 WHERE id = $2",
        [mfToken, payReqId]
      );
    }

    res.json({ ...data, payment_req_id: payReqId });
  } catch (err) {
    console.error("[PAYMENT]", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard" });
  }
});

// ─── ROUTE: Déclarer paiement Crypto ─────────────────────────────────────
app.post("/api/create-payment-crypto", requireAuth, async (req, res) => {
  const { plan_id, crypto_id, transaction_hash } = req.body;
  const plans = await getPlans();
  const plan = plans.find(p => p.id === plan_id);
  if (!plan) return res.status(400).json({ error: "Plan invalide" });

  try {
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes,
          payment_method, status, transaction_id)
       VALUES ($1,$2,$3,$4,$5,'crypto','awaiting_screenshot',$6) RETURNING id`,
      [req.session.userId, plan.id, plan.label, plan.amount_usd,
       plan.duration_minutes, transaction_hash || null]
    );
    res.json({ success: true, payment_req_id: dbRes.rows[0].id });
  } catch (err) {
    console.error("[CRYPTO]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Vérifier statut paiement ─────────────────────────────────────
app.get("/api/payment-check/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM payment_requests WHERE id = $1 AND user_id = $2",
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Paiement introuvable" });

    const pr = result.rows[0];
    const pid = String(pr.plan_id);
    const item_type = pid.startsWith("sup_") ? "support"
      : (pid.startsWith("idea_") || pid.startsWith("strat_")) ? "item"
      : "subscription";

    // Si Mobile Money et encore pending → vérifier auprès de Money Fusion
    if (pr.payment_method === "mobile_money" && pr.status === "pending" && pr.transaction_id) {
      try {
        const mfRes  = await fetch(`${CONFIG.STATUS_URL}/${pr.transaction_id}`, {
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.API_KEY}` },
        });
        const mfData = await mfRes.json();

        if (mfData.statut === "payé" || mfData.status === "completed" || mfData.statut === true) {
          await activateSubscription(pr);
          return res.json({ status: "validated", plan_label: pr.plan_label, duration_minutes: pr.duration_minutes, item_type, amount_usd: pr.amount_usd, phone_number: pr.phone_number });
        }
      } catch (_) { /* on ignore l'erreur MF temporaire */ }
    }

    res.json({
      status:           pr.status,
      plan_label:       pr.plan_label,
      duration_minutes: pr.duration_minutes,
      item_type,
      amount_usd:    pr.amount_usd,
      phone_number:  pr.phone_number,
      created_at:    pr.created_at,
    });
  } catch (err) {
    console.error("[CHECK]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Statut Money Fusion (direct) ─────────────────────────────────
app.get("/api/payment-status/:token", async (req, res) => {
  try {
    const r    = await fetch(`${CONFIG.STATUS_URL}/${req.params.token}`, {
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.API_KEY}` },
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Impossible de récupérer le statut" });
  }
});

// ─── ROUTE: Polling public — vérifie et active si payé ───────────────────
// Utilisé par le frontend après envoi du USSD, sans redirection vers Money Fusion
app.get("/api/poll-payment/:payReqId", async (req, res) => {
  try {
    const prRes = await pool.query(
      "SELECT * FROM payment_requests WHERE id = $1",
      [req.params.payReqId]
    );
    if (!prRes.rows.length) return res.status(404).json({ status: "not_found" });
    const pr = prRes.rows[0];

    // Calcul item_type pour l'affichage côté client
    const pid_ = String(pr.plan_id || "");
    const item_type_ = pid_.startsWith("sup_") ? "support"
      : (pid_.startsWith("idea_") || pid_.startsWith("strat_")) ? "item"
      : "subscription";

    const prInfo = {
      plan_label:       pr.plan_label,
      duration_minutes: pr.duration_minutes,
      item_type:        item_type_,
      amount_usd:       pr.amount_usd,
      phone_number:     pr.phone_number,
    };

    // Déjà validé en base
    if (pr.status === "validated") return res.json({ status: "paid", ...prInfo });

    // Interroger Money Fusion si on a un token
    if (pr.transaction_id) {
      try {
        const mfRes  = await fetch(`${CONFIG.STATUS_URL}/${pr.transaction_id}`, {
          headers: { "Authorization": `Bearer ${CONFIG.API_KEY}` },
        });
        const mfData = await mfRes.json();
        console.log("[POLL]", pr.transaction_id, JSON.stringify(mfData));

        // La doc Money Fusion : data.statut === "paid"
        const innerStatut = mfData?.data?.statut || mfData?.statut;
        const isPaid = innerStatut === "paid" || innerStatut === "payé"
                    || innerStatut === "completed" || innerStatut === true;

        if (isPaid) {
          await activateSubscription(pr);
          return res.json({ status: "paid", ...prInfo });
        }

        const isFailed = innerStatut === "failure" || innerStatut === "no paid"
                      || innerStatut === "failed"  || innerStatut === "cancelled";
        if (isFailed) return res.json({ status: "failed", ...prInfo });
      } catch (e) {
        console.error("[POLL-MF]", e.message);
      }
    }

    res.json({ status: "pending", ...prInfo });
  } catch (err) {
    console.error("[POLL]", err);
    res.status(500).json({ status: "error" });
  }
});

// ─── ROUTE: Infos paiement publiques (pour failed.html et pages non-auth) ──
app.get("/api/payment-info/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT plan_label, amount_usd, phone_number, created_at, payment_method FROM payment_requests WHERE id = $1",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Introuvable" });
    const pr = r.rows[0];
    res.json({
      plan_label:     pr.plan_label,
      amount_xof:     Math.round((pr.amount_usd || 0) * 656),
      phone_number:   pr.phone_number,
      payment_method: pr.payment_method,
      created_at:     pr.created_at,
    });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Notifier paiement non validé après timeout ───────────────────
app.post("/api/notify-timeout", async (req, res) => {
  const { payment_req_id, context, country, network } = req.body;
  try {
    let details = { label: context || "Paiement inconnu", amount: null, user: "Inconnu" };
    if (payment_req_id) {
      const r = await pool.query(
        `SELECT pr.plan_label, pr.amount_usd, pr.payment_method, pr.phone_number,
                u.username, u.first_name, u.last_name
         FROM payment_requests pr
         LEFT JOIN users u ON u.id = pr.user_id
         WHERE pr.id = $1`, [payment_req_id]
      );
      if (r.rows.length) {
        const row = r.rows[0];
        details.label  = row.plan_label || "Paiement";
        details.amount = Math.round((row.amount_usd || 0) * 656);
        details.method = row.payment_method;
        details.phone  = row.phone_number;
        details.user   = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.username || "Invité";
      }
    }
    const countryStr  = country  || "";
    const networkStr  = network  || "";
    const locationStr = [countryStr, networkStr].filter(Boolean).join(" — ");
    const failDateStr = new Date().toLocaleString("fr-FR", {
      timeZone: "Africa/Abidjan",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    const adminEmail = 'sossoukouam@gmail.com';
    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;background:#1a0a0a;color:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#EF4444;padding:20px 28px">
    <h2 style="margin:0;color:#fff">⚠️ Paiement échoué — Alerte</h2>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:.9rem">Non confirmé après 60 secondes</p>
  </div>
  <div style="padding:28px">
    <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-top:4px">
      <tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Réf. paiement</td><td style="color:#fff;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">#${payment_req_id || '—'}</td></tr>
      <tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Service</td><td style="color:#fff;font-weight:700;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">${details.label}</td></tr>
      ${details.amount ? `<tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Montant</td><td style="color:#F0C040;font-weight:700;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">${details.amount.toLocaleString('fr-FR')} XOF</td></tr>` : ""}
      ${details.method ? `<tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Méthode</td><td style="color:#fff;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">${details.method}</td></tr>` : ""}
      ${locationStr   ? `<tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Pays / Réseau</td><td style="color:#fff;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">${locationStr}</td></tr>` : ""}
      ${details.phone ? `<tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Téléphone</td><td style="color:#fff;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">${details.phone}</td></tr>` : ""}
      <tr><td style="color:rgba(255,255,255,.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">Client</td><td style="color:#fff;text-align:right;border-bottom:1px solid rgba(255,255,255,.06)">${details.user}</td></tr>
      <tr><td style="color:rgba(255,255,255,.5);padding:6px 0">Date / Heure</td><td style="color:#fff;text-align:right">${failDateStr}</td></tr>
    </table>
    <p style="margin-top:20px;color:rgba(255,255,255,.6);font-size:.85rem">Vérifiez le panneau d'administration pour valider ou annuler ce paiement manuellement.</p>
  </div>
</div>`;
    await gmailTransport.sendMail({
      from: `"Sossou Kouamé Alerte" <${adminEmail}>`,
      to: adminEmail,
      subject: `⚠️ Paiement échoué #${payment_req_id || '?'} — ${details.label} — ${failDateStr}`,
      html,
    });
    console.log("[TIMEOUT-NOTIFY] Alerte envoyée pour paiement", payment_req_id);
  } catch (e) {
    console.error("[TIMEOUT-NOTIFY-ERR]", e.message);
  }
  res.json({ ok: true });
});

// ─── ROUTE: IP du serveur ─────────────────────────────────────────────────
app.get("/my-ip", async (req, res) => {
  try {
    const r    = await fetch("https://api.ipify.org?format=json");
    const data = await r.json();
    res.json({ ip: data.ip, message: "Ajoute cette IP dans le dashboard Money Fusion > Adresses IP autorisées" });
  } catch (err) {
    res.status(500).json({ error: "Impossible de récupérer l'IP" });
  }
});

// ─── ROUTE: Webhook Money Fusion ──────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const { event, tokenPay } = req.body;
  console.log("[WEBHOOK]", event, tokenPay);

  if (event === "payin.session.completed") {
    try {
      const prRes = await pool.query(
        "SELECT * FROM payment_requests WHERE transaction_id = $1 AND status = 'pending'",
        [tokenPay]
      );
      if (prRes.rows.length > 0) {
        await activateSubscription(prRes.rows[0]);
        console.log("[WEBHOOK] Abonnement activé pour user", prRes.rows[0].user_id);
      }
    } catch (err) {
      console.error("[WEBHOOK]", err);
    }
  }

  res.status(200).send("OK");
});

// ─── HELPER: Email admin — paiement réussi ───────────────────────────────
async function sendAdminSuccessEmail(pr) {
  try {
    const amtXof = Math.round((pr.amount_usd || 0) * 656);
    const amtStr = amtXof > 0 ? `${amtXof.toLocaleString('fr-FR')} XOF` : '—';
    let clientName = 'Invité';
    if (pr.user_id && pr.user_id > 0) {
      const u = await pool.query("SELECT username, first_name, last_name FROM users WHERE id = $1", [pr.user_id]);
      if (u.rows.length) {
        const row = u.rows[0];
        clientName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Invité';
      }
    }
    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;background:#0a1a0f;color:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#10B981;padding:20px 28px">
    <h2 style="margin:0;color:#fff">✅ Paiement réussi — Confirmation</h2>
  </div>
  <div style="padding:28px">
    <p style="color:rgba(255,255,255,.85)">Un paiement vient d'être <strong style="color:#10B981">validé et confirmé</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-top:12px">
      <tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Réf. paiement</td><td style="color:#fff;text-align:right">#${pr.id}</td></tr>
      <tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Service</td><td style="color:#fff;font-weight:700;text-align:right">${pr.plan_label || '—'}</td></tr>
      <tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Montant</td><td style="color:#F0C040;font-weight:700;text-align:right">${amtStr}</td></tr>
      ${pr.payment_method ? `<tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Méthode</td><td style="color:#fff;text-align:right">${pr.payment_method}</td></tr>` : ''}
      ${pr.phone_number   ? `<tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Téléphone</td><td style="color:#fff;text-align:right">${pr.phone_number}</td></tr>` : ''}
      <tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Client</td><td style="color:#fff;text-align:right">${clientName}</td></tr>
      <tr><td style="color:rgba(255,255,255,.5);padding:5px 0">Statut</td><td style="color:#10B981;font-weight:700;text-align:right">✓ Validé</td></tr>
    </table>
    <p style="margin-top:20px;color:rgba(255,255,255,.6);font-size:.85rem">Connectez-vous au panneau d'administration pour voir les détails.</p>
  </div>
</div>`;
    await gmailTransport.sendMail({
      from: '"Sossou Kouamé Paiement" <sossoukouam@gmail.com>',
      to: 'sossoukouam@gmail.com',
      subject: `✅ Paiement réussi #${pr.id} — ${pr.plan_label || 'Paiement'} — ${amtStr}`,
      html,
    });
    console.log("[SUCCESS-NOTIFY] Email admin envoyé pour paiement", pr.id);
  } catch (e) {
    console.error("[SUCCESS-NOTIFY-ERR]", e.message);
  }
}

// ─── HELPER: Activer l'abonnement / achat ────────────────────────────────
async function activateSubscription(pr) {
  await pool.query(
    "UPDATE payment_requests SET status = 'validated', admin_validated_at = NOW() WHERE id = $1",
    [pr.id]
  );
  // Notifier l'admin du succès du paiement
  sendAdminSuccessEmail(pr).catch(() => {});

  const pid = String(pr.plan_id);

  // Soutien au développeur → pas d'abonnement à activer
  if (pid.startsWith("sup_")) {
    if (pr.user_id && pr.user_id > 0) {
      await sendPaymentEmail(pr.user_id, { label: pr.plan_label, amount: null });
    }
    return;
  }

  // Service Telegram / Maintenance → email uniquement
  if (pid.startsWith("telegram_") || pid.startsWith("maintenance_")) {
    const amtXof = Math.round((pr.amount_usd || 0) * 656);
    const amtStr = amtXof > 0 ? `${amtXof.toLocaleString("fr-FR")} XOF` : null;
    if (pr.user_id && pr.user_id > 0) {
      await sendPaymentEmail(pr.user_id, { label: pr.plan_label, amount: amtStr });
    }
    return;
  }

  // Achat boutique (idée ou stratégie) → pas d'abonnement à activer
  if (pid.startsWith("idea_") || pid.startsWith("strat_")) {
    if (pid.startsWith("idea_")) {
      const idea_id = parseInt(pid.replace("idea_", ""), 10);
      await pool.query(
        `INSERT INTO strategy_idea_purchases
           (user_id, idea_id, idea_name, amount_usd, status, created_at)
         VALUES ($1, $2, $3, $4, 'validated', NOW())`,
        [pr.user_id, idea_id, pr.plan_label, pr.amount_usd]
      ).catch(err => console.error("[IDEA-PURCHASE]", err.message));
    }
    if (pr.user_id && pr.user_id > 0) {
      await sendPaymentEmail(pr.user_id, { label: pr.plan_label, amount: null });
    }
    return;
  }

  // Sinon, activer l'abonnement
  const userRes = await pool.query("SELECT subscription_expires_at FROM users WHERE id = $1", [pr.user_id]);
  if (userRes.rows.length === 0) return;

  const user = userRes.rows[0];
  const now  = new Date();
  let base   = (user.subscription_expires_at && new Date(user.subscription_expires_at) > now)
               ? new Date(user.subscription_expires_at)
               : now;
  const newExpiry = new Date(base.getTime() + pr.duration_minutes * 60 * 1000);

  await pool.query(
    "UPDATE users SET subscription_expires_at = $1, is_premium = true WHERE id = $2",
    [newExpiry, pr.user_id]
  );

  const mins = pr.duration_minutes || 0;
  const days = Math.floor(mins / 1440);
  const hrs  = Math.floor((mins % 1440) / 60);
  let durStr = days > 0 ? `${days} jour${days > 1 ? "s" : ""}` : "";
  if (hrs > 0) durStr += (durStr ? " " : "") + `${hrs}h`;
  const amtXof = Math.round((pr.amount_usd || 0) * 656);
  if (pr.user_id && pr.user_id > 0) {
    await sendPaymentEmail(pr.user_id, {
      label: pr.plan_label,
      amount: amtXof > 0 ? `${amtXof.toLocaleString("fr-FR")} XOF` : null,
      duration: durStr || null,
    });
  }
}


// ─── ROUTE: Paiement service personnalisé (Telegram / Maintenance) ────────
app.post("/api/create-service-payment", requireAuth, async (req, res) => {
  const { service_type, description, amount_xof, numeroSend } = req.body;

  if (!service_type || !["telegram", "maintenance"].includes(service_type))
    return res.status(400).json({ error: "Type de service invalide" });
  if (!amount_xof || Number(amount_xof) <= 0)
    return res.status(400).json({ error: "Montant invalide" });

  const label = service_type === "telegram" ? "Service Telegram" : "Service de Maintenance";
  const labelFull = description ? `${label} — ${description}` : label;
  const amount_usd = parseFloat((Number(amount_xof) / 656).toFixed(2));
  const plan_id    = `${service_type}_custom`;

  try {
    const userRes = await pool.query(
      "SELECT first_name, last_name, username FROM users WHERE id = $1",
      [req.session.userId]
    );
    const u = userRes.rows[0];
    const nomclient = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status, phone_number)
       VALUES ($1,$2,$3,$4,0,'mobile_money','pending',$5) RETURNING id`,
      [req.session.userId, plan_id, labelFull, amount_usd, numeroSend ? String(numeroSend).trim() : null]
    );
    const payReqId = dbRes.rows[0].id;

    const origin     = req.headers.origin || `http://localhost:${PORT}`;
    const return_url = `${origin}/success.html?req=${payReqId}&type=service`;

    const paymentData = {
      totalPrice: parseInt(amount_xof, 10),
      article:    [{ [labelFull]: parseInt(amount_xof, 10) }],
      nomclient,
      return_url,
      ...(numeroSend ? { numeroSend: String(numeroSend).trim() } : {}),
    };

    console.log("[SERVICE-PAY] Appel Money Fusion:", JSON.stringify(paymentData));
    const mfRes  = await fetch(CONFIG.API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.API_KEY}` },
      body: JSON.stringify(paymentData),
    });
    const data = await mfRes.json();
    console.log("[SERVICE-PAY] Réponse:", JSON.stringify(data));

    const mfToken = data.token || data.tokenPay || null;
    if (mfToken) {
      await pool.query(
        "UPDATE payment_requests SET transaction_id = $1 WHERE id = $2",
        [mfToken, payReqId]
      );
    }
    res.json({ ...data, payment_req_id: payReqId });
  } catch (err) {
    console.error("[SERVICE-PAY]", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard" });
  }
});

// ─── ROUTE: Paiement service Crypto (Telegram / Maintenance) ─────────────
app.post("/api/create-service-payment-crypto", requireAuth, async (req, res) => {
  const { service_type, description, amount_xof, crypto_id, transaction_hash } = req.body;

  if (!service_type || !["telegram", "maintenance"].includes(service_type))
    return res.status(400).json({ error: "Type de service invalide" });
  if (!amount_xof || Number(amount_xof) <= 0)
    return res.status(400).json({ error: "Montant invalide" });

  const label = service_type === "telegram" ? "Service Telegram" : "Service de Maintenance";
  const labelFull = description ? `${label} — ${description}` : label;
  const amount_usd = parseFloat((Number(amount_xof) / 656).toFixed(2));
  const plan_id    = `${service_type}_custom`;

  try {
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes,
          payment_method, status, transaction_id)
       VALUES ($1,$2,$3,$4,0,'crypto','awaiting_screenshot',$5) RETURNING id`,
      [req.session.userId, plan_id, labelFull, amount_usd, transaction_hash || null]
    );
    res.json({ success: true, payment_req_id: dbRes.rows[0].id });
  } catch (err) {
    console.error("[SERVICE-CRYPTO]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Liste des paliers de soutien — publique (pas de connexion requise)
app.get("/api/support-tiers", async (req, res) => {
  const tiers = await getSupportTiers();
  res.json({ tiers });
});

// ─── ROUTE: Créer un soutien sans compte (public) ─────────────────────────
app.post("/api/create-support-public", async (req, res) => {
  const { tier_id, numeroSend, nomclient } = req.body;
  const allTiers = await getSupportTiers();
  const tier = allTiers.find(t => t.id === tier_id);
  if (!tier) return res.status(400).json({ error: "Palier de soutien invalide" });

  const nom = (nomclient || "Donateur").trim() || "Donateur";
  const price_usd = parseFloat((tier.price_xof / 650).toFixed(2));

  try {
    const phoneNum = numeroSend ? String(numeroSend).trim() : null;
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status, phone_number)
       VALUES (NULL,$1,$2,$3,0,'mobile_money','pending',$4) RETURNING id`,
      [tier.id, tier.label, price_usd, phoneNum]
    ).catch(() =>
      // Si user_id NOT NULL, on utilise -1 comme ID invité
      pool.query(
        `INSERT INTO payment_requests
           (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status, phone_number)
         VALUES (-1,$1,$2,$3,0,'mobile_money','pending',$4) RETURNING id`,
        [tier.id, tier.label, price_usd, phoneNum]
      )
    );
    const payReqId = dbRes.rows[0].id;

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const return_url = `${origin}/success.html?req=${payReqId}&type=support`;

    const paymentData = {
      totalPrice: tier.price_xof,
      article:    [{ [tier.label]: tier.price_xof }],
      nomclient:  nom,
      return_url,
      ...(phoneNum ? { numeroSend: phoneNum } : {}),
    };

    console.log("[SUPPORT-PUBLIC] Appel Money Fusion:", JSON.stringify(paymentData));

    const mfRes = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.API_KEY}` },
      body: JSON.stringify(paymentData),
    });
    const data = await mfRes.json();
    console.log("[SUPPORT-PUBLIC] Réponse:", JSON.stringify(data));

    const mfToken = data.token || data.tokenPay || null;
    if (mfToken) {
      await pool.query(
        "UPDATE payment_requests SET transaction_id = $1 WHERE id = $2",
        [mfToken, payReqId]
      );
    }
    res.json({ ...data, payment_req_id: payReqId });
  } catch (err) {
    console.error("[SUPPORT-PUBLIC]", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard" });
  }
});

// ─── ROUTE: Créer un paiement de soutien ─────────────────────────────────
app.post("/api/create-support", requireAuth, async (req, res) => {
  const { tier_id, numeroSend } = req.body;
  const allTiers = await getSupportTiers();
  const tier = allTiers.find(t => t.id === tier_id);
  if (!tier) return res.status(400).json({ error: "Palier de soutien invalide" });

  try {
    const userRes = await pool.query(
      "SELECT first_name, last_name, username FROM users WHERE id = $1",
      [req.session.userId]
    );
    const u = userRes.rows[0];
    const nomclient = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;
    const phoneNum  = numeroSend ? String(numeroSend).trim() : null;

    const price_usd = parseFloat((tier.price_xof / 650).toFixed(2));

    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status, phone_number)
       VALUES ($1,$2,$3,$4,0,'mobile_money','pending',$5) RETURNING id`,
      [req.session.userId, tier.id, tier.label, price_usd, phoneNum]
    );
    const payReqId = dbRes.rows[0].id;

    const origin     = req.headers.origin || `http://localhost:${PORT}`;
    const return_url = `${origin}/success.html?req=${payReqId}&type=support`;

    const paymentData = {
      totalPrice: tier.price_xof,
      article:    [{ [tier.label]: tier.price_xof }],
      nomclient,
      return_url,
      ...(phoneNum ? { numeroSend: phoneNum } : {}),
    };

    console.log("[SUPPORT] Appel Money Fusion:", JSON.stringify(paymentData));

    const mfRes = await fetch(CONFIG.API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.API_KEY}` },
      body: JSON.stringify(paymentData),
    });
    const data = await mfRes.json();
    console.log("[SUPPORT] Réponse:", JSON.stringify(data));

    const mfToken = data.token || data.tokenPay || null;
    if (mfToken) {
      await pool.query(
        "UPDATE payment_requests SET transaction_id = $1 WHERE id = $2",
        [mfToken, payReqId]
      );
    }

    res.json({ ...data, payment_req_id: payReqId });
  } catch (err) {
    console.error("[SUPPORT-CREATE]", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard" });
  }
});

// ─── ADMIN: Liste complète des paiements ─────────────────────────────────
app.get("/api/admin/payments", requireAdmin, async (req, res) => {
  try {
    const { type, status, q, limit } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 500, 2000);

    const conds = [];
    const params = [];
    if (status) { params.push(status); conds.push(`pr.status = ${params.length}`); }
    if (type === "support")      conds.push("pr.plan_id LIKE 'sup_%'");
    else if (type === "subscription") conds.push("pr.plan_id NOT LIKE 'sup_%' AND pr.plan_id NOT LIKE 'idea_%' AND pr.plan_id NOT LIKE 'strat_%'");
    else if (type === "item")    conds.push("(pr.plan_id LIKE 'idea_%' OR pr.plan_id LIKE 'strat_%')");
    if (q) {
      params.push(`%${q}%`);
      conds.push(`(u.username ILIKE ${params.length} OR u.first_name ILIKE ${params.length} OR u.last_name ILIKE ${params.length} OR pr.transaction_id ILIKE ${params.length} OR pr.plan_label ILIKE ${params.length})`);
    }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    params.push(lim);

    const sql = `
      SELECT pr.id, pr.user_id, pr.plan_id, pr.plan_label, pr.amount_usd,
             pr.duration_minutes, pr.payment_method, pr.status, pr.transaction_id,
             pr.admin_validated_at, pr.created_at, pr.phone_number,
             u.username, u.first_name, u.last_name
      FROM payment_requests pr
      LEFT JOIN users u ON u.id = pr.user_id
      ${where}
      ORDER BY pr.created_at DESC NULLS LAST, pr.id DESC
      LIMIT ${params.length}
    `;
    const r = await pool.query(sql, params);
    const rows = r.rows.map(row => {
      const pid = String(row.plan_id || "");
      const type = pid.startsWith("sup_") ? "support"
                 : (pid.startsWith("idea_") || pid.startsWith("strat_")) ? "item"
                 : "subscription";
      return {
        ...row,
        amount_xof: Math.round((Number(row.amount_usd) || 0) * 650),
        type,
      };
    });
    res.json({ payments: rows });
  } catch (err) {
    console.error("[ADMIN-PAYMENTS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ADMIN: Statistiques globales ────────────────────────────────────────
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const q = async (sql, p=[]) => (await pool.query(sql, p)).rows;

    const [byStatus, byType, totals, recentCount] = await Promise.all([
      q(`SELECT status, COUNT(*)::int AS n FROM payment_requests GROUP BY status`),
      q(`SELECT
           CASE
             WHEN plan_id LIKE 'sup_%'   THEN 'support'
             WHEN plan_id LIKE 'idea_%'  THEN 'item'
             WHEN plan_id LIKE 'strat_%' THEN 'item'
             ELSE 'subscription'
           END AS type,
           COUNT(*)::int AS n,
           COUNT(DISTINCT user_id)::int AS payers,
           COALESCE(SUM(CASE WHEN status='validated' THEN amount_usd ELSE 0 END),0)::float AS validated_usd
         FROM payment_requests GROUP BY 1`),
      q(`SELECT COUNT(*)::int AS total_payments,
                COUNT(DISTINCT user_id)::int AS unique_payers,
                COALESCE(SUM(CASE WHEN status='validated' THEN amount_usd ELSE 0 END),0)::float AS total_validated_usd
         FROM payment_requests`),
      q(`SELECT COUNT(*)::int AS n FROM payment_requests
         WHERE created_at > NOW() - INTERVAL '24 hours'`),
    ]);

    res.json({
      by_status: byStatus,
      by_type: byType.map(r => ({ ...r, validated_xof: Math.round(r.validated_usd * 650) })),
      totals: { ...(totals[0]||{}), total_validated_xof: Math.round(((totals[0]||{}).total_validated_usd||0) * 650) },
      last_24h: (recentCount[0]||{}).n || 0,
    });
  } catch (err) {
    console.error("[ADMIN-STATS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── SEEDING BDD : initialise les clés manquantes en settings ────────────
async function seedSettings() {
  try {
    // subscription_plans — si absent, on insère les valeurs par défaut
    const chk = await pool.query("SELECT 1 FROM settings WHERE key = 'subscription_plans'");
    if (chk.rows.length === 0) {
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ('subscription_plans', $1)",
        [JSON.stringify(DEFAULT_PLANS)]
      );
      console.log("[SEED] subscription_plans créé en BDD");
    }

    // strategy_prices — si absent, on insère les valeurs par défaut
    const chk2 = await pool.query("SELECT 1 FROM settings WHERE key = 'strategy_prices'");
    if (chk2.rows.length === 0) {
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ('strategy_prices', $1)",
        [JSON.stringify({ default_combo: 15000, default_standard: 10000 })]
      );
      console.log("[SEED] strategy_prices créé en BDD");
    }
  } catch (e) {
    console.error("[SEED-ERR]", e.message);
  }
}

// ─── LANCEMENT ────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log("========================================");
  console.log(`Serveur Sossou Kouamé — Port ${PORT}`);
  console.log("========================================");
  await seedSettings();
});
