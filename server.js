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

// ─── BOT TELEGRAM ─────────────────────────────────────────────────────────
const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');

const BOT_TOKEN   = '8627302352:AAF21Vn4bhLXk7PVzjZzHME9fZeZoQa5C18';
const ADMIN_TG_ID = 1190237801;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Création immédiate de la table des visiteurs TG non liés ──────────────
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_visitors (
      telegram_id   BIGINT PRIMARY KEY,
      tg_username   TEXT,
      tg_first_name TEXT,
      seen_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(e => console.error('[TG-INIT]', e.message));
})();

// ── Helpers canal ──────────────────────────────────────────────────────────
async function getActiveChannel() {
  const r = await pool.query("SELECT * FROM telegram_config WHERE enabled=true ORDER BY updated_at DESC LIMIT 1").catch(()=>({rows:[]}));
  return r.rows[0] || null;
}
async function setActiveChannel(channelId, channelName) {
  await pool.query("UPDATE telegram_config SET enabled=false").catch(()=>{});
  const ex = await pool.query("SELECT id FROM telegram_config WHERE channel_id=$1", [String(channelId)]).catch(()=>({rows:[]}));
  if (ex.rows.length) {
    await pool.query("UPDATE telegram_config SET enabled=true, channel_name=$2, updated_at=NOW() WHERE channel_id=$1", [String(channelId), channelName||'']);
  } else {
    await pool.query("INSERT INTO telegram_config(channel_id,channel_name,enabled,updated_at) VALUES($1,$2,true,NOW())", [String(channelId), channelName||'']);
  }
}

// ── Lien TG ↔ compte (via users.telegram_id — colonne native) ─────────────
async function linkTgUser(telegramId, userId, tgUsername, tgFirstName) {
  // Stocker l'ID Telegram dans la colonne native users.telegram_id
  await pool.query("UPDATE users SET telegram_id=$1 WHERE id=$2", [String(telegramId), userId])
    .catch(e=>console.error('[TG-LINK]',e.message));
  // Retirer des visiteurs non liés si présent
  await pool.query("DELETE FROM telegram_visitors WHERE telegram_id=$1", [telegramId]).catch(()=>{});
}
async function getLinkedUser(telegramId) {
  // Chercher par users.telegram_id (colonne text)
  const r = await pool.query(
    "SELECT * FROM users WHERE telegram_id=$1 AND telegram_id IS NOT NULL",
    [String(telegramId)]
  ).catch(()=>({rows:[]}));
  return r.rows[0] || null;
}
async function unlinkTgUser(telegramId) {
  await pool.query("UPDATE users SET telegram_id=NULL WHERE telegram_id=$1", [String(telegramId)]).catch(()=>{});
}
async function trackVisitor(telegramId, tgUsername, tgFirstName) {
  await pool.query(`
    INSERT INTO telegram_visitors(telegram_id,tg_username,tg_first_name,seen_at)
    VALUES($1,$2,$3,NOW())
    ON CONFLICT(telegram_id) DO UPDATE SET tg_username=$2, tg_first_name=$3, seen_at=NOW()
  `, [telegramId, tgUsername||null, tgFirstName||null]).catch(()=>{});
}

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  return d ? new Date(d).toLocaleString('fr-FR', { timeZone:'Africa/Abidjan', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
}
function fmtRemaining(ms) {
  if (ms <= 0) return 'Expiré';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h/24)}j ${h%24}h`;
  return `${h}h ${m}min`;
}
// Échappe les caractères spéciaux Markdown Telegram dans les valeurs dynamiques
function esc(s) {
  return String(s||'').replace(/([_*`\[])/g,'\\$1');
}

// ── Sessions en mémoire ────────────────────────────────────────────────────
const tgSessions = new Map();

