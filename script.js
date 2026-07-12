// ============================================
// SOSSOU KOUAMÉ — Paiement Mobile Money
// Intégration API Money Fusion / FusionPay
// ============================================

// ─── CONFIGURATION ───────────────────────────────────────────────────────
// Remplace cette URL par ton vrai lien API FusionPay (depuis ton dashboard)
const API_URL = "/api/create-payment";
const STATUS_URL = "/api/payment-status";

// Données des pays et réseaux supportés par Money Fusion
const COUNTRIES = {
  "bj": {
    name: "Bénin",
    flag: "🇧🇯",
    code: "+229",
    currency: "XOF",
    networks: [
      { key: "mtn-bj", name: "MTN", color: "#FFCC00", textColor: "#000" },
      { key: "moov-bj", name: "Moov", color: "#FF6600", textColor: "#fff" },
      { key: "celtiis-bj", name: "Celtiis", color: "#00A859", textColor: "#fff" }
    ]
  },
  "ci": {
    name: "Côte d'Ivoire",
    flag: "🇨🇮",
    code: "+225",
    currency: "XOF",
    networks: [
      { key: "mtn-ci", name: "MTN", color: "#FFCC00", textColor: "#000" },
      { key: "orange-money-ci", name: "Orange", color: "#FF6600", textColor: "#fff" },
      { key: "moov-ci", name: "Moov", color: "#0066CC", textColor: "#fff" },
      { key: "wave-ci", name: "Wave", color: "#1CE5BD", textColor: "#000" }
    ]
  },
  "bf": {
    name: "Burkina Faso",
    flag: "🇧🇫",
    code: "+226",
    currency: "XOF",
    networks: [
      { key: "orange-money-bf", name: "Orange", color: "#FF6600", textColor: "#fff" },
      { key: "moov-bf", name: "Moov", color: "#0066CC", textColor: "#fff" }
    ]
  },
  "tg": {
    name: "Togo",
    flag: "🇹🇬",
    code: "+228",
    currency: "XOF",
    networks: [
      { key: "tmoney-tg", name: "T-Money", color: "#0066CC", textColor: "#fff" },
      { key: "moov-tg", name: "Moov", color: "#FF6600", textColor: "#fff" }
    ]
  },
  "sn": {
    name: "Sénégal",
    flag: "🇸🇳",
    code: "+221",
    currency: "XOF",
    networks: [
      { key: "orange-money-sn", name: "Orange", color: "#FF6600", textColor: "#fff" },
      { key: "wave-sn", name: "Wave", color: "#1CE5BD", textColor: "#000" }
    ]
  },
  "ml": {
    name: "Mali",
    flag: "🇲🇱",
    code: "+223",
    currency: "XOF",
    networks: [
      { key: "orange-money-ml", name: "Orange", color: "#FF6600", textColor: "#fff" },
      { key: "moov-ml", name: "Moov", color: "#0066CC", textColor: "#fff" }
    ]
  }
};

let selectedCountry = null;
let selectedNetwork = null;
let currentToken = null;
let statusCheckInterval = null;

// ─── INITIALISATION ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initScrollSpy();
  populateCountries();
  loadHistory();

  // Écouteurs pour afficher/masquer les champs
  document.getElementById("countrySelect").addEventListener("change", onCountryChange);
  document.getElementById("phoneInput").addEventListener("input", onPhoneInput);
  document.getElementById("amountInput").addEventListener("input", onAmountInput);
  document.getElementById("clientName").addEventListener("input", checkFormComplete);
});

// ─── UI ──────────────────────────────────────────────────────────────────
function initMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const menu = document.querySelector('.mobile-menu');
  btn.addEventListener('click', () => menu.classList.toggle('open'));
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => menu.classList.remove('open'));
  });
}

function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-40% 0px -40% 0px' });
  sections.forEach(sec => observer.observe(sec));
}

