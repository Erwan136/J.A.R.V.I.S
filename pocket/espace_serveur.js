/* ============================================================
   ESPACE PERSONNEL DE JARVIS
   Tâches, projets, dossiers, notes, fichiers, agenda.
   Ce module est importé par worker.js et bundlé par esbuild.
   ============================================================ */

const TABLES = {
  espace_projets: ["id", "titre", "description", "statut", "echeance", "cree", "maj"],
  espace_taches: ["id", "titre", "notes", "jour", "projet_id", "echeance", "priorite", "fait", "reporte", "rappel", "rappel_envoye", "cree", "maj"],
  espace_dossiers: ["id", "nom", "parent_id", "projet_id", "drive_id", "cree", "maj"],
  espace_notes: ["id", "dossier_id", "titre", "contenu", "cree", "maj"],
  espace_fichiers: ["id", "dossier_id", "nom", "mime", "taille", "drive_id", "lien", "cree"],
};

let pret = false;

export const CONSIGNE_ESPACE = " Tu disposes aussi de son ESPACE personnel (taches du jour, projets, dossiers, notes) :"
  + " quand il demande de noter, ranger, planifier ou retenir une chose a faire, utilise les outils espace_*"
  + " et execute directement, sans demander confirmation.";

export const ESPACE_OUTILS = [
  {
    name: "espace_tache",
    description: "Ajoute une tache dans l'ESPACE personnel de Monsieur : sa journee, un projet, ou plus tard. A utiliser des qu'il demande de noter, planifier ou retenir une chose a faire.",
    parameters: {
      type: "OBJECT",
      properties: {
        titre: { type: "STRING", description: "La tache, courte et claire" },
        notes: { type: "STRING", description: "Details optionnels" },
        jour: { type: "STRING", description: "Date YYYY-MM-DD, ou aujourd'hui / demain ; vide ou 'plus tard' pour la liste generale" },
        projet: { type: "STRING", description: "Nom du projet si la tache en fait partie" },
        echeance: { type: "STRING", description: "Date limite YYYY-MM-DD, optionnelle" },
        priorite: { type: "NUMBER", description: "0 normal, 1 important" },
      },
      required: ["titre"],
    },
  },
  {
    name: "espace_note",
    description: "Enregistre une note Markdown dans un dossier de l'ESPACE (le dossier est cree s'il n'existe pas). A utiliser quand Monsieur dit de ranger, noter ou garder quelque chose dans un dossier.",
    parameters: {
      type: "OBJECT",
      properties: {
        dossier: { type: "STRING", description: "Nom du dossier, ex. achat, sport" },
        titre: { type: "STRING" },
        contenu: { type: "STRING", description: "Le contenu de la note, en Markdown simple" },
      },
      required: ["dossier", "contenu"],
    },
  },
  {
    name: "espace_projet",
    description: "Cree un projet dans l'ESPACE, avec ses etapes eventuelles. A utiliser pour une demarche ou un projet a suivre.",
    parameters: {
      type: "OBJECT",
      properties: {
        titre: { type: "STRING" },
        description: { type: "STRING" },
        echeance: { type: "STRING", description: "Date limite YYYY-MM-DD, optionnelle" },
        etapes: { type: "ARRAY", items: { type: "STRING" }, description: "Premieres etapes du projet" },
      },
      required: ["titre"],
    },
  },
  {
    name: "espace_dossier",
    description: "Cree un dossier dans l'ESPACE personnel. Un dossier peut contenir des notes, des fichiers et des sous-dossiers.",
    parameters: {
      type: "OBJECT",
      properties: {
        nom: { type: "STRING" },
        parent: { type: "STRING", description: "Nom du dossier parent, optionnel" },
      },
      required: ["nom"],
    },
  },
  {
    name: "espace_lister",
    description: "Liste le contenu de l'ESPACE personnel : taches du jour, projets et dossiers.",
    parameters: {
      type: "OBJECT",
      properties: {
        quoi: { type: "STRING", enum: ["jour", "projets", "dossiers", "tout"] },
      },
    },
  },
];

function texte(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 300);
}

