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

// ─── PLANS D'ABONNEMENT ───────────────────────────────────────────────────
const PLANS = [
  { id: "1j",  label: "1 Jour",   duration_minutes:  1440, amount_usd:  3.00, price_xof:  2000 },
  { id: "7j",  label: "7 Jours",  duration_minutes: 10080, amount_usd: 16.00, price_xof: 10000 },
  { id: "30j", label: "30 Jours", duration_minutes: 43200, amount_usd: 50.00, price_xof: 30000 },
];

// ─── WALLETS CRYPTO ───────────────────────────────────────────────────────
const CRYPTO_WALLETS = [
  { id: "USDT_TRC20", name: "Tether TRC20", symbol: "USDT", icon: "₮", network: "TRON",     address: "T9zZ123xABCdef456GHIjkl789mnoPQRst", min: "10 USDT" },
  { id: "USDT_ERC20", name: "Tether ERC20", symbol: "USDT", icon: "₮", network: "Ethereum", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", min: "10 USDT" },
  { id: "BTC",        name: "Bitcoin",      symbol: "BTC",  icon: "₿", network: "Bitcoin",  address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", min: "0.001 BTC" },
  { id: "ETH",        name: "Ethereum",     symbol: "ETH",  icon: "Ξ", network: "Ethereum", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", min: "0.01 ETH" },
];

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
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username.trim()]);
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
              subscription_expires_at, subscription_duration_minutes, account_type
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

    res.json({ ...user, remaining_ms, is_active, plans: PLANS, crypto_wallets: CRYPTO_WALLETS });
  } catch (err) {
    console.error("[ME]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ROUTE: Plans ─────────────────────────────────────────────────────────
app.get("/api/plans", (req, res) => {
  res.json({ plans: PLANS, crypto_wallets: CRYPTO_WALLETS });
});

// ─── ROUTE: Créer paiement Mobile Money ──────────────────────────────────
app.post("/api/create-payment", requireAuth, async (req, res) => {
  const { totalPrice, article, numeroSend, nomclient, plan_id } = req.body;

  if (!totalPrice || totalPrice <= 0)
    return res.status(400).json({ error: "Montant requis" });
  if (!numeroSend || String(numeroSend).trim().length < 8)
    return res.status(400).json({ error: "Numéro de téléphone requis (min 8 chiffres)" });
  if (!nomclient)
    return res.status(400).json({ error: "Nom du client requis" });

  const plan = PLANS.find(p => p.id === plan_id) || null;

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
      nomclient:  String(nomclient).trim(),
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
  const plan = PLANS.find(p => p.id === plan_id);
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

    // Si Mobile Money et encore pending → vérifier auprès de Money Fusion
    if (pr.payment_method === "mobile_money" && pr.status === "pending" && pr.transaction_id) {
      try {
        const mfRes  = await fetch(`${CONFIG.STATUS_URL}/${pr.transaction_id}`, {
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.API_KEY}` },
        });
        const mfData = await mfRes.json();

        if (mfData.statut === "payé" || mfData.status === "completed" || mfData.statut === true) {
          await activateSubscription(pr);
          return res.json({ status: "validated", plan_label: pr.plan_label, duration_minutes: pr.duration_minutes });
        }
      } catch (_) { /* on ignore l'erreur MF temporaire */ }
    }

    res.json({ status: pr.status, plan_label: pr.plan_label, duration_minutes: pr.duration_minutes });
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

// ─── HELPER: Activer l'abonnement ────────────────────────────────────────
async function activateSubscription(pr) {
  await pool.query(
    "UPDATE payment_requests SET status = 'validated', admin_validated_at = NOW() WHERE id = $1",
    [pr.id]
  );

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

// ─── LANCEMENT ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("========================================");
  console.log(`Serveur Sossou Kouamé — Port ${PORT}`);
  console.log("========================================");
});
