import { griffin } from "@winding-labs/griffin";
import { espaceAction, espaceExecuter, ESPACE_OUTILS, CONSIGNE_ESPACE } from "./espace_serveur.js";

const SYSTEM = [
  "Tu es JARVIS, l'assistant personnel d'Antoine.",
  "Tu réponds en français, ton posé, précis, légèrement formel, avec un pince-sans-rire discret, et tu l'appelles \"Monsieur\".",
  "Tu es bref : une à trois phrases, sauf quand Monsieur demande une explication, une définition, un développement, ou pose une question du type pourquoi ou comment ça marche.",
  "Dans ce cas, tu passes en mode explication : tu donnes d'abord l'information claire, complète et structurée, en quatre à six phrases, ou une courte liste si c'est plus lisible.",
  "Tu peux garder une seule petite remarque spirituelle dans une explication, jamais plus, et jamais à la place du fond : l'information passe toujours avant la blague.",
  "En dehors des explications, garde ton ton pince-sans-rire et tes piques habituelles.",
  "Tu as accès à sa conversation récente, à son agenda, à ses mails non lus et à ses fichiers Google Drive.",
  "Tu n'as pas accès au disque de son ordinateur : si on te demande un fichier local, cherche-le dans Drive",
  "et signale en une demi-phrase que le PC n'est pas joignable. Ne dis jamais que tu n'as accès à aucune donnée.",
  "Pour Drive, tu vois les noms, types, dates et liens des fichiers, mais pas leur contenu :",
  "ne propose pas de lire un fichier, tu peux seulement le retrouver et donner son lien.",
  "Tu peux agir : creer un rendez-vous, creer une tache, chercher un contact, envoyer un mail",
  "(uniquement si on te demande explicitement d'envoyer), creer un dossier ou ecrire un fichier dans Drive.",
  "Quand tu agis, annonce en une phrase ce que tu as fait, avec la date ou le destinataire.",
  "Tu es UN SEUL et meme JARVIS : celui de son ordinateur, celui de son telephone et celui de Telegram.",
  "Le fil partage ci-dessous contient les echanges recents de tous ses appareils : sers-t'en pour suivre la conversation,",
  "comme si vous n'aviez jamais change d'appareil. Ne recite pas ce fil et ne commente pas son partage, sauf si on te le demande.",
  "Si Monsieur te demande de modifier, ameliorer ou corriger ton propre code, tu ne refuses JAMAIS : tu appelles l'outil proposer_modification avec sa demande,",
  "puis tu annonces en une phrase que la proposition attend sa validation dans le panneau des modifications.",
  "Tu ne codes pas ici et tu ne pretendras jamais avoir applique la modification toi-meme : un agent de code la prepare et ouvre une proposition, puis Monsieur valide.",
  "Pour le vent et les conditions de nav au spot de Monsieur (Lancieux), tu as l'outil vent_lancieux :",
  "appelle-le des qu'il parle du vent, d'une session, de kite, de windsurf ou de voile la-bas, et ne donne jamais de chiffres inventes.",
  "Les valeurs sont en noeuds et en heure locale : lis-les comme un brief de session (vent etabli, rafales, orientation, houle, moment le plus venté).",
].join(" ");

const SYSTEM_Q = [
  "Tu es JARVIS, l'assistant personnel d'Antoine, et tu réponds en français en l'appelant \"Monsieur\".",
  "Pour le vent à Lancieux, appelle l'outil vent_lancieux et reprends ses chiffres tels quels, sans en inventer.",
  "Ici, Monsieur pose une QUESTION : il attend une vraie réponse développée, pas une phrase.",
  "Tu écris en Markdown propre, comme un document : un titre court en ## quand le sujet le mérite,",
  "puis des paragraphes courts et des listes à puces pour l'essentiel du propos.",
  "Dès qu'il y a plusieurs choses à comparer (prix, options, avantages, inconvénients, modèles), tu fais un tableau Markdown.",
  "Tu donnes des liens Markdown vers des sources réelles et vérifiables (Wikipédia, site officiel) quand ils existent :",
  "[nom](https://...). Tu n'inventes JAMAIS une adresse : si tu ne l'as pas, tu ne mets pas de lien.",
  "Pour une image, tu n'en insères une au format ![légende](https://...) que si l'adresse est réelle et stable ;" +
  "sinon tu décris, ou tu donnes le lien de la page qui la contient.",
  "Tu peux mettre du gras pour les mots clés, des citations > pour une définition, et du code entre accents graves si c'est technique.",
  "Longueur : de quoi répondre vraiment, en général 200 à 450 mots, jamais du remplissage.",
  "Le ton reste posé et légèrement pince-sans-rire, mais ici l'information et la structure passent d'abord.",
  "Tu termines par une ligne courte du type \"Si vous voulez, je peux ...\" seulement si une suite utile existe.",
].join(" ");

const SYSTEM_R = [
  "Tu es JARVIS, l'assistant personnel d'Antoine, en mode REVISIONS pour le college.",
  "Tu l'appelles \"Monsieur\" et tu restes bref : une a deux phrases, sauf quand il demande une explication.",
  "Quand tu l'interroges, tu poses UNE seule question a la fois, sans donner la reponse, puis tu attends.",
  "Quand il repond : tu dis d'abord si c'est juste ou faux, puis tu corriges en une phrase, puis tu poses la question suivante.",
  "S'il se trompe deux fois, tu donnes la bonne reponse et tu expliques en deux phrases.",
  "Tu adaptes la difficulte au niveau college et tu ne melanges pas les matieres.",
  "Tu ne recites pas un cours entier : tu fais travailler, tu corriges, tu encourages brievement.",
  "A l'oral, evite le Markdown et les listes : des phrases simples, prononcables.",
].join(" ");

const MATIERES_REV = ["maths", "histoire", "hggsp", "ses", "francais", "anglais", "espagnol", "physique", "svt"];

function slugMatiere(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

const VERSION = "v39";

const CHEMINS_PRIVES = [
  "/ask", "/last", "/stt", "/tts", "/sauvegardes", "/propositions",
  "/fil", "/faits", "/souvenirs", "/diag", "/ecole", "/ecole-sync",
  "/tg-envoi", "/tg-chats", "/gemini-lien", "/espace",
];

function lireCookie(request, nom) {
  const brut = request.headers.get("Cookie") || "";
  for (const morceau of brut.split(";")) {
    const parts = morceau.trim().split("=");
    const cle = parts.shift();
    if (cle === nom) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function hexa(octets) {
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function empreinteMotDePasse(motdepasse, sel) {
  const cle = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(sel + ":" + motdepasse), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode("jarvis-acces"), iterations: 100000, hash: "SHA-256" },
    cle, 256,
  );
  return hexa(bits);
}

async function accesPreparer(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS acces (id INTEGER PRIMARY KEY, sel TEXT, empreinte TEXT, cree TEXT)",
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS sessions (jeton TEXT PRIMARY KEY, cree TEXT, expire TEXT)",
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS cles (empreinte TEXT PRIMARY KEY, cree TEXT)",
  ).run();
}

async function accesConfigure(env) {
  const r = await env.DB.prepare("SELECT empreinte FROM acces WHERE id = 1").first();
  return !!(r && r.empreinte);
}

async function sessionValide(request, env) {
  const jeton = lireCookie(request, "jarvis_session");
  if (!jeton || !env.DB) return false;
  try {
    const r = await env.DB.prepare("SELECT expire FROM sessions WHERE jeton = ?").bind(jeton).first();
    if (!r) return false;
    if (r.expire && new Date(r.expire).getTime() < Date.now()) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function cleAppareilValide(donne, env) {
  if (!donne) return false;
  try {
    const h = hexa(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(donne)));
    const r = await env.DB.prepare("SELECT empreinte FROM cles WHERE empreinte = ?").bind(h).first();
    return !!r;
  } catch (e) {
    return false;
  }
}

async function jetonMachineValide(request, url, env) {
  // toutes les cles que Monsieur peut avoir posees dans son .env
  const connues = [env.SYNC_KEY, env.ECOLODIRECTE_MDP, env.APP_TOKEN]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const donne = request.headers.get("X-Token") || url.searchParams.get("k")
    || url.searchParams.get("t") || "";
  if (donne && connues.includes(donne)) return true;
  return await cleAppareilValide(donne, env);
}

async function creerSession(env) {
  const jeton = hexa(crypto.getRandomValues(new Uint8Array(24)));
  const maintenant = new Date();
  const expire = new Date(maintenant.getTime() + 1000 * 3600 * 24 * 30).toISOString();
  await env.DB.prepare("INSERT INTO sessions (jeton, cree, expire) VALUES (?, ?, ?)")
    .bind(jeton, maintenant.toISOString(), expire).run();
  return jeton;
}


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Token",
};

function b64octets(o) {
  let s = "";
  for (let i = 0; i < o.length; i += 32768) s += String.fromCharCode.apply(null, o.subarray(i, i + 32768));
  return btoa(s);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function erreurDouce(e) {
  const m = String((e && e.message) || e || "");
  if (/too many subrequests|subrequest/i.test(m)) {
    return "Trop de recherches en une seule fois, Monsieur. Demandez-moi une seule chose à la fois : je répondrai sans dépasser la limite.";
  }
  return m;
}

function quand() {
  const d = new Date();
  const paris = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
  return "Nous sommes le " + paris + " (heure de Paris). ";
}

let cacheGoogle = { tok: "", exp: 0 };

async function jetonGoogle(env) {
  if (cacheGoogle.tok && Date.now() < cacheGoogle.exp) return cacheGoogle.tok;
  if (!env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (d.access_token) cacheGoogle = { tok: d.access_token, exp: Date.now() + 45 * 60000 };
  return d.access_token || null;
}

const TEMPS = {
  0: "ciel clair", 1: "plutot clair", 2: "nuages epars", 3: "couvert",
  45: "brouillard", 48: "brouillard givrant",
  51: "bruine faible", 53: "bruine", 55: "bruine forte",
  61: "pluie faible", 63: "pluie", 65: "pluie forte",
  66: "pluie verglacante", 67: "pluie verglacante forte",
  71: "neige faible", 73: "neige", 75: "neige forte", 77: "grains de neige",
  80: "averses faibles", 81: "averses", 82: "averses violentes",
  85: "averses de neige", 86: "averses de neige fortes",
  95: "orage", 96: "orage avec grele", 99: "orage violent",
};

// ---------------------------------------------------------------- windguru
const VENT_SPOT = { id: 573, nom: "Lancieux", lat: 48.6056, lon: -2.1867 };
const VENT_SECTEURS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const VENT_JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
let ventCache = { quand: 0, texte: "" };

function secteurVent(deg) {
  const d = Number(deg);
  if (!isFinite(d)) return "?";
  return VENT_SECTEURS[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
}

// la page Windguru pose un objet JSON dans un script : on l'isole aux accolades
function blocJson(texte, position) {
  const debut = texte.indexOf("{", position);
  if (debut < 0) return null;
  let profondeur = 0;
  let guillemet = false;
  let echappe = false;
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];
    if (guillemet) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') guillemet = false;
      continue;
    }
    if (c === '"') { guillemet = true; continue; }
    if (c === "{") profondeur++;
    else if (c === "}") {
      profondeur--;
      if (!profondeur) return texte.slice(debut, i + 1);
    }
  }
  return null;
}

async function ventWindguru(jours) {
  const nbj = Math.max(1, Math.min(3, parseInt(jours, 10) || 3));
  if (ventCache.texte && Date.now() - ventCache.quand < 20 * 60 * 1000) {
    return ventCache.texte;
  }
  const r = await fetch("https://old.windguru.cz/int/index.php?sc=" + VENT_SPOT.id, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JARVIS-perso",
      "Accept-Language": "fr",
    },
  });
  if (!r.ok) return "Windguru ne repond pas (" + r.status + "), Monsieur. Reessaie dans un moment.";
  const html = await r.text();
  const pos = html.indexOf("wg_fcst_tab_data_");
  const bloc = pos < 0 ? null : blocJson(html, pos);
  if (!bloc) return "Windguru a change sa page : je ne trouve plus les previsions.";
  let donnees;
  try {
    donnees = JSON.parse(bloc);
  } catch (e) {
    return "Previsions Windguru illisibles.";
  }
  const modeles = donnees.fcst || {};
  const cle = Object.keys(modeles).find(
    (k) => modeles[k] && modeles[k].WINDSPD && modeles[k].hr_h && modeles[k].hr_d,
  );
  if (!cle) return "Aucun modele de vent disponible sur Windguru pour Lancieux.";
  const m = modeles[cle];
  const decalage = (Number(donnees.utc_offset) || 0) * 3600 * 1000;
  const init = String(m.initdate || "");
  let annee = parseInt(init.slice(0, 4), 10) || new Date().getUTCFullYear();
  let mois = parseInt(init.slice(5, 7), 10) || (new Date().getUTCMonth() + 1);
  const depuis = Date.now() - 3600 * 1000;
  const parJour = [];
  let courant = null;
  let jourPrecedent = null;
  let premier = -1;
  const temperatures = [];
  const nombre = Math.min(m.WINDSPD.length, m.hr_d.length, m.hr_h.length);
  for (let i = 0; i < nombre; i++) {
    const d = Number(m.hr_d[i]);
    const h = Number(m.hr_h[i]);
    if (!isFinite(d) || !isFinite(h)) continue;
    if (jourPrecedent !== null && d < jourPrecedent) {
      mois++;
      if (mois > 12) { mois = 1; annee++; }
    }
    jourPrecedent = d;
    const stamp = Date.UTC(annee, mois - 1, d, h) - decalage;
    if (stamp < depuis) continue;
    if (premier < 0) premier = i;
    if (m.TMP && isFinite(Number(m.TMP[i]))) temperatures.push(Number(m.TMP[i]));
    const label = (VENT_JOURS[Number(m.hr_weekday ? m.hr_weekday[i] : 0) || 0] || "?")
      + " " + d + "/" + String(mois).padStart(2, "0");
    if (!courant || courant.label !== label) {
      courant = { label, creneaux: [], max: 0, heureMax: h };
      parJour.push(courant);
    }
    const moyen = Math.round(Number(m.WINDSPD[i]));
    const rafale = isFinite(Number(m.GUST ? m.GUST[i] : NaN)) ? Math.round(Number(m.GUST[i])) : moyen;
    courant.creneaux.push(String(h).padStart(2, "0") + "h " + moyen + "/" + rafale + " " + secteurVent(m.WINDDIR ? m.WINDDIR[i] : NaN));
    if (moyen > courant.max) { courant.max = moyen; courant.heureMax = h; }
  }
  if (!parJour.length) return "Pas de prevision de vent pour les prochaines heures.";
  const maj = String(m.update_last || "");
  const lignes = [];
  lignes.push("Vent a Lancieux — Windguru, " + (m.model_name || "GFS")
    + ", mis a jour le " + maj.slice(8, 10) + "/" + maj.slice(5, 7)
    + " a " + maj.slice(11, 16) + " (heure locale).");
  lignes.push("Format : heure, vent moyen/rafales en noeuds, direction.");
  for (const j of parJour.slice(0, nbj)) {
    lignes.push(j.label + " : " + j.creneaux.join(" · "));
  }
  const infos = [];
  if (premier >= 0) {
    if (m.HTSGW && isFinite(Number(m.HTSGW[premier]))) {
      let houle = "Houle " + Number(m.HTSGW[premier]).toFixed(1) + " m";
      if (m.PERPW && isFinite(Number(m.PERPW[premier]))) houle += " / " + Math.round(Number(m.PERPW[premier])) + " s";
      infos.push(houle);
    }
    if (donnees.sst && isFinite(Number(donnees.sst))) infos.push("eau " + Math.round(Number(donnees.sst)) + " °C");
    if (temperatures.length) {
      infos.push("air " + Math.round(Math.min(...temperatures)) + " a " + Math.round(Math.max(...temperatures)) + " °C");
    }
  }
  if (infos.length) lignes.push(infos.join(", ") + ".");
  const forts = parJour.slice(0, nbj).filter((j) => j.max >= 12);
  if (forts.length) {
    const meilleur = forts.reduce((a, b) => (b.max > a.max ? b : a));
    lignes.push("Le plus venté : " + meilleur.label + " vers " + String(meilleur.heureMax).padStart(2, "0") + "h, " + meilleur.max + " noeuds etablis.");
  } else {
    lignes.push("Vent faible sur la periode : rien de bien navigable.");
  }
  const texte = lignes.join("\n");
  ventCache = { quand: Date.now(), texte };
  return texte;
}

