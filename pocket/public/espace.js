/* ===== ESPACE PERSONNEL — interface ===== */
(function () {
  "use strict";

  const racine = document.getElementById("espace");
  if (!racine) return;
  const $ = (id) => document.getElementById(id);
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  const S = {
    ouvert: false, charge: false, chargement: false,
    vue: "aujourdhui", vuePrecedente: "aujourdhui", derniereVue: "",
    data: { today: "", projets: [], taches: [], dossiers: [], notes: [], fichiers: [] },
    semaine: lundiDe(new Date()), agenda: [], agendaCle: "", agendaCharge: false, agendaErreurs: [], agendaComptes: {},
    filtre: "jour", projet: null, dossier: null, requete: "", haut: true,
    vus: new Set(), envoi: 0,
  };

  /* ---------- dates et petits outils ---------- */
  function lundiDe(d) {
    const x = new Date(d || new Date());
    x.setHours(12, 0, 0, 0);
    const j = x.getDay();
    x.setDate(x.getDate() - ((j + 6) % 7));
    return x;
  }
  function ajoutJours(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function dateDepuisJour(j) {
    if (j instanceof Date) return j;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(j || ""))) return new Date(j + "T12:00:00");
    return new Date(j);
  }
  function isoJour(d) {
    const x = d instanceof Date ? d : dateDepuisJour(d);
    if (!x || isNaN(x.getTime())) return "";
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function aujourdhui() { return isoJour(new Date()); }
  function demain() { return isoJour(ajoutJours(new Date(), 1)); }
  function e(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function attr(v) { return e(v); }
  function court(v, n) {
    const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function mdEspace(v) {
    try { if (typeof md === "function") return md(String(v || "")); } catch (err) { /* repli */ }
    return e(v).replace(/\n/g, "<br>");
  }
  function dateLongue(j) {
    const d = dateDepuisJour(j);
    if (!d || isNaN(d.getTime())) return "";
    return JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
  }
  function formatJour(j) {
    const today = S.data.today || aujourdhui();
    if (!j) return "";
    if (j === today) return "Aujourd'hui";
    if (j === demain()) return "Demain";
    const d = dateDepuisJour(j);
    if (isNaN(d.getTime())) return j;
    return JOURS_COURTS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()];
  }
  function formatHeure(v) {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return "journée";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function valeurDateHeure(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return isoJour(d) + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function isoDepuisLocal(v) {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  function taille(n) {
    const x = Number(n) || 0;
    if (x < 1024) return x + " o";
    if (x < 1024 * 1024) return Math.round(x / 1024) + " Ko";
    return (x / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mo";
  }
  function iconeFichier(nom, mime) {
    const m = String(mime || "");
    const n = String(nom || "").toLowerCase();
    if (m.indexOf("image") === 0) return "▧";
    if (m.indexOf("pdf") >= 0 || n.endsWith(".pdf")) return "▤";
    if (m.indexOf("word") >= 0 || n.endsWith(".docx") || n.endsWith(".doc")) return "▥";
    if (m.indexOf("sheet") >= 0 || n.endsWith(".xlsx") || n.endsWith(".csv")) return "▦";
    return "▦";
  }

  /* ---------- accès données ---------- */
  async function api(action, data) {
    const r = await fetch("/espace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action }, data || {})),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.erreur) throw new Error(d.erreur || ("erreur " + r.status));
    return d;
  }

  let minuteurToast = null;
  function dire(msg, duree) {
    const t = $("esp-toast");
    if (!t) return;
    t.textContent = String(msg || "");
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.hidden = true; }, duree || 3000);
  }

  function taches() { return S.data.taches || []; }
  function projets() { return S.data.projets || []; }
  function dossiers() { return S.data.dossiers || []; }
  function notes() { return S.data.notes || []; }
  function fichiers() { return S.data.fichiers || []; }
  function projetDe(id) { return projets().find((p) => Number(p.id) === Number(id)) || null; }
  function dossierDe(id) { return dossiers().find((d) => Number(d.id) === Number(id)) || null; }
  function noteDe(id) { return notes().find((n) => Number(n.id) === Number(id)) || null; }
  function progression(p) {
    const etapes = taches().filter((t) => Number(t.projet_id) === Number(p.id));
    const faites = etapes.filter((t) => t.fait).length;
    return { faites, total: etapes.length, pct: etapes.length ? Math.round((faites / etapes.length) * 100) : 0 };
  }
  function enfantsDossier(id) {
    const cible = id === null || id === undefined ? null : Number(id);
    return {
      dossiers: dossiers().filter((d) => (d.parent_id == null ? null : Number(d.parent_id)) === cible),
      notes: notes().filter((n) => (n.dossier_id == null ? null : Number(n.dossier_id)) === cible),
      fichiers: fichiers().filter((f) => (f.dossier_id == null ? null : Number(f.dossier_id)) === cible),
    };
  }
  function jourEvenement(ev) {
    if (!ev || !ev.debut) return "";
    if (ev.journee) return String(ev.debut).slice(0, 10);
    return isoJour(new Date(ev.debut));
  }
  function evenementsJour(jour) {
    return S.agenda
      .filter((ev) => jourEvenement(ev) === jour)
      .sort((a, b) => (b.journee ? 1 : 0) - (a.journee ? 1 : 0) || String(a.debut).localeCompare(String(b.debut)));
  }
  function cheminDossier(id) {
    const arr = [];
    let d = dossierDe(id);
    let garde = 0;
    while (d && garde < 30) { arr.unshift(d); d = d.parent_id ? dossierDe(d.parent_id) : null; garde++; }
    return arr;
  }

  /* ---------- chargement ---------- */
  async function charger(silencieux) {
    if (!silencieux) { S.chargement = true; rendre(); }
    try {
      const d = await api("etat");
      S.data = Object.assign({ today: "", projets: [], taches: [], dossiers: [], notes: [], fichiers: [] }, d);
      S.charge = true;
    } catch (err) {
      dire("Espace indisponible : " + err.message, 5000);
    } finally {
      S.chargement = false;
      rendre();
    }
  }

  async function chargerAgenda(force) {
    const cle = isoJour(S.semaine);
    if (!force && S.agendaCle === cle) return;
    S.agendaCle = cle;
    S.agendaCharge = true;
    rendre();
    const debut = new Date(S.semaine);
    debut.setHours(0, 0, 0, 0);
    const fin = ajoutJours(debut, 7);
    try {
      const d = await api("agenda", { debut: debut.toISOString(), fin: fin.toISOString() });
      if (S.agendaCle !== cle) return;
      S.agenda = d.evenements || [];
      S.agendaErreurs = d.erreurs || [];
      S.agendaComptes = d.comptes || {};
    } catch (err) {
      S.agenda = [];
      S.agendaErreurs = [err.message];
    } finally {
      S.agendaCharge = false;
      rendre();
    }
  }

  /* ---------- ouverture / fermeture ---------- */
  function ouvrir() {
    racine.hidden = false;
    S.ouvert = true;
    S.vue = "aujourdhui";
    S.vuePrecedente = "aujourdhui";
    S.projet = null;
    S.dossier = null;
    S.requete = "";
    S.haut = true;
    S.semaine = lundiDe(new Date());
    const rech = $("esp-recherche");
    if (rech) rech.value = "";
    document.body.classList.add("espace-ouvert");
    rendre();
    if (!S.charge) charger();
    if (S.agendaCle !== isoJour(S.semaine)) chargerAgenda(true);
    demarrerRappels();
    verifierRappels();
  }
  function fermer() {
    racine.hidden = true;
    S.ouvert = false;
    document.body.classList.remove("espace-ouvert");
    fermerModale();
  }

  /* ---------- rendu ---------- */
  function rendre() {
    if (!S.ouvert) return;
    const app = $("esp-app");
    const vue = $("esp-vue");
    if (!app || !vue) return;

    racine.querySelectorAll(".esp-nav [data-vue]").forEach((b) => {
      b.classList.toggle("actif", b.dataset.vue === S.vue);
    });
    const today = S.data.today || aujourdhui();
    const duJour = taches().filter((t) => t.jour === today);
    const enCours = taches().filter((t) => !t.fait);
    const projetsActifs = projets().filter((p) => p.statut !== "termine");
    const cpt = (id, n) => { const el = $(id); if (el) el.textContent = n ? String(n) : ""; };
    cpt("esp-cpt-jour", duJour.filter((t) => !t.fait).length);
    cpt("esp-cpt-taches", enCours.length);
    cpt("esp-cpt-projets", projetsActifs.length);
    cpt("esp-cpt-dossiers", dossiers().filter((d) => d.parent_id == null).length);

    const titre = titreVue();
    const sous = sousTitreVue();
    const h1 = $("esp-titre");
    const p = $("esp-sous-titre");
    if (h1) h1.textContent = titre;
    if (p) p.textContent = sous;

    if (S.chargement && !S.charge) {
      vue.innerHTML = vide("Chargement de l'espace…", "Tes tâches, projets et dossiers arrivent.");
      return;
    }

    const changee = S.derniereVue !== S.vue;
    S.derniereVue = S.vue;
    const y = changee || S.haut ? 0 : vue.scrollTop;
    S.haut = false;

    if (S.vue === "aujourdhui") vue.innerHTML = vueAujourdhui();
    else if (S.vue === "calendrier") vue.innerHTML = vueCalendrier();
    else if (S.vue === "taches") vue.innerHTML = vueTaches();
    else if (S.vue === "projets") vue.innerHTML = S.projet ? vueProjetDetail() : vueProjets();
    else if (S.vue === "dossiers") vue.innerHTML = vueDossiers();
    else if (S.vue === "reglages") vue.innerHTML = vueReglages();
    else if (S.vue === "recherche") vue.innerHTML = vueRecherche();
    else vue.innerHTML = vueAujourdhui();
    vue.scrollTop = y;
  }

  function titreVue() {
    if (S.vue === "aujourdhui") return "Aujourd'hui";
    if (S.vue === "calendrier") return "Calendrier";
    if (S.vue === "taches") return "Tâches";
    if (S.vue === "projets") return S.projet && projetDe(S.projet) ? projetDe(S.projet).titre : "Projets";
    if (S.vue === "dossiers") return S.dossier && dossierDe(S.dossier) ? dossierDe(S.dossier).nom : "Dossiers";
    if (S.vue === "reglages") return "Réglages";
    if (S.vue === "recherche") return "Recherche";
    return "Espace";
  }
  function sousTitreVue() {
    if (S.chargement && !S.charge) return "chargement…";
    if (S.vue === "aujourdhui") return dateLongue(S.data.today || aujourdhui());
    if (S.vue === "calendrier") {
      const fin = ajoutJours(S.semaine, 6);
      return "semaine du " + S.semaine.getDate() + " " + MOIS[S.semaine.getMonth()] + " au " + fin.getDate() + " " + MOIS[fin.getMonth()] + " " + fin.getFullYear();
    }
    if (S.vue === "taches") return taches().filter((t) => !t.fait).length + " tâche(s) ouverte(s)";
    if (S.vue === "projets") return projets().filter((p) => p.statut !== "termine").length + " projet(s) en cours";
    if (S.vue === "dossiers") return "notes, fichiers et sous-dossiers";
    if (S.vue === "reglages") return "sauvegarde, rappels et connexions";
    if (S.vue === "recherche") return S.requete ? "pour « " + S.requete + " »" : "tape au moins deux lettres";
    return "";
  }
  function vide(titre, texte) {
    return '<div class="esp-vide"><b>' + e(titre) + "</b>" + e(texte || "") + "</div>";
  }

  /* ---------- aujourd'hui ---------- */
  function vueAujourdhui() {
    const today = S.data.today || aujourdhui();
    const duJour = taches().filter((t) => t.jour === today);
    const faites = duJour.filter((t) => t.fait).length;
    const evs = evenementsJour(today);
    const enRetard = taches().filter((t) => !t.fait && t.jour && t.jour < today && t.projet_id);
    const actifs = projets().filter((p) => p.statut !== "termine").slice(0, 5);
    return '<div class="esp-grille">'
      + '<div class="esp-colonne">'
      + '<section class="esp-carte">'
      + '<div class="esp-carte-tete"><h2>Ma journée</h2><span class="esp-sous-total">' + faites + " / " + duJour.length + "</span></div>"
      + '<div class="esp-ajout-ligne"><input id="esp-nouvelle-tache" maxlength="300" placeholder="Ajouter une tâche pour aujourd\'hui…" autocomplete="off" /><button class="esp-bouton principal" data-action="ajout-tache-jour" type="button">Ajouter</button></div>'
      + '<div class="esp-liste">' + (duJour.length ? duJour.map((t) => tacheHtml(t, { montrerJour: false })).join("") : vide("Rien pour aujourd'hui", "Écris une tâche ci-dessus, ou dis à JARVIS « ajoute une tâche… ».")) + "</div>"
      + "</section>"
      + (enRetard.length ? '<section class="esp-carte"><div class="esp-carte-tete"><h2>En retard</h2><span class="esp-sous-total">' + enRetard.length + "</span></div><div class=\"esp-liste\">" + enRetard.map((t) => tacheHtml(t, { montrerJour: true })).join("") + "</div></section>" : "")
      + '<section class="esp-carte">'
      + '<div class="esp-carte-tete"><h2>Projets en cours</h2><button class="esp-mini-icone" data-action="nouveau-projet" type="button" title="nouveau projet">＋</button></div>'
      + (actifs.length ? '<div class="esp-liste">' + actifs.map(projetLigne).join("") + "</div>" : vide("Aucun projet", "Crée un projet pour suivre une démarche, un achat ou un entraînement."))
      + "</section>"
      + "</div>"
      + '<div class="esp-colonne">'
      + '<section class="esp-carte">'
      + '<div class="esp-carte-tete"><h2>Agenda</h2><span class="esp-sous-total">' + (S.agendaCharge ? "…" : evs.length + " événement(s)") + "</span></div>"
      + (evs.length ? '<div class="esp-agenda-liste">' + evs.map((ev) => agendaLigne(ev)).join("") + "</div>" : vide("Agenda libre", "Aucun événement aujourd'hui sur les deux agendas."))
      + '<div class="esp-modale-pied"><button class="esp-bouton" type="button" data-action="ouvrir-calendrier">Voir la semaine</button><button class="esp-bouton" type="button" data-action="cal-event">＋ Événement</button></div>'
      + "</section>"
      + '<section class="esp-carte"><div class="esp-carte-tete"><h2>Raccourcis</h2></div>'
      + '<div class="esp-liste">'
      + '<button class="esp-resultat" type="button" data-action="nouvelle-note"><span class="esp-r-ico">▤</span><span><b>Nouvelle note</b><small>un carnet, une idée, une recette</small></span></button>'
      + '<button class="esp-resultat" type="button" data-action="nouveau-dossier"><span class="esp-r-ico">▦</span><span><b>Nouveau dossier</b><small>achat, sport, administration…</small></span></button>'
      + '<button class="esp-resultat" type="button" data-action="ouvrir-taches"><span class="esp-r-ico">✓</span><span><b>Toutes les tâches</b><small>en retard, à venir, sans date</small></span></button>'
      + "</div></section>"
      + "</div></div>";
  }

  function projetLigne(p) {
    const pr = progression(p);
    return '<button class="esp-resultat" type="button" data-action="projet-ouvrir" data-id="' + p.id + '">'
      + '<span class="esp-r-ico">◇</span><span style="flex:1;min-width:0"><b>' + e(p.titre) + "</b>"
      + '<small>' + pr.faites + "/" + pr.total + " étape(s)" + (p.echeance ? " · " + e(formatJour(p.echeance)) : "") + "</small>"
      + '<span class="esp-jauge bleu" style="display:block;margin-top:6px"><i style="width:' + pr.pct + '%"></i></span></span></button>';
  }

  function agendaLigne(ev) {
    const h = ev.journee ? "journée" : formatHeure(ev.debut);
    return '<button class="esp-agenda-item esp-agenda-bouton" type="button" data-action="evenement-editer" data-id="' + attr(ev.id) + '" data-compte="' + attr(ev.compte) + '">'
      + '<span class="esp-agenda-heure">' + e(h) + "</span>"
      + '<span class="esp-agenda-corps"><span class="esp-agenda-titre"><i class="esp-point ' + (ev.compte === "ecole" ? "ecole" : "") + '"></i>' + e(ev.titre) + "</span>"
      + (ev.lieu ? '<span class="esp-agenda-sous">' + e(ev.lieu) + "</span>" : "") + "</span></button>";
  }

  function tacheHtml(t, opts) {
    const o = opts || {};
    const today = S.data.today || aujourdhui();
    const p = projetDe(t.projet_id);
    const retard = !t.fait && ((t.jour && t.jour < today) || (t.echeance && t.echeance < today));
    const metas = [];
    if (p) metas.push('<span class="esp-meta projet">' + e(p.titre) + "</span>");
    if (o.montrerJour && t.jour) metas.push('<span class="esp-meta">' + e(formatJour(t.jour)) + "</span>");
    if (t.echeance) metas.push('<span class="esp-meta' + (retard ? " retard" : "") + '">échéance ' + e(formatJour(t.echeance)) + "</span>");
    if (Number(t.reporte) > 0) metas.push('<span class="esp-meta reporte">reportée ×' + t.reporte + "</span>");
    if (t.rappel) metas.push('<span class="esp-meta rappel">⏰ ' + e(valeurDateHeure(t.rappel).replace("T", " ")) + "</span>");
    return '<div class="esp-tache' + (t.fait ? " faite" : "") + '">'
      + '<input type="checkbox" data-tache-fait="' + t.id + '"' + (t.fait ? " checked" : "") + ' aria-label="marquer comme faite" />'
      + '<div class="esp-tache-corps"><div class="esp-tache-titre" data-action="tache-editer" data-id="' + t.id + '">' + e(t.titre) + "</div>"
      + (metas.length ? '<div class="esp-tache-meta">' + metas.join("") + "</div>" : "") + "</div>"
      + '<div class="esp-tache-actions"><button class="esp-mini-icone" type="button" data-action="tache-editer" data-id="' + t.id + '" title="modifier">✎</button>'
      + '<button class="esp-mini-icone" type="button" data-action="tache-suppr" data-id="' + t.id + '" title="supprimer">✕</button></div></div>';
  }

  /* ---------- calendrier ---------- */
  function vueCalendrier() {
    const today = S.data.today || aujourdhui();
    const fin = ajoutJours(S.semaine, 6);
    const titre = S.semaine.getMonth() === fin.getMonth()
      ? S.semaine.getDate() + " – " + fin.getDate() + " " + MOIS[fin.getMonth()] + " " + fin.getFullYear()
      : S.semaine.getDate() + " " + MOIS[S.semaine.getMonth()] + " – " + fin.getDate() + " " + MOIS[fin.getMonth()] + " " + fin.getFullYear();
    const jours = [];
    for (let i = 0; i < 7; i++) {
      const d = ajoutJours(S.semaine, i);
      const j = isoJour(d);
      const evs = evenementsJour(j);
      const tks = taches().filter((t) => !t.fait && (t.jour === j || (!t.jour && t.echeance === j)));
      const morceaux = [];
      evs.forEach((ev) => {
        const h = ev.journee ? "journée" : formatHeure(ev.debut);
        morceaux.push('<button class="esp-evenement ' + (ev.compte === "ecole" ? "ecole " : "") + (ev.journee ? "journee" : "") + '" type="button" data-action="evenement-editer" data-id="' + attr(ev.id) + '" data-compte="' + attr(ev.compte) + '"><b>' + e(h) + "</b>" + e(ev.titre) + "</button>");
      });
      tks.slice(0, 8).forEach((t) => {
        morceaux.push('<button class="esp-evenement esp-evenement-tache" type="button" data-action="tache-editer" data-id="' + t.id + '"><b>tâche</b>' + e(t.titre) + "</button>");
      });
      morceaux.push('<button class="esp-jour-ajout" type="button" data-action="jour-ajout" data-date="' + j + '">＋</button>');
      jours.push('<div class="esp-jour' + (j === today ? " est-aujourdhui" : "") + '"><header><b>' + JOURS_COURTS[d.getDay()] + "</b><span>" + d.getDate() + "</span></header><div class=\"esp-jour-corps\">" + morceaux.join("") + "</div></div>");
    }
    const erreurs = S.agendaErreurs.length ? '<div class="esp-vide" style="text-align:left;padding:8px 2px">Agenda partiel : ' + e(S.agendaErreurs.join(" · ")) + "</div>" : "";
    const ecoleAbsente = S.agendaComptes && S.agendaComptes.ecole === false
      ? '<div class="esp-vide" style="text-align:left;padding:8px 2px;color:#b7791f">Le compte Google école n\'est pas connecté : seul l\'agenda perso est affiché.</div>' : "";
    return '<div class="esp-cal-tete"><h2>' + e(titre) + "</h2>"
      + '<button class="esp-bouton petit" type="button" data-action="cal-prec">←</button>'
      + '<button class="esp-bouton petit" type="button" data-action="cal-aujourdhui">Aujourd\'hui</button>'
      + '<button class="esp-bouton petit" type="button" data-action="cal-suiv">→</button>'
      + '<button class="esp-bouton principal petit" type="button" data-action="cal-event">＋ Événement</button></div>'
      + '<div class="esp-legende"><span><i class="esp-point"></i>perso</span><span><i class="esp-point ecole"></i>école</span><span><i class="esp-point" style="background:#b7791f"></i>tâches</span><span style="margin-left:auto">' + (S.agendaCharge ? "chargement…" : "") + "</span></div>"
      + erreurs
      + ecoleAbsente
      + '<div class="esp-semaine">' + jours.join("") + "</div>";
  }

  /* ---------- tâches ---------- */
  function vueTaches() {
    const today = S.data.today || aujourdhui();
    const filtres = [["jour", "Aujourd'hui"], ["retard", "En retard"], ["avenir", "À venir"], ["sans", "Sans date"], ["faites", "Faites"], ["tout", "Tout"]];
    let liste = taches();
    if (S.filtre === "jour") liste = liste.filter((t) => t.jour === today);
    else if (S.filtre === "retard") liste = liste.filter((t) => !t.fait && ((t.jour && t.jour < today) || (t.echeance && t.echeance < today)));
    else if (S.filtre === "avenir") liste = liste.filter((t) => !t.fait && ((t.jour && t.jour > today) || (t.echeance && t.echeance > today)));
    else if (S.filtre === "sans") liste = liste.filter((t) => !t.fait && !t.jour && !t.echeance);
    else if (S.filtre === "faites") liste = liste.filter((t) => t.fait);
    liste = liste.slice().sort((a, b) => (a.fait ? 1 : 0) - (b.fait ? 1 : 0) || String(a.jour || "9999").localeCompare(String(b.jour || "9999")) || Number(b.priorite) - Number(a.priorite));
    return '<div class="esp-filtres">' + filtres.map((f) => '<button class="esp-filtre' + (S.filtre === f[0] ? " actif" : "") + '" type="button" data-action="filtre-taches" data-filtre="' + f[0] + '">' + f[1] + "</button>").join("") + "</div>"
      + '<section class="esp-carte"><div class="esp-carte-tete"><h2>' + e((filtres.find((f) => f[0] === S.filtre) || ["", "Tâches"])[1]) + '</h2><span class="esp-sous-total">' + liste.length + '</span><button class="esp-bouton principal petit" type="button" data-action="nouvelle-tache">＋ Tâche</button></div>'
      + '<div class="esp-liste">' + (liste.length ? liste.map((t) => tacheHtml(t, { montrerJour: true })).join("") : vide("Aucune tâche ici", "Ajoute une tâche ou change de filtre.")) + "</div></section>";
  }

  /* ---------- projets ---------- */
  function vueProjets() {
    const actifs = projets().filter((p) => p.statut !== "termine");
    const finis = projets().filter((p) => p.statut === "termine");
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap"><span style="color:#667085;font-size:13px;flex:1">Un projet rassemble ses étapes, ses notes et ses fichiers.</span><button class="esp-bouton principal" type="button" data-action="nouveau-projet">＋ Nouveau projet</button></div>'
      + (actifs.length ? '<div class="esp-projets">' + actifs.map(projetCarte).join("") + "</div>" : vide("Aucun projet en cours", "Crée un projet pour une démarche, un achat, le sport, l'école…"))
      + (finis.length ? '<div class="esp-section-titre">Terminés</div><div class="esp-projets">' + finis.map(projetCarte).join("") + "</div>" : "");
  }

  function projetCarte(p) {
    const pr = progression(p);
    return '<div class="esp-projet" role="button" tabindex="0" data-action="projet-ouvrir" data-id="' + p.id + '">'
      + "<h3>" + e(p.titre) + "</h3>"
      + (p.description ? "<p>" + e(p.description) + "</p>" : "")
      + '<span class="esp-jauge bleu" style="display:block"><i style="width:' + pr.pct + '%"></i></span>'
      + '<div class="esp-projet-pied"><span>' + pr.faites + "/" + pr.total + " étape(s)</span>" + (p.echeance ? "<span>· " + e(formatJour(p.echeance)) + "</span>" : "") + "</div></div>";
  }

  function vueProjetDetail() {
    const p = projetDe(S.projet);
    if (!p) { S.projet = null; return vueProjets(); }
    const etapes = taches().filter((t) => Number(t.projet_id) === Number(p.id));
    const pr = progression(p);
    const dossier = dossiers().find((d) => Number(d.projet_id) === Number(p.id));
    return '<div class="esp-fil"><button type="button" data-action="projet-retour">← Projets</button><span class="sep">/</span><span>' + e(p.titre) + "</span></div>"
      + '<section class="esp-carte esp-projet-detail"><div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:0"><h2>' + e(p.titre) + "</h2>"
      + '<div class="esp-statuts"><span class="esp-meta">' + e(p.statut === "termine" ? "terminé" : "en cours") + "</span>" + (p.echeance ? '<span class="esp-meta">échéance ' + e(formatJour(p.echeance)) + "</span>" : "") + '<span class="esp-meta">' + pr.faites + "/" + pr.total + " étapes</span></div></div>"
      + '<button class="esp-bouton petit" type="button" data-action="projet-modifier" data-id="' + p.id + '">Modifier</button>'
      + (dossier ? '<button class="esp-bouton petit" type="button" data-action="projet-dossier" data-id="' + dossier.id + '">Dossier</button>' : "")
      + '<button class="esp-bouton danger petit" type="button" data-action="projet-suppr" data-id="' + p.id + '">Supprimer</button></div>'
      + '<div class="esp-jauge bleu" style="margin:14px 0 8px"><i style="width:' + pr.pct + '%"></i></div>'
      + (p.description ? '<div class="esp-desc">' + e(p.description) + "</div>" : "")
      + '<div class="esp-carte-tete" style="margin-top:18px"><h2>Étapes</h2><span class="esp-sous-total">' + etapes.length + "</span></div>"
      + '<div class="esp-ajout-ligne"><input id="esp-nouvelle-etape" maxlength="300" placeholder="Ajouter une étape…" autocomplete="off" /><button class="esp-bouton principal" type="button" data-action="ajout-etape">＋</button></div>'
      + '<div class="esp-liste">' + (etapes.length ? etapes.map((t) => tacheHtml(t, { montrerJour: false })).join("") : vide("Aucune étape", "Ajoute la première étape de ce projet.")) + "</div></section>";
  }

  /* ---------- dossiers ---------- */
  function vueDossiers() {
    let courant = S.dossier ? dossierDe(S.dossier) : null;
    if (S.dossier && !courant) { S.dossier = null; }
    const id = courant ? Number(courant.id) : null;
    const enfants = enfantsDossier(id);
    const chemin = cheminDossier(id);
    const p = courant && courant.projet_id ? projetDe(courant.projet_id) : null;
    const fil = '<div class="esp-fil"><button type="button" data-action="dossier-ouvrir" data-id="">Dossiers</button>'
      + chemin.map((d) => '<span class="sep">/</span><button type="button" data-action="dossier-ouvrir" data-id="' + d.id + '">' + e(d.nom) + "</button>").join("") + "</div>";
    const boutons = '<button class="esp-bouton" type="button" data-action="nouveau-dossier">＋ Dossier</button>'
      + '<button class="esp-bouton" type="button" data-action="nouvelle-note">＋ Note</button>'
      + '<button class="esp-bouton principal" type="button" data-action="importer-fichier"' + (S.envoi ? " disabled" : "") + ">" + (S.envoi ? "Envoi…" : "＋ Fichier") + "</button>";
    const entete = '<div class="esp-entete-dossier"><h2>' + e(courant ? courant.nom : "Dossiers") + "</h2><div class=\"esp-actions\">" + boutons
      + (courant ? '<button class="esp-bouton danger petit" type="button" data-action="dossier-suppr" data-id="' + courant.id + '">Supprimer</button>' : "") + "</div></div>"
      + (p ? '<div class="esp-fil" style="margin-top:-6px"><span class="esp-meta projet">projet</span><button type="button" data-action="projet-ouvrir" data-id="' + p.id + '">' + e(p.titre) + "</button></div>" : "");
    const cartesDossiers = enfants.dossiers.map((d) => {
      const c = enfantsDossier(d.id);
      const total = c.dossiers.length + c.notes.length + c.fichiers.length;
      return '<button class="esp-dossier" type="button" data-action="dossier-ouvrir" data-id="' + d.id + '"><span class="esp-ico-d">▤</span><span style="min-width:0"><b>' + e(d.nom) + "</b><small>" + total + " élément(s)</small></span></button>";
    }).join("");
    const cartesNotes = enfants.notes.map((n) => '<div class="esp-note-carte" role="button" tabindex="0" data-action="note-editer" data-id="' + n.id + '"><b>' + e(n.titre) + "</b><p>" + e(court(String(n.contenu || "").replace(/[#*_>`~[\]()]/g, " "), 170)) + "</p><small>" + e(formatJour((n.maj || n.cree || "").slice(0, 10))) + "</small></div>").join("");
    const cartesFichiers = enfants.fichiers.map((f) => '<div class="esp-fichier"><span class="esp-ico-f">' + iconeFichier(f.nom, f.mime) + '</span><a href="' + attr(f.lien || "#") + '" target="_blank" rel="noopener" style="flex:1;min-width:0;color:inherit;text-decoration:none"><b>' + e(f.nom) + "</b><small>" + taille(f.taille) + (f.cree ? " · " + e(String(f.cree).slice(0, 10)) : "") + '</small></a><button class="esp-mini-icone" type="button" data-action="fichier-suppr" data-id="' + f.id + '" title="supprimer">✕</button></div>').join("");
    return fil + entete
      + '<input type="file" id="esp-fichier-input" multiple hidden />'
      + (enfants.dossiers.length ? '<div class="esp-section-titre">Sous-dossiers</div><div class="esp-dossiers">' + cartesDossiers + "</div>" : "")
      + (enfants.notes.length ? '<div class="esp-section-titre">Notes</div><div class="esp-dossiers">' + cartesNotes + "</div>" : "")
      + (enfants.fichiers.length ? '<div class="esp-section-titre">Fichiers</div><div class="esp-dossiers" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">' + cartesFichiers + "</div>" : "")
      + (!enfants.dossiers.length && !enfants.notes.length && !enfants.fichiers.length ? vide("Dossier vide", "Ajoute une note, un fichier ou un sous-dossier.") : "");
  }

  /* ---------- recherche ---------- */
  function vueRecherche() {
    const q = S.requete.toLowerCase();
    if (q.length < 2) return vide("Cherche dans tout l'espace", "Notes, tâches, projets, dossiers et noms de fichiers.");
    const tTr = taches().filter((t) => (t.titre + " " + (t.notes || "")).toLowerCase().indexOf(q) >= 0);
    const pTr = projets().filter((p) => (p.titre + " " + (p.description || "")).toLowerCase().indexOf(q) >= 0);
    const dTr = dossiers().filter((d) => String(d.nom || "").toLowerCase().indexOf(q) >= 0);
    const nTr = notes().filter((n) => (n.titre + " " + (n.contenu || "")).toLowerCase().indexOf(q) >= 0);
    const fTr = fichiers().filter((f) => String(f.nom || "").toLowerCase().indexOf(q) >= 0);
    if (!tTr.length && !pTr.length && !dTr.length && !nTr.length && !fTr.length) return vide("Aucun résultat", "Rien ne correspond à « " + S.requete + " ».");
    const bloc = (titre, items) => items.length ? '<section class="esp-recherche-bloc"><div class="esp-section-titre">' + titre + "</div>" + items.join("") + "</section>" : "";
    return bloc("Tâches", tTr.map((t) => '<button class="esp-resultat" type="button" data-action="tache-editer" data-id="' + t.id + '"><span class="esp-r-ico">✓</span><span><b>' + e(t.titre) + "</b><small>" + e(t.fait ? "faite" : (t.jour ? formatJour(t.jour) : "sans date")) + (t.notes ? " · " + e(court(t.notes, 80)) : "") + "</small></span></button>"))
      + bloc("Projets", pTr.map((p) => '<button class="esp-resultat" type="button" data-action="projet-ouvrir" data-id="' + p.id + '"><span class="esp-r-ico">◇</span><span><b>' + e(p.titre) + "</b><small>" + e(court(p.description || "", 100)) + "</small></span></button>"))
      + bloc("Dossiers", dTr.map((d) => '<button class="esp-resultat" type="button" data-action="dossier-ouvrir" data-id="' + d.id + '"><span class="esp-r-ico">▤</span><span><b>' + e(d.nom) + "</b></span></button>"))
      + bloc("Notes", nTr.map((n) => '<button class="esp-resultat" type="button" data-action="note-editer" data-id="' + n.id + '"><span class="esp-r-ico">▥</span><span><b>' + e(n.titre) + "</b><small>" + e(court(String(n.contenu || "").replace(/\s+/g, " "), 110)) + "</small></span></button>"))
      + bloc("Fichiers", fTr.map((f) => '<a class="esp-resultat" href="' + attr(f.lien || "#") + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="esp-r-ico">' + iconeFichier(f.nom, f.mime) + "</span><span><b>" + e(f.nom) + "</b><small>" + taille(f.taille) + "</small></span></a>"));
  }

  /* ---------- réglages ---------- */
  function vueReglages() {
    const notif = typeof Notification !== "undefined" ? Notification.permission : "indisponible";
    const notifTexte = notif === "granted" ? "activées" : notif === "denied" ? "refusées par le navigateur" : "pas encore demandées";
    return '<div class="esp-reglages">'
      + '<section class="esp-carte"><div class="esp-carte-tete"><h2>Sauvegarde</h2></div>'
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Exporter tout l\'espace</b><small>Tâches, projets, dossiers, notes et fiches de fichiers, en JSON.</small></div><button class="esp-bouton" type="button" data-action="export">Exporter</button></div>'
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Importer une sauvegarde</b><small>Remplace le contenu actuel. Les fichiers restent dans Drive.</small></div><button class="esp-bouton" type="button" data-action="import">Importer</button></div>'
      + '<input type="file" id="esp-import-input" accept="application/json,.json" hidden />'
      + "</section>"
      + '<section class="esp-carte"><div class="esp-carte-tete"><h2>Rappels</h2></div>'
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Notifications du navigateur</b><small>' + e(notifTexte) + ". Telegram reçoit aussi les rappels quand il est configuré.</small></div><button class=\"esp-bouton\" type=\"button\" data-action=\"notif\">Activer</button></div>"
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Fonctionnement</b><small>Un rappel est envoyé à l\'heure prévue quand JARVIS est ouvert, et sur Telegram dès qu\'il est configuré.</small></div></div>'
      + "</section>"
      + '<section class="esp-carte"><div class="esp-carte-tete"><h2>Google</h2></div>'
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Agendas</b><small>' + (S.agendaComptes && S.agendaComptes.ecole === false ? "perso connecté · école non connecté" : S.agendaErreurs.length ? e(S.agendaErreurs.join(" · ")) : "Lecture des agendas perso et école ; création dans le compte choisi.") + "</small></div></div>"
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Google Tasks</b><small>Importer les tâches Google non terminées dans la liste générale, sans doublon.</small></div><button class="esp-bouton" type="button" data-action="google-taches">Importer</button></div>'
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Google Drive</b><small>Les fichiers importés dans un dossier sont déposés dans le Drive, dans le même dossier.</small></div></div>'
      + "</section>"
      + '<section class="esp-carte"><div class="esp-carte-tete"><h2>À propos</h2></div>'
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Espace personnel</b><small>JARVIS v39 · ' + taches().length + " tâches · " + projets().length + " projets · " + notes().length + " notes · " + fichiers().length + " fichiers.</small></div><button class=\"esp-bouton\" type=\"button\" data-action=\"recharger\">Recharger</button></div>"
      + '<div class="esp-reglage-ligne"><div class="esp-r-txt"><b>Rangement direct</b><small>Dis à JARVIS « range ça dans le dossier achat », « ajoute une tâche demain » ou « crée un projet » : il le fait directement.</small></div></div>'
      + "</section></div>";
  }

  /* ---------- actions ---------- */
  async function basculerTache(id, fait) {
    const t = taches().find((x) => Number(x.id) === Number(id));
    if (!t) return;
    t.fait = fait ? 1 : 0;
    rendre();
    try {
      await api("tache", { op: "fait", id, fait });
    } catch (err) {
      t.fait = fait ? 0 : 1;
      rendre();
      dire("Impossible de modifier la tâche : " + err.message);
    }
  }

  async function ajouterTacheRapide(titre, jour, projetId) {
    const t = String(titre || "").trim();
    if (!t) { dire("Écris d'abord la tâche."); return; }
    try {
      await api("tache", { op: "creer", titre: t, jour, projet_id: projetId || null });
      dire("Tâche ajoutée.");
      await charger(true);
    } catch (err) { dire("Ajout impossible : " + err.message); }
  }

  async function supprimerTache(id) {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    try { await api("tache", { op: "suppr", id }); dire("Tâche supprimée."); await charger(true); }
    catch (err) { dire("Suppression impossible : " + err.message); }
  }

  /* ---------- modale ---------- */
  function ouvrirModale(html) {
    const m = $("esp-modale");
    if (!m) return;
    m.innerHTML = '<div class="esp-modale-carte">' + html + "</div>";
    m.hidden = false;
  }
  function fermerModale() {
    const m = $("esp-modale");
    if (!m) return;
    m.hidden = true;
    m.innerHTML = "";
  }

  function projetOptions(sel) {
    return '<option value="">Aucun</option>' + projets().map((p) => '<option value="' + p.id + '"' + (Number(sel) === Number(p.id) ? " selected" : "") + ">" + e(p.titre) + "</option>").join("");
  }

  function ouvrirTache(t, jourDefaut) {
    const existe = !!(t && t.id);
    const x = t || {
      titre: "", notes: "", jour: jourDefaut === undefined ? (S.data.today || aujourdhui()) : jourDefaut,
      projet_id: S.vue === "projets" && S.projet ? S.projet : null, echeance: "", priorite: 0, rappel: "",
    };
    ouvrirModale('<form id="esp-form-tache">'
      + '<div class="esp-modale-tete"><h2>' + (existe ? "Modifier la tâche" : "Nouvelle tâche") + '</h2><button type="button" class="esp-mini-icone" data-fermer>✕</button></div>'
      + '<div class="esp-champ"><label>Titre</label><input id="et-titre" maxlength="300" value="' + attr(x.titre) + '" required /></div>'
      + '<div class="esp-champ"><label>Notes</label><textarea id="et-notes" placeholder="Détails, liens, contexte…">' + e(x.notes) + "</textarea></div>"
      + '<div class="esp-rangee"><div class="esp-champ"><label>Journée</label><input type="date" id="et-jour" value="' + attr(x.jour) + '" /></div>'
      + '<div class="esp-champ"><label>Échéance</label><input type="date" id="et-echeance" value="' + attr(x.echeance) + '" /></div></div>'
      + '<div class="esp-rangee"><div class="esp-champ"><label>Projet</label><select id="et-projet">' + projetOptions(x.projet_id) + "</select></div>"
      + '<div class="esp-champ"><label>Priorité</label><select id="et-priorite"><option value="0"' + (!Number(x.priorite) ? " selected" : "") + '>Normale</option><option value="1"' + (Number(x.priorite) ? " selected" : "") + '>Importante</option></select></div></div>'
      + '<div class="esp-champ"><label>Rappel</label><input type="datetime-local" id="et-rappel" value="' + attr(valeurDateHeure(x.rappel)) + '" /></div>'
      + '<div class="esp-modale-pied"><button class="esp-bouton principal" type="submit">Enregistrer</button>'
      + (existe ? '<button class="esp-bouton danger" type="button" data-maction="suppr-tache" data-id="' + x.id + '">Supprimer</button>' : "")
      + '<button class="esp-bouton" type="button" data-fermer>Annuler</button></div></form>');
    const f = $("esp-form-tache");
    if (!f) return;
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const titre = ($("et-titre").value || "").trim();
      if (!titre) { dire("La tâche a besoin d'un titre."); return; }
      const pid = $("et-projet").value;
      const data = {
        op: existe ? "maj" : "creer", id: existe ? x.id : undefined, titre,
        notes: $("et-notes").value, jour: $("et-jour").value,
        projet_id: pid ? Number(pid) : null,
        echeance: $("et-echeance").value,
        priorite: Number($("et-priorite").value) || 0,
        rappel: isoDepuisLocal($("et-rappel").value),
      };
      try {
        await api("tache", data);
        fermerModale();
        dire(existe ? "Tâche modifiée." : "Tâche ajoutée.");
        await charger(true);
      } catch (err) { dire("Enregistrement impossible : " + err.message); }
    });
  }

  function ouvrirProjet(p) {
    const existe = !!(p && p.id);
    const x = p || { titre: "", description: "", echeance: "", statut: "actif" };
    ouvrirModale('<form id="esp-form-projet">'
      + '<div class="esp-modale-tete"><h2>' + (existe ? "Modifier le projet" : "Nouveau projet") + '</h2><button type="button" class="esp-mini-icone" data-fermer>✕</button></div>'
      + '<div class="esp-champ"><label>Titre</label><input id="ep-titre" maxlength="160" value="' + attr(x.titre) + '" required /></div>'
      + '<div class="esp-champ"><label>Description</label><textarea id="ep-description" placeholder="But, contexte, prochaine action…">' + e(x.description) + "</textarea></div>"
      + '<div class="esp-rangee"><div class="esp-champ"><label>Échéance</label><input type="date" id="ep-echeance" value="' + attr(x.echeance) + '" /></div>'
      + '<div class="esp-champ"><label>Statut</label><select id="ep-statut"><option value="actif"' + (x.statut !== "termine" ? " selected" : "") + '>En cours</option><option value="termine"' + (x.statut === "termine" ? " selected" : "") + ">Terminé</option></select></div></div>"
      + '<div class="esp-modale-pied"><button class="esp-bouton principal" type="submit">Enregistrer</button><button class="esp-bouton" type="button" data-fermer>Annuler</button></div></form>');
    const f = $("esp-form-projet");
    if (!f) return;
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const titre = ($("ep-titre").value || "").trim();
      if (!titre) { dire("Le projet a besoin d'un titre."); return; }
      try {
        const d = await api("projet", {
          op: existe ? "maj" : "creer", id: existe ? x.id : undefined,
          titre, description: $("ep-description").value, echeance: $("ep-echeance").value,
          statut: $("ep-statut").value,
        });
        fermerModale();
        dire(existe ? "Projet modifié." : "Projet créé.");
        S.haut = true;
        if (!existe && d.id) S.projet = d.id;
        await charger(true);
      } catch (err) { dire("Enregistrement impossible : " + err.message); }
    });
  }

  function ouvrirDossier() {
    ouvrirModale('<form id="esp-form-dossier">'
      + '<div class="esp-modale-tete"><h2>Nouveau dossier</h2><button type="button" class="esp-mini-icone" data-fermer>✕</button></div>'
      + '<div class="esp-champ"><label>Nom</label><input id="ed-nom" maxlength="160" placeholder="achat, sport, administration…" required /></div>'
      + '<div class="esp-champ"><label>Dans</label><p style="margin:0;color:#667085;font-size:13px">' + e(S.dossier && dossierDe(S.dossier) ? dossierDe(S.dossier).nom : "Racine des dossiers") + "</p></div>"
      + '<div class="esp-modale-pied"><button class="esp-bouton principal" type="submit">Créer</button><button class="esp-bouton" type="button" data-fermer>Annuler</button></div></form>');
    const f = $("esp-form-dossier");
    if (!f) return;
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nom = ($("ed-nom").value || "").trim();
      if (!nom) return;
      try {
        await api("dossier", { op: "creer", nom, parent_id: S.dossier || null });
        fermerModale();
        dire("Dossier créé.");
        await charger(true);
      } catch (err) { dire("Création impossible : " + err.message); }
    });
  }

  function ouvrirNoteLecture(n) {
    ouvrirModale('<div class="esp-modale-tete"><h2>' + e(n.titre) + '</h2><button type="button" class="esp-mini-icone" data-fermer>✕</button></div>'
      + '<div style="font-size:11.5px;color:#98a2b3;margin-bottom:12px">' + e(formatJour(String(n.maj || n.cree || "").slice(0, 10))) + (n.dossier_id && dossierDe(n.dossier_id) ? " · " + e(dossierDe(n.dossier_id).nom) : "") + "</div>"
      + '<div class="esp-md">' + mdEspace(n.contenu) + "</div>"
      + '<div class="esp-modale-pied"><button class="esp-bouton principal" type="button" data-maction="modifier-note" data-id="' + n.id + '">Modifier</button>'
      + '<button class="esp-bouton danger" type="button" data-maction="suppr-note" data-id="' + n.id + '">Supprimer</button>'
      + '<button class="esp-bouton" type="button" data-fermer>Fermer</button></div>');
  }

  function ouvrirNoteEdition(n, dossierId) {
    const existe = !!(n && n.id);
    const x = n || { titre: "", contenu: "" };
    const did = dossierId === undefined ? (S.dossier || null) : dossierId;
    ouvrirModale('<form id="esp-form-note">'
      + '<div class="esp-modale-tete"><h2>' + (existe ? "Modifier la note" : "Nouvelle note") + '</h2><button type="button" class="esp-mini-icone" data-fermer>✕</button></div>'
      + '<div class="esp-champ"><label>Titre</label><input id="en-titre" maxlength="200" value="' + attr(x.titre) + '" placeholder="Une note…" /></div>'
      + '<div class="esp-champ"><label>Contenu (Markdown simple)</label><textarea id="en-contenu" style="min-height:260px">' + e(x.contenu) + "</textarea></div>"
      + '<div class="esp-modale-pied"><button class="esp-bouton principal" type="submit">Enregistrer</button>'
      + (existe ? '<button class="esp-bouton danger" type="button" data-maction="suppr-note" data-id="' + x.id + '">Supprimer</button>' : "")
      + '<button class="esp-bouton" type="button" data-fermer>Annuler</button></div></form>');
    const f = $("esp-form-note");
    if (!f) return;
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await api("note", {
          op: existe ? "maj" : "creer", id: existe ? x.id : undefined,
          titre: ($("en-titre").value || "").trim() || "Note",
          contenu: $("en-contenu").value,
          dossier_id: existe ? undefined : did,
        });
        fermerModale();
        dire("Note enregistrée.");
        await charger(true);
      } catch (err) { dire("Enregistrement impossible : " + err.message); }
    });
  }

  function ouvrirEvenement(ev, date) {
    const existe = !!(ev && ev.id);
    const x = ev || {};
    const jour = x.journee ? String(x.debut).slice(0, 10) : (x.debut ? String(x.debut).slice(0, 10) : (date || (S.data.today || aujourdhui())));
    const hDebut = x.debut && !x.journee ? new Date(x.debut).toTimeString().slice(0, 5) : "09:00";
    const hFin = x.fin && !x.journee ? new Date(x.fin).toTimeString().slice(0, 5) : "10:00";
    ouvrirModale('<form id="esp-form-evenement">'
      + '<div class="esp-modale-tete"><h2>' + (existe ? "Modifier l'événement" : "Nouvel événement") + '</h2><button type="button" class="esp-mini-icone" data-fermer>✕</button></div>'
      + '<div class="esp-champ"><label>Titre</label><input id="ee-titre" maxlength="200" value="' + attr(x.titre || "") + '" required /></div>'
      + '<div class="esp-rangee"><div class="esp-champ"><label>Agenda</label><select id="ee-compte"><option value="perso"' + (x.compte !== "ecole" ? " selected" : "") + '>Perso</option><option value="ecole"' + (x.compte === "ecole" ? " selected" : "") + ">École</option></select></div>"
      + '<div class="esp-champ"><label>Date</label><input type="date" id="ee-date" value="' + attr(jour) + '" required /></div></div>'
      + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475467;margin:2px 0 12px"><input type="checkbox" id="ee-journee"' + (x.journee ? " checked" : "") + ' /> Toute la journée</label>'
      + '<div class="esp-rangee" id="ee-heures"' + (x.journee ? " hidden" : "") + '><div class="esp-champ"><label>Début</label><input type="time" id="ee-debut" value="' + attr(hDebut) + '" step="300" /></div><div class="esp-champ"><label>Fin</label><input type="time" id="ee-fin" value="' + attr(hFin) + '" step="300" /></div></div>'
      + '<div class="esp-champ"><label>Lieu</label><input id="ee-lieu" maxlength="200" value="' + attr(x.lieu || "") + '" /></div>'
      + '<div class="esp-champ"><label>Notes</label><textarea id="ee-notes" style="min-height:80px">' + e(x.description || "") + "</textarea></div>"
      + '<div class="esp-modale-pied"><button class="esp-bouton principal" type="submit">Enregistrer</button>'
      + (existe ? '<button class="esp-bouton danger" type="button" data-maction="suppr-event" data-id="' + attr(x.id) + '" data-compte="' + attr(x.compte || "perso") + '">Supprimer</button>' : "")
      + '<button class="esp-bouton" type="button" data-fermer>Annuler</button></div></form>');
    const f = $("esp-form-evenement");
    if (!f) return;
    const journee = $("ee-journee");
    journee.addEventListener("change", () => { $("ee-heures").hidden = journee.checked; });
    f.addEventListener("submit", async (even) => {
      even.preventDefault();
      const titre = ($("ee-titre").value || "").trim();
      if (!titre) return;
      const d = $("ee-date").value;
      if (!d) { dire("Choisis une date."); return; }
      const toutJour = journee.checked;
      let debut = d;
      let fin = "";
      if (!toutJour) {
        const hd = $("ee-debut").value || "09:00";
        const hf = $("ee-fin").value || "10:00";
        const dt = new Date(d + "T" + hd);
        const ft = new Date(d + "T" + hf);
        if (ft <= dt) ft.setTime(dt.getTime() + 3600000);
        debut = dt.toISOString();
        fin = ft.toISOString();
      }
      try {
        await api("evenement", {
          op: existe ? "maj" : "creer", id: existe ? x.id : undefined, compte: $("ee-compte").value,
          titre, journee: toutJour, debut, fin, lieu: $("ee-lieu").value, notes: $("ee-notes").value,
        });
        fermerModale();
        dire("Événement enregistré.");
        await chargerAgenda(true);
      } catch (err) { dire("Agenda : " + err.message); }
    });
  }

  function ouvrirSuppressionDossier() {
    const d = S.dossier ? dossierDe(S.dossier) : null;
    if (!d) return;
    if (!window.confirm("Supprimer le dossier « " + d.nom + " » et ses sous-dossiers, notes et fiches ? Les fichiers restent dans Drive.")) return;
    api("dossier", { op: "suppr", id: d.id }).then(async () => {
      S.dossier = null;
      S.haut = true;
      dire("Dossier supprimé.");
      await charger(true);
    }).catch((err) => dire("Suppression impossible : " + err.message));
  }

  /* ---------- fichiers ---------- */
  function lireBase64(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("lecture impossible"));
      r.readAsDataURL(f);
    });
  }

  async function envoyerFichiers(files) {
    const liste = Array.from(files || []);
    if (!liste.length) return;
    S.envoi += liste.length;
    rendre();
    for (const f of liste) {
      try {
        if (f.size > 10 * 1024 * 1024) { dire(f.name + " dépasse 10 Mo."); continue; }
        const data = await lireBase64(f);
        await api("fichier", { dossier_id: S.dossier || null, nom: f.name, mime: f.type || "application/octet-stream", data });
        dire(f.name + " envoyé dans Drive.");
      } catch (err) { dire("Envoi impossible : " + err.message); }
    }
    S.envoi -= liste.length;
    await charger(true);
  }

  /* ---------- export / import ---------- */
  async function exporter() {
    try {
      dire("Préparation de la sauvegarde…");
      const d = await api("export");
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "jarvis-espace-" + (S.data.today || aujourdhui()) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      dire("Sauvegarde téléchargée.");
    } catch (err) { dire("Export impossible : " + err.message); }
  }

  async function importerSauvegarde(file) {
    try {
      const txt = await file.text();
      const obj = JSON.parse(txt);
      const data = obj && obj.data ? obj.data : obj;
      if (!window.confirm("Remplacer tout l'espace actuel par cette sauvegarde ?")) return;
      await api("import", { data });
      dire("Sauvegarde importée.");
      S.charge = false;
      await charger();
      await chargerAgenda(true);
    } catch (err) { dire("Import impossible : " + err.message); }
  }

  /* ---------- rappels ---------- */
  async function verifierRappels() {
    const acces = document.getElementById("acces");
    if (acces && !acces.hidden) return;
    try {
      const d = await api("rappels");
      const peutNotifier = typeof Notification !== "undefined" && Notification.permission === "granted";
      if (!peutNotifier) return;
      for (const t of (d.rappels || [])) {
        if (S.vus.has(Number(t.id))) continue;
        S.vus.add(Number(t.id));
        try {
          new Notification("JARVIS — rappel", { body: t.titre + (t.notes ? "\n" + String(t.notes).slice(0, 200) : "") });
        } catch (err) { /* notifications indisponibles */ }
      }
    } catch (err) { /* silencieux */ }
  }
  let minuteurRappels = null;
  function demarrerRappels() {
    if (minuteurRappels) return;
    minuteurRappels = setInterval(verifierRappels, 60000);
    setTimeout(verifierRappels, 1500);
  }

  /* ---------- écouteurs ---------- */
  function brancher() {
    const m = $("esp-modale");
    racine.addEventListener("click", async (ev) => {
      const nav = ev.target.closest("[data-vue]");
      if (nav) {
        S.vue = nav.dataset.vue;
        S.projet = null;
        S.dossier = null;
        S.requete = "";
        const rech = $("esp-recherche");
        if (rech) rech.value = "";
        S.haut = true;
        if (S.vue === "calendrier") chargerAgenda();
        rendre();
        $("esp-app").classList.remove("side-ouvert");
        return;
      }
      if (ev.target.closest("#esp-menu")) { $("esp-app").classList.toggle("side-ouvert"); return; }
      if (ev.target.closest("#esp-backdrop")) { $("esp-app").classList.remove("side-ouvert"); return; }
      if (ev.target.closest("#esp-fermer")) { fermer(); return; }
      if (ev.target.closest("#esp-ajout")) { ouvrirTache(null, undefined); return; }

      const b = ev.target.closest("[data-action]");
      if (!b) return;
      const a = b.dataset.action;
      const id = Number(b.dataset.id) || 0;
      if (a === "ajout-tache-jour") {
        const inp = $("esp-nouvelle-tache");
        await ajouterTacheRapide(inp ? inp.value : "", S.data.today || aujourdhui(), null);
      } else if (a === "tache-editer") {
        const t = taches().find((x) => Number(x.id) === id);
        if (t) ouvrirTache(t);
      } else if (a === "tache-suppr") {
        await supprimerTache(id);
      } else if (a === "nouvelle-tache") {
        ouvrirTache(null, S.data.today || aujourdhui());
      } else if (a === "filtre-taches") {
        S.filtre = b.dataset.filtre || "jour"; S.haut = true; rendre();
      } else if (a === "nouveau-projet") {
        ouvrirProjet(null);
      } else if (a === "projet-ouvrir") {
        S.projet = id; S.vue = "projets"; S.haut = true; rendre();
      } else if (a === "projet-retour") {
        S.projet = null; S.haut = true; rendre();
      } else if (a === "projet-modifier") {
        const p = projetDe(id); if (p) ouvrirProjet(p);
      } else if (a === "projet-dossier") {
        S.dossier = id; S.vue = "dossiers"; S.projet = null; S.haut = true; rendre();
      } else if (a === "projet-suppr") {
        const p = projetDe(id);
        if (!p) return;
        if (!window.confirm("Supprimer le projet « " + p.titre + " » ? Ses tâches redeviennent générales, son dossier reste.")) return;
        try { await api("projet", { op: "suppr", id }); S.projet = null; S.haut = true; dire("Projet supprimé."); await charger(true); }
        catch (err) { dire("Suppression impossible : " + err.message); }
      } else if (a === "ajout-etape") {
        const inp = $("esp-nouvelle-etape");
        const titre = inp ? inp.value : "";
        if (!String(titre || "").trim()) return;
        try {
          await api("tache", { op: "creer", titre: String(titre).trim(), jour: "", projet_id: S.projet });
          if (inp) inp.value = "";
          await charger(true);
        } catch (err) { dire("Ajout impossible : " + err.message); }
      } else if (a === "dossier-ouvrir") {
        S.dossier = id || null; S.vue = "dossiers"; S.haut = true; rendre();
      } else if (a === "nouveau-dossier") {
        ouvrirDossier();
      } else if (a === "dossier-suppr") {
        ouvrirSuppressionDossier();
      } else if (a === "nouvelle-note") {
        ouvrirNoteEdition(null, S.dossier || null);
      } else if (a === "note-editer") {
        const n = noteDe(id); if (n) ouvrirNoteLecture(n);
      } else if (a === "fichier-suppr") {
        if (!window.confirm("Supprimer cette fiche ? Le fichier part aussi à la corbeille Drive.")) return;
        try { await api("fichier", { op: "suppr", id }); dire("Fiche supprimée."); await charger(true); }
        catch (err) { dire("Suppression impossible : " + err.message); }
      } else if (a === "importer-fichier") {
        const inp = $("esp-fichier-input"); if (inp) inp.click();
      } else if (a === "ouvrir-calendrier") {
        S.vue = "calendrier"; S.haut = true; chargerAgenda(); rendre();
      } else if (a === "cal-prec" || a === "cal-suiv") {
        S.semaine = ajoutJours(S.semaine, a === "cal-prec" ? -7 : 7); S.haut = true; rendre(); chargerAgenda();
      } else if (a === "cal-aujourdhui") {
        S.semaine = lundiDe(new Date()); S.haut = true; rendre(); chargerAgenda();
      } else if (a === "cal-event") {
        ouvrirEvenement(null, S.vue === "calendrier" ? isoJour(S.semaine) : undefined);
      } else if (a === "jour-ajout") {
        ouvrirEvenement(null, b.dataset.date);
      } else if (a === "evenement-editer") {
        const ev = S.agenda.find((x) => String(x.id) === String(b.dataset.id) && x.compte === b.dataset.compte);
        if (ev) ouvrirEvenement(ev);
      } else if (a === "ouvrir-taches") {
        S.vue = "taches"; S.haut = true; rendre();
      } else if (a === "export") {
        await exporter();
      } else if (a === "import") {
        const inp = $("esp-import-input"); if (inp) inp.click();
      } else if (a === "notif") {
        if (typeof Notification === "undefined") { dire("Notifications indisponibles sur ce navigateur."); return; }
        try { const p = await Notification.requestPermission(); dire(p === "granted" ? "Notifications activées." : "Notifications non accordées."); rendre(); }
        catch (err) { dire("Impossible d'activer les notifications."); }
      } else if (a === "google-taches") {
        try { dire("Import de Google Tasks…"); const d = await api("google_taches"); dire((d.importees || 0) + " tâche(s) importée(s)."); await charger(true); }
        catch (err) { dire("Import impossible : " + err.message); }
      } else if (a === "recharger") {
        await charger(); await chargerAgenda(true); dire("Espace rechargé.");
      }
    });

    racine.addEventListener("keydown", async (ev) => {
      if (ev.key !== "Enter") return;
      if (ev.target.id === "esp-nouvelle-tache") {
        ev.preventDefault();
        await ajouterTacheRapide(ev.target.value, S.data.today || aujourdhui(), null);
      } else if (ev.target.id === "esp-nouvelle-etape") {
        ev.preventDefault();
        const titre = ev.target.value;
        if (!String(titre || "").trim()) return;
        try { await api("tache", { op: "creer", titre: String(titre).trim(), jour: "", projet_id: S.projet }); ev.target.value = ""; await charger(true); }
        catch (err) { dire("Ajout impossible : " + err.message); }
      }
    });

    racine.addEventListener("change", async (ev) => {
      if (ev.target.matches("[data-tache-fait]")) {
        await basculerTache(ev.target.dataset.tacheFait, ev.target.checked);
      } else if (ev.target.id === "esp-fichier-input") {
        await envoyerFichiers(ev.target.files);
      } else if (ev.target.id === "esp-import-input") {
        if (ev.target.files && ev.target.files[0]) await importerSauvegarde(ev.target.files[0]);
      }
    });

    racine.addEventListener("input", (ev) => {
      if (ev.target.id !== "esp-recherche") return;
      const v = String(ev.target.value || "").trim();
      S.requete = v;
      if (v.length >= 2) {
        if (S.vue !== "recherche") S.vuePrecedente = S.vue;
        S.vue = "recherche";
      } else if (S.vue === "recherche") {
        S.vue = S.vuePrecedente || "aujourdhui";
      }
      S.haut = true;
      rendre();
    });

    if (m) {
      m.addEventListener("click", async (ev) => {
        if (ev.target === m || ev.target.closest("[data-fermer]")) { fermerModale(); return; }
        const b = ev.target.closest("[data-maction]");
        if (!b) return;
        const a = b.dataset.maction;
        const id = Number(b.dataset.id) || 0;
        if (a === "suppr-tache") {
          if (!window.confirm("Supprimer cette tâche ?")) return;
          try { await api("tache", { op: "suppr", id }); fermerModale(); dire("Tâche supprimée."); await charger(true); }
          catch (err) { dire("Suppression impossible : " + err.message); }
        } else if (a === "suppr-note") {
          if (!window.confirm("Supprimer cette note ?")) return;
          try { await api("note", { op: "suppr", id }); fermerModale(); dire("Note supprimée."); await charger(true); }
          catch (err) { dire("Suppression impossible : " + err.message); }
        } else if (a === "modifier-note") {
          const n = noteDe(id);
          if (n) { fermerModale(); ouvrirNoteEdition(n); }
        } else if (a === "suppr-event") {
          if (!window.confirm("Supprimer cet événement de Google Agenda ?")) return;
          try { await api("evenement", { op: "suppr", id: b.dataset.id, compte: b.dataset.compte }); fermerModale(); dire("Événement supprimé."); await chargerAgenda(true); }
          catch (err) { dire("Suppression impossible : " + err.message); }
        }
      });
    }

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !$("esp-modale").hidden) fermerModale();
    });

    const bouton = document.getElementById("espace-bouton");
    if (bouton) bouton.addEventListener("click", ouvrir);
  }

  /* ---------- construction ---------- */
  racine.innerHTML = '<div class="esp-app" id="esp-app">'
    + '<aside class="esp-side">'
    + '<div class="esp-marque"><b>ESPACE</b><small>J.A.R.V.I.S. · personnel</small></div>'
    + '<nav class="esp-nav">'
    + '<button type="button" data-vue="aujourdhui"><span class="esp-ico">◷</span>Aujourd\'hui<span class="esp-compte" id="esp-cpt-jour"></span></button>'
    + '<button type="button" data-vue="calendrier"><span class="esp-ico">▦</span>Calendrier</button>'
    + '<button type="button" data-vue="taches"><span class="esp-ico">✓</span>Tâches<span class="esp-compte" id="esp-cpt-taches"></span></button>'
    + '<button type="button" data-vue="projets"><span class="esp-ico">◇</span>Projets<span class="esp-compte" id="esp-cpt-projets"></span></button>'
    + '<button type="button" data-vue="dossiers"><span class="esp-ico">▤</span>Dossiers<span class="esp-compte" id="esp-cpt-dossiers"></span></button>'
    + '<button type="button" data-vue="reglages"><span class="esp-ico">⚙</span>Réglages</button>'
    + "</nav>"
    + '<div class="esp-side-pied"><div class="esp-aide"><b>Dis-le à JARVIS.</b><br />« ajoute une tâche demain »<br />« range ça dans le dossier achat »<br />« crée un projet déménagement »</div></div>'
    + "</aside>"
    + '<div class="esp-backdrop" id="esp-backdrop"></div>'
    + '<section class="esp-principal">'
    + '<header class="esp-tete"><button class="esp-icone esp-menu" id="esp-menu" type="button" title="menu">☰</button>'
    + '<div class="esp-titre"><h1 id="esp-titre">Aujourd\'hui</h1><p id="esp-sous-titre"></p></div>'
    + '<div class="esp-actions"><label class="esp-recherche"><span>⌕</span><input id="esp-recherche" type="search" placeholder="Rechercher…" autocomplete="off" /></label>'
    + '<button class="esp-ajout" id="esp-ajout" type="button"><span>＋</span><span class="esp-texte-ajout">Ajouter</span></button>'
    + '<button class="esp-icone" id="esp-fermer" type="button" title="fermer">✕</button></div></header>'
    + '<main class="esp-vue" id="esp-vue"></main></section></div>'
    + '<div class="esp-modale" id="esp-modale" hidden></div>'
    + '<div class="esp-toast" id="esp-toast" hidden></div>';

  brancher();
  demarrerRappels();
  window.ouvrirEspace = ouvrir;
})();
