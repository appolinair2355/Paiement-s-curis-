// ============================================================
// SOSSOU KOUAMÉ — Serveur Express (optionnel)
// Le frontend appelle directement Money Fusion avec axios
// Ce serveur sert juste les fichiers statiques
// ============================================================

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques
app.use(express.static(__dirname));

// ============================================================
// ROUTE: Callback après paiement (si utilisé)
// GET /callback
// ============================================================
app.get("/callback", (req, res) => {
  const { token, amount, currency, phone, name, network } = req.query;
  res.redirect(`/success.html?token=${token || ''}&amount=${amount || ''}&currency=${currency || ''}&phone=${phone || ''}&name=${name || ''}&network=${network || ''}`);
});

// ============================================================
// Lancement
// ============================================================
app.listen(PORT, () => {
  console.log(`Serveur Sossou Kouamé lancé sur le port ${PORT}`);
  console.log(`Ouvre: http://localhost:${PORT}`);
});