// ── Claviers inline ────────────────────────────────────────────────────────
const KB_USER_MENU = { inline_keyboard: [
  [{ text:'👤 Mon compte', callback_data:'mon_compte' }],
  [{ text:'🔓 Se déconnecter', callback_data:'deconnexion' }]
]};
const KB_GUEST_MENU = { inline_keyboard: [
  [{ text:'🔐 Se connecter',  callback_data:'action_connexion'   }],
  [{ text:"📝 S'inscrire",    callback_data:'action_inscription' }]
]};
const KB_ADMIN_MENU = { inline_keyboard: [
  [{ text:'📊 Dashboard',           callback_data:'admin_dashboard'   },
   { text:'👥 Membres',             callback_data:'admin_membres'     }],
  [{ text:'📋 Stratégies',          callback_data:'admin_strategies'  },
   { text:'📡 Canaux',              callback_data:'admin_canaux'      }],
  [{ text:'🎯 Assigner stratégie',  callback_data:'admin_assigner'    },
   { text:'🔍 Scan canal',          callback_data:'admin_scan'        }],
  [{ text:'⚙️ Config canal',        callback_data:'admin_config_canal'},
   { text:'🚪 Kick expirés',        callback_data:'admin_kick'        }]
]};

const SEND_OPT = (kb) => kb ? { parse_mode:'Markdown', reply_markup: kb } : { parse_mode:'Markdown' };

// ── Dashboard ADMIN ────────────────────────────────────────────────────────
async function sendAdminDashboard(chatId) {
  try {
    const [byStatus, byMethod, global_, pending24, users_, preds_, linked_] = await Promise.all([
      pool.query(`SELECT status, COUNT(*)::int n FROM payment_requests GROUP BY status`),
      pool.query(`SELECT payment_method, COUNT(*)::int n,
                         COALESCE(SUM(CASE WHEN status='validated' THEN amount_usd ELSE 0 END),0)::float usd
                  FROM payment_requests GROUP BY payment_method`),
      pool.query(`SELECT COUNT(*)::int total_payments,
                         COUNT(DISTINCT user_id)::int unique_payers,
                         COALESCE(SUM(CASE WHEN status='validated' THEN amount_usd ELSE 0 END),0)::float total_usd
                  FROM payment_requests`),
      pool.query(`SELECT COUNT(*)::int n FROM payment_requests WHERE status='pending' AND created_at>NOW()-INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(*)::int total,
                         COUNT(*) FILTER(WHERE is_premium)::int premium,
                         COUNT(*) FILTER(WHERE is_pro)::int pro FROM users`),
      pool.query(`SELECT COUNT(*)::int total,
                         COUNT(*) FILTER(WHERE status='won')::int won,
                         COUNT(*) FILTER(WHERE status='lost')::int lost FROM predictions`),
      pool.query(`SELECT COUNT(*)::int n FROM users WHERE telegram_id IS NOT NULL`)
    ]);
    const g=global_.rows[0]; const u=users_.rows[0]; const p=preds_.rows[0];
    const sm={}; byStatus.rows.forEach(r=>sm[r.status]=r.n);

    let msg=`🏪 *SOSSOU KOUAMÉ SHOPPING BOUTIQUE*\n━━━━━━━━━━━━━━━━━━━━━━\n📊 *Tableau de bord Admin*\n\n`;
    msg+=`👥 *Utilisateurs*\n• Total : ${u.total} | Liés bot : ${linked_.rows[0].n}\n• 💎 Premium : ${u.premium} | ⭐ Pro : ${u.pro}\n\n`;
    msg+=`💳 *Paiements*\n• Total : ${g.total_payments} | ✅ Validés : ${sm['validated']||0}\n`;
    msg+=`• ⏳ En attente : ${sm['pending']||0} | ❌ Échoués : ${(sm['failed']||0)+(sm['timeout']||0)}\n`;
    msg+=`• Payeurs uniques : ${g.unique_payers}\n• 💵 Revenus : ${parseFloat(g.total_usd).toFixed(2)} USD\n\n`;
    if (byMethod.rows.length) {
      msg+=`📱 *Par méthode*\n`;
      byMethod.rows.forEach(r=>{ msg+=`• ${esc(r.payment_method||'N/A')} : ${r.n} pmt — ${parseFloat(r.usd).toFixed(2)} USD\n`; });
      msg+=`\n`;
    }
    msg+=`🔮 *Prédictions*\n• Total : ${p.total} | ✅ Gagnées : ${p.won} | ❌ Perdues : ${p.lost}\n\n`;
    msg+=`⚠️ *En attente (24h)* : ${pending24.rows[0].n}`;
    await bot.sendMessage(chatId, msg, SEND_OPT(KB_ADMIN_MENU));
  } catch(e) { bot.sendMessage(chatId,'❌ Erreur données.'); console.error('[TG-ADMIN]',e.message); }
}

