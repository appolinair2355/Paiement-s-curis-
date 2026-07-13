// ============================================================
// SOSSOU KOUAMÉ — Serveur Express (Backend Proxy)
// Le frontend appelle ce serveur, et ce serveur appelle Money Fusion
// Cela évite le problème CORS et cache la clé API
// ============================================================

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURATION MONEY FUSION (EN DUR)
// ============================================================
const CONFIG = {
  // URL API Money Fusion (depuis ton dashboard)
  API_URL: "https://pay.moneyfusion.net/Paiements_m/7da7654df194be93/pay/",

  // URL de vérification de statut
  STATUS_URL: "https://pay.moneyfusion.net/paiementNotif",

  // Clé API Money Fusion (NE JAMAIS PARTAGER)
  API_KEY: "moneyfusion_v1_69777b802181d4ebf71e2bde_9F8AA2BB17ED57E9EE1835A9C1A",
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Autorise ton frontend à appeler ce serveur
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Servir les fichiers statiques
app.use(express.static(__dirname));

// ============================================================
// ROUTE: Récupérer l'IP du serveur (pour Money Fusion whitelist)
// GET /my-ip
// ============================================================
app.get("/my-ip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    res.json({
      ip: data.ip,
      message: "Ajoute cette IP dans ton dashboard Money Fusion > Adresses IP autorisées",
      dashboard_url: "https://pay.moneyfusion.net/dashboard"
    });
  } catch (err) {
    res.status(500).json({ error: "Impossible de récupérer l'IP", details: err.message });
  }
});

// ============================================================
// ROUTE: Créer un paiement (PROXY vers Money Fusion)
// POST /api/create-payment
// Le frontend appelle CETTE route, pas Money Fusion directement
// ============================================================
app.post("/api/create-payment", async (req, res) => {
  const { totalPrice, article, numeroSend, nomclient, return_url } = req.body;

  // Validation
  if (!totalPrice || totalPrice <= 0) {
    return res.status(400).json({ error: "Le montant total est requis et doit être > 0" });
  }
  if (!article || !Array.isArray(article) || article.length === 0) {
    return res.status(400).json({ error: "Au moins un article est requis" });
  }
  if (!numeroSend || String(numeroSend).trim().length < 8) {
    return res.status(400).json({ error: "Le numéro de téléphone est requis (min 8 chiffres)" });
  }
  if (!nomclient || String(nomclient).trim().length === 0) {
    return res.status(400).json({ error: "Le nom du client est requis" });
  }

  try {
    const paymentData = {
      totalPrice: parseInt(String(totalPrice), 10),
      article: article,
      numeroSend: String(numeroSend).trim(),
      nomclient: String(nomclient).trim(),
      return_url: return_url || `${req.headers.origin || "http://localhost:3000"}/success.html`,
    };

    console.log("[PROXY] Appel Money Fusion avec:", JSON.stringify(paymentData));

    // Appel à Money Fusion avec la clé API
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    console.log("[PROXY] Réponse Money Fusion:", JSON.stringify(data));

    // Retourne la réponse au frontend
    res.json(data);

  } catch (err) {
    console.error("[PROXY] Erreur:", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard", details: err.message });
  }
});

// ============================================================
// ROUTE: Vérifier le statut d'un paiement
// GET /api/payment-status/:token
// ============================================================
app.get("/api/payment-status/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const response = await fetch(`${CONFIG.STATUS_URL}/${token}`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.API_KEY}`,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("[PROXY] Erreur statut:", err);
    res.status(500).json({ error: "Impossible de récupérer le statut" });
  }
});

// ============================================================
// ROUTE: Webhook — Notifications en temps réel
// POST /webhook
// ============================================================
app.post("/webhook", (req, res) => {
  const { event, tokenPay, numeroSend, nomclient, numeroTransaction, Montant, frais, moyen, createdAt } = req.body;

  console.log("[WEBHOOK] Reçu:", { event, tokenPay });

  if (event === "payin.session.completed") {
    console.log("[WEBHOOK] PAIEMENT CONFIRME:", { tokenPay, nomclient, Montant, numeroTransaction, moyen });
  } else if (event === "payin.session.cancelled") {
    console.log("[WEBHOOK] PAIEMENT ANNULE:", { tokenPay, nomclient, Montant });
  } else if (event === "payin.session.pending") {
    console.log("[WEBHOOK] PAIEMENT EN ATTENTE:", { tokenPay });
  }

  res.status(200).send("OK");
});

// ============================================================
// Lancement
// ============================================================
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Serveur Sossou Kouamé lancé !`);
  console.log(`Port: ${PORT}`);
  console.log(`API Money Fusion: ${CONFIG.API_URL}`);
  console.log(`Clé API: ${CONFIG.API_KEY ? "CONFIGURÉE" : "NON CONFIGURÉE"}`);
  console.log(`Récupérer l'IP: http://localhost:${PORT}/my-ip`);
  console.log(`========================================`);
});