function jourParis(d) {
  const dt = d ? new Date(d) : new Date();
  if (isNaN(dt.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(dt);
  } catch (e) {
    return dt.toISOString().slice(0, 10);
  }
}

function normaliserJour(v) {
  const s = texte(v, 40).toLowerCase();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s === "aujourd'hui" || s === "aujourdhui" || s === "ce soir") return jourParis();
  if (s === "demain") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return jourParis(d);
  }
  if (s === "apres-demain" || s === "après-demain") {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return jourParis(d);
  }
  if (s === "plus tard" || s === "un jour" || s === "sans date") return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : jourParis(d);
}

function maintenant() {
  return new Date().toISOString();
}

async function dbTous(ctx, sql, binds) {
  const st = ctx.env.DB.prepare(sql);
  const r = binds && binds.length ? await st.bind(...binds).all() : await st.all();
  return r.results || [];
}

async function dbUn(ctx, sql, binds) {
  const st = ctx.env.DB.prepare(sql);
  return binds && binds.length ? await st.bind(...binds).first() : await st.first();
}

async function dbExec(ctx, sql, binds) {
  const st = ctx.env.DB.prepare(sql);
  return binds && binds.length ? await st.bind(...binds).run() : await st.run();
}

export async function espacePreparer(ctx) {
  if (!ctx.env.DB) throw new Error("base absente");
  if (pret) return;
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("CREATE TABLE IF NOT EXISTS espace_projets (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, description TEXT DEFAULT '', statut TEXT DEFAULT 'actif', echeance TEXT DEFAULT '', cree TEXT, maj TEXT)"),
    ctx.env.DB.prepare("CREATE TABLE IF NOT EXISTS espace_taches (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, notes TEXT DEFAULT '', jour TEXT DEFAULT '', projet_id INTEGER, echeance TEXT DEFAULT '', priorite INTEGER DEFAULT 0, fait INTEGER DEFAULT 0, reporte INTEGER DEFAULT 0, rappel TEXT DEFAULT '', rappel_envoye INTEGER DEFAULT 0, cree TEXT, maj TEXT)"),
    ctx.env.DB.prepare("CREATE TABLE IF NOT EXISTS espace_dossiers (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, parent_id INTEGER, projet_id INTEGER, drive_id TEXT DEFAULT '', cree TEXT, maj TEXT)"),
    ctx.env.DB.prepare("CREATE TABLE IF NOT EXISTS espace_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER, titre TEXT NOT NULL, contenu TEXT DEFAULT '', cree TEXT, maj TEXT)"),
    ctx.env.DB.prepare("CREATE TABLE IF NOT EXISTS espace_fichiers (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER, nom TEXT NOT NULL, mime TEXT DEFAULT '', taille INTEGER DEFAULT 0, drive_id TEXT DEFAULT '', lien TEXT DEFAULT '', cree TEXT)"),
    ctx.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_esp_taches_jour ON espace_taches(jour)"),
    ctx.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_esp_taches_projet ON espace_taches(projet_id)"),
    ctx.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_esp_dossiers_parent ON espace_dossiers(parent_id)"),
    ctx.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_esp_notes_dossier ON espace_notes(dossier_id)"),
    ctx.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_esp_fichiers_dossier ON espace_fichiers(dossier_id)"),
  ]);
  pret = true;
}

async function etat(ctx) {
  const today = jourParis();
  const now = maintenant();
  await dbExec(ctx,
    "UPDATE espace_taches SET jour = ?, reporte = reporte + 1, maj = ? WHERE fait = 0 AND jour <> '' AND jour < ? AND projet_id IS NULL",
    [today, now, today]);
  const [projets, taches, dossiers, notes, fichiers] = await Promise.all([
    dbTous(ctx, "SELECT * FROM espace_projets ORDER BY echeance = '' ASC, echeance ASC, maj DESC LIMIT 500"),
    dbTous(ctx, "SELECT * FROM espace_taches ORDER BY fait ASC, jour ASC, priorite DESC, cree DESC LIMIT 3000"),
    dbTous(ctx, "SELECT * FROM espace_dossiers ORDER BY nom ASC LIMIT 1000"),
    dbTous(ctx, "SELECT * FROM espace_notes ORDER BY maj DESC LIMIT 2000"),
    dbTous(ctx, "SELECT * FROM espace_fichiers ORDER BY cree DESC LIMIT 2000"),
  ]);
  return { ok: true, today, projets, taches, dossiers, notes, fichiers };
}