// ── Dashboard UTILISATEUR ──────────────────────────────────────────────────
async function sendUserDashboard(chatId, user) {
  const now=new Date();
  const exp=user.subscription_expires_at?new Date(user.subscription_expires_at):null;
  const isActive=exp?exp>now:false;
  const rem_ms=isActive?exp-now:0;
  const strats=await pool.query(
    `SELECT si.name FROM user_strategy_visible usv
     JOIN strategy_ideas si ON si.id::text=usv.strategy_id WHERE usv.user_id=$1`,
    [user.id]
  ).catch(()=>({rows:[]}));

  let msg=`👤 *Mon compte*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg+=`• Nom : ${esc([user.first_name,user.last_name].filter(Boolean).join(' ')||user.username)}\n`;
  msg+=`• Identifiant : \`${esc(user.username)}\`\n`;
  msg+=`• Type : ${esc(user.account_type||'Standard')}\n`;
  msg+=`• 💎 Premium : ${user.is_premium?'✅':'❌'} | ⭐ Pro : ${user.is_pro?'✅':'❌'}\n\n`;
  msg+=`📅 *Abonnement*\n• Statut : ${isActive?'✅ Actif':'❌ Expiré / Aucun'}\n`;
  if (exp) msg+=`• Expire le : ${fmtDate(exp)}\n`;
  if (isActive) msg+=`• Temps restant : ${fmtRemaining(rem_ms)}\n`;
  if (strats.rows.length) {
    msg+=`\n📋 *Stratégies assignées*\n`;
    strats.rows.forEach(s=>{ msg+=`• ${esc(s.name)}\n`; });
  }
  await bot.sendMessage(chatId, msg, SEND_OPT(KB_USER_MENU));
}

// ── Membres (admin) ────────────────────────────────────────────────────────
async function sendMembersAdmin(chatId, page=0) {
  const LIMIT=12;
  const [rows_, total_] = await Promise.all([
    pool.query(`SELECT telegram_id::bigint,username,is_premium,is_pro,subscription_expires_at,account_type,first_name,last_name
                FROM users WHERE telegram_id IS NOT NULL
                ORDER BY last_seen DESC NULLS LAST LIMIT $1 OFFSET $2`,[LIMIT,page*LIMIT]),
    pool.query(`SELECT COUNT(*)::int n FROM users WHERE telegram_id IS NOT NULL`)
  ]).catch(()=>([{rows:[]},{rows:[{n:0}]}]));

  if (!rows_.rows.length) { bot.sendMessage(chatId,'📭 Aucun membre lié.'); return; }
  const now=new Date();
  let msg=`👥 *Membres liés* (${total_.rows[0].n} total)\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  rows_.rows.forEach((m,i)=>{
    const exp=m.subscription_expires_at?new Date(m.subscription_expires_at):null;
    const actif=exp&&exp>now;
    const tgName=esc([m.first_name,m.last_name].filter(Boolean).join(' ')||m.username||`ID:${m.telegram_id}`);
    msg+=`\n${page*LIMIT+i+1}. ${tgName} → \`${esc(m.username||'?')}\`\n`;
    msg+=`   ${actif?'✅ Actif':'❌ Expiré'} ${m.is_premium?'💎':''} ${m.is_pro?'⭐':''}\n`;
    if (exp) msg+=`   Expire : ${fmtDate(exp)}\n`;
  });
  const nav=[];
  if (page>0) nav.push({text:'◀ Préc.',callback_data:`membres_p_${page-1}`});
  if (rows_.rows.length===LIMIT) nav.push({text:'Suiv. ▶',callback_data:`membres_p_${page+1}`});
  await bot.sendMessage(chatId,msg,SEND_OPT(nav.length?{inline_keyboard:[nav]}:null));
}