async function meteo(ville) {
  const g = await fetch(
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&format=json&name="
    + encodeURIComponent(ville),
  );
  const gd = await g.json();
  const lieu = (gd.results || [])[0];
  if (!lieu) return "ville introuvable : " + ville;
  const u = "https://api.open-meteo.com/v1/forecast?latitude=" + lieu.latitude
    + "&longitude=" + lieu.longitude
    + "&current=temperature_2m,apparent_temperature,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    + "&timezone=Europe%2FParis&forecast_days=3";
  const r = await fetch(u);
  const d = await r.json();
  if (!r.ok) return "meteo indisponible (" + r.status + ")";
  const actuel = d.current || {};
  const jour = d.daily || {};
  const lignes = [];
  lignes.push("Maintenant a " + (lieu.name || ville) + " : " + Math.round(actuel.temperature_2m)
    + " degres (ressenti " + Math.round(actuel.apparent_temperature) + "), "
    + (TEMPS[actuel.weather_code] || "temps incertain") + ".");
  for (let i = 0; i < (jour.time || []).length; i++) {
    const nom = i === 0 ? "aujourd'hui" : (i === 1 ? "demain" : "apres-demain");
    lignes.push(nom + " : " + (TEMPS[jour.weather_code[i]] || "temps incertain")
      + ", " + Math.round(jour.temperature_2m_min[i]) + " a " + Math.round(jour.temperature_2m_max[i])
      + " degres, pluie " + (jour.precipitation_probability_max[i] == null ? "?" : jour.precipitation_probability_max[i]) + "%");
  }
  return lignes.join("\n");
}

let cacheGoogle2 = { tok: "", exp: 0 };

async function jetonGoogle2(env) {
  if (cacheGoogle2.tok && Date.now() < cacheGoogle2.exp) return cacheGoogle2.tok;
  if (!env.GOOGLE2_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE2_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (d.access_token) cacheGoogle2 = { tok: d.access_token, exp: Date.now() + 45 * 60000 };
  return d.access_token || null;
}

const ECOLE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function ecoleLogin(env) {
  if (!env.ECOLODIRECTE_ID || !env.ECOLODIRECTE_MDP) return null;
  // ecoledirecte ne repond pas aux hebergeurs : on ne laisse jamais pendre la requete
  const r = await fetch("https://api.ecoledirecte.com/v3/login.awp?verbe=POST&v=4.101.4", {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": ECOLE_UA,
      "Accept": "application/json",
      "Origin": "https://www.ecoledirecte.com",
      "Referer": "https://www.ecoledirecte.com/",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
    body: "data=" + encodeURIComponent(JSON.stringify({
      identifiant: env.ECOLODIRECTE_ID,
      motdepasse: env.ECOLODIRECTE_MDP,
    })),
  });
  const d = await r.json().catch(() => ({}));
  if (d.code !== 200) return { erreur: "connexion ecole : " + (d.message || ("code " + d.code)) };
  const a = ((d.data && d.data.accounts) || [])[0] || {};
  if (!a.token) return { erreur: "jeton ecole absent (compte non reconnu)" };
  return { token: a.token, id: a.id, nom: ((a.prenom || "") + " " + (a.nom || "")).trim() };
}

async function ecoleApi(e, chemin) {
  const r = await fetch("https://api.ecoledirecte.com/v3/" + chemin, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "X-Token": e.token,
      "User-Agent": ECOLE_UA,
      "Accept": "application/json",
      "Origin": "https://www.ecoledirecte.com",
      "Referer": "https://www.ecoledirecte.com/",
    },
  });
  return await r.json().catch(() => ({ code: r.status }));
}

async function classroomCours(tok) {
  const r = await fetch(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=20",
    { headers: { Authorization: "Bearer " + tok } },
  );
  const d = await r.json();
  if (!r.ok) return "classroom indisponible (" + r.status + ") " + JSON.stringify(d).slice(0, 160);
  const cs = d.courses || [];
  if (!cs.length) return "aucun cours actif.";
  return cs.map((c) => "- " + (c.name || "") + (c.section ? " (" + c.section + ")" : "")).join("\n");
}

function dateDevoir(t) {
  const d = t.dueDate || {};
  const h = t.dueTime || {};
  if (!d.year) return null;
  return new Date(d.year, (d.month || 1) - 1, d.day || 1, h.hours || 23, h.minutes || 59);
}

async function classroomDevoirs(tok) {
  const r = await fetch(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=20",
    { headers: { Authorization: "Bearer " + tok } },
  );
  const d = await r.json();
  if (!r.ok) return "classroom indisponible (" + r.status + ")";
  const cs = (d.courses || []).slice(0, 8);
  const lignes = [];
  for (const c of cs) {
    const rt = await fetch(
      "https://classroom.googleapis.com/v1/courses/" + encodeURIComponent(c.id)
        + "/courseWork?pageSize=20&courseWorkStates=PUBLISHED&orderBy=dueDate%20asc",
      { headers: { Authorization: "Bearer " + tok } },
    );
    const dt = await rt.json();
    if (!rt.ok) continue;
    for (const t of dt.courseWork || []) {
      const quandDevoir = dateDevoir(t);
      if (quandDevoir && quandDevoir.getTime() < Date.now() - 86400000) continue;
      lignes.push("- " + t.title + " [" + (c.name || "") + "]"
        + (quandDevoir ? " pour le " + quandDevoir.toLocaleDateString("fr-FR") : " sans date"));
    }
  }
  if (!lignes.length) return "aucun devoir a rendre prochainement.";
  return lignes.slice(0, 15).join("\n");
}

async function classroomAnnonces(tok) {
  const r = await fetch(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=10",
    { headers: { Authorization: "Bearer " + tok } },
  );
  const d = await r.json();
  if (!r.ok) return "classroom indisponible (" + r.status + ")";
  const lignes = [];
  for (const c of (d.courses || []).slice(0, 6)) {
    const ra = await fetch(
      "https://classroom.googleapis.com/v1/courses/" + encodeURIComponent(c.id) + "/announcements?pageSize=3",
      { headers: { Authorization: "Bearer " + tok } },
    );
    const da = await ra.json();
    if (!ra.ok) continue;
    for (const a of da.announcements || []) {
      lignes.push("- " + (c.name || "") + " : " + String(a.text || "").replace(/\s+/g, " ").slice(0, 140));
    }
  }
  if (!lignes.length) return "aucune annonce recente.";
  return lignes.slice(0, 10).join("\n");
}

async function agenda(tok, jours) {
  const t0 = new Date().toISOString();
  const t1 = new Date(Date.now() + (jours || 2) * 86400000).toISOString();
  const u = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    + "?singleEvents=true&orderBy=startTime&maxResults=10"
    + "&timeMin=" + encodeURIComponent(t0) + "&timeMax=" + encodeURIComponent(t1);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + tok } });
  if (!r.ok) return "agenda indisponible (" + r.status + ")";
  const d = await r.json();
  const items = d.items || [];
  if (!items.length) return "aucun evenement prevu.";
  return items.map((e) => {
    const debut = (e.start && (e.start.dateTime || e.start.date)) || "?";
    return "- " + debut + " : " + (e.summary || "(sans titre)");
  }).join("\n");
}