async function projetCreer(ctx, o) {
  const titre = texte(o.titre, 160);
  if (!titre) throw new Error("titre du projet vide");
  const now = maintenant();
  const r = await dbExec(ctx,
    "INSERT INTO espace_projets (titre, description, statut, echeance, cree, maj) VALUES (?,?,?,?,?,?)",
    [titre, texte(o.description, 5000), texte(o.statut, 20) || "actif", texte(o.echeance, 40), now, now]);
  const id = r.meta && r.meta.last_row_id;
  let dossierId = null;
  try {
    const d = await dbExec(ctx,
      "INSERT INTO espace_dossiers (nom, parent_id, projet_id, drive_id, cree, maj) VALUES (?,?,?,?,?,?)",
      [titre, null, id, "", now, now]);
    dossierId = d.meta && d.meta.last_row_id;
  } catch (e) { /* le projet existe meme sans dossier */ }
  return { id, dossier_id: dossierId };
}

async function projetAction(ctx, o) {
  const op = texte(o.op, 20) || "creer";
  const id = Number(o.id) || 0;
  if (op === "creer") {
    const p = await projetCreer(ctx, o);
    if (Array.isArray(o.etapes)) {
      for (const e of o.etapes.slice(0, 30)) {
        const t = texte(e, 300);
        if (t) await tacheCreer(ctx, { titre: t, projet_id: p.id, jour: "" });
      }
    }
    return { ok: true, ...p };
  }
  if (!id) throw new Error("projet inconnu");
  if (op === "maj") {
    const champs = [];
    const vals = [];
    for (const k of ["titre", "description", "statut", "echeance"]) {
      if (k in o) { champs.push(k + " = ?"); vals.push(texte(o[k], k === "description" ? 5000 : 160)); }
    }
    if (champs.length) {
      vals.push(maintenant(), id);
      await dbExec(ctx, "UPDATE espace_projets SET " + champs.join(", ") + ", maj = ? WHERE id = ?", vals);
      if (o.titre) await dbExec(ctx, "UPDATE espace_dossiers SET nom = ?, maj = ? WHERE projet_id = ?", [texte(o.titre, 160), maintenant(), id]);
    }
    return { ok: true, id };
  }
  if (op === "suppr") {
    await dbExec(ctx, "UPDATE espace_taches SET projet_id = NULL, jour = '' WHERE projet_id = ?", [id]);
    await dbExec(ctx, "UPDATE espace_dossiers SET projet_id = NULL WHERE projet_id = ?", [id]);
    await dbExec(ctx, "DELETE FROM espace_projets WHERE id = ?", [id]);
    return { ok: true, id };
  }
  throw new Error("operation projet inconnue");
}