// ── Stratégies (admin) ─────────────────────────────────────────────────────
async function sendStrategiesAdmin(chatId) {
  const [ideas,routes,pred_c]=await Promise.all([
    pool.query(`SELECT * FROM strategy_ideas ORDER BY sort_order,id`),
    pool.query(`SELECT scr.strategy,scr.channel_id,tc.channel_name
                FROM strategy_channel_routes scr LEFT JOIN telegram_config tc ON tc.id=scr.channel_id`),
    pool.query(`SELECT strategy,COUNT(*)::int n,COUNT(*) FILTER(WHERE status='won')::int won FROM predictions GROUP BY strategy`)
  ]).catch(()=>([{rows:[]},{rows:[]},{rows:[]}]));

  const routeMap={};
  routes.rows.forEach(r=>{ (routeMap[r.strategy]=routeMap[r.strategy]||[]).push(r.channel_name||`#${r.channel_id}`); });
  const predMap={};
  pred_c.rows.forEach(r=>{ predMap[r.strategy]=r; });

  let msg=`📋 *Stratégies* (${ideas.rows.length})\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (!ideas.rows.length) { msg+='_Aucune stratégie en BDD_'; }
  else ideas.rows.forEach(s=>{
    const p=predMap[s.id]||predMap[s.name]||{};
    const ch=(routeMap[s.id]||routeMap[s.name]||[]).map(esc).join(', ')||'Non assignée';
    msg+=`\n*${esc(s.name)}* (ID:${s.id})\n`;
    msg+=`• ${s.enabled?'✅ Activée':'❌ Désactivée'} | ${s.is_paid?`💰 ${s.price_usd} USD`:'Gratuite'}\n`;
    if (p.n) msg+=`• 🔮 Prédictions : ${p.n} (✅${p.won})\n`;
    msg+=`• 📡 Canal : ${ch}\n`;
  });
  await bot.sendMessage(chatId,msg,SEND_OPT(null));
}

// ── Canaux (admin) ─────────────────────────────────────────────────────────
async function sendChannelsAdmin(chatId) {
  const [channels,routes]=await Promise.all([
    pool.query(`SELECT * FROM telegram_config ORDER BY enabled DESC,updated_at DESC`),
    pool.query(`SELECT scr.strategy,scr.channel_id,tc.channel_name
                FROM strategy_channel_routes scr LEFT JOIN telegram_config tc ON tc.id=scr.channel_id`)
  ]).catch(()=>([{rows:[]},{rows:[]}]));

  if (!channels.rows.length) {
    bot.sendMessage(chatId,'📭 Aucun canal configuré.\n\nUtilisez ⚙️ *Config canal*.',{parse_mode:'Markdown'}); return;
  }
  let msg=`📡 *Canaux Telegram*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  channels.rows.forEach(c=>{
    msg+=`\n• *${esc(c.channel_name||'Sans nom')}*\n  ID : \`${esc(c.channel_id)}\`\n  ${c.enabled?'✅ Actif':'⭕ Inactif'}\n`;
  });
  if (routes.rows.length) {
    msg+=`\n📋 *Stratégies → Canaux*\n`;
    routes.rows.forEach(r=>{ msg+=`• ${esc(r.strategy)} → ${esc(r.channel_name||String(r.channel_id))}\n`; });
  }
  await bot.sendMessage(chatId,msg,SEND_OPT(null));
}