async function mails(tok) {
  const u = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    + "?q=is:unread&maxResults=5";
  const r = await fetch(u, { headers: { Authorization: "Bearer " + tok } });
  if (!r.ok) return "mails indisponibles (" + r.status + ")";
  const d = await r.json();
  const msgs = d.messages || [];
  if (!msgs.length) return "aucun mail non lu.";
  const lignes = [];
  for (const m of msgs) {
    const m2 = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + m.id
      + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject",
      { headers: { Authorization: "Bearer " + tok } },
    );
    if (!m2.ok) continue;
    const j = await m2.json();
    const hs = ((j.payload || {}).headers) || [];
    const val = (n) => {
      const h = hs.find((x) => x.name.toLowerCase() === n.toLowerCase());
      return h ? h.value : "";
    };
    lignes.push("- " + val("From") + " : " + val("Subject"));
  }
  return lignes.length ? lignes.join("\n") : nomsVides();
}

function nomsVides() {
  return "aucun mail non lu.";
}

function genreDrive(mime) {
  const m = String(mime || "");
  if (m.indexOf("folder") >= 0) return "dossier";
  if (m.indexOf("spreadsheetml") >= 0 || m.indexOf("spreadsheet") >= 0) return "tableur";
  if (m.indexOf("presentationml") >= 0 || m.indexOf("presentation") >= 0) return "presentation";
  if (m.indexOf("wordprocessing") >= 0) return "document";
  if (m.indexOf("pdf") >= 0) return "pdf";
  if (m.indexOf("image") >= 0) return "image";
  if (m.indexOf("document") >= 0) return "document";
  return "fichier";
}

const MOTS_VIDES = ["avec", "pour", "dans", "quoi", "quel", "quels", "quelle", "quelles",
  "peux", "avoir", "donne", "trouve", "cherche", "fichier", "fichiers", "document",
  "documents", "dossier", "dossiers", "drive", "google", "monsieur", "aussi", "mon",
  "mes", "les", "des", "une", "que", "qui", "est", "sur", "ton", "ordinateur"];

async function drive(tok, texte) {
  const mots = (String(texte).toLowerCase().match(/[a-z\u00e0-\u00ff0-9]{4,}/g) || [])
    .filter((m) => MOTS_VIDES.indexOf(m) < 0)
    .slice(0, 4);
  let filtre = "trashed = false";
  if (mots.length) {
    filtre += " and (" + mots.map((m) => "name contains '" + m.replace(/'/g, "") + "'").join(" or ") + ")";
  }
  const u = "https://www.googleapis.com/drive/v3/files?pageSize=8"
    + "&orderBy=modifiedTime desc"
    + "&fields=" + encodeURIComponent("files(name,mimeType,modifiedTime,webViewLink)")
    + "&q=" + encodeURIComponent(filtre);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + tok } });
  if (!r.ok) {
    const detail = await r.text();
    return "drive indisponible (" + r.status + ") " + detail.replace(/\s+/g, " ").slice(0, 220);
  }
  const d = await r.json();
  const fs = d.files || [];
  if (!fs.length) return "aucun fichier correspondant.";
  return fs.map((f) => {
    const quand = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("fr-FR") : "";
    return "- " + f.name + " [" + genreDrive(f.mimeType) + "]"
      + (quand ? " modifie le " + quand : "")
      + (f.webViewLink ? " " + f.webViewLink : "");
  }).join("\n");
}

async function ecoleStocker(env, texte) {
  if (!env.DB) throw new Error("base absente");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ecole (id INTEGER PRIMARY KEY, texte TEXT, maj TEXT)",
  ).run();
  await env.DB.prepare(
    "INSERT INTO ecole (id, texte, maj) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET texte = excluded.texte, maj = excluded.maj",
  ).bind(String(texte).slice(0, 8000), new Date().toISOString()).run();
}

async function ecoleLire(env) {
  if (!env.DB) return null;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS ecole (id INTEGER PRIMARY KEY, texte TEXT, maj TEXT)",
    ).run();
    const r = await env.DB.prepare("SELECT texte, maj FROM ecole WHERE id = 1").first();
    return r || null;
  } catch (e) {
    return null;
  }
}

let cacheWeb = { q: "", t: "", exp: 0 };

async function rechercheWeb(question, env, attente) {
  const cle = String(question || "").trim().toLowerCase();
  if (cacheWeb.t && cacheWeb.q === cle && Date.now() < cacheWeb.exp) return cacheWeb.t;
  const modeles = [env.GEMINI_MODEL || "gemini-3.5-flash-lite", "gemini-3.5-flash"];
  let derniere = "";
  for (const modele of modeles) {
    try {
      const corps = {
        contents: [{ role: "user", parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 450 },
      };
      const parts = await appelGeminiModele(env, corps, modele, "web-search", attente);
      const txt = parts.map((p) => p.text || "").join("").trim();
      if (txt) {
        cacheWeb = { q: cle, t: txt, exp: Date.now() + 300000 };
        return txt;
      }
      derniere = "reponse vide";
    } catch (e) {
      derniere = String((e && e.message) || e).slice(0, 160);
    }
  }
  if (/subrequest|too many/i.test(derniere)) {
    const m = "recherche web indisponible (limite atteinte)";
    cacheWeb = { q: cle, t: m, exp: Date.now() + 120000 };
    return m;
  }
  const bouts = [];
  if (/actualit|news|infos?|jour|titre|presse/i.test(String(question || ""))) {
    const titres = await actualites(question);
    if (titres && titres.indexOf("indisponible") < 0 && titres.indexOf("aucune") !== 0) {
      bouts.push("Titres de presse correspondants :\n" + titres);
    }
  }
  if (String(question).split(/\s+/).length <= 5) {
    const w = await wikipedia(question);
    if (w && w.indexOf("aucun article") < 0 && w.indexOf("indisponible") < 0) bouts.push(w);
  }
  if (bouts.length) {
    const r = bouts.join("\n\n");
    cacheWeb = { q: cle, t: r, exp: Date.now() + 300000 };
    return r;
  }
  const echec = "recherche web indisponible (" + derniere + ")";
  cacheWeb = { q: cle, t: echec, exp: Date.now() + 120000 };
  return echec;
}

async function wikipedia(sujet) {
  const s = String(sujet || "").trim();
  if (!s) return "sujet vide";
  const entetes = { "User-Agent": "JarvisPoche/1.0" };
  let titre = s;
  let r = await fetch("https://fr.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(titre), { headers: entetes });
  if (!r.ok) {
    const sr = await fetch("https://fr.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=" + encodeURIComponent(s), { headers: entetes });
    const sd = await sr.json().catch(() => ({}));
    const hit = ((sd.query || {}).search || [])[0];
    if (!hit) return "aucun article trouve pour " + s;
    titre = hit.title;
    r = await fetch("https://fr.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(titre), { headers: entetes });
  }
  if (!r.ok) return "wikipedia indisponible (" + r.status + ")";
  const d = await r.json();
  const extrait = String(d.extract || "").slice(0, 700);
  return (d.title || titre) + " : " + (extrait || "pas de resume.");
}

async function fluxLire(u) {
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!r.ok) return null;
  const xml = await r.text();
  if (xml.length < 200) return null;
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 8);
  const lignes = items.map((m) => {
    const t = (m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
    const propre = t
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
    return "- " + propre;
  }).filter((l) => l.length > 3);
  return lignes.length ? lignes : null;
}

async function actualites(sujet) {
  const q = String(sujet || "").trim();
  const urls = [
    "https://www.francetvinfo.fr/titres.rss",
    "https://www.20minutes.fr/feeds/rss-une.xml",
    "https://www.lefigaro.fr/rss/figaro_actualites.xml",
  ];
  const vus = {};
  const total = [];
  for (const u of urls) {
    try {
      const lignes = await fluxLire(u);
      if (!lignes) continue;
      for (const l of lignes) {
        if (vus[l]) continue;
        vus[l] = 1;
        total.push(l);
      }
    } catch (e) { /* flux suivant */ }
  }
  if (!total.length) return "actualites indisponibles.";
  const mots = q.toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length > 3
    && ["aujourd", "hui", "jour", "actualite", "actualites", "news", "titre", "titres", "moi", "donne", "quel", "quels", "sport"].indexOf(m) < 0);
  if (!mots.length) return total.slice(0, 10).join("\n");
  const pertinents = total.filter((l) => {
    const bas = l.toLowerCase();
    return mots.some((m) => bas.indexOf(m) >= 0);
  });
  const choix = (pertinents.length ? pertinents : total).slice(0, 8);
  return choix.join("\n");
}

async function vacances(quoi) {
  const today = new Date().toISOString().slice(0, 10);
  if (quoi === "feries") {
    const an = new Date().getFullYear();
    const r = await fetch("https://calendrier.api.gouv.fr/jours-feries/metropole/" + an + ".json");
    if (!r.ok) return "jours feries indisponibles";
    const d = await r.json();
    const prochains = Object.keys(d).filter((k) => k >= today).slice(0, 6)
      .map((k) => "- " + k + " : " + d[k]);
    return prochains.join("\n") || "aucun jour ferie a venir.";
  }
  const base = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
  const u = base + "?limit=100&order_by=start_date%20asc&where="
    + encodeURIComponent("start_date >= date'" + today + "'");
  const r = await fetch(u);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return "vacances scolaires indisponibles (" + r.status + ")";
  const vus = {};
  const res = [];
  for (const x of d.results || []) {
    const zone = String(x.zones || "");
    if (["Zone A", "Zone B", "Zone C"].indexOf(zone) < 0) continue;
    const cle = zone + "|" + String(x.description || "");
    if (vus[cle]) continue;
    vus[cle] = 1;
    res.push(x);
    if (res.length >= 6) break;
  }
  if (!res.length) return "vacances scolaires indisponibles.";
  return res.map((x) => "- " + String(x.description || "vacances").replace("Début des ", "")
    + " " + (x.zones || "") + " : du " + String(x.start_date || "").slice(0, 10)
    + " au " + String(x.end_date || "").slice(0, 10)).join("\n");
}

async function change(montant, de, vers) {
  const a = String(de || "EUR").toUpperCase();
  const b = String(vers || "USD").toUpperCase();
  const r = await fetch("https://api.frankfurter.dev/v1/latest?from=" + a + "&to=" + b);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.rates || !d.rates[b]) return "taux indisponible pour " + a + " vers " + b;
  const m = Number(montant) || 1;
  return m + " " + a + " = " + (m * d.rates[b]).toFixed(2) + " " + b + " (taux du " + d.date + ")";
}

async function faitsLire(env, limite) {
  if (!env.DB) return [];
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS faits (id INTEGER PRIMARY KEY AUTOINCREMENT, texte TEXT, cree TEXT)").run();
    const r = await env.DB.prepare("SELECT texte FROM faits ORDER BY id DESC LIMIT ?")
      .bind(limite || 40).all();
    return (r.results || []).map((x) => x.texte);
  } catch (e) {
    return [];
  }
}

async function faitAjouter(env, texte) {
  if (!env.DB) throw new Error("base absente");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS faits (id INTEGER PRIMARY KEY AUTOINCREMENT, texte TEXT, cree TEXT)").run();
  await env.DB.prepare("INSERT INTO faits (texte, cree) VALUES (?, ?)")
    .bind(String(texte).slice(0, 500), new Date().toISOString()).run();
}

async function souvenirsLire(env) {
  if (!env.DB) return "";
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS souvenirs (id INTEGER PRIMARY KEY, texte TEXT, maj TEXT)").run();
    const r = await env.DB.prepare("SELECT texte, maj FROM souvenirs WHERE id = 1").first();
    if (!r || !r.texte) return "";
    return "Memoire de l'ordinateur (souvenirs partages) :\n" + String(r.texte).slice(-12000);
  } catch (e) {
    return "";
  }
}

async function souvenirsEcrire(env, texte) {
  if (!env.DB) return false;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS souvenirs (id INTEGER PRIMARY KEY, texte TEXT, maj TEXT)").run();
  await env.DB.prepare(
    "INSERT INTO souvenirs (id, texte, maj) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET texte = excluded.texte, maj = excluded.maj",
  ).bind(String(texte).slice(0, 20000), new Date().toISOString()).run();
  return true;
}