async function tacheCreer(ctx, o) {
  const titre = texte(o.titre, 300);
  if (!titre) throw new Error("titre vide");
  let projetId = Number(o.projet_id) || null;
  const projetNom = texte(o.projet, 160);
  if (!projetId && projetNom) {
    const p = await dbUn(ctx, "SELECT id FROM espace_projets WHERE lower(titre) = lower(?) LIMIT 1", [projetNom]);
    if (p) projetId = p.id;
    else {
      const c = await projetCreer(ctx, { titre: projetNom });
      projetId = c.id;
    }
  }
  if (projetId) {
    const p = await dbUn(ctx, "SELECT id FROM espace_projets WHERE id = ?", [projetId]);
    if (!p) projetId = null;
  }
  const jour = o.jour === undefined ? jourParis() : normaliserJour(o.jour);
  const now = maintenant();
  const r = await dbExec(ctx,
    "INSERT INTO espace_taches (titre, notes, jour, projet_id, echeance, priorite, fait, reporte, rappel, rappel_envoye, cree, maj) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [titre, texte(o.notes, 5000), jour, projetId, texte(o.echeance, 40), Number(o.priorite) || 0, 0, 0, texte(o.rappel, 40), 0, now, now]);
  return { id: r.meta && r.meta.last_row_id, jour, projet_id: projetId };
}

async function tacheAction(ctx, o) {
  const op = texte(o.op, 20) || "creer";
  if (op === "creer") return { ok: true, ...(await tacheCreer(ctx, o)) };
  const id = Number(o.id) || 0;
  if (!id) throw new Error("tache inconnue");
  if (op === "maj") {
    const champs = [];
    const vals = [];
    const simples = { titre: 300, notes: 5000, echeance: 40, rappel: 40 };
    for (const k of Object.keys(simples)) {
      if (k in o) { champs.push(k + " = ?"); vals.push(texte(o[k], simples[k])); }
    }
    if ("jour" in o) { champs.push("jour = ?"); vals.push(normaliserJour(o.jour)); }
    if ("fait" in o) { champs.push("fait = ?"); vals.push(o.fait ? 1 : 0); }
    if ("priorite" in o) { champs.push("priorite = ?"); vals.push(Number(o.priorite) || 0); }
    if ("projet_id" in o) {
      const pid = Number(o.projet_id) || null;
      champs.push("projet_id = ?"); vals.push(pid);
    }
    if ("rappel" in o) { champs.push("rappel_envoye = 0"); }
    if (!champs.length) return { ok: true, id };
    vals.push(maintenant(), id);
    await dbExec(ctx, "UPDATE espace_taches SET " + champs.join(", ") + ", maj = ? WHERE id = ?", vals);
    return { ok: true, id };
  }
  if (op === "fait") {
    await dbExec(ctx, "UPDATE espace_taches SET fait = ?, maj = ? WHERE id = ?", [o.fait ? 1 : 0, maintenant(), id]);
    return { ok: true, id };
  }
  if (op === "suppr") {
    await dbExec(ctx, "DELETE FROM espace_taches WHERE id = ?", [id]);
    return { ok: true, id };
  }
  throw new Error("operation tache inconnue");
}

async function dossierCreer(ctx, o) {
  const nom = texte(o.nom, 160);
  if (!nom) throw new Error("nom du dossier vide");
  let parent = Number(o.parent_id) || null;
  if (parent) {
    const p = await dbUn(ctx, "SELECT id FROM espace_dossiers WHERE id = ?", [parent]);
    if (!p) parent = null;
  }
  const now = maintenant();
  const r = await dbExec(ctx,
    "INSERT INTO espace_dossiers (nom, parent_id, projet_id, drive_id, cree, maj) VALUES (?,?,?,?,?,?)",
    [nom, parent, Number(o.projet_id) || null, "", now, now]);
  return { id: r.meta && r.meta.last_row_id, parent_id: parent };
}

async function dossierSupprimer(ctx, id) {
  const enfants = await dbTous(ctx, "SELECT id FROM espace_dossiers WHERE parent_id = ?", [id]);
  for (const e of enfants) await dossierSupprimer(ctx, e.id);
  await dbExec(ctx, "DELETE FROM espace_notes WHERE dossier_id = ?", [id]);
  await dbExec(ctx, "DELETE FROM espace_fichiers WHERE dossier_id = ?", [id]);
  await dbExec(ctx, "DELETE FROM espace_dossiers WHERE id = ?", [id]);
}

async function dossierAction(ctx, o) {
  const op = texte(o.op, 20) || "creer";
  if (op === "creer") return { ok: true, ...(await dossierCreer(ctx, o)) };
  const id = Number(o.id) || 0;
  if (!id) throw new Error("dossier inconnu");
  if (op === "maj") {
    const champs = [];
    const vals = [];
    if ("nom" in o) { champs.push("nom = ?"); vals.push(texte(o.nom, 160)); }
    if ("parent_id" in o) { champs.push("parent_id = ?"); vals.push(Number(o.parent_id) || null); }
    if (champs.length) {
      vals.push(maintenant(), id);
      await dbExec(ctx, "UPDATE espace_dossiers SET " + champs.join(", ") + ", maj = ? WHERE id = ?", vals);
    }
    return { ok: true, id };
  }
  if (op === "suppr") {
    await dossierSupprimer(ctx, id);
    return { ok: true, id };
  }
  throw new Error("operation dossier inconnue");
}

async function noteAction(ctx, o) {
  const op = texte(o.op, 20) || "creer";
  const id = Number(o.id) || 0;
  if (op === "creer") {
    const contenu = texte(o.contenu, 100000);
    const titre = texte(o.titre, 200) || "Note";
    let dossier = Number(o.dossier_id) || null;
    if (dossier) {
      const d = await dbUn(ctx, "SELECT id FROM espace_dossiers WHERE id = ?", [dossier]);
      if (!d) dossier = null;
    }
    const now = maintenant();
    const r = await dbExec(ctx,
      "INSERT INTO espace_notes (dossier_id, titre, contenu, cree, maj) VALUES (?,?,?,?,?)",
      [dossier, titre, contenu, now, now]);
    return { ok: true, id: r.meta && r.meta.last_row_id };
  }
  if (!id) throw new Error("note inconnue");
  if (op === "maj") {
    const champs = [];
    const vals = [];
    if ("titre" in o) { champs.push("titre = ?"); vals.push(texte(o.titre, 200) || "Note"); }
    if ("contenu" in o) { champs.push("contenu = ?"); vals.push(texte(o.contenu, 100000)); }
    if ("dossier_id" in o) { champs.push("dossier_id = ?"); vals.push(Number(o.dossier_id) || null); }
    if (champs.length) {
      vals.push(maintenant(), id);
      await dbExec(ctx, "UPDATE espace_notes SET " + champs.join(", ") + ", maj = ? WHERE id = ?", vals);
    }
    return { ok: true, id };
  }
  if (op === "suppr") {
    await dbExec(ctx, "DELETE FROM espace_notes WHERE id = ?", [id]);
    return { ok: true, id };
  }
  throw new Error("operation note inconnue");
}

function octetsBase64(s) {
  const propre = String(s || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!propre) throw new Error("fichier vide");
  const bin = atob(propre);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function driveCreerDossier(tok, nom, parent) {
  const meta = { name: nom, mimeType: "application/vnd.google-apps.folder" };
  if (parent) meta.parents = [parent];
  const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Drive dossier " + r.status + " " + JSON.stringify(d).slice(0, 120));
  return d;
}

async function driveDossierPour(ctx, tok, id, vus) {
  if (!id) return "";
  const v = vus || new Set();
  if (v.has(id)) return "";
  v.add(id);
  const d = await dbUn(ctx, "SELECT * FROM espace_dossiers WHERE id = ?", [id]);
  if (!d) return "";
  if (d.drive_id) return d.drive_id;
  const parent = d.parent_id ? await driveDossierPour(ctx, tok, d.parent_id, v) : "";
  const cree = await driveCreerDossier(tok, d.nom, parent);
  await dbExec(ctx, "UPDATE espace_dossiers SET drive_id = ?, maj = ? WHERE id = ?", [cree.id, maintenant(), id]);
  return cree.id;
}

async function driveTeleverser(tok, o) {
  const frontiere = "----jarvis" + Date.now() + Math.random().toString(36).slice(2);
  const meta = { name: o.nom || "fichier", mimeType: o.mime || "application/octet-stream" };
  if (o.parent) meta.parents = [o.parent];
  const entete = "--" + frontiere + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
    + JSON.stringify(meta)
    + "\r\n--" + frontiere + "\r\nContent-Type: " + (o.mime || "application/octet-stream") + "\r\n\r\n";
  const fin = "\r\n--" + frontiere + "--";
  const e = new TextEncoder();
  const debut = e.encode(entete);
  const queue = e.encode(fin);
  const corps = new Uint8Array(debut.length + o.octets.length + queue.length);
  corps.set(debut, 0);
  corps.set(o.octets, debut.length);
  corps.set(queue, debut.length + o.octets.length);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,size", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + tok,
      "Content-Type": "multipart/related; boundary=" + frontiere,
    },
    body: corps,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Drive envoi " + r.status + " " + JSON.stringify(d).slice(0, 140));
  return d;
}

async function fichierAction(ctx, o) {
  const op = texte(o.op, 20) || "creer";
  const id = Number(o.id) || 0;
  if (op === "suppr") {
    if (!id) throw new Error("fichier inconnu");
    const f = await dbUn(ctx, "SELECT * FROM espace_fichiers WHERE id = ?", [id]);
    if (f && f.drive_id) {
      try {
        const tok = await ctx.jetonGoogle(ctx.env);
        if (tok) {
          await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(f.drive_id), {
            method: "PATCH",
            headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ trashed: true }),
          });
        }
      } catch (e) { /* le fichier reste dans Drive */ }
    }
    await dbExec(ctx, "DELETE FROM espace_fichiers WHERE id = ?", [id]);
    return { ok: true, id };
  }
  if (op !== "creer") throw new Error("operation fichier inconnue");
  const octets = octetsBase64(o.data);
  if (octets.length > 10 * 1024 * 1024) throw new Error("fichier trop gros (10 Mo max)");
  const nom = texte(o.nom, 240) || "fichier";
  const mime = texte(o.mime, 120) || "application/octet-stream";
  const dossierId = Number(o.dossier_id) || null;
  const tok = await ctx.jetonGoogle(ctx.env);
  if (!tok) throw new Error("Google Drive non connecte");
  const parent = dossierId ? await driveDossierPour(ctx, tok, dossierId) : "";
  const d = await driveTeleverser(tok, { nom, mime, octets, parent });
  const lien = d.webViewLink || ("https://drive.google.com/file/d/" + d.id + "/view");
  const r = await dbExec(ctx,
    "INSERT INTO espace_fichiers (dossier_id, nom, mime, taille, drive_id, lien, cree) VALUES (?,?,?,?,?,?,?)",
    [dossierId, d.name || nom, mime, octets.length, d.id, lien, maintenant()]);
  return { ok: true, id: r.meta && r.meta.last_row_id, lien };
}