// ── Scan canal (admin) ─────────────────────────────────────────────────────
async function scanCanalAdmin(chatId) {
  const channel=await getActiveChannel();
  if (!channel) { bot.sendMessage(chatId,'❌ Aucun canal actif.'); return; }
  bot.sendMessage(chatId,'🔍 Scan en cours...');
  try {
    const admins=await bot.getChatAdministrators(channel.channel_id);
    let dm_sent=0;
    let msg=`🔍 *Scan : ${esc(channel.channel_name||channel.channel_id)}*\n━━━━━━━━━━━━━━━━━━━━━━\n👮 Admins : ${admins.length}\n\n`;
    for (const a of admins) {
      if (a.user.is_bot) continue;
      const name=[a.user.first_name,a.user.last_name].filter(Boolean).join(' ')||a.user.username||String(a.user.id);
      await trackVisitor(a.user.id,a.user.username,a.user.first_name);
      const linked=!!(await getLinkedUser(a.user.id));
      msg+=`• ${esc(name)}${a.user.username?` @${esc(a.user.username)}`:''} — ${linked?'✅ Lié':'📩 DM envoyé'}\n`;
      if (!linked) {
        await bot.sendMessage(a.user.id,
          `👋 Bonjour *${esc(name)}*,\n\nVous êtes admin du canal *${esc(channel.channel_name||'')}*.\n\nConnectez ou créez un compte pour gérer votre abonnement :\n\nTapez /start`,
          {parse_mode:'Markdown'}).catch(()=>{});
        dm_sent++;
      }
    }
    // Membres non liés ayant déjà interagi avec le bot
    const unlinked=await pool.query(`SELECT telegram_id,tg_username,tg_first_name FROM telegram_visitors`).catch(()=>({rows:[]}));
    for (const u of unlinked.rows) {
      await bot.sendMessage(u.telegram_id,
        `👋 Bonjour,\n\nConnectez votre compte *Sossou Kouamé Shopping Boutique* pour accéder à vos avantages.\n\nTapez /start`,
        {parse_mode:'Markdown'}).catch(()=>{});
      dm_sent++;
    }
    msg+=`\n⚠️ Non liés (interagis) : ${unlinked.rows.length}\n✅ DM envoyés : ${dm_sent}`;
    await bot.sendMessage(chatId,msg,SEND_OPT(null));
  } catch(e) { bot.sendMessage(chatId,`❌ Erreur scan : ${e.message}`); console.error('[TG-SCAN]',e.message); }
}

// ── Kick automatique des expirés ───────────────────────────────────────────
async function kickExpiredUsers(notifyAdmin=false) {
  const channel=await getActiveChannel();
  if (!channel) return;
  const r=await pool.query(`
    SELECT telegram_id::bigint,id AS user_id,username,first_name,subscription_expires_at
    FROM users
    WHERE telegram_id IS NOT NULL
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at<NOW()
      AND (is_premium=true OR is_pro=true)
  `).catch(()=>({rows:[]}));

  let kicked=0;
  for (const row of r.rows) {
    try {
      await bot.banChatMember(channel.channel_id,row.telegram_id);
      await bot.unbanChatMember(channel.channel_id,row.telegram_id);
      await pool.query("UPDATE users SET is_premium=false,is_pro=false WHERE id=$1",[row.user_id]);
      const prenom=esc(row.first_name||row.username||'client');
      await bot.sendMessage(row.telegram_id,
        `⏰ *Abonnement expiré*\n\nBonjour *${prenom}*,\n\nVotre abonnement a expiré le ${fmtDate(row.subscription_expires_at)}.\nVous avez été retiré du canal *${esc(channel.channel_name||'')}*.\n\n💳 *Renouveler votre abonnement :*\nhttps://a42ddbbc-f934-4f10-af76-20388838fe9b-00-rifgo0fh7zj9.worf.replit.dev/payment.html\n\nTapez /start pour gérer votre compte.`,
        {parse_mode:'Markdown'}).catch(()=>{});
      kicked++;
      console.log(`[TG-KICK] ${row.username} (${row.telegram_id}) retiré`);
    } catch(e) { console.error('[TG-KICK-ERR]',row.username,e.message); }
  }
  if (notifyAdmin && kicked>0) {
    bot.sendMessage(ADMIN_TG_ID,`🚪 *${kicked} membre(s) expiré(s) retirés du canal.*`,{parse_mode:'Markdown'}).catch(()=>{});
  }
}
// Vérification toutes les 5 minutes
setInterval(()=>kickExpiredUsers(true), 5*60*1000);