const CANAL_NOM = { pc: "son ordinateur", telephone: "son telephone", telegram: "Telegram" };

async function propositionsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS propositions (id INTEGER PRIMARY KEY AUTOINCREMENT, demande TEXT, resume TEXT, statut TEXT, cible TEXT DEFAULT 'pc', cree TEXT, maj TEXT)",
  ).run();
  try {
    await env.DB.prepare("ALTER TABLE propositions ADD COLUMN cible TEXT DEFAULT 'pc'").run();
  } catch (e) { /* deja presente */ }
}

async function filTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS fil (id INTEGER PRIMARY KEY AUTOINCREMENT, canal TEXT, role TEXT, texte TEXT, cree TEXT)",
  ).run();
}

async function filLire(env, limite, canal) {
  if (!env.DB) return [];
  try {
    await filTable(env);
    if (!canal) {
      const vide = await env.DB.prepare("SELECT 1 AS x FROM fil LIMIT 1").first();
      if (!vide) {
        try {
          await env.DB.prepare(
            "INSERT INTO fil (canal, role, texte, cree) SELECT 'telephone', role, texte, cree FROM (SELECT id, role, texte, cree FROM histo ORDER BY id DESC LIMIT 40) ORDER BY id ASC",
          ).run();
        } catch (e) { /* pas encore d'historique */ }
      }
    }
    const l = Math.min(Math.max(Number(limite) || 24, 1), 120);
    // Les anciens enregistrements coupaient le canal a 16 caracteres
    // (revisions:histoire -> revisions:histoi) : on lit les deux formes.
    const canalCourt = String(canal || "").slice(0, 16);
    const r = canal
      ? await env.DB.prepare(
        "SELECT canal, role, texte, cree FROM fil WHERE canal = ? OR canal = ? ORDER BY id DESC LIMIT ?",
      ).bind(canal, canalCourt, l).all()
      : await env.DB.prepare(
        "SELECT canal, role, texte, cree FROM fil ORDER BY id DESC LIMIT ?",
      ).bind(l).all();
    return (r.results || []).reverse();
  } catch (e) {
    return [];
  }
}

async function filEcrire(env, canal, role, texte) {
  if (!env.DB) return 0;
  const t = String(texte == null ? "" : texte).trim();
  if (!t) return 0;
  try {
    await filTable(env);
    await env.DB.prepare("INSERT INTO fil (canal, role, texte, cree) VALUES (?, ?, ?, ?)")
      .bind(String(canal || "autre").slice(0, 40), role === "assistant" ? "assistant" : "user",
        t.slice(0, 1500), new Date().toISOString()).run();
    await env.DB.prepare("DELETE FROM fil WHERE id NOT IN (SELECT id FROM fil ORDER BY id DESC LIMIT 400)").run();
    return 1;
  } catch (e) {
    return 0;
  }
}

function heureFil(iso) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch (e) {
    return "";
  }
}

function filTexte(msgs) {
  if (!msgs || !msgs.length) return "";
  const lignes = msgs.map((m) => {
    const canal = CANAL_NOM[m.canal] || m.canal || "autre appareil";
    const qui = m.role === "assistant" ? "JARVIS" : "Monsieur";
    return "[" + canal + " · " + heureFil(m.cree) + "] " + qui + " : "
      + String(m.texte || "").replace(/\s+/g, " ").slice(0, 280);
  });
  return "Fil unique JARVIS (derniers echanges sur ses autres appareils, du plus ancien au plus recent) :\n"
    + lignes.join("\n");
}

async function contexte(texte, env) {
  const bas = texte.toLowerCase();
  const bouts = [];

  const faits = await faitsLire(env, 40);
  if (faits.length) bouts.push("Faits retenus sur Monsieur :\n- " + faits.join("\n- "));

  if (/actualit|\bnews\b|infos? du jour|\btitres\b|quoi de neuf|la une|derniere heure/i.test(String(texte || ""))) {
    try {
      const titres = await actualites("");
      if (titres && titres.indexOf("indisponible") < 0) {
        bouts.push("Titres de presse francaise du jour (reels et a jour, cite-en deux ou trois) :\n" + titres);
      }
    } catch (e) { /* flux indisponible */ }
  }

  const souv = await souvenirsLire(env);
  if (souv) bouts.push(souv);

  const veutEcole = /(devoir|cahier|ecole|college|lycee|controle|interro|rendre|prof|matiere|notes?|moyenne)/.test(bas);
  if (veutEcole) {
    const e = await ecoleLire(env);
    if (e && e.texte) {
      const quandMaj = new Date(e.maj).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
      const age = (Date.now() - new Date(e.maj).getTime()) / 3600000;
      bouts.push("EcoleDirecte (releve fait par le PC de Monsieur le " + quandMaj
        + (age > 36 ? ", un peu ancien : le PC n'a pas synchronise depuis plus d'un jour" : "")
        + ") :\n" + e.texte);
    } else {
      bouts.push("Aucun releve EcoleDirecte en memoire : le PC n'a pas encore synchronise (ecole_pc.py).");
    }
  }

  const veutAgenda = /(agenda|rendez-vous|calendrier|planning|mon programme|aujourd'hui|demain|cette semaine|qu'est-ce que j'ai)/.test(bas);
  const veutMails = /(mail|gmail|courriel|message|boite)/.test(bas);
  const veutDrive = /(fichier|document|dossier|drive|pdf|photo|image|facture|note|cv|contrat)/.test(bas);
  if (veutAgenda || veutMails || veutDrive) {
    const tok = await jetonGoogle(env);
    if (tok) {
      const [a, m, f] = await Promise.all([
        veutAgenda ? agenda(tok, 3).catch(() => "") : "",
        veutMails ? mails(tok).catch(() => "") : "",
        veutDrive ? drive(tok, texte).catch(() => "") : "",
      ]);
      if (a) bouts.push("Agenda (prochains jours) :\n" + a);
      if (m) bouts.push("Mails non lus :\n" + m);
      if (f) bouts.push("Fichiers Google Drive :\n" + f);
    }
  }

  return bouts.join("\n\n");
}

async function memoireLire(env, limite) {
  if (!env.DB) return [];
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS histo (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, texte TEXT, cree TEXT)",
    ).run();
    const r = await env.DB.prepare(
      "SELECT role, texte FROM histo ORDER BY id DESC LIMIT ?",
    ).bind(limite || 12).all();
    return (r.results || []).reverse();
  } catch (e) {
    return [];
  }
}

async function memoireEcrire(env, role, texte) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO histo (role, texte, cree) VALUES (?, ?, ?)",
    ).bind(role, String(texte).slice(0, 2000), new Date().toISOString()).run();
    await env.DB.prepare(
      "DELETE FROM histo WHERE id NOT IN (SELECT id FROM histo ORDER BY id DESC LIMIT 60)",
    ).run();
  } catch (e) {
    /* on continue sans memoire */
  }
}

const OUTILS = [{
  functionDeclarations: [...ESPACE_OUTILS, {
      name: "proposer_modification",
      description: "Enregistre une proposition de modification du propre code de JARVIS, a valider par Monsieur dans le panneau. A utiliser des que Monsieur demande d'ameliorer, corriger ou changer le code de JARVIS.",
      parameters: {
        type: "OBJECT",
        properties: {
          demande: { type: "STRING", description: "La modification demandee, formulee clairement et completement" },
        },
        required: ["demande"],
      },
    },
    {
      name: "creer_evenement",
      description: "Cree un rendez-vous dans l'agenda Google.",
      parameters: {
        type: "OBJECT",
        properties: {
          titre: { type: "STRING" },
          debut: { type: "STRING", description: "Date et heure ISO 8601 avec decalage, ex 2026-11-25T15:00:00+01:00" },
          duree_minutes: { type: "NUMBER" },
          lieu: { type: "STRING" },
          notes: { type: "STRING" },
        },
        required: ["titre", "debut"],
      },
    },
    {
      name: "annuler_evenement",
      description: "Annule un rendez-vous de l'agenda en le retrouvant par son titre.",
      parameters: {
        type: "OBJECT",
        properties: {
          titre: { type: "STRING" },
          jours_autour: { type: "NUMBER", description: "Nombre de jours avant et apres aujourd'hui (defaut 30)" },
        },
        required: ["titre"],
      },
    },
    {
      name: "recherche_web",
      description: "Cherche sur internet une information actuelle (actualite, horaire, resultat, prix, fait recent).",
      parameters: { type: "OBJECT", properties: { question: { type: "STRING" } }, required: ["question"] },
    },
    {
      name: "wikipedia",
      description: "Donne le resume d'un article Wikipedia en francais.",
      parameters: { type: "OBJECT", properties: { sujet: { type: "STRING" } }, required: ["sujet"] },
    },
    {
      name: "actualites",
      description: "Donne les dernieres actualites, globalement ou sur un sujet.",
      parameters: { type: "OBJECT", properties: { sujet: { type: "STRING" } } },
    },
    {
      name: "vacances",
      description: "Donne les prochaines vacances scolaires ou les prochains jours feries.",
      parameters: {
        type: "OBJECT",
        properties: { quoi: { type: "STRING", enum: ["vacances", "feries"] } },
        required: ["quoi"],
      },
    },
    {
      name: "change",
      description: "Convertit une somme d'une monnaie a une autre avec le taux du jour.",
      parameters: {
        type: "OBJECT",
        properties: {
          montant: { type: "NUMBER" },
          de: { type: "STRING", description: "code devise, ex EUR" },
          vers: { type: "STRING", description: "code devise, ex USD" },
        },
        required: ["montant", "de", "vers"],
      },
    },
    {
      name: "retenir",
      description: "Enregistre un fait durable sur Monsieur (mot secret, preference, information personnelle). A utiliser des qu'il dit retiens, note, souviens-toi, memorise.",
      parameters: {
        type: "OBJECT",
        properties: { fait: { type: "STRING" } },
        required: ["fait"],
      },
    },
    {
      name: "telegram",
      description: "Envoie un message Telegram a Monsieur. A utiliser quand il demande d'ecrire, prevenir ou envoyer quelque chose sur Telegram.",
      parameters: {
        type: "OBJECT",
        properties: { texte: { type: "STRING" } },
        required: ["texte"],
      },
    },
    {
      name: "vent_lancieux",
      description: "Previsions de vent Windguru pour le spot de Lancieux (Cotes-d'Armor) : vent moyen et rafales en noeuds, direction, houle, sur 3 jours par tranches de 3 h. A utiliser des que Monsieur parle du vent ou d'une session de kite, windsurf ou voile la-bas.",
      parameters: {
        type: "OBJECT",
        properties: {
          jours: { type: "NUMBER", description: "Nombre de jours a afficher, 1 a 3 (defaut 3)" },
        },
      },
    },
    {
      name: "meteo",
      description: "Donne la meteo du jour et des deux jours suivants pour une ville.",
      parameters: {
        type: "OBJECT",
        properties: { ville: { type: "STRING" } },
        required: ["ville"],
      },
    },
    {
      name: "classroom",
      description: "Consulte Google Classroom du compte ecole : cours suivis, devoirs a rendre, annonces.",
      parameters: {
        type: "OBJECT",
        properties: { quoi: { type: "STRING", enum: ["cours", "devoirs", "annonces"] } },
        required: ["quoi"],
      },
    },
    {
      name: "lister_taches",
      description: "Liste les taches Google Tasks encore a faire.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "creer_tache",
      description: "Cree une tache dans Google Tasks.",
      parameters: {
        type: "OBJECT",
        properties: {
          titre: { type: "STRING" },
          echeance: { type: "STRING", description: "Date ISO 8601, optionnelle" },
        },
        required: ["titre"],
      },
    },
    {
      name: "chercher_contact",
      description: "Cherche un contact Google (telephone, email).",
      parameters: { type: "OBJECT", properties: { nom: { type: "STRING" } }, required: ["nom"] },
    },
    {
      name: "envoyer_mail",
      description: "Envoie un mail depuis son Gmail. Seulement si on demande explicitement d'envoyer.",
      parameters: {
        type: "OBJECT",
        properties: { a: { type: "STRING" }, sujet: { type: "STRING" }, corps: { type: "STRING" } },
        required: ["a", "sujet", "corps"],
      },
    },
    {
      name: "creer_dossier_drive",
      description: "Cree un dossier dans Google Drive.",
      parameters: { type: "OBJECT", properties: { nom: { type: "STRING" } }, required: ["nom"] },
    },
    {
      name: "ecrire_note_drive",
      description: "Enregistre un fichier texte dans Google Drive.",
      parameters: {
        type: "OBJECT",
        properties: { nom: { type: "STRING" }, contenu: { type: "STRING" } },
        required: ["nom", "contenu"],
      },
    },
  ],
}];

