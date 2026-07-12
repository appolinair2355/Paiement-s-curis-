// ============================================================
// SOSSOU KOUAMÉ — Serveur Express
// Paiement Mobile Money via Money Fusion / FusionPay
// ============================================================

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURATION EN DUR (HARDCODED)
// ============================================================
const CONFIG = {
  // URL API de création de paiement Money Fusion
  API_URL: "https://pay.moneyfusion.net/Paiements_m/7da7654df194be93/pay/",

  // URL de vérification de statut (fixe)
  STATUS_URL: "https://www.pay.moneyfusion.net/paiementNotif",

  // Clé API Money Fusion (NE JAMAIS PARTAGER PUBLIQUEMENT)
  API_KEY: "moneyfusion_v1_69777b802181d4ebf71e2bde_9F8AA2BB17ED57E9EE1835A9C1A",
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    res.status(500).json({ error: "Impossible de récupérer l'IP" });
  }
});

// ============================================================
// ROUTE: Créer un paiement (PAYIN)
// POST /api/create-payment
// ============================================================
app.post("/api/create-payment", async (req, res) => {
  const { totalPrice, article, numeroSend, nomclient, personal_Info, return_url, webhook_url } = req.body;

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
    const origin = req.headers.origin || `http://localhost:${PORT}`;

    const paymentData = {
      totalPrice: parseInt(String(totalPrice), 10),
      article: article,
      personal_Info: personal_Info || [],
      numeroSend: String(numeroSend).trim(),
      nomclient: String(nomclient).trim(),
      return_url: return_url || `${origin}/callback`,
      webhook_url: webhook_url || `${origin}/webhook`,
    };

    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();

    if (!response.ok || data.statut !== true) {
      console.error("Erreur FusionPay:", data);
      return res.status(response.status || 400).json({
        error: data.message || "Erreur lors de la création du paiement",
      });
    }

    res.json({
      success: true,
      token: data.token,
      tokenPay: data.tokenPay,
      message: data.message,
      paymentUrl: data.url,
      totalPrice: paymentData.totalPrice,
      numeroSend: paymentData.numeroSend,
      nomclient: paymentData.nomclient,
      status: "pending",
    });
  } catch (err) {
    console.error("Erreur serveur:", err);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard" });
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
    console.error("Erreur statut:", err);
    res.status(500).json({ error: "Impossible de récupérer le statut" });
  }
});

// ============================================================
// ROUTE: Webhook — Notifications en temps réel
// POST /webhook
// ============================================================
app.post("/webhook", (req, res) => {
  const {
    event,
    tokenPay,
    numeroSend,
    nomclient,
    numeroTransaction,
    Montant,
    frais,
    moyen,
    createdAt,
  } = req.body;

  console.log("Webhook FusionPay reçu:", { event, tokenPay });

  if (event === "payin.session.completed") {
    console.log("PAIEMENT CONFIRME:", {
      tokenPay, nomclient, Montant, frais, numeroSend, numeroTransaction, moyen, createdAt,
    });
  } else if (event === "payin.session.cancelled") {
    console.log("PAIEMENT ANNULE:", { tokenPay, nomclient, Montant });
  } else if (event === "payin.session.pending") {
    console.log("PAIEMENT EN ATTENTE:", { tokenPay });
  } else {
    console.warn("Événement inconnu:", event);
  }

  res.status(200).send("OK");
});

// ============================================================
// ROUTE: Callback après paiement
// GET /callback
// ============================================================
app.get("/callback", (req, res) => {
  const { token } = req.query;
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement terminé — FusionPay</title>
  <style>
    body { font-family: 'Poppins', system-ui; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; background: linear-gradient(135deg, #0D1B3E, #1E3A5F); margin: 0; }
    .card { background: white; padding: 40px; border-radius: 20px; text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3); max-width: 400px; }
    h1 { color: #059669; margin-bottom: 12px; font-size: 1.5rem; }
    p { color: #4B5563; line-height: 1.6; }
    .token { background: #F3F4F6; padding: 12px; border-radius: 8px; font-family: monospace;
             margin: 16px 0; font-weight: 700; color: #0D1B3E; }
    a { display: inline-block; margin-top: 20px; padding: 14px 32px;
        background: #DC2626; color: white; text-decoration: none;
        border-radius: 12px; font-weight: 700; }
    a:hover { background: #B91C1C; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Paiement traité !</h1>
    <p>Votre paiement a été traité avec succès.</p>
    ${token ? `<div class="token">Token: ${token}</div>` : ""}
    <p>Vous recevrez une confirmation par SMS.</p>
    <a href="/">Retour à l'accueil</a>
  </div>
</body>
</html>`);
});

// ============================================================
// Lancement
// ============================================================
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
  console.log(`API URL: ${CONFIG.API_URL}`);
  console.log(`API Key: ${CONFIG.API_KEY ? "CONFIGURÉE" : "NON CONFIGURÉE"}`);
  console.log(`Pour récupérer l'IP: http://localhost:${PORT}/my-ip`);
});