// ── Nouveaux membres dans le canal ─────────────────────────────────────────
bot.on('new_chat_members', async (msg) => {
  const channel=await getActiveChannel();
  if (!channel||String(msg.chat.id)!==String(channel.channel_id)) return;
  for (const m of msg.new_chat_members) {
    if (m.is_bot) continue;
    await trackVisitor(m.id,m.username,m.first_name);
    await bot.sendMessage(m.id,
      `👋 Bienvenue sur *Sossou Kouamé Shopping Boutique* !\n\nConnectez-vous ou créez un compte pour gérer votre abonnement.\n\nTapez /start`,
      {parse_mode:'Markdown'}).catch(()=>{});
  }
});

// ── /start ─────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId=msg.chat.id;
  tgSessions.delete(chatId);
  if (chatId===ADMIN_TG_ID) { await sendAdminDashboard(chatId); return; }
  const linked=await getLinkedUser(chatId);
  if (linked) { await sendUserDashboard(chatId,linked); return; }
  // Enregistrer l'interaction sans lien
  await trackVisitor(chatId,msg.from?.username,msg.from?.first_name);
  await bot.sendMessage(chatId,
    `👋 Bienvenue sur *Sossou Kouamé Shopping Boutique*\n\nConnectez-vous ou créez un compte pour accéder à vos services.`,
    SEND_OPT(KB_GUEST_MENU));
});