function b64url(texte) {
  const octets = new TextEncoder().encode(texte);
  let bin = "";
  for (let i = 0; i < octets.length; i++) bin += String.fromCharCode(octets[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function creerEvenement(tok, a) {
  const debut = new Date(a.debut);
  if (isNaN(debut.getTime())) return "date invalide, rien n'a ete cree";
  const fin = new Date(debut.getTime() + (Number(a.duree_minutes) || 60) * 60000);
  const corps = {
    summary: a.titre || "Rendez-vous",
    location: a.lieu || undefined,
    description: a.notes || undefined,
    start: { dateTime: debut.toISOString(), timeZone: "Europe/Paris" },
    end: { dateTime: fin.toISOString(), timeZone: "Europe/Paris" },
  };
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const d = await r.json();
  if (!r.ok) return "echec agenda (" + r.status + ") " + JSON.stringify(d).slice(0, 160);
  const quandTexte = new Date(d.start.dateTime).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  return "rendez-vous cree : " + d.summary + " le " + quandTexte;
}

async function annulerEvenement(tok, a) {
  const jours = Number(a.jours_autour) || 30;
  const t0 = new Date(Date.now() - jours * 86400000).toISOString();
  const t1 = new Date(Date.now() + jours * 86400000).toISOString();
  const u = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    + "?singleEvents=true&orderBy=startTime&maxResults=250"
    + "&timeMin=" + encodeURIComponent(t0) + "&timeMax=" + encodeURIComponent(t1);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + tok } });
  const d = await r.json();
  if (!r.ok) return "agenda indisponible (" + r.status + ")";
  const cible = String(a.titre || "").toLowerCase();
  const trouve = (d.items || []).find((e) => String(e.summary || "").toLowerCase().indexOf(cible) >= 0);
  if (!trouve) return "aucun rendez-vous trouve pour \"" + a.titre + "\"";
  const dr = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(trouve.id),
    { method: "DELETE", headers: { Authorization: "Bearer " + tok } },
  );
  if (!dr.ok && dr.status !== 204) return "echec annulation (" + dr.status + ")";
  return "rendez-vous annule : " + trouve.summary;
}

async function listerTaches(tok) {
  const r = await fetch(
    "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=20",
    { headers: { Authorization: "Bearer " + tok } },
  );
  const d = await r.json();
  if (!r.ok) return "taches indisponibles (" + r.status + ") " + JSON.stringify(d).slice(0, 140);
  const items = d.items || [];
  if (!items.length) return "aucune tache en cours.";
  return items.map((t) => "- " + t.title).join("\n");
}

async function creerTache(tok, a) {
  const corps = { title: a.titre || "Tache" };
  if (a.echeance) corps.due = new Date(a.echeance).toISOString();
  const r = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const d = await r.json();
  if (!r.ok) return "echec tache (" + r.status + ") " + JSON.stringify(d).slice(0, 160);
  return "tache creee : " + d.title;
}

async function chercherContact(tok, nom) {
  const r = await fetch(
    "https://people.googleapis.com/v1/people/me/connections?pageSize=1000&personFields=names,phoneNumbers,emailAddresses",
    { headers: { Authorization: "Bearer " + tok } },
  );
  const d = await r.json();
  if (!r.ok) return "contacts indisponibles (" + r.status + ") " + JSON.stringify(d).slice(0, 140);
  const cherche = String(nom || "").toLowerCase();
  const trouves = [];
  for (const p of d.connections || []) {
    const noms = (p.names || []).map((n) => n.displayName || "").join(" ");
    if (!noms || noms.toLowerCase().indexOf(cherche) < 0) continue;
    const tel = (p.phoneNumbers || []).map((x) => x.value).join(", ");
    const mail = (p.emailAddresses || []).map((x) => x.value).join(", ");
    trouves.push("- " + noms + (tel ? " tel " + tel : "") + (mail ? " mail " + mail : ""));
    if (trouves.length >= 5) break;
  }
  return trouves.length ? trouves.join("\n") : "aucun contact trouve pour " + nom;
}

async function envoyerMail(tok, a) {
  const sujet = "=?UTF-8?B?" + b64url(a.sujet || "") + "?=";
  const contenu = b64url(String(a.corps || ""));
  const brut = [
    "To: " + a.a,
    "Subject: " + sujet,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    contenu,
  ].join("\r\n");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(brut) }),
  });
  const d = await r.json();
  if (!r.ok) return "echec envoi (" + r.status + ") " + JSON.stringify(d).slice(0, 160);
  return "mail envoye a " + a.a + " (objet : " + a.sujet + ")";
}

async function creerDossierDrive(tok, nom) {
  const r = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nom, mimeType: "application/vnd.google-apps.folder" }),
  });
  const d = await r.json();
  if (!r.ok) return "echec dossier (" + r.status + ") " + JSON.stringify(d).slice(0, 160);
  return "dossier cree dans Drive : " + d.name;
}

async function ecrireNoteDrive(tok, a) {
  const limite = "----jarvis" + Date.now();
  const meta = JSON.stringify({ name: a.nom || "note.txt", mimeType: "text/plain" });
  const corps = "--" + limite + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
    + meta
    + "\r\n--" + limite + "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
    + String(a.contenu || "")
    + "\r\n--" + limite + "--";
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "multipart/related; boundary=" + limite },
    body: corps,
  });
  const d = await r.json();
  if (!r.ok) return "echec note (" + r.status + ") " + JSON.stringify(d).slice(0, 160);
  return "note enregistree dans Drive : " + d.name;
}

async function envoyerTelegram(env, texte) {
  if (!env.TELEGRAM_TOKEN) return "Telegram non configure.";
  let chat = null;
  if (env.DB) {
    try {
      const l = await env.DB.prepare("SELECT chat FROM tg WHERE id = 1").first();
      chat = l && l.chat;
    } catch (e) { /* rien */ }
  }
  if (!chat) return "Aucune conversation Telegram connue : il faut ecrire au bot une premiere fois.";
  const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_TOKEN + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: String(texte).slice(0, 4000) }),
  });
  const d = await r.json();
  if (!d.ok) return "echec telegram : " + (d.description || r.status);
  return "message Telegram envoye.";
}

async function executerOutil(nom, args, env, attente) {
  const a0 = args || {};
  if (nom.indexOf("espace_") === 0) {
    return await espaceExecuter({ env, jetonGoogle, jetonGoogle2, envoyerTelegram }, nom, a0);
  }
  try {
    if (nom === "recherche_web") return await rechercheWeb(a0.question || "", env, attente);
    if (nom === "wikipedia") return await wikipedia(a0.sujet);
    if (nom === "actualites") return await actualites(a0.sujet);
    if (nom === "vacances") return await vacances(a0.quoi || "vacances");
    if (nom === "change") return await change(a0.montant, a0.de, a0.vers);
    if (nom === "vent_lancieux") return await ventWindguru(a0.jours);
  } catch (e) {
    return "erreur " + nom + " : " + String((e && e.message) || e);
  }
  if (nom === "proposer_modification") {
    try {
      const demande = String((args || {}).demande || "").trim();
      if (!demande) return "demande vide.";
      if (!env.DB) return "pas de base pour enregistrer la proposition.";
      await propositionsTable(env);
      const maintenant = new Date().toISOString();
      const info = await env.DB.prepare(
        "INSERT INTO propositions (demande, resume, statut, cible, cree, maj) VALUES (?, '', 'a_generer', 'web', ?, ?)",
      ).bind(demande.slice(0, 500), maintenant, maintenant).run();
      return "proposition " + (info.meta && info.meta.last_row_id)
        + " enregistree : l'agent de code prepare la modification, puis Monsieur la valide dans le panneau.";
    } catch (e) {
      return "impossible d'enregistrer la proposition : " + String((e && e.message) || e);
    }
  }
  if (nom === "retenir") {
    try {
      await faitAjouter(env, (args || {}).fait || "");
      return "fait enregistre.";
    } catch (e) {
      return "impossible d'enregistrer : " + String((e && e.message) || e);
    }
  }
  if (nom === "telegram") {
    try {
      return await envoyerTelegram(env, (args || {}).texte || "Bonjour Monsieur.");
    } catch (e) {
      return "erreur telegram : " + String((e && e.message) || e);
    }
  }
  if (nom === "meteo") {
    try {
      return await meteo((args || {}).ville || env.VILLE || "Paris");
    } catch (e) {
      return "erreur meteo : " + String((e && e.message) || e);
    }
  }
  if (nom === "classroom") {
    const t2 = await jetonGoogle2(env);
    if (!t2) return "Compte ecole non connecte.";
    const quoi = (args || {}).quoi || "devoirs";
    try {
      if (quoi === "cours") return await classroomCours(t2);
      if (quoi === "annonces") return await classroomAnnonces(t2);
      return await classroomDevoirs(t2);
    } catch (e) {
      return "erreur classroom : " + String((e && e.message) || e);
    }
  }
  const tok = await jetonGoogle(env);
  if (!tok) return "Google indisponible : autorisation manquante.";
  try {
    if (nom === "creer_evenement") return await creerEvenement(tok, args || {});
    if (nom === "annuler_evenement") return await annulerEvenement(tok, args || {});
    if (nom === "lister_taches") return await listerTaches(tok);
    if (nom === "creer_tache") return await creerTache(tok, args || {});
    if (nom === "chercher_contact") return await chercherContact(tok, (args || {}).nom);
    if (nom === "envoyer_mail") return await envoyerMail(tok, args || {});
    if (nom === "creer_dossier_drive") return await creerDossierDrive(tok, (args || {}).nom);
    if (nom === "ecrire_note_drive") return await ecrireNoteDrive(tok, args || {});
    return "outil inconnu : " + nom;
  } catch (e) {
    return "erreur outil " + nom + " : " + String((e && e.message) || e);
  }
}

// Griffin : le client des appels Gemini, dont le fetch est enveloppe avec un cas d'usage par
// fonctionnalite (chat, web-search, transcription, diagnostic), pour voir la depense IA de chacune.
// Sans GRIFFIN_KEY, le SDK rappelle le fetch habituel et rien ne change ; s'il est injoignable,
// l'appel part directement chez Gemini.
function clientGemini(env, useCase, attente) {
  return {
    fetch: griffin({ key: env.GRIFFIN_KEY, useCase, waitUntil: attente }),
  };
}

async function appelGeminiModele(env, corps, modele, useCase, attente) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + modele + ":generateContent?key=" + env.GEMINI_API_KEY;
  const client = clientGemini(env, useCase || "chat", attente);
  const r = await client.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Gemini " + r.status + " " + JSON.stringify(data).slice(0, 200));
  const cand = (data.candidates || [])[0] || {};
  return ((cand.content || {}).parts) || [];
}

async function appelGemini(env, corps, useCase, attente) {
  return appelGeminiModele(env, corps, env.GEMINI_MODEL || "gemini-3.5-flash-lite", useCase, attente);
}

