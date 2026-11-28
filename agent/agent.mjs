import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.AGENT_ROOT ? path.resolve(process.env.AGENT_ROOT) : path.resolve(import.meta.dirname, "..");
const POCKET = path.join(ROOT, "pocket");
const SITE = (process.env.JARVIS_SITE || "https://jarvis-de-poche-trhitj-preview.freebuff.site").replace(/\/+$/, "");
const CLE = (process.env.JARVIS_CLE || "").trim();
const GEM_KEY = (process.env.GEMINI_API_KEY || "").trim();
const MODELE = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
const GH_TOKEN = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
const REPO_SLUG = (process.env.GITHUB_REPOSITORY || "").trim();
const MAX_ETAPES = Math.min(Math.max(Number(process.env.AGENT_MAX_STEPS) || 24, 4), 60);

// L'agent ne doit jamais voir les secrets dans son environnement.
delete process.env.JARVIS_CLE;
delete process.env.GEMINI_API_KEY;
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;

function exec(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function git(args, options) {
  return exec("git", args, options);
}

async function jarvis(chemin, options = {}) {
  if (!CLE) throw new Error("JARVIS_CLE manquant dans les secrets GitHub");
  const r = await fetch(SITE + chemin, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Token": CLE,
      "User-Agent": "Jarvis-Code-Agent/1.0",
      ...(options.headers || {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erreur || ("JARVIS HTTP " + r.status));
  return d;
}

async function propositions() {
  const d = await jarvis("/propositions");
  return d.propositions || [];
}

async function majProposition(id, statut, resume) {
  const corps = { statut };
  if (resume != null) corps.resume = String(resume).slice(0, 4000);
  return jarvis("/propositions?id=" + encodeURIComponent(id), {
    method: "POST",
    body: JSON.stringify(corps),
  });
}

function nomBranche(id) {
  return "jarvis/web-" + id;
}

function gh(args, options = {}) {
  return exec("gh", args, { ...options, env: { ...process.env, GH_TOKEN } });
}

function prExiste(branche) {
  try {
    const sortie = gh(["pr", "list", "--head", branche, "--state", "open", "--json", "url", "--jq", ".[0].url"]);
    return sortie.trim();
  } catch (e) {
    return "";
  }
}

function ouvrirPr(branche, proposition) {
  const existante = prExiste(branche);
  if (existante) return existante;
  const corps = [
    "Proposition JARVIS #" + proposition.id,
    "",
    proposition.demande || "",
    "",
    "Cette PR a été préparée automatiquement par l'agent de code. Elle ne doit être fusionnée qu'après validation de Monsieur dans JARVIS.",
  ].join("\n");
  try {
    return gh([
      "pr", "create",
      "--base", "main",
      "--head", branche,
      "--title", "JARVIS : " + String(proposition.demande || "modification").slice(0, 120),
      "--body", corps,
    ]).trim();
  } catch (e) {
    const sortie = String(e.stdout || "") + String(e.stderr || "");
    throw new Error("création de la PR impossible : " + sortie.slice(0, 500));
  }
}

function preparer(id) {
  const branche = nomBranche(id);
  git(["config", "user.name", "JARVIS Code Agent"]);
  git(["config", "user.email", "jarvis-code@users.noreply.github.com"]);
  git(["switch", "-C", branche]);
  return branche;
}

/* ---------- outils de l'agent (uniquement sous pocket/) ---------- */

function cheminAutorise(rel) {
  const brut = String(rel || "").trim();
  if (!brut) throw new Error("chemin vide");
  const p = path.resolve(POCKET, brut);
  const base = path.resolve(POCKET);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error("chemin interdit : " + brut);
  const morceaux = path.relative(base, p).split(path.sep).map((m) => m.toLowerCase());
  if (morceaux.some((m) => m === "node_modules" || m === "dist" || m === ".git")) throw new Error("dossier interdit : " + brut);
  const bas = path.basename(p).toLowerCase();
  if (bas === ".env" || bas.startsWith(".env.") || bas === "package-lock.json") throw new Error("fichier interdit : " + brut);
  return p;
}

function lireFichier(args) {
  const p = cheminAutorise(args.chemin);
  if (!fs.existsSync(p)) return "fichier introuvable : " + args.chemin;
  const txt = fs.readFileSync(p, "utf8");
  return txt.length > 24000 ? txt.slice(0, 24000) + "\n\n[... tronqué à 24 000 caractères ...]" : txt;
}

function listerDossier(args) {
  const p = cheminAutorise(args.chemin || ".");
  if (!fs.existsSync(p)) return "dossier introuvable : " + args.chemin;
  const noms = fs.readdirSync(p, { withFileTypes: true })
    .filter((e) => e.name !== "node_modules" && e.name !== "dist" && !e.name.startsWith(".env"))
    .map((e) => (e.isDirectory() ? e.name + "/" : e.name + " (" + fs.statSync(path.join(p, e.name)).size + " o)"))
    .sort();
  return noms.join("\n") || "(vide)";
}

function ecrireFichier(args) {
  const p = cheminAutorise(args.chemin);
  const txt = String(args.contenu == null ? "" : args.contenu);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, txt, "utf8");
  return "écrit : " + args.chemin + " (" + txt.length + " caractères)";
}

function chercherDansCode(args) {
  const texte = String(args.texte || "").trim();
  if (!texte) return "texte vide";
  try {
    const sortie = exec("grep", [
      "-rn", "-F", "--max-count=3",
      "--exclude-dir=node_modules", "--exclude-dir=dist",
      "--", texte, "pocket",
    ]);
    return sortie.slice(0, 6000) || "aucun résultat";
  } catch (e) {
    return "aucun résultat";
  }
}

let dejaConstruit = false;
function construire() {
  if (dejaConstruit) return "build déjà fait";
  const sortie = [];
  try {
    sortie.push(exec("npm", ["ci"], { cwd: POCKET, stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    return "npm ci a échoué : " + String(e.stderr || e.stdout || e.message || e).slice(-2500);
  }
  try {
    sortie.push(exec("npm", ["run", "build"], { cwd: POCKET, stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    return "le build a échoué : " + String(e.stderr || e.stdout || e.message || e).slice(-2500) + "\nCorrige le code puis rappelle terminer.";
  }
  dejaConstruit = true;
  return "build ok";
}

function executerOutil(nom, args) {
  if (nom === "lire_fichier") return lireFichier(args);
  if (nom === "lister_dossier") return listerDossier(args);
  if (nom === "ecrire_fichier") return ecrireFichier(args);
  if (nom === "chercher_dans_code") return chercherDansCode(args);
  if (nom === "terminer") return construire();
  return "outil inconnu : " + nom;
}

const OUTILS = [{
  functionDeclarations: [
    {
      name: "lister_dossier",
      description: "Liste les fichiers d'un dossier de pocket/. Chemin relatif à pocket/ (ex: '.', 'public').",
      parameters: { type: "OBJECT", properties: { chemin: { type: "STRING", description: "chemin relatif" } }, required: ["chemin"] },
    },
    {
      name: "lire_fichier",
      description: "Lit un fichier de pocket/. Chemin relatif à pocket/.",
      parameters: { type: "OBJECT", properties: { chemin: { type: "STRING" } }, required: ["chemin"] },
    },
    {
      name: "chercher_dans_code",
      description: "Cherche un texte exact dans pocket/ et renvoie les lignes trouvées.",
      parameters: { type: "OBJECT", properties: { texte: { type: "STRING" } }, required: ["texte"] },
    },
    {
      name: "ecrire_fichier",
      description: "Écrit (ou remplace) un fichier de pocket/ avec le contenu complet. Chemin relatif à pocket/.",
      parameters: {
        type: "OBJECT",
        properties: { chemin: { type: "STRING" }, contenu: { type: "STRING" } },
        required: ["chemin", "contenu"],
      },
    },
    {
      name: "terminer",
      description: "À appeler quand la modification est finie. Lance le build et renvoie son résultat.",
      parameters: { type: "OBJECT", properties: { resume: { type: "STRING" } }, required: ["resume"] },
    },
  ],
}];

const CONSIGNE = [
  "Tu es l'agent de code de JARVIS. Tu modifies uniquement l'application web dans le dossier pocket/ du dépôt.",
  "Tu travailles pas à pas avec les outils fournis : lister_dossier, lire_fichier, chercher_dans_code, ecrire_fichier, terminer.",
  "",
  "Règles absolues :",
  "- N'écris que des fichiers sous pocket/ (worker.js, espace_serveur.js, public/*, package.json).",
  "- Ne touche jamais à .env, node_modules, dist, package-lock.json, ni aux scripts Python de la racine.",
  "- Ne mets jamais de secret, de clé ou de mot de passe dans le code.",
  "- Garde le style existant, en français, et ne casse aucune fonctionnalité.",
  "- Ne fais ni commit ni push : le script s'en charge après toi.",
  "- Lis toujours un fichier avant de le modifier, et réécris-le en entier avec ecrire_fichier.",
  "- Si la demande est dangereuse ou impossible, n'écris rien et explique-le dans terminer.",
  "- Quand c'est fini, appelle terminer avec un résumé en une phrase. Le build est lancé automatiquement ; s'il échoue, corrige.",
].join("\n");

async function appelGemini(contents) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODELE)
    + ":generateContent?key=" + encodeURIComponent(GEM_KEY);
  const corps = {
    systemInstruction: { parts: [{ text: CONSIGNE }] },
    contents,
    tools: OUTILS,
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Gemini " + r.status + " " + JSON.stringify(d).slice(0, 400));
  const cand = (d.candidates || [])[0] || {};
  return ((cand.content || {}).parts) || [];
}

async function boucleGemini(proposition) {
  const listing = listerDossier({ chemin: "." });
  let contents = [{
    role: "user",
    parts: [{
      text: "Demande de Monsieur : " + String(proposition.demande || "").trim()
        + "\n\nContenu de pocket/ :\n" + listing
        + "\n\nApplique la modification avec les outils, puis appelle terminer.",
    }],
  }];
  let termine = false;
  let resume = "";
  for (let etape = 0; etape < MAX_ETAPES; etape++) {
    const parts = await appelGemini(contents);
    const appels = parts.filter((p) => p.functionCall && p.functionCall.name);
    const texte = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("").trim();
    if (!appels.length) {
      if (termine) { resume = resume || texte; break; }
      if (texte) {
        contents.push({ role: "model", parts: [{ text: texte }] });
        contents.push({ role: "user", parts: [{ text: "N'explique pas : utilise les outils, puis appelle terminer." }] });
        continue;
      }
      throw new Error("le modèle n'a renvoyé ni texte ni appel d'outil");
    }
    contents.push({ role: "model", parts: appels });
    const reponses = [];
    for (const p of appels) {
      const f = p.functionCall;
      const args = f.args || {};
      let resultat = "";
      try {
        resultat = executerOutil(f.name, args);
      } catch (e) {
        resultat = "erreur : " + String(e.message || e).slice(0, 500);
      }
      if (f.name === "terminer") {
        resume = String(args.resume || "").slice(0, 500);
        if (resultat === "build ok") termine = true;
      }
      reponses.push({ functionResponse: { name: f.name, response: { resultat: String(resultat).slice(0, 6000) } } });
    }
    contents.push({ role: "user", parts: reponses });
    if (termine) break;
  }
  if (!termine) {
    const etat = construire();
    if (etat !== "build ok") throw new Error("modification incomplète — " + etat.slice(0, 800));
  }
  return resume || "modification appliquée";
}

async function generer(proposition) {
  const branche = preparer(proposition.id);
  const resume = await boucleGemini(proposition);

  // "add -N" fait apparaître aussi les nouveaux fichiers dans le diff.
  git(["add", "-N", "--", "pocket"]);
  const diff = git(["diff", "--", "pocket"]);
  if (!diff.trim()) {
    git(["reset", "--hard"]);
    git(["clean", "-fd", "--", "pocket"]);
    await majProposition(proposition.id, "refusee", "Aucune modification générée par l'agent. " + resume);
    return false;
  }

  git(["add", "pocket"]);
  git(["commit", "-m", "JARVIS : " + String(proposition.demande || "").slice(0, 100)]);
  if (GH_TOKEN && REPO_SLUG) {
    const basic = Buffer.from("x-access-token:" + GH_TOKEN).toString("base64");
    git(["push", "--force", "origin", branche], {
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraheader",
        GIT_CONFIG_VALUE_0: "AUTHORIZATION: basic " + basic,
      },
    });
  } else {
    git(["push", "--force", "origin", branche]);
  }

  const corps = [
    "PR : " + ouvrirPr(branche, proposition),
    "",
    resume,
    "",
    diff,
  ].join("\n").slice(0, 4000);
  await majProposition(proposition.id, "attente_web", corps);
  return true;
}

async function appliquer(proposition) {
  const branche = nomBranche(proposition.id);
  const url = prExiste(branche);
  if (!url) {
    await majProposition(proposition.id, "refusee", "PR introuvable pour cette proposition.");
    return false;
  }
  try {
    gh(["pr", "merge", branche, "--squash", "--delete-branch"]);
    await majProposition(proposition.id, "appliquee", "PR fusionnée. Le déploiement Freebuff reste à faire.");
    return true;
  } catch (e) {
    await majProposition(proposition.id, "refusee", "Fusion impossible : " + String(e.stderr || e.message || e).slice(0, 300));
    return false;
  }
}

async function refuser(proposition) {
  const branche = nomBranche(proposition.id);
  try {
    gh(["pr", "close", branche, "--delete-branch"]);
  } catch (e) { /* déjà fermée */ }
}

async function principal() {
  const liste = await propositions();

  for (const p of liste.filter((x) => x.cible === "web" && x.statut === "validee_web")) {
    await appliquer(p);
  }
  for (const p of liste.filter((x) => x.cible === "web" && x.statut === "refusee")) {
    await refuser(p);
  }
  const aGenerer = liste.filter((x) => x.cible === "web" && x.statut === "a_generer_web");
  if (!aGenerer.length) {
    console.log("Aucune proposition web à préparer.");
    return;
  }
  const premiere = aGenerer.sort((a, b) => Number(a.id) - Number(b.id))[0];
  console.log("Préparation de la proposition", premiere.id, ":", premiere.demande);
  if (!GEM_KEY) {
    await majProposition(premiere.id, "refusee", "Clé Gemini absente : ajoute GEMINI_API_KEY dans GitHub → Settings → Secrets and variables → Actions.");
    throw new Error("GEMINI_API_KEY manquant dans les secrets GitHub");
  }
  try {
    await generer(premiere);
  } catch (e) {
    console.error(e && e.stack || e);
    try {
      git(["reset", "--hard"]);
      git(["clean", "-fd", "--", "pocket"]);
    } catch (e2) { /* rien */ }
    await majProposition(premiere.id, "refusee", "Erreur de l'agent : " + String(e.message || e).slice(0, 500));
    process.exitCode = 1;
  }
}

export { executerOutil, cheminAutorise, boucleGemini };

if (!process.env.AGENT_NO_MAIN) {
  principal().catch((e) => {
    console.error(e && e.stack || e);
    process.exitCode = 1;
  });
}