// ── Callback query (boutons inline) ────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId=query.message.chat.id;
  const data=query.data;
  await bot.answerCallbackQuery(query.id).catch(()=>{});

  // ── ADMIN ──
  if (chatId===ADMIN_TG_ID) {
    if (data==='admin_dashboard')    { await sendAdminDashboard(chatId); return; }
    if (data==='admin_membres')      { await sendMembersAdmin(chatId,0); return; }
    if (data==='admin_strategies')   { await sendStrategiesAdmin(chatId); return; }
    if (data==='admin_canaux')       { await sendChannelsAdmin(chatId); return; }
    if (data==='admin_scan')         { await scanCanalAdmin(chatId); return; }
    if (data==='admin_kick') {
      await kickExpiredUsers(false);
      bot.sendMessage(chatId,'✅ Vérification expirés effectuée.'); return;
    }
    if (data.startsWith('membres_p_')) {
      await sendMembersAdmin(chatId,parseInt(data.replace('membres_p_',''))); return;
    }
    if (data==='admin_config_canal') {
      tgSessions.set(chatId,{step:'config_canal_id'});
      bot.sendMessage(chatId,'⚙️ Entrez l\'*ID du canal* (ex: -1001234567890) :',{parse_mode:'Markdown'}); return;
    }
    if (data==='admin_assigner') {
      const members=await pool.query(
        `SELECT telegram_id::bigint,username,first_name,last_name FROM users WHERE telegram_id IS NOT NULL ORDER BY username LIMIT 25`
      ).catch(()=>({rows:[]}));
      if (!members.rows.length) { bot.sendMessage(chatId,'📭 Aucun membre lié.'); return; }
      const btns=members.rows.map(m=>[{text:esc([m.first_name,m.last_name].filter(Boolean).join(' ')||m.username),callback_data:`asgn_u_${m.telegram_id}`}]);
      btns.push([{text:'❌ Annuler',callback_data:'cancel'}]);
      bot.sendMessage(chatId,'🎯 *Choisir un membre :*',SEND_OPT({inline_keyboard:btns})); return;
    }
    if (data.startsWith('asgn_u_')) {
      const tgId=parseInt(data.replace('asgn_u_',''));
      const strategies=await pool.query(`SELECT * FROM strategy_ideas WHERE enabled=true ORDER BY sort_order,id`).catch(()=>({rows:[]}));
      if (!strategies.rows.length) { bot.sendMessage(chatId,'📭 Aucune stratégie disponible.'); return; }
      tgSessions.set(chatId,{step:'assign_strategy',target_tg_id:tgId});
      const btns=strategies.rows.map(s=>[{text:s.name,callback_data:`asgn_s_${s.id}`}]);
      btns.push([{text:'❌ Annuler',callback_data:'cancel'}]);
      bot.sendMessage(chatId,'📋 *Choisir une stratégie :*',SEND_OPT({inline_keyboard:btns})); return;
    }
    if (data.startsWith('asgn_s_')) {
      const stratId=data.replace('asgn_s_','');
      const sess=tgSessions.get(chatId);
      if (!sess||sess.step!=='assign_strategy') return;
      tgSessions.delete(chatId);
      const userRow=await pool.query("SELECT id FROM users WHERE telegram_id=$1::text",[String(sess.target_tg_id)]).catch(()=>({rows:[]}));
      if (!userRow.rows.length) { bot.sendMessage(chatId,'❌ Membre introuvable.'); return; }
      const userId=userRow.rows[0].id;
      await pool.query(`INSERT INTO user_strategy_visible(user_id,strategy_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[userId,String(stratId)]).catch(()=>{});
      const [strat_,user__]=await Promise.all([
        pool.query("SELECT name FROM strategy_ideas WHERE id=$1",[stratId]),
        pool.query("SELECT username FROM users WHERE id=$1",[userId])
      ]).catch(()=>([{rows:[{}]},{rows:[{}]}]));
      const stratName=strat_.rows[0]?.name||stratId;
      const uname=user__.rows[0]?.username||userId;
      bot.sendMessage(chatId,`✅ Stratégie *${stratName}* assignée à *${uname}*`,{parse_mode:'Markdown'});
      bot.sendMessage(sess.target_tg_id,
        `🎯 *Nouvelle stratégie disponible !*\n\nLa stratégie *${stratName}* vous a été attribuée.\n\nTapez /start pour voir votre compte.`,
        {parse_mode:'Markdown'}).catch(()=>{});
      return;
    }
    if (data==='cancel') { tgSessions.delete(chatId); bot.sendMessage(chatId,'❌ Annulé.'); return; }
  }

  // ── Confirmation inscription ──
  if (data==='reg_confirm_yes') {
    const sess=tgSessions.get(chatId);
    if (!sess||sess.step!=='reg_confirm') return;
    tgSessions.delete(chatId);
    try {
      const exists=await pool.query("SELECT id FROM users WHERE username=$1",[sess.username]);
      if (exists.rows.length) { bot.sendMessage(chatId,'⚠️ Identifiant déjà pris. Tapez /start pour réessayer.'); return; }
      const hash=await bcrypt.hash(sess.password,10);
      const ins=await pool.query(
        `INSERT INTO users(username,email,password_hash,plain_password,account_type) VALUES($1,$2,$3,$4,'Standard') RETURNING id,username,first_name,last_name,is_premium,is_pro,subscription_expires_at,account_type`,
        [sess.username,sess.email,hash,sess.password]
      );
      const newUser=ins.rows[0];
      await linkTgUser(chatId,newUser.id,query.from?.username,query.from?.first_name);
      await sendUserDashboard(chatId,newUser);
    } catch(e) { bot.sendMessage(chatId,'❌ Erreur création compte. Réessayez.'); console.error('[TG-REG]',e.message); }
    return;
  }

  // ── Menu utilisateur ──
  if (data==='mon_compte') {
    const linked=await getLinkedUser(chatId);
    if (linked) await sendUserDashboard(chatId,linked);
    else bot.sendMessage(chatId,'❌ Non connecté. Tapez /start');
    return;
  }
  if (data==='deconnexion') {
    await unlinkTgUser(chatId);
    bot.sendMessage(chatId,'✅ Déconnecté.\n\nTapez /start pour vous reconnecter.',SEND_OPT(KB_GUEST_MENU)); return;
  }
  if (data==='action_connexion') {
    tgSessions.set(chatId,{step:'login_username'});
    bot.sendMessage(chatId,'🔐 Entrez votre *identifiant* :',{parse_mode:'Markdown'}); return;
  }
  if (data==='action_inscription') {
    tgSessions.set(chatId,{step:'reg_username'});
    bot.sendMessage(chatId,'📝 *Inscription*\n\nChoisissez un *identifiant* (sans espaces) :',{parse_mode:'Markdown'}); return;
  }
  if (data==='cancel') { tgSessions.delete(chatId); bot.sendMessage(chatId,'❌ Annulé.'); return; }
});

// ── Messages texte (tous les flux) ────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId=msg.chat.id;
  const text=(msg.text||'').trim();
  if (!text||text.startsWith('/')) return;
  const sess=tgSessions.get(chatId);
  if (!sess) return;

  // Config canal (admin)
  if (sess.step==='config_canal_id') {
    tgSessions.set(chatId,{step:'config_canal_name',channel_id:text});
    bot.sendMessage(chatId,'📝 Entrez le *nom du canal* (ex: Canal VIP) :',{parse_mode:'Markdown'}); return;
  }
  if (sess.step==='config_canal_name') {
    await setActiveChannel(sess.channel_id,text);
    tgSessions.delete(chatId);
    bot.sendMessage(chatId,`✅ Canal configuré :\n• ID : \`${sess.channel_id}\`\n• Nom : *${text}*`,{parse_mode:'Markdown'}); return;
  }

  // Connexion
  if (sess.step==='login_username') {
    tgSessions.set(chatId,{step:'login_password',username:text});
    bot.sendMessage(chatId,'🔑 Entrez votre *mot de passe* :',{parse_mode:'Markdown'}); return;
  }
  if (sess.step==='login_password') {
    tgSessions.delete(chatId);
    try {
      const r=await pool.query(
        `SELECT id,username,first_name,last_name,is_premium,is_pro,subscription_expires_at,account_type,password_hash,plain_password
         FROM users WHERE username=$1 OR email=$1`,[sess.username]);
      if (!r.rows.length) { bot.sendMessage(chatId,'❌ Identifiant ou mot de passe incorrect.\n\nTapez /start pour réessayer.'); return; }
      const user=r.rows[0];
      let valid=false;
      if (user.password_hash) valid=await bcrypt.compare(text,user.password_hash);
      if (!valid&&user.plain_password) valid=(text===user.plain_password);
      if (!valid) { bot.sendMessage(chatId,'❌ Identifiant ou mot de passe incorrect.\n\nTapez /start pour réessayer.'); return; }
      await linkTgUser(chatId,user.id,msg.from?.username,msg.from?.first_name);
      await sendUserDashboard(chatId,user);
    } catch(e) { bot.sendMessage(chatId,'❌ Erreur serveur.'); console.error('[TG-LOGIN]',e.message); }
    return;
  }

  // Inscription
  if (sess.step==='reg_username') {
    const username=text.replace(/\s/g,'');
    const ex=await pool.query("SELECT id FROM users WHERE username=$1",[username]).catch(()=>({rows:[{id:1}]}));
    if (ex.rows.length) { bot.sendMessage(chatId,'⚠️ Identifiant déjà pris. Choisissez-en un autre :'); return; }
    tgSessions.set(chatId,{step:'reg_email',username});
    bot.sendMessage(chatId,'📧 Entrez votre *adresse email* :',{parse_mode:'Markdown'}); return;
  }
  if (sess.step==='reg_email') {
    if (!text.includes('@')) { bot.sendMessage(chatId,'⚠️ Email invalide. Réessayez :'); return; }
    tgSessions.set(chatId,{...sess,step:'reg_password',email:text});
    bot.sendMessage(chatId,'🔑 Choisissez un *mot de passe* (min. 6 caractères) :',{parse_mode:'Markdown'}); return;
  }
  if (sess.step==='reg_password') {
    if (text.length<6) { bot.sendMessage(chatId,'⚠️ Trop court (min. 6 car.). Réessayez :'); return; }
    tgSessions.set(chatId,{...sess,step:'reg_confirm',password:text});
    await bot.sendMessage(chatId,
      `✅ *Confirmer l'inscription ?*\n\n• Identifiant : \`${sess.username}\`\n• Email : ${sess.email}`,
      SEND_OPT({inline_keyboard:[[
        {text:'✅ Confirmer',callback_data:'reg_confirm_yes'},
        {text:'❌ Annuler',callback_data:'cancel'}
      ]]}));
    return;
  }
});

bot.on('polling_error', (e) => console.error('[TG-BOT-ERR]', e.message));
console.log('[TG-BOT] Bot Telegram complet démarré');

// ─── LANCEMENT ────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log("========================================");
  console.log(`Serveur Sossou Kouamé — Port ${PORT}`);
  console.log("========================================");
  await seedSettings();
});