async function discuter(texte, env, ctx, trace, canal, options, attente) {
  const ici = canal || "telephone";
  const o = options || {};
  const estRev = (c) => c === "revisions" || c.indexOf("revisions:") === 0;
  // Lire le canal exact : sinon les messages de conversation peuvent
  // repousser tout l'historique de revision hors des 80 derniers messages.
  const memes = await filLire(env, 12, ici);
  const fil = estRev(ici) ? [] : await filLire(env, 60);
  const autres = estRev(ici) ? [] : fil.filter((m) => {
    const c = m.canal || "telephone";
    return c !== ici && !estRev(c);
  }).slice(-12);
  const contents = memes.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.texte }],
  }));
  const morceaux = [];
  if (ctx) morceaux.push(ctx);
  if (o.archive) morceaux.push(String(o.archive));
  const filAilleurs = filTexte(autres);
  if (filAilleurs) morceaux.push(filAilleurs);
  let demande = texte;
  if (morceaux.length) demande = morceaux.join("\n\n") + "\n\nQuestion : " + texte;
  const partsDemande = [{ text: demande }];
  if (o.image && o.image.data) {
    partsDemande.push({
      inline_data: {
        mime_type: String(o.image.mime || "image/jpeg").split(";")[0],
        data: String(o.image.data).replace(/^data:[^,]+,/, ""),
      },
    });
  }
  contents.push({ role: "user", parts: partsDemande });

  const consigne = (o.riche ? SYSTEM_Q : (o.revisions ? SYSTEM_R + (o.matiere ? " Matiere en cours : " + o.matiere + "." : "") : SYSTEM))
    + (o.archive ? " Les discussions Gemini importées fournies ci-dessous sont réellement accessibles : ne dis jamais que tu n'es pas connecté à Gemini, utilise-les comme ses souvenirs." : "")
    + CONSIGNE_ESPACE;
  let outilsFaits = 0;
  for (let tour = 0; tour < 4; tour++) {
    const corps = {
      systemInstruction: {
        parts: [{ text: consigne + " " + quand() + " Il vous parle en ce moment via " + (CANAL_NOM[ici] || "son telephone") + "." }],
      },
      contents,
      tools: OUTILS,
      generationConfig: o.riche
        ? { temperature: 0.55, maxOutputTokens: 2600 }
        : { temperature: 0.7, maxOutputTokens: 400 },
    };
    const parts = await appelGemini(env, corps, "chat", attente);
    const appels = parts.filter((p) => p.functionCall && p.functionCall.name);
    if (appels.length) {
      contents.push({ role: "model", parts });
      const reponses = [];
      for (const p of appels) {
        const f = p.functionCall;
        if (outilsFaits >= 3) {
          reponses.push({ functionResponse: { name: f.name, response: { resultat: "Limite d'outils atteinte pour cette question. Reponds maintenant avec ce que tu sais deja, sans nouvel appel." } } });
          continue;
        }
        outilsFaits++;
        const resultat = await executerOutil(f.name, f.args || {}, env, attente);
        if (trace) trace.push({ nom: f.name, args: f.args || {}, res: String(resultat).slice(0, 150) });
        reponses.push({ functionResponse: { name: f.name, response: { resultat } } });
      }
      contents.push({ role: "user", parts: reponses });
      continue;
    }
    const rep = parts.map((p) => p.text || "").join("").trim();
    if (rep) return rep;
    throw new Error("Gemini n'a rien renvoye");
  }
  return "Je n'ai pas pu terminer cette action, Monsieur.";
}

// Lecture d'un flux SSE Gemini : on rend le texte au fur et a mesure.
async function geminiFlux(env, corps, useCase, attente, onTexte) {
  const modele = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + modele + ":streamGenerateContent?alt=sse&key=" + env.GEMINI_API_KEY;
  const client = clientGemini(env, useCase || "chat", attente);
  const r = await client.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("Gemini flux " + r.status + " " + t.slice(0, 200));
  }
  const lecteur = r.body.getReader();
  const dec = new TextDecoder();
  let tampon = "";
  let texte = "";
  const appels = [];
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += dec.decode(value, { stream: true });
    const lignes = tampon.split("\n");
    tampon = lignes.pop() || "";
    for (const ligne of lignes) {
      const l = ligne.trim();
      if (!l.startsWith("data:")) continue;
      const brut = l.slice(5).trim();
      if (!brut || brut === "[DONE]") continue;
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) { continue; }
      const cand = (obj.candidates || [])[0] || {};
      const parts = (cand.content || {}).parts || [];
      for (const p of parts) {
        if (p.functionCall && p.functionCall.name) appels.push(p);
        else if (typeof p.text === "string" && p.text) {
          texte += p.text;
          try { onTexte(p.text); } catch (e) { /* client parti */ }
        }
      }
    }
  }
  return { texte: texte.trim(), appels };
}

// Meme dialogue que discuter(), mais le texte part des qu'il est produit.
async function discuterFlux(texte, env, ctx, canal, options, attente, onTexte) {
  const ici = canal || "telephone";
  const o = options || {};
  const estRev = (c) => c === "revisions" || c.indexOf("revisions:") === 0;
  // Lire le canal exact : sinon les messages de conversation peuvent
  // repousser tout l'historique de revision hors des 80 derniers messages.
  const memes = await filLire(env, 12, ici);
  const fil = estRev(ici) ? [] : await filLire(env, 60);
  const autres = estRev(ici) ? [] : fil.filter((m) => {
    const c = m.canal || "telephone";
    return c !== ici && !estRev(c);
  }).slice(-12);
  const contents = memes.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.texte }],
  }));
  const morceaux = [];
  if (ctx) morceaux.push(ctx);
  if (o.archive) morceaux.push(String(o.archive));
  const filAilleurs = filTexte(autres);
  if (filAilleurs) morceaux.push(filAilleurs);
  let demande = texte;
  if (morceaux.length) demande = morceaux.join("\n\n") + "\n\nQuestion : " + texte;
  const partsDemande = [{ text: demande }];
  if (o.image && o.image.data) {
    partsDemande.push({
      inline_data: {
        mime_type: String(o.image.mime || "image/jpeg").split(";")[0],
        data: String(o.image.data).replace(/^data:[^,]+,/, ""),
      },
    });
  }
  contents.push({ role: "user", parts: partsDemande });

  const consigne = (o.riche ? SYSTEM_Q : (o.revisions ? SYSTEM_R + (o.matiere ? " Matiere en cours : " + o.matiere + "." : "") : SYSTEM))
    + (o.archive ? " Les discussions Gemini importées fournies ci-dessous sont réellement accessibles : ne dis jamais que tu n'es pas connecté à Gemini, utilise-les comme ses souvenirs." : "")
    + CONSIGNE_ESPACE;
  let complet = "";
  let outilsFaits = 0;
  for (let tour = 0; tour < 4; tour++) {
    const corps = {
      systemInstruction: {
        parts: [{ text: consigne + " " + quand() + " Il vous parle en ce moment via " + (CANAL_NOM[ici] || "son telephone") + "." }],
      },
      contents,
      tools: OUTILS,
      generationConfig: o.riche
        ? { temperature: 0.55, maxOutputTokens: 2600 }
        : { temperature: 0.7, maxOutputTokens: 400 },
    };
    const avant = complet.length;
    const r = await geminiFlux(env, corps, "chat", attente, (t) => {
      complet += t;
      onTexte(t);
    });
    if (r.appels.length) {
      contents.push({ role: "model", parts: r.appels });
      const reponses = [];
      for (const p of r.appels) {
        const f = p.functionCall;
        if (outilsFaits >= 3) {
          reponses.push({ functionResponse: { name: f.name, response: { resultat: "Limite d'outils atteinte pour cette question. Reponds maintenant avec ce que tu sais deja, sans nouvel appel." } } });
          continue;
        }
        outilsFaits++;
        const resultat = await executerOutil(f.name, f.args || {}, env, attente);
        reponses.push({ functionResponse: { name: f.name, response: { resultat } } });
      }
      contents.push({ role: "user", parts: reponses });
      continue;
    }
    if (complet.trim()) return complet.trim();
    if (complet.length === avant) break;
  }
  return complet.trim() || "Je n'ai pas pu terminer cette action, Monsieur.";
}

