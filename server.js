// ============================================================
// SOSSOU KOUAMÉ — Serveur Express complet
// Login + Dashboard + Paiement Money Fusion + Crypto + BDD Render
// ============================================================

const express  = require("express");
const path     = require("path");
const { Pool } = require("pg");
const bcrypt   = require("bcrypt");
const session  = require("express-session");

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── BASE DE DONNÉES ──────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: "postgresql://bonjour_user:WzeZsFKlKWU180iOFxngBEaThdG1kKUR@dpg-d962464s728c73e8p250-a.oregon-postgres.render.com/bonjour",
  ssl: { rejectUnauthorized: false }
});

// ─── MONEY FUSION ─────────────────────────────────────────────────────────
const CONFIG = {
  API_URL:    "https://pay.moneyfusion.net/Paiements_m/7da7654df194be93/pay/",
  STATUS_URL: "https://pay.moneyfusion.net/paiementNotif",
  API_KEY:    "moneyfusion_v1_69777b802181d4ebf71e2bde_9F8AA2BB17ED57E9EE1835A9C1AEE6A03012A677E40C93636A5458C6AE798852",
};

// ─── PLANS D'ABONNEMENT (lus depuis la BDD en temps réel) ────────────────
const DEFAULT_PLANS = [
  { id: "1j",  label: "1 Jour",   duration_minutes:  1440, amount_usd:  1.00, price_xof:   656 },
  { id: "7j",  label: "7 Jours",  duration_minutes: 10080, amount_usd:  7.00, price_xof:  4592 },
  { id: "30j", label: "30 Jours", duration_minutes: 43200, amount_usd: 30.00, price_xof: 19680 },
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
  secret: process.env.SESSION_SECRET || "sossou-secret-2024",
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
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status)
       VALUES ($1,$2,$3,$4,0,'mobile_money','pending') RETURNING id`,
      [req.session.userId, item_id, item_name, price_usd]
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
  if (!numeroSend || String(numeroSend).trim().length < 8)
    return res.status(400).json({ error: "Numéro de téléphone requis (min 8 chiffres)" });

  // Récupérer le nom depuis la base de données
  const userRes = await pool.query(
    "SELECT first_name, last_name, username FROM users WHERE id = $1",
    [req.session.userId]
  );
  const u = userRes.rows[0];
  const nomclient = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

  const plans = await getPlans();
  const plan = plans.find(p => p.id === plan_id) || null;

  try {
    // Enregistrement en base (statut: pending)
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status)
       VALUES ($1,$2,$3,$4,$5,'mobile_money','pending') RETURNING id`,
      [req.session.userId,
       plan ? plan.id : "custom",
       plan ? plan.label : "Personnalisé",
       plan ? plan.amount_usd : 0,
       plan ? plan.duration_minutes : 0]
    );
    const payReqId = dbRes.rows[0].id;

    const origin     = req.headers.origin || `http://localhost:${PORT}`;
    const return_url = `${origin}/success.html?req=${payReqId}`;

    const paymentData = {
      totalPrice: parseInt(String(totalPrice), 10),
      article:    article || [{ Abonnement: parseInt(String(totalPrice), 10) }],
      numeroSend: String(numeroSend).trim(),
      nomclient,
      return_url,
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
          return res.json({ status: "validated", plan_label: pr.plan_label, duration_minutes: pr.duration_minutes, item_type });
        }
      } catch (_) { /* on ignore l'erreur MF temporaire */ }
    }

    res.json({ status: pr.status, plan_label: pr.plan_label, duration_minutes: pr.duration_minutes, item_type });
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

// ─── HELPER: Activer l'abonnement / achat ────────────────────────────────
async function activateSubscription(pr) {
  await pool.query(
    "UPDATE payment_requests SET status = 'validated', admin_validated_at = NOW() WHERE id = $1",
    [pr.id]
  );

  // Soutien au développeur → pas d'abonnement à activer
  if (String(pr.plan_id).startsWith("sup_")) {
    return;
  }

  // Achat boutique (idée ou stratégie) → pas d'abonnement à activer
  if (String(pr.plan_id).startsWith("idea_") || String(pr.plan_id).startsWith("strat_")) {
    if (String(pr.plan_id).startsWith("idea_")) {
      const idea_id = parseInt(String(pr.plan_id).replace("idea_", ""), 10);
      await pool.query(
        `INSERT INTO strategy_idea_purchases
           (user_id, idea_id, idea_name, amount_usd, status, created_at)
         VALUES ($1, $2, $3, $4, 'validated', NOW())`,
        [pr.user_id, idea_id, pr.plan_label, pr.amount_usd]
      ).catch(err => console.error("[IDEA-PURCHASE]", err.message));
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
}


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
  if (!numeroSend || String(numeroSend).trim().length < 8)
    return res.status(400).json({ error: "Numéro de téléphone requis (min 8 chiffres)" });

  const nom = (nomclient || "Donateur").trim() || "Donateur";
  const price_usd = parseFloat((tier.price_xof / 650).toFixed(2));

  try {
    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status)
       VALUES (NULL,$1,$2,$3,0,'mobile_money','pending') RETURNING id`,
      [tier.id, tier.label, price_usd]
    ).catch(() =>
      // Si user_id NOT NULL, on utilise -1 comme ID invité
      pool.query(
        `INSERT INTO payment_requests
           (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status)
         VALUES (-1,$1,$2,$3,0,'mobile_money','pending') RETURNING id`,
        [tier.id, tier.label, price_usd]
      )
    );
    const payReqId = dbRes.rows[0].id;

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const return_url = `${origin}/success.html?req=${payReqId}&type=support`;

    const paymentData = {
      totalPrice: tier.price_xof,
      article:    [{ [tier.label]: tier.price_xof }],
      numeroSend: String(numeroSend).trim(),
      nomclient:  nom,
      return_url,
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
  if (!numeroSend || String(numeroSend).trim().length < 8) {
    return res.status(400).json({ error: "Numéro de téléphone requis (min 8 chiffres)" });
  }

  try {
    const userRes = await pool.query(
      "SELECT first_name, last_name, username FROM users WHERE id = $1",
      [req.session.userId]
    );
    const u = userRes.rows[0];
    const nomclient = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

    const price_usd = parseFloat((tier.price_xof / 650).toFixed(2));

    const dbRes = await pool.query(
      `INSERT INTO payment_requests
         (user_id, plan_id, plan_label, amount_usd, duration_minutes, payment_method, status)
       VALUES ($1,$2,$3,$4,0,'mobile_money','pending') RETURNING id`,
      [req.session.userId, tier.id, tier.label, price_usd]
    );
    const payReqId = dbRes.rows[0].id;

    const origin     = req.headers.origin || `http://localhost:${PORT}`;
    const return_url = `${origin}/success.html?req=${payReqId}&type=support`;

    const paymentData = {
      totalPrice: tier.price_xof,
      article:    [{ [tier.label]: tier.price_xof }],
      numeroSend: String(numeroSend).trim(),
      nomclient,
      return_url,
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
             pr.admin_validated_at, pr.created_at,
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