// ─── PAYS ────────────────────────────────────────────────────────────────
function populateCountries() {
  const select = document.getElementById("countrySelect");
  Object.entries(COUNTRIES).forEach(([key, country]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${country.flag} ${country.name}`;
    select.appendChild(opt);
  });
}

function onCountryChange(e) {
  const code = e.target.value;
  selectedCountry = COUNTRIES[code];
  if (!selectedCountry) return;

  // Met à jour le drapeau et l'indicatif
  document.getElementById("countryFlag").textContent = selectedCountry.flag;
  document.getElementById("countryCode").textContent = selectedCountry.code;
  document.getElementById("currencyLabel").textContent = selectedCountry.currency;

  // Affiche les réseaux
  renderNetworks(selectedCountry.networks);
  document.getElementById("networkGroup").style.display = "block";
  document.getElementById("phoneGroup").style.display = "block";
  document.getElementById("amountGroup").style.display = "block";
  document.getElementById("nameGroup").style.display = "block";

  selectedNetwork = null;
  checkFormComplete();
}

function renderNetworks(networks) {
  const grid = document.getElementById("networkGrid");
  grid.innerHTML = "";
  networks.forEach(net => {
    const card = document.createElement("div");
    card.className = "network-card";
    card.dataset.key = net.key;
    card.innerHTML = `
      <div class="network-logo" style="background:${net.color};color:${net.textColor}">
        ${net.name.charAt(0)}
      </div>
      <span class="network-name">${net.name}</span>
    `;
    card.addEventListener("click", () => selectNetwork(net, card));
    grid.appendChild(card);
  });
}

function selectNetwork(network, cardElement) {
  selectedNetwork = network;
  document.querySelectorAll(".network-card").forEach(c => c.classList.remove("selected"));
  cardElement.classList.add("selected");
  checkFormComplete();
}

function onPhoneInput() {
  checkFormComplete();
}

function onAmountInput() {
  checkFormComplete();
}

function checkFormComplete() {
  const phone = document.getElementById("phoneInput").value.trim();
  const amount = document.getElementById("amountInput").value;
  const name = document.getElementById("clientName").value.trim();
  const btn = document.getElementById("payBtn");

  const isComplete = selectedNetwork && phone.length >= 8 && amount && parseInt(amount) >= 100 && name;
  btn.style.display = isComplete ? "flex" : "none";
}

// ─── PAIEMENT ────────────────────────────────────────────────────────────
async function initiatePayment() {
  const btn = document.getElementById("payBtn");
  const btnText = document.getElementById("btnText");
  const btnLoader = document.getElementById("btnLoader");
  const resultDiv = document.getElementById("result");
  const statusBox = document.getElementById("statusBox");

  const phone = document.getElementById("phoneInput").value.trim().replace(/\s/g, "");
  const amount = parseInt(document.getElementById("amountInput").value);
  const name = document.getElementById("clientName").value.trim();

  // Reset UI
  btn.disabled = true;
  btnText.textContent = "Traitement...";
  btnLoader.classList.remove("hidden");
  resultDiv.classList.add("hidden");
  statusBox.classList.add("hidden");
  clearInterval(statusCheckInterval);

  const fullPhone = selectedCountry.code + phone;

  const paymentData = {
    totalPrice: amount,
    article: [{ "Paiement": amount }],
    numeroSend: fullPhone,
    nomclient: name,
    personal_Info: [{ country: selectedCountry.name, network: selectedNetwork.name, networkKey: selectedNetwork.key }],
    return_url: window.location.origin + "/callback",
    webhook_url: window.location.origin + "/webhook"
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentData)
    });

    const data = await res.json();

    if (!data.success && data.statut !== true) {
      throw new Error(data.error || data.message || "Erreur lors de la création du paiement.");
    }

    currentToken = data.token || data.tokenPay;

    // Sauvegarde dans l'historique local
    saveToHistory({
      token: currentToken,
      date: new Date().toISOString(),
      name: name,
      phone: fullPhone,
      amount: amount,
      country: selectedCountry.name,
      network: selectedNetwork.name,
      status: "pending"
    });

    displaySuccess(data, fullPhone, amount, name);
    startStatusCheck(currentToken);
    loadHistory();

  } catch (err) {
    displayError(err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = "Payer maintenant";
    btnLoader.classList.add("hidden");
  }
}

function displaySuccess(data, phone, amount, name) {
  const resultDiv = document.getElementById("result");
  const token = data.token || data.tokenPay;
  const paymentUrl = data.paymentUrl || data.url;

  resultDiv.innerHTML = `
    <div class="result-success">
      <h4 style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        Paiement initié avec succès
      </h4>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Client</span>
          <span class="info-value">${name}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Numéro</span>
          <span class="info-value">${phone}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Montant</span>
          <span class="info-value">${amount} ${selectedCountry.currency}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Réseau</span>
          <span class="info-value">${selectedNetwork.name}</span>
        </div>
      </div>
      <p style="margin-top:16px;font-weight:600;color:var(--navy);">Référence (Token) :</p>
      <div class="token-box" onclick="copyToken(this, '${token}')">${token}</div>
      <p style="font-size:0.8rem;color:var(--gray-600);text-align:center;">Cliquez pour copier le token</p>
      ${paymentUrl ? `<a href="${paymentUrl}" target="_blank" rel="noopener" class="btn-primary-large" style="margin-top:16px;text-decoration:none;display:inline-flex;width:100%;">Ouvrir la page de paiement</a>` : ""}
      <p style="margin-top:16px;font-size:0.85rem;text-align:center;color:var(--gray-600);">
        Un SMS de confirmation sera envoyé au ${phone}.
      </p>
    </div>
  `;
  resultDiv.classList.remove("hidden");
}

function displayError(msg) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `
    <div class="result-error">
      <h4 style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        Erreur
      </h4>
      <p>${msg}</p>
    </div>`;
  resultDiv.classList.remove("hidden");
}

function copyToken(el, text) {
  navigator.clipboard.writeText(text).then(() => {
    el.classList.add("copied");
    el.textContent = "Copié !";
    setTimeout(() => { el.textContent = text; el.classList.remove("copied"); }, 2000);
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    el.classList.add("copied");
    el.textContent = "Copié !";
    setTimeout(() => { el.textContent = text; el.classList.remove("copied"); }, 2000);
  });
}

// ─── STATUT ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  "pending": { text: "En attente de paiement...", class: "pending" },
  "no paid": { text: "Paiement non effectué", class: "error" },
  "failure": { text: "Échec du paiement", class: "error" },
  "paid": { text: "Paiement réussi !", class: "success" },
  "completed": { text: "Paiement réussi !", class: "success" }
};

function updateStatusUI(statusKey) {
  const statusBox = document.getElementById("statusBox");
  const statusBadge = document.getElementById("statusBadge");
  const progressBar = document.getElementById("progressBar");

  const mapped = STATUS_MAP[statusKey] || { text: `Statut: ${statusKey}`, class: "pending" };

  statusBox.classList.remove("hidden");
  statusBadge.textContent = mapped.text;
  statusBadge.className = `status-badge ${mapped.class}`;

  if (["paid", "completed", "failure", "no paid"].includes(statusKey)) {
    progressBar.classList.remove("animated");
    progressBar.style.width = "100%";
    progressBar.style.backgroundColor = mapped.class === "success" ? "var(--success)" : "var(--error)";
    if (mapped.class === "success") triggerConfetti();
  } else {
    progressBar.classList.add("animated");
    progressBar.style.backgroundColor = "transparent";
  }
}

function startStatusCheck(token) {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  updateStatusUI("pending");
  checkStatus(token);
  statusCheckInterval = setInterval(() => checkStatus(token), 10000);
  setTimeout(() => {
    clearInterval(statusCheckInterval);
    const bar = document.getElementById("progressBar");
    if (bar) bar.classList.remove("animated");
  }, 300000);
}

async function checkStatus(token) {
  try {
    const res = await fetch(`${STATUS_URL}/${token}`);
    const data = await res.json();

    if (data.statut === true && data.data) {
      const paymentStatus = data.data.statut;
      updateStatusUI(paymentStatus);

      // Met à jour l'historique
      updateHistoryStatus(token, paymentStatus);

      if (["paid", "completed", "failure", "no paid"].includes(paymentStatus)) {
        clearInterval(statusCheckInterval);
      }
    }
  } catch (err) {
    console.error("Erreur vérification statut:", err);
  }
}

// ─── HISTORIQUE ──────────────────────────────────────────────────────────
function saveToHistory(tx) {
  let history = JSON.parse(localStorage.getItem("sk_payment_history") || "[]");
  history.unshift(tx);
  localStorage.setItem("sk_payment_history", JSON.stringify(history));
}

function updateHistoryStatus(token, status) {
  let history = JSON.parse(localStorage.getItem("sk_payment_history") || "[]");
  const idx = history.findIndex(h => h.token === token);
  if (idx !== -1) {
    history[idx].status = status;
    localStorage.setItem("sk_payment_history", JSON.stringify(history));
    loadHistory();
  }
}

function loadHistory() {
  const list = document.getElementById("historyList");
  const history = JSON.parse(localStorage.getItem("sk_payment_history") || "[]");

  if (history.length === 0) {
    list.innerHTML = `<div class="history-empty">Aucune transaction pour le moment</div>`;
    return;
  }

  list.innerHTML = history.map(tx => {
    const date = new Date(tx.date);
    const dateStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const statusClass = tx.status === "paid" || tx.status === "completed" ? "paid" : tx.status === "pending" ? "pending" : "failed";
    const statusLabel = STATUS_MAP[tx.status]?.text || tx.status;

    return `
      <div class="history-item">
        <span>${dateStr}<br><small style="color:var(--gray-400)">${timeStr}</small></span>
        <span style="font-family:monospace;font-size:0.8rem;word-break:break-all;">${tx.token}</span>
        <span>${tx.phone}</span>
        <span><strong>${tx.amount} ${tx.country === "Bénin" ? "XOF" : "XOF"}</strong></span>
        <span><span class="status-dot ${statusClass}"></span>${statusLabel}</span>
      </div>
    `;
  }).join("");
}

// ─── CONFETTI ────────────────────────────────────────────────────────────
function triggerConfetti() {
  const colors = ['#DC2626', '#C9A84C', '#059669', '#2563EB', '#FFFFFF'];
  for (let i = 0; i < 60; i++) {
    const confetti = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = 1.5 + Math.random() * 2;
    const isCircle = Math.random() > 0.5;
    confetti.style.cssText = `
      position: fixed; width: 10px; height: 10px; background: ${color};
      left: ${left}vw; top: -10px; border-radius: ${isCircle ? '50%' : '0'};
      animation: fallAnim ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
      z-index: 9999; pointer-events: none; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), duration * 1000);
  }
}

if (!document.getElementById('confetti-style')) {
  const style = document.createElement('style');
  style.id = 'confetti-style';
  style.textContent = `@keyframes fallAnim {
    0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }`;
  document.head.appendChild(style);
}