async function agendaLire(ctx, o) {
  const debut = texte(o.debut, 50) || new Date().toISOString();
  const fin = texte(o.fin, 50) || new Date(Date.now() + 7 * 86400000).toISOString();
  const comptes = [];
  const p = await ctx.jetonGoogle(ctx.env);
  if (p) comptes.push(["perso", p]);
  const e = await ctx.jetonGoogle2(ctx.env);
  if (e) comptes.push(["ecole", e]);
  const etatComptes = { perso: !!p, ecole: !!e };
  const evenements = [];
  const erreurs = [];
  await Promise.all(comptes.map(async (paire) => {
    const compte = paire[0];
    const tok = paire[1];
    const u = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
      + "?singleEvents=true&orderBy=startTime&maxResults=250"
      + "&timeMin=" + encodeURIComponent(debut) + "&timeMax=" + encodeURIComponent(fin);
    try {
      const r = await fetch(u, { headers: { Authorization: "Bearer " + tok } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { erreurs.push(compte + " " + r.status); return; }
      for (const it of (d.items || [])) {
        const debutIt = (it.start && (it.start.dateTime || it.start.date)) || "";
        const finIt = (it.end && (it.end.dateTime || it.end.date)) || "";
        evenements.push({
          id: it.id,
          compte,
          titre: it.summary || "(sans titre)",
          debut: debutIt,
          fin: finIt,
          journee: !!(it.start && it.start.date),
          lieu: it.location || "",
          description: it.description || "",
          lien: it.htmlLink || "",
        });
      }
    } catch (err) {
      erreurs.push(compte + " " + String((err && err.message) || err).slice(0, 80));
    }
  }));
  evenements.sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  return { ok: true, evenements, erreurs, comptes: etatComptes };
}

async function evenementAction(ctx, o) {
  const compte = o.compte === "ecole" ? "ecole" : "perso";
  const tok = compte === "ecole" ? await ctx.jetonGoogle2(ctx.env) : await ctx.jetonGoogle(ctx.env);
  if (!tok) throw new Error("compte " + compte + " non connecte");
  const op = texte(o.op, 20) || "creer";
  if (op === "suppr") {
    const id = texte(o.id, 200);
    if (!id) throw new Error("evenement inconnu");
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + tok },
    });
    if (!r.ok && r.status !== 204 && r.status !== 404) throw new Error("suppression agenda " + r.status);
    return { ok: true };
  }
  if (op === "maj" && !texte(o.id, 200)) throw new Error("evenement inconnu");
  const titre = texte(o.titre, 200) || "Rendez-vous";
  const corps = { summary: titre, location: texte(o.lieu, 200) || undefined, description: texte(o.notes, 3000) || undefined };
  if (o.journee) {
    const d = texte(o.debut, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("date invalide");
    const lendemain = new Date(d + "T12:00:00");
    lendemain.setDate(lendemain.getDate() + 1);
    corps.start = { date: d };
    corps.end = { date: texte(o.fin, 10) || lendemain.toISOString().slice(0, 10) };
  } else {
    const d = new Date(o.debut);
    const f = new Date(o.fin || (d.getTime() + 3600000));
    if (isNaN(d.getTime()) || isNaN(f.getTime())) throw new Error("date invalide");
    corps.start = { dateTime: d.toISOString(), timeZone: "Europe/Paris" };
    corps.end = { dateTime: f.toISOString(), timeZone: "Europe/Paris" };
  }
  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    + (op === "maj" ? "/" + encodeURIComponent(texte(o.id, 200)) : "");
  const r = await fetch(url, {
    method: op === "maj" ? "PATCH" : "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("agenda " + r.status + " " + JSON.stringify(d).slice(0, 140));
  return { ok: true, id: d.id, lien: d.htmlLink || "" };
}

async function exporter(ctx) {
  const data = {};
  for (const t of Object.keys(TABLES)) data[t] = await dbTous(ctx, "SELECT * FROM " + t + " LIMIT 10000");
  return { ok: true, version: 1, exporte: maintenant(), data };
}

async function importer(ctx, o) {
  const data = o.data;
  if (!data || typeof data !== "object") throw new Error("sauvegarde illisible");
  const ordre = ["espace_projets", "espace_dossiers", "espace_taches", "espace_notes", "espace_fichiers"];
  const compte = {};
  for (const t of ordre) {
    await dbExec(ctx, "DELETE FROM " + t);
    compte[t] = 0;
  }
  for (const t of ordre) {
    const rows = Array.isArray(data[t]) ? data[t] : [];
    const cols = TABLES[t];
    for (const row of rows.slice(0, 10000)) {
      const vals = cols.map((c) => {
        const v = row[c];
        if (v === undefined || v === null) return null;
        if (c === "fait" || c === "priorite" || c === "reporte" || c === "rappel_envoye" || c === "taille" || c.endsWith("_id") || c === "id") {
          const n = Number(v);
          return isFinite(n) ? n : null;
        }
        return String(v);
      });
      const marques = cols.map(() => "?").join(",");
      await dbExec(ctx, "INSERT INTO " + t + " (" + cols.join(",") + ") VALUES (" + marques + ")", vals);
      compte[t]++;
    }
  }
  return { ok: true, compte };
}

async function rappels(ctx) {
  const now = maintenant();
  const rows = await dbTous(ctx,
    "SELECT * FROM espace_taches WHERE fait = 0 AND rappel <> '' AND rappel <= ? AND rappel_envoye = 0 ORDER BY rappel ASC LIMIT 5",
    [now]);
  for (const t of rows) {
    const msg = "⏰ " + t.titre + (t.notes ? "\n" + String(t.notes).slice(0, 300) : "");
    let envoye = false;
    try {
      const r = await ctx.envoyerTelegram(ctx.env, msg);
      envoye = String(r || "").indexOf("envoye") >= 0;
    } catch (e) { envoye = false; }
    if (envoye) {
      await dbExec(ctx, "UPDATE espace_taches SET rappel_envoye = 1 WHERE id = ?", [t.id]);
    }
  }
  return { ok: true, rappels: rows };
}

async function googleTaches(ctx) {
  const tok = await ctx.jetonGoogle(ctx.env);
  if (!tok) throw new Error("Google non connecte");
  const r = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=100", {
    headers: { Authorization: "Bearer " + tok },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google Tasks " + r.status);
  let n = 0;
  for (const t of (d.items || [])) {
    const titre = texte(t.title, 300);
    if (!titre) continue;
    const deja = await dbUn(ctx, "SELECT id FROM espace_taches WHERE lower(titre) = lower(?) LIMIT 1", [titre]);
    if (deja) continue;
    await tacheCreer(ctx, {
      titre,
      notes: "Importe de Google Tasks",
      jour: "",
      echeance: t.due ? jourParis(t.due) : "",
    });
    n++;
  }
  return { ok: true, importees: n };
}

async function dossierParNom(ctx, nom) {
  const n = texte(nom, 160);
  if (!n) return null;
  const d = await dbUn(ctx, "SELECT * FROM espace_dossiers WHERE lower(nom) = lower(?) AND parent_id IS NULL LIMIT 1", [n]);
  if (d) return d;
  const c = await dossierCreer(ctx, { nom: n });
  return await dbUn(ctx, "SELECT * FROM espace_dossiers WHERE id = ?", [c.id]);
}

async function outilTache(ctx, a) {
  const c = await tacheCreer(ctx, {
    titre: a.titre,
    notes: a.notes,
    jour: a.jour === undefined ? "aujourd'hui" : a.jour,
    projet: a.projet,
    echeance: a.echeance,
    priorite: a.priorite,
  });
  const projet = c.projet_id ? await dbUn(ctx, "SELECT titre FROM espace_projets WHERE id = ?", [c.projet_id]) : null;
  return "Tache ajoutee" + (c.jour ? " pour " + c.jour : " dans la liste generale")
    + " : " + texte(a.titre, 300) + (projet ? " (projet " + projet.titre + ")" : "") + ".";
}

async function outilNote(ctx, a) {
  const dossier = await dossierParNom(ctx, a.dossier);
  const note = await noteAction(ctx, {
    op: "creer",
    dossier_id: dossier && dossier.id,
    titre: a.titre || "Note " + jourParis(),
    contenu: a.contenu,
  });
  return "Note enregistree dans le dossier " + (dossier ? dossier.nom : "la racine") + ".";
}

async function outilProjet(ctx, a) {
  const p = await projetCreer(ctx, { titre: a.titre, description: a.description, echeance: a.echeance });
  if (Array.isArray(a.etapes)) {
    for (const e of a.etapes.slice(0, 20)) {
      if (texte(e, 300)) await tacheCreer(ctx, { titre: e, projet_id: p.id, jour: "" });
    }
  }
  return "Projet cree : " + texte(a.titre, 160) + " (dossier et suivi ouverts dans l'espace).";
}

async function outilLister(ctx, a) {
  const quoi = texte(a.quoi, 20) || "tout";
  const today = jourParis();
  const lignes = [];
  if (quoi === "jour" || quoi === "tout") {
    const t = await dbTous(ctx, "SELECT titre, fait, priorite FROM espace_taches WHERE jour = ? ORDER BY fait ASC, priorite DESC, id ASC LIMIT 40", [today]);
    lignes.push("Taches du jour (" + today + ") :");
    lignes.push(t.length ? t.map((x) => "- [" + (x.fait ? "x" : " ") + "] " + x.titre).join("\n") : "- aucune");
  }
  if (quoi === "projets" || quoi === "tout") {
    const p = await dbTous(ctx, "SELECT titre, echeance FROM espace_projets WHERE statut <> 'termine' ORDER BY echeance = '' ASC, echeance ASC LIMIT 30");
    lignes.push("Projets :");
    lignes.push(p.length ? p.map((x) => "- " + x.titre + (x.echeance ? " (echeance " + x.echeance + ")" : "")).join("\n") : "- aucun");
  }
  if (quoi === "dossiers" || quoi === "tout") {
    const d = await dbTous(ctx, "SELECT nom FROM espace_dossiers WHERE parent_id IS NULL ORDER BY nom LIMIT 50");
    lignes.push("Dossiers :");
    lignes.push(d.length ? d.map((x) => "- " + x.nom).join("\n") : "- aucun");
  }
  return lignes.join("\n");
}

async function outilDossier(ctx, a) {
  let parent = null;
  if (a.parent) {
    const p = await dossierParNom(ctx, a.parent);
    parent = p && p.id;
  }
  const d = await dossierCreer(ctx, { nom: a.nom, parent_id: parent });
  return "Dossier cree : " + texte(a.nom, 160) + (parent ? " dans " + texte(a.parent, 160) : "") + ".";
}

export async function espaceExecuter(ctx, nom, args) {
  try {
    await espacePreparer(ctx);
    const a = args || {};
    if (nom === "espace_tache") return await outilTache(ctx, a);
    if (nom === "espace_note") return await outilNote(ctx, a);
    if (nom === "espace_projet") return await outilProjet(ctx, a);
    if (nom === "espace_lister") return await outilLister(ctx, a);
    if (nom === "espace_dossier") return await outilDossier(ctx, a);
    return "outil espace inconnu : " + nom;
  } catch (e) {
    return "erreur espace : " + String((e && e.message) || e);
  }
}

export async function espaceAction(ctx, o) {
  await espacePreparer(ctx);
  const action = texte(o.action, 40) || "etat";
  if (action === "etat") return await etat(ctx);
  if (action === "tache") return await tacheAction(ctx, o);
  if (action === "projet") return await projetAction(ctx, o);
  if (action === "dossier") return await dossierAction(ctx, o);
  if (action === "note") return await noteAction(ctx, o);
  if (action === "fichier") return await fichierAction(ctx, o);
  if (action === "agenda") return await agendaLire(ctx, o);
  if (action === "evenement") return await evenementAction(ctx, o);
  if (action === "export") return await exporter(ctx);
  if (action === "import") return await importer(ctx, o);
  if (action === "rappels") return await rappels(ctx);
  if (action === "google_taches") return await googleTaches(ctx);
  throw new Error("action espace inconnue : " + action);
}