async function transcrire(base64, mime, env, attente) {
  const modele = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + modele + ":generateContent?key=" + env.GEMINI_API_KEY;
  const corps = {
    systemInstruction: {
      parts: [{
        text: "Tu es un moteur de transcription. Tu rends uniquement les mots prononces, en francais, sans commentaire ni introduction. Si tu n'entends aucune parole, tu renvoies exactement : (vide)",
      }],
    },
    contents: [{
      role: "user",
      parts: [
        { text: "Transcris cet audio." },
        { inline_data: { mime_type: mime, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 200 },
  };
  const client = clientGemini(env, "transcription", attente);
  const r = await client.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Gemini stt " + r.status + " " + JSON.stringify(data).slice(0, 160));
  const cand = (data.candidates || [])[0] || {};
  const parts = ((cand.content || {}).parts) || [];
  const texte = parts.map((p) => p.text || "").join(" ").trim();
  if (!texte || texte === "(vide)") return "";
  return texte;
}

async function demanderAFish(texte, env) {
  if (!env.FISH_VOICE_ID) throw new Error("FISH_VOICE_ID manquant");
  const r = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.FISH_API_KEY,
      "Content-Type": "application/json",
      model: env.FISH_MODEL || "s2.1-pro-free",
    },
    body: JSON.stringify({
      text: texte,
      reference_id: env.FISH_VOICE_ID,
      format: "mp3",
      latency: "low",
      chunk_length: 150,
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error("Fish " + r.status + " " + detail.slice(0, 200));
  }
  return await r.arrayBuffer();
}

export default {
  async fetch(request, env, execution) {
    const url = new URL(request.url);
    // Griffin : garde l'envoi de l'evenement en vie apres la reponse (Cloudflare Workers).
    const attente = execution && execution.waitUntil ? execution.waitUntil.bind(execution) : undefined;
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/acces") {
      if (!env.DB) return json({ erreur: "pas de base" }, 500);
      try {
        await accesPreparer(env);
        const configure = await accesConfigure(env);
        if (request.method === "GET") {
          return json({ configure, connecte: configure ? await sessionValide(request, env) : false });
        }
        if (request.method === "DELETE") {
          if (!(await sessionValide(request, env))) return json({ erreur: "mot de passe requis" }, 401);
          await env.DB.prepare("DELETE FROM acces").run();
          await env.DB.prepare("DELETE FROM sessions").run();
          await env.DB.prepare("DELETE FROM cles").run();
          return json({ ok: true, configure: false });
        }
        if (request.method !== "POST") return json({ erreur: "methode inconnue" }, 405);
        if (url.searchParams.get("cle") === "1") {
          if (!(await sessionValide(request, env))) return json({ erreur: "mot de passe requis" }, 401);
          const brute = hexa(crypto.getRandomValues(new Uint8Array(24)));
          const h = hexa(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(brute)));
          await env.DB.prepare("INSERT OR REPLACE INTO cles (empreinte, cree) VALUES (?, ?)")
            .bind(h, new Date().toISOString()).run();
          return json({ ok: true, cle: brute });
        }
        const b = await request.json().catch(() => ({}));
        if (b.deconnexion) {
          const jeton = lireCookie(request, "jarvis_session");
          if (jeton) {
            await env.DB.prepare("DELETE FROM sessions WHERE jeton = ?").bind(jeton).run();
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              ...CORS,
              "Set-Cookie": "jarvis_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
            },
          });
        }
        const motdepasse = String(b.motdepasse || "").trim();
        if (motdepasse.length < 4) {
          return json({ erreur: "mot de passe trop court (4 caracteres minimum)" }, 400);
        }
        if (!configure) {
          const sel = hexa(crypto.getRandomValues(new Uint8Array(12)));
          const empreinte = await empreinteMotDePasse(motdepasse, sel);
          await env.DB.prepare(
            "INSERT INTO acces (id, sel, empreinte, cree) VALUES (1, ?, ?, ?) "
            + "ON CONFLICT(id) DO UPDATE SET sel = excluded.sel, empreinte = excluded.empreinte",
          ).bind(sel, empreinte, new Date().toISOString()).run();
        } else {
          const r = await env.DB.prepare("SELECT sel, empreinte FROM acces WHERE id = 1").first();
          const essai = await empreinteMotDePasse(motdepasse, (r && r.sel) || "");
          if (!r || essai !== r.empreinte) {
            return json({ erreur: "mot de passe incorrect" }, 403);
          }
        }
        const jeton = await creerSession(env);
        return new Response(JSON.stringify({ ok: true, configure: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...CORS,
            "Set-Cookie": "jarvis_session=" + jeton + "; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax",
          },
        });
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    if (CHEMINS_PRIVES.some((c) => url.pathname === c || url.pathname.startsWith(c + "/"))) {
      if (!(await sessionValide(request, env)) && !(await jetonMachineValide(request, url, env))) {
        return json({ erreur: "mot de passe requis", acces: true }, 401);
      }
    }

    if (url.pathname === "/espace" && request.method === "POST") {
      try {
        const o = await request.json().catch(() => ({}));
        return json(await espaceAction({ env, jetonGoogle, jetonGoogle2, envoyerTelegram }, o));
      } catch (e) {
        return json({ erreur: erreurDouce(e) }, 502);
      }
    }

    if (url.pathname === "/health") {
      let google = false;
      try {
        google = !!(await jetonGoogle(env));
      } catch (e) {
        google = false;
      }
      return json({
        ok: true,
        version: VERSION,
        gemini: !!env.GEMINI_API_KEY,
        fish: !!env.FISH_API_KEY,
        voix: !!env.FISH_VOICE_ID,
        memoire: !!env.DB,
        google,
        ecole: !!env.GOOGLE2_REFRESH_TOKEN,
        ecoledirecte: !!(env.ECOLODIRECTE_ID && env.ECOLODIRECTE_MDP),
        modele: env.GEMINI_MODEL || "gemini-3.5-flash-lite",
        protege: !!env.APP_TOKEN,
      });
    }

    if (url.pathname === "/diag" && request.method === "GET") {
      const cld = request.headers.get("X-Token") || url.searchParams.get("k") || "";
      const attD = env.SYNC_KEY || env.ECOLODIRECTE_MDP;
      if (!attD || cld !== attD) return json({ erreur: "cle invalide" }, 401);
      const t = url.searchParams.get("t") || "web";
      if (t === "news") return json({ outil: String(await actualites(url.searchParams.get("q") || "")).slice(0, 400) });
      const essais = [];
      for (const m of [env.GEMINI_MODEL || "gemini-3.5-flash-lite", "gemini-3.8-flash"]) {
        try {
          const parts = await appelGeminiModele(env, {
            contents: [{ role: "user", parts: [{ text: "En une phrase, le temps qu'il fait a Paris aujourd'hui." }] }],
            tools: [{ google_search: {} }],
            generationConfig: { maxOutputTokens: 120 },
          }, m, "diagnostic", attente);
          essais.push({ modele: m, ok: true, texte: parts.map((p) => p.text || "").join("").slice(0, 160) });
        } catch (e) {
          essais.push({ modele: m, ok: false, erreur: String((e && e.message) || e).slice(0, 200) });
        }
      }
      return json({ essais });
    }

    if (url.pathname === "/faits" && request.method === "GET") {
      const cle = request.headers.get("X-Token") || url.searchParams.get("k") || "";
      const attendu = env.SYNC_KEY || env.ECOLODIRECTE_MDP;
      if (!attendu || cle !== attendu) return json({ erreur: "cle invalide" }, 401);
      const f = await faitsLire(env, 60);
      return json({ nombre: f.length, faits: f });
    }

    if (url.pathname === "/souvenirs" && request.method === "GET") {
      const clel = request.headers.get("X-Token") || url.searchParams.get("k") || "";
      const attenduL = env.SYNC_KEY || env.ECOLODIRECTE_MDP;
      if (!attenduL || clel !== attenduL) return json({ erreur: "cle invalide" }, 401);
      let s = "";
      try {
        if (env.DB) {
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS souvenirs (id INTEGER PRIMARY KEY, texte TEXT, maj TEXT)").run();
          const r = await env.DB.prepare("SELECT texte FROM souvenirs WHERE id = 1").first();
          s = (r && r.texte) || "";
        }
      } catch (e) { s = ""; }
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json({
        present: !!s,
        longueur: s.length,
        trouve: q && s ? s.toLowerCase().indexOf(q) >= 0 : null,
        debut: s.slice(0, 160),
        fin: s.slice(-160),
      });
    }

    if (url.pathname === "/souvenirs" && request.method === "POST") {
      try {
        const cle = request.headers.get("X-Token") || "";
        const attendu = env.SYNC_KEY || env.ECOLODIRECTE_MDP;
        if (!attendu || cle !== attendu) return json({ erreur: "cle invalide" }, 401);
        const o = await request.json();
        const texte = String(o.texte || "").trim();
        if (!texte) return json({ erreur: "texte vide" }, 400);
        await souvenirsEcrire(env, texte);
        return json({ ok: true, longueur: texte.length });
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    if (url.pathname === "/fil" && request.method === "GET") {
      const cle = request.headers.get("X-Token") || url.searchParams.get("k") || "";
      const attendu = env.SYNC_KEY || env.ECOLODIRECTE_MDP;
      if (!attendu || cle !== attendu) return json({ erreur: "cle invalide" }, 401);
      const n = Math.min(Number(url.searchParams.get("n")) || 30, 120);
      const canal = url.searchParams.get("canal") || "";
      const messages = await filLire(env, n, canal || null);
      const out = { messages };
      if (url.searchParams.get("faits") === "1") out.faits = await faitsLire(env, 20);
      return json(out);
    }

    if (url.pathname === "/fil" && request.method === "POST") {
      try {
        const cle = request.headers.get("X-Token") || "";
        const attendu = env.SYNC_KEY || env.ECOLODIRECTE_MDP;
        if (!attendu || cle !== attendu) return json({ erreur: "cle invalide" }, 401);
        const o = await request.json();
        const canal = String(o.canal || "pc").slice(0, 40);
        let ecrits = 0;
        if (Array.isArray(o.messages)) {
          for (const m of o.messages.slice(-40)) {
            ecrits += await filEcrire(env, canal, m && m.role === "assistant" ? "assistant" : "user",
              (m && (m.texte || m.text)) || "");
          }
        }
        if (o.texte) ecrits += await filEcrire(env, canal, "user", o.texte);
        if (o.reponse) ecrits += await filEcrire(env, canal, "assistant", o.reponse);
        return json({ ok: true, canal, ecrits });
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    if (url.pathname === "/tg-hook") {
      if (!env.TELEGRAM_TOKEN) return json({ erreur: "TELEGRAM_TOKEN absent" }, 400);
      const base = new URL(request.url).origin;
      const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_TOKEN + "/setWebhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: base + "/tg-webhook", allowed_updates: ["message", "edited_message"] }),
      });
      return json(await r.json());
    }

    if (url.pathname === "/tg-webhook" && request.method === "POST") {
      try {
        const maj = await request.json().catch(() => ({}));
        const m = maj.message || maj.edited_message || {};
        if (!m.chat || !m.text) return json({ ok: true, ignore: true });
        const chat = String(m.chat.id);
        const texte = String(m.text).trim();

        if (env.DB) {
          try {
            await env.DB.prepare("CREATE TABLE IF NOT EXISTS tg (id INTEGER PRIMARY KEY, chat TEXT)").run();
            const l = await env.DB.prepare("SELECT chat FROM tg WHERE id = 1").first();
            if (l && l.chat && l.chat !== chat) return json({ ok: true, ignore: "autre chat" });
            await env.DB.prepare("INSERT INTO tg (id, chat) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET chat = excluded.chat")
              .bind(chat).run();
          } catch (e) { /* on continue */ }
        }

        const envoyer = async (t) => {
          await fetch("https://api.telegram.org/bot" + env.TELEGRAM_TOKEN + "/sendMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chat, text: t.slice(0, 4000) }),
          });
        };

        if (texte === "/start" || texte === "start") {
          await envoyer("Bonjour Monsieur. Je suis en ligne. Posez-moi une question, ici ou sur l'application.");
          return json({ ok: true, accueil: true });
        }

        const ctx = await contexte(texte, env);
        const reponse = await discuter(texte, env, ctx, null, "telegram", undefined, attente);
        await memoireEcrire(env, "user", texte);
        await memoireEcrire(env, "assistant", reponse);
        await filEcrire(env, "telegram", "user", texte);
        await filEcrire(env, "telegram", "assistant", reponse);
        await envoyer(reponse);
        return json({ ok: true, reponse });
      } catch (e) {
        return json({ ok: false, erreur: String((e && e.stack) || e).slice(0, 500) }, 200);
      }
    }

    if (url.pathname === "/tg") {
      if (!env.TELEGRAM_TOKEN) return json({ erreur: "TELEGRAM_TOKEN absent" }, 400);
      const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_TOKEN + "/getUpdates?limit=30");
      const d = await r.json();
      const chats = [];
      for (const u of (d.result || [])) {
        const m = u.message || u.edited_message || {};
        if (!m.chat) continue;
        if (chats.some((c) => c.id === m.chat.id)) continue;
        chats.push({
          id: m.chat.id,
          nom: [m.chat.first_name, m.chat.last_name].filter(Boolean).join(" "),
          pseudo: m.chat.username || "",
          texte: m.text || "",
        });
      }
      if (chats.length && env.DB) {
        try {
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS tg (id INTEGER PRIMARY KEY, chat TEXT)").run();
          await env.DB.prepare("INSERT INTO tg (id, chat) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET chat = excluded.chat")
            .bind(String(chats[0].id)).run();
        } catch (e) { /* sans memoire */ }
      }
      return json({ ok: d.ok, erreur: d.description || null, chats });
    }

    if (url.pathname === "/tg-envoi" && request.method === "POST") {
      if (!env.TELEGRAM_TOKEN) return json({ erreur: "TELEGRAM_TOKEN absent" }, 400);
      const o = await request.json().catch(() => ({}));
      let chat = o.chat;
      if (!chat && env.DB) {
        try {
          const l = await env.DB.prepare("SELECT chat FROM tg WHERE id = 1").first();
          chat = l && l.chat;
        } catch (e) { /* rien */ }
      }
      if (!chat) return json({ erreur: "aucune conversation connue, ecris d'abord au bot" }, 400);
      const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: o.texte || "Bonjour Monsieur." }),
      });
      return json(await r.json());
    }

    if (url.pathname === "/ecole-sync" && request.method === "POST") {
      try {
        // l'acces est deja verifie par le verrou (session, cle machine ou cle d'appareil)
        const o = await request.json();
        const texte = String(o.texte || "").trim();
        if (!texte) return json({ erreur: "texte vide" }, 400);
        await ecoleStocker(env, texte);
        return json({ ok: true, longueur: texte.length });
      } catch (ex) {
        return json({ erreur: String((ex && ex.message) || ex) }, 502);
      }
    }

    if (url.pathname === "/ecole") {
      try {
        const e = await ecoleLogin(env);
        if (!e) return json({ erreur: "ECOLODIRECTE_ID / ECOLODIRECTE_MDP absents" }, 400);
        if (e.erreur) return json(e, 400);
        const quoi = url.searchParams.get("quoi") || "devoirs";
        const chemin = quoi === "notes"
          ? "eleves/" + e.id + "/notes.awp?verbe=GET&v=4.72.0"
          : "eleves/" + e.id + "/cahierdetexte.awp?verbe=GET&v=4.72.0";
        const brut = await ecoleApi(e, chemin);
        return json({ eleve: e.nom, code: brut.code, apercu: JSON.stringify(brut).slice(0, 2500) });
      } catch (ex) {
        return json({ erreur: String((ex && ex.message) || ex) }, 502);
      }
    }

    if (url.pathname === "/propositions") {
      try {
        if (!env.DB) return json({ erreur: "pas de base" }, 500);
        await propositionsTable(env);
        const id = Number(url.searchParams.get("id"));
        if (request.method === "GET") {
          if (id) {
            const r = await env.DB.prepare(
              "SELECT id, demande, resume, statut, cible, cree, maj FROM propositions WHERE id = ?",
            ).bind(id).first();
            return json({ proposition: r || null });
          }
          const r = await env.DB.prepare(
            "SELECT id, demande, resume, statut, cible, cree, maj FROM propositions ORDER BY id DESC",
          ).all();
          return json({ propositions: r.results || [] });
        }
        if (request.method === "POST") {
          const b = await request.json().catch(() => ({}));
          const maintenant = new Date().toISOString();
          if (id) {
            const statut = String(b.statut || "");
            if (!["a_generer", "attente", "validee", "refusee", "appliquee"].includes(statut)) {
              return json({ erreur: "statut inconnu" }, 400);
            }
            const resume = b.resume ? String(b.resume).slice(0, 4000) : null;
            await env.DB.prepare(
              "UPDATE propositions SET statut = ?, resume = COALESCE(?, resume), maj = ? WHERE id = ?",
            ).bind(statut, resume, maintenant, id).run();
            return json({ ok: true, id, statut });
          }
          const demande = String(b.demande || "").trim();
          if (!demande) return json({ erreur: "demande vide" }, 400);
          const cible = String(b.cible || "pc") === "web" ? "web" : "pc";
          const info = await env.DB.prepare(
            "INSERT INTO propositions (demande, resume, statut, cible, cree, maj) VALUES (?, ?, 'attente', ?, ?, ?)",
          ).bind(demande.slice(0, 500), String(b.resume || "").slice(0, 4000), cible, maintenant, maintenant).run();
          return json({ ok: true, id: info.meta && info.meta.last_row_id });
        }
        if (request.method === "DELETE") {
          if (!id) return json({ erreur: "id manquant" }, 400);
          await env.DB.prepare("DELETE FROM propositions WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }
        return json({ erreur: "methode inconnue" }, 405);
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    if (url.pathname === "/sauvegardes") {
      try {
        if (env.APP_TOKEN) {
          const donne = url.searchParams.get("t") || request.headers.get("X-Token") || "";
          if (donne !== env.APP_TOKEN) return json({ erreur: "jeton invalide" }, 401);
        }
        if (!env.DB) return json({ erreur: "pas de base" }, 500);
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS sauvegardes (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT, texte TEXT, mode TEXT, cree TEXT)",
        ).run();
        if (request.method === "GET") {
          const q = (url.searchParams.get("q") || "").trim();
          const r = q
            ? await env.DB.prepare(
              "SELECT id, question, texte, mode, cree FROM sauvegardes WHERE texte LIKE ? OR question LIKE ? ORDER BY id DESC LIMIT 200",
            ).bind("%" + q + "%", "%" + q + "%").all()
            : await env.DB.prepare(
              "SELECT id, question, texte, mode, cree FROM sauvegardes ORDER BY id DESC LIMIT 200",
            ).all();
          return json({ sauvegardes: r.results || [] });
        }
        if (request.method === "POST") {
          const b = await request.json().catch(() => ({}));
          const texte = String(b.texte || "").trim();
          if (!texte) return json({ erreur: "texte vide" }, 400);
          const info = await env.DB.prepare(
            "INSERT INTO sauvegardes (question, texte, mode, cree) VALUES (?, ?, ?, ?)",
          ).bind(
            String(b.question || "").slice(0, 400),
            texte,
            String(b.mode || "questions").slice(0, 20),
            new Date().toISOString(),
          ).run();
          return json({ ok: true, id: info.meta && info.meta.last_row_id });
        }
        if (request.method === "DELETE") {
          const id = Number(url.searchParams.get("id"));
          if (!id) return json({ erreur: "id manquant" }, 400);
          await env.DB.prepare("DELETE FROM sauvegardes WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }
        return json({ erreur: "methode inconnue" }, 405);
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    if (url.pathname === "/last") {
      if (!env.DB) return json({ erreur: "pas de base" }, 500);
      const combien = Math.min(Number(url.searchParams.get("n")) || 8, 60);
      const canal = url.searchParams.get("canal") || "";
      if (canal) {
        const messages = await filLire(env, combien, canal);
        return json({ messages });
      }
      const r = await env.DB.prepare(
        "SELECT role, texte, cree FROM histo ORDER BY id DESC LIMIT ?",
      ).bind(combien).all();
      return json({ messages: (r.results || []).reverse() });
    }

    if (url.pathname === "/tts") {
      let phrase = url.searchParams.get("t") || "";
      if (!phrase && request.method === "POST") {
        const o = await request.json().catch(() => ({}));
        phrase = String(o.texte || o.text || "");
      }
      if (!phrase) phrase = "Bonjour, je suis Jarvis.";
      try {
        const audio = await demanderAFish(phrase, env);
        return new Response(audio, {
          headers: { ...CORS, "Content-Type": "audio/mpeg" },
        });
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 500);
      }
    }

    if (url.pathname === "/stt" && request.method === "POST") {
      try {
        const o = await request.json();
        const data = String(o.audio || "").replace(/^data:[^,]+,/, "");
        const mime = String(o.mime || "audio/mp4").split(";")[0];
        if (!data) return json({ erreur: "audio vide" }, 400);
        const texte = await transcrire(data, mime, env, attente);
        return json({ texte });
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    if (url.pathname === "/gemini-lien" && request.method === "POST") {
      try {
        const o = JSON.parse((await request.text()) || "{}");
        const brutal = String(o.url || "").trim();
        const trouve = brutal.match(/https?:\/\/[^\s"'<>]+/);
        if (!trouve) return json({ ok: false, erreur: "aucun lien dans le texte" }, 400);
        let u;
        try { u = new URL(trouve[0]); } catch (e) { return json({ ok: false, erreur: "lien invalide" }, 400); }
        if (!/(^|\.)google\.com$/i.test(u.hostname) && !/(^|\.)googleusercontent\.com$/i.test(u.hostname)) {
          return json({ ok: false, erreur: "lien Google attendu (docs.google.com ou drive.google.com)" }, 400);
        }
        if (/(^|\.)gemini\.google\.com$/i.test(u.hostname)) {
          return json({ ok: false, erreur: "lien de partage Gemini : un serveur ne peut pas l'ouvrir. Ouvre-le, menu ⋯ → Partager via Drive, puis importe le fichier .docx." }, 400);
        }
        let id = "";
        const mp = u.pathname.match(/\/d\/(?:e\/)?([A-Za-z0-9_-]{10,})/);
        if (mp) id = mp[1];
        if (!id) id = u.searchParams.get("id") || "";
        if (!id) return json({ ok: false, erreur: "identifiant introuvable dans le lien" }, 400);
        const entete = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };

        const doc = await fetch("https://docs.google.com/document/d/" + encodeURIComponent(id) + "/export?format=txt", { redirect: "follow", headers: entete });
        if (doc.ok) {
          const ct = String(doc.headers.get("content-type") || "");
          if (ct.indexOf("text/plain") >= 0) {
            const t = (await doc.text()).slice(0, 3000000);
            if (t.trim()) return json({ ok: true, texte: t });
          }
        }

        const f = await fetch("https://drive.google.com/uc?export=download&id=" + encodeURIComponent(id), { redirect: "follow", headers: entete });
        if (f.ok) {
          const ct = String(f.headers.get("content-type") || "").toLowerCase();
          const buf = new Uint8Array(await f.arrayBuffer());
          const zip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b;
          if (ct.indexOf("wordprocessingml") >= 0 || zip) {
            if (buf.length > 12000000) return json({ ok: false, erreur: "document trop gros (12 mo max)" });
            return json({ ok: true, docx: b64octets(buf) });
          }
          if (ct.indexOf("text/plain") >= 0) return json({ ok: true, texte: new TextDecoder().decode(buf).slice(0, 3000000) });
          if (ct.indexOf("pdf") >= 0) return json({ ok: false, erreur: "c'est un PDF — dans Drive, télécharge-le en Word (.docx) ou en texte brut, puis importe le fichier" });
        }

        if (/\/d\/e\//.test(u.pathname)) {
          const pub = await fetch("https://docs.google.com/document/d/e/" + encodeURIComponent(id) + "/pub", { redirect: "follow", headers: entete });
          if (pub.ok) {
            const html = await pub.text();
            const txt = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
              .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
            if (txt.trim()) return json({ ok: true, texte: txt.slice(0, 3000000) });
          }
        }

        return json({ ok: false, erreur: "lien non lisible : le partage doit être « tous les utilisateurs disposant du lien »" });
      } catch (e) {
        return json({ ok: false, erreur: String((e && e.message) || e) }, 500);
      }
    }

    if (url.pathname === "/ask" && request.method === "POST") {
      try {
        if (env.APP_TOKEN) {
          const donne = url.searchParams.get("t") || request.headers.get("X-Token") || "";
          if (donne !== env.APP_TOKEN) return json({ erreur: "jeton invalide" }, 401);
        }
        let texte = "";
        let image = null;
        let riche = false;
        let revisions = false;
        let matiere = "";
        let archive = "";
        const brut = await request.text();
        try {
          const o = JSON.parse(brut || "{}");
          texte = String(o.text || o.texte || o.q || "").trim();
          riche = String(o.mode || "") === "questions";
          revisions = String(o.mode || "") === "revisions";
          matiere = slugMatiere(o.matiere);
          archive = String(o.archive || "").slice(0, 12000);
          if (o.image && o.image.data) {
            image = { mime: String(o.image.mime || "image/jpeg"), data: String(o.image.data) };
          }
        } catch (e) {
          texte = String(brut || "").trim();
        }
        if (!texte && !image) return json({ erreur: "texte vide" }, 400);
        if (!texte) texte = "Décris précisément cette image et dis ce qui mérite mon attention.";

        if (!matiere || MATIERES_REV.indexOf(matiere) < 0) matiere = "";
        const canal = revisions ? ("revisions" + (matiere ? ":" + matiere : "")) : "telephone";

        if (url.searchParams.get("fmt") === "flux") {
          const encodeur = new TextEncoder();
          const corpsFlux = new ReadableStream({
            async start(controleur) {
              let vivant = true;
              const envoie = (o) => {
                if (!vivant) return;
                try { controleur.enqueue(encodeur.encode(JSON.stringify(o) + "\n")); } catch (e) { vivant = false; }
              };
              envoie({ debut: true });
              try {
                const ctxFlux = await contexte(texte, env);
                const reponse = await discuterFlux(texte, env, ctxFlux, canal, { riche, image, revisions, matiere, archive }, attente, (t) => envoie({ t }));
                envoie({ fin: true, reponse });
                const taches = [
                  filEcrire(env, canal, "user", texte),
                  filEcrire(env, canal, "assistant", reponse),
                ];
                if (!revisions) {
                  taches.push(memoireEcrire(env, "user", texte), memoireEcrire(env, "assistant", reponse));
                }
                await Promise.all(taches.map((p) => p.catch(() => {})));
              } catch (e) {
                envoie({ erreur: erreurDouce(e) });
              } finally {
                vivant = false;
                try { controleur.close(); } catch (e) {}
              }
            },
          });
          return new Response(corpsFlux, {
            headers: {
              "Content-Type": "application/x-ndjson; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Accel-Buffering": "no",
              ...CORS,
            },
          });
        }

        const ctx = await contexte(texte, env);
        const trace = [];
        const reponse = await discuter(texte, env, ctx, trace, canal, { riche, image, revisions, matiere, archive }, attente);
        if (!revisions) {
          await memoireEcrire(env, "user", texte);
          await memoireEcrire(env, "assistant", reponse);
        }
        const [filQ, filR] = await Promise.all([
          filEcrire(env, canal, "user", texte),
          filEcrire(env, canal, "assistant", reponse),
        ]);

        if (url.searchParams.get("fmt") === "text") {
          return json({ question: texte, reponse, outils: trace, fil: filQ + filR });
        }
        const audio = await demanderAFish(reponse, env);
        return new Response(audio, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(audio.byteLength),
            "X-Reponse": encodeURIComponent(reponse).slice(0, 900),
            "Cache-Control": "no-store",
            ...CORS,
          },
        });
      } catch (e) {
        return json({ erreur: erreurDouce(e), trace: String((e && e.stack) || "").slice(0, 600) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
