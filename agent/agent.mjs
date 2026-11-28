import { CodebuffClient } from "@codebuff/sdk";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = (process.env.JARVIS_SITE || "https://jarvis-de-poche-trhitj-preview.freebuff.site").replace(/\/+$/, "");
const CLE = (process.env.JARVIS_CLE || "").trim();
const CODEBUFF_KEY = (process.env.CODEBUFF_API_KEY || "").trim();
const GH_TOKEN = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
const REPO_SLUG = (process.env.GITHUB_REPOSITORY || "").trim();

// L'agent de code ne doit jamais voir les secrets dans son environnement.
delete process.env.JARVIS_CLE;
delete process.env.CODEBUFF_API_KEY;
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

function ouvrirPr(branche, proposition, resume) {
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

async function generer(proposition) {
  const branche = preparer(proposition.id);
  const client = new CodebuffClient({
    apiKey: CODEBUFF_KEY,
    cwd: ROOT,
  });
  const demande = String(proposition.demande || "").trim();
  const prompt = [
    "Tu es l'agent de code de JARVIS. Modifie uniquement l'application web dans le dossier pocket/.",
    "Demande de Monsieur : " + demande,
    "",
    "Règles absolues :",
    "- Ne touche jamais aux secrets, aux fichiers .env, ni aux dossiers node_modules et dist.",
    "- Ne modifie pas le JARVIS du PC (jarvis_fish.py) ni les scripts Python de la racine.",
    "- Garde le style existant et les fonctionnalités actuelles.",
    "- Ne fais pas de commit, de push ni de déploiement : le script s'en charge après toi.",
    "- Tu peux lire et modifier pocket/worker.js, pocket/espace_serveur.js, pocket/public/*, pocket/package.json.",
    "- Si la demande est trop dangereuse ou impossible, ne modifie rien et explique pourquoi en une phrase.",
  ].join("\n");

  const resultat = await client.run({
    agent: "codebuff/base@0.0.22",
    prompt,
    maxAgentSteps: 30,
    handleEvent: (evenement) => {
      if (evenement && evenement.type === "tool_call") {
        console.log("[outil]", evenement.toolName || evenement.name || "?");
      }
    },
  });
  if (resultat && resultat.output && resultat.output.type === "error") {
    throw new Error(resultat.output.message || "l'agent Codebuff a échoué");
  }

  exec("npm", ["ci"], { cwd: path.join(ROOT, "pocket"), stdio: "inherit" });
  exec("npm", ["run", "build"], { cwd: path.join(ROOT, "pocket"), stdio: "inherit" });

  // "add -N" fait apparaître aussi les nouveaux fichiers dans le diff.
  git(["add", "-N", "--", "pocket"]);
  const diff = git(["diff", "--", "pocket"]);
  if (!diff.trim()) {
    git(["reset", "--hard"]);
    git(["clean", "-fd", "--", "pocket"]);
    await majProposition(proposition.id, "refusee", "Aucune modification générée par l'agent.");
    return false;
  }

  git(["add", "pocket"]);
  git(["commit", "-m", "JARVIS : " + demande.slice(0, 100)]);
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

  const resume = [
    "PR : " + ouvrirPr(branche, proposition, diff),
    "",
    diff,
  ].join("\n").slice(0, 4000);
  await majProposition(proposition.id, "attente_web", resume);
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
  } catch (e) { /* deja fermee */ }
}

async function principal() {
  if (!CODEBUFF_KEY) throw new Error("CODEBUFF_API_KEY manquant dans les secrets GitHub");
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

principal().catch((e) => {
  console.error(e && e.stack || e);
  process.exitCode = 1;
});
