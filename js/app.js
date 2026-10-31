/* WinFleet – gestion de flotte, chauffeurs et sous-traitants.
 * Application monopage sans dépendance : les données sont stockées dans le navigateur (localStorage).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'winfleet:v1';
  const ALERT_DAYS = 30; // une échéance à moins de 30 jours déclenche une alerte

  // ---------- Schéma des entités ----------
  const isST = (m) => m.mode === 'Sous-traitance';

  const ENTITIES = {
    vehicules: {
      label: 'Véhicules', singular: 'véhicule',
      title: (v) => v.immat || '(sans immatriculation)',
      fields: [
        { key: 'immat', label: 'Immatriculation', required: true },
        { key: 'type', label: 'Type', type: 'select', options: ['Tracteur', 'Semi-remorque', 'Porteur', 'VUL', 'Remorque'] },
        { key: 'marque', label: 'Marque / modèle' },
        { key: 'km', label: 'Kilométrage', type: 'number' },
        { key: 'statut', label: 'Statut', type: 'select', options: ['Disponible', 'En mission', 'Atelier', 'Hors service'] },
        { key: 'ct', label: 'Contrôle technique', type: 'date', expiry: true },
        { key: 'assurance', label: 'Fin d’assurance', type: 'date', expiry: true },
        { key: 'tachy', label: 'Contrôle chronotachygraphe', type: 'date', expiry: true },
        { key: 'revision', label: 'Prochaine révision', type: 'date', expiry: true },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
      columns: ['immat', 'type', 'marque', 'km', 'statut', 'ct', 'assurance', 'tachy'],
    },
    chauffeurs: {
      label: 'Chauffeurs', singular: 'chauffeur',
      title: (c) => [c.prenom, c.nom].filter(Boolean).join(' ') || '(sans nom)',
      fields: [
        { key: 'nom', label: 'Nom', required: true },
        { key: 'prenom', label: 'Prénom' },
        { key: 'telephone', label: 'Téléphone', type: 'tel' },
        { key: 'email', label: 'E-mail', type: 'email' },
        { key: 'permis', label: 'Catégories de permis', placeholder: 'C, CE…' },
        { key: 'statut', label: 'Statut', type: 'select', options: ['Actif', 'Congé', 'Arrêt', 'Inactif'] },
        { key: 'permisExp', label: 'Validité du permis', type: 'date', expiry: true },
        { key: 'fco', label: 'FIMO / FCO', type: 'date', expiry: true },
        { key: 'carte', label: 'Carte conducteur', type: 'date', expiry: true },
        { key: 'medical', label: 'Visite médicale', type: 'date', expiry: true },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
      columns: ['nom', 'prenom', 'telephone', 'permis', 'statut', 'permisExp', 'fco', 'carte', 'medical'],
    },
    soustraitants: {
      label: 'Sous-traitants', singular: 'sous-traitant',
      title: (s) => s.raison || '(sans nom)',
      fields: [
        { key: 'raison', label: 'Raison sociale', required: true },
        { key: 'siret', label: 'SIRET' },
        { key: 'contact', label: 'Contact' },
        { key: 'telephone', label: 'Téléphone', type: 'tel' },
        { key: 'email', label: 'E-mail', type: 'email' },
        { key: 'statut', label: 'Statut', type: 'select', options: ['Actif', 'Suspendu'] },
        { key: 'licence', label: 'N° de licence de transport' },
        { key: 'licenceExp', label: 'Validité de la licence', type: 'date', expiry: true },
        { key: 'urssaf', label: 'Attestation de vigilance URSSAF', type: 'date', expiry: true },
        { key: 'assurance', label: 'Attestation d’assurance', type: 'date', expiry: true },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
      columns: ['raison', 'contact', 'telephone', 'statut', 'licenceExp', 'urssaf', 'assurance'],
    },
    missions: {
      label: 'Missions', singular: 'mission',
      title: (m) => m.ref || '(sans référence)',
      fields: [
        { key: 'ref', label: 'Référence', required: true },
        { key: 'client', label: 'Client', required: true },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'statut', label: 'Statut', type: 'select', options: ['Planifiée', 'En cours', 'Livrée', 'Facturée', 'Annulée'] },
        { key: 'enlevement', label: 'Lieu d’enlèvement' },
        { key: 'livraison', label: 'Lieu de livraison' },
        { key: 'mode', label: 'Affectation', type: 'select', options: ['Interne', 'Sous-traitance'] },
        { key: 'soustraitant', label: 'Sous-traitant', type: 'ref', entity: 'soustraitants', showIf: isST },
        { key: 'vehicule', label: 'Véhicule', type: 'ref', entity: 'vehicules', showIf: (m) => !isST(m) },
        { key: 'chauffeur', label: 'Chauffeur', type: 'ref', entity: 'chauffeurs', showIf: (m) => !isST(m) },
        { key: 'prixVente', label: 'Prix de vente HT (€)', type: 'number' },
        { key: 'prixAchat', label: 'Prix d’achat sous-traitant HT (€)', type: 'number', showIf: isST },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
      columns: [
        'ref', 'date', 'client',
        { label: 'Trajet', get: (m) => [m.enlevement, m.livraison].filter(Boolean).join(' → ') },
        { label: 'Affectation', get: (m) => affectation(m) },
        'statut', 'prixVente',
        { label: 'Marge', num: true, html: (m) => marginCell(m) },
      ],
    },
  };

  const STATUS_CLASS = {
    'Disponible': 'ok', 'Actif': 'ok', 'Livrée': 'ok', 'Facturée': 'ok',
    'En mission': 'info', 'En cours': 'info', 'Planifiée': 'neutral',
    'Atelier': 'warn', 'Congé': 'warn', 'Arrêt': 'warn', 'Suspendu': 'warn',
    'Hors service': 'bad', 'Inactif': 'neutral', 'Annulée': 'bad',
  };

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fmtNum = new Intl.NumberFormat('fr-FR');
  const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '');

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function daysUntil(dateStr) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr + 'T00:00:00') - start) / 86400000);
  }
  function expiryState(dateStr) {
    if (!dateStr) return null;
    const d = daysUntil(dateStr);
    return d < 0 ? 'bad' : d <= ALERT_DAYS ? 'warn' : 'ok';
  }
  function relDays(d) {
    if (d < 0) return `expiré depuis ${-d} j`;
    if (d === 0) return 'expire aujourd’hui';
    return `dans ${d} j`;
  }

  // ---------- Données ----------
  let db = load();

  function emptyDb() { return { vehicules: [], chauffeurs: [], soustraitants: [], missions: [] }; }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(emptyDb(), JSON.parse(raw));
    } catch (e) { /* stockage indisponible : on part de la démo */ }
    return demoData();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* ignoré */ }
  }
  const findById = (entity, id) => db[entity].find((x) => x.id === id);
  function refTitle(entity, id) {
    if (!id) return '';
    const item = findById(entity, id);
    return item ? ENTITIES[entity].title(item) : '(supprimé)';
  }
  function affectation(m) {
    if (isST(m)) return m.soustraitant ? 'ST · ' + refTitle('soustraitants', m.soustraitant) : 'Sous-traitance (à affecter)';
    const parts = [refTitle('vehicules', m.vehicule), refTitle('chauffeurs', m.chauffeur)].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'À affecter';
  }
  function margin(m) {
    const vente = Number(m.prixVente) || 0;
    if (!vente) return null;
    return isST(m) ? vente - (Number(m.prixAchat) || 0) : null;
  }
  function marginCell(m) {
    const mg = margin(m);
    if (mg === null) return '';
    return `<span class="${mg < 0 ? 'neg' : ''}">${fmtEur.format(mg)}</span>`;
  }

  function collectAlerts() {
    const alerts = [];
    for (const [entity, def] of Object.entries(ENTITIES)) {
      const expiryFields = def.fields.filter((f) => f.expiry);
      if (!expiryFields.length) continue;
      for (const item of db[entity]) {
        if (['Inactif', 'Hors service'].includes(item.statut)) continue;
        for (const f of expiryFields) {
          const state = expiryState(item[f.key]);
          if (state === 'bad' || state === 'warn') {
            alerts.push({ entity, item, field: f, state, days: daysUntil(item[f.key]) });
          }
        }
      }
    }
    return alerts.sort((a, b) => a.days - b.days);
  }

  // ---------- Navigation ----------
  const PAGES = [['dashboard', 'Tableau de bord'], ['missions'], ['vehicules'], ['chauffeurs'], ['soustraitants']];
  let search = '';

  function currentPage() {
    const p = location.hash.replace('#', '');
    return p === 'dashboard' || ENTITIES[p] ? p : 'dashboard';
  }

  function renderNav() {
    const page = currentPage();
    const alertCount = collectAlerts().length;
    $('#nav').innerHTML = PAGES.map(([key, label]) => {
      const name = label || ENTITIES[key].label;
      const count = key === 'dashboard'
        ? (alertCount ? `<span class="count alert" title="Alertes">${alertCount}</span>` : '')
        : `<span class="count">${db[key].length}</span>`;
      return `<a href="#${key}" class="${page === key ? 'active' : ''}">${esc(name)} ${count}</a>`;
    }).join('');
  }

  function render() {
    renderNav();
    const page = currentPage();
    if (page === 'dashboard') renderDashboard(); else renderList(page);
  }

  // ---------- Tableau de bord ----------
  function renderDashboard() {
    const v = db.vehicules, c = db.chauffeurs, s = db.soustraitants, m = db.missions;
    const count = (arr, st) => arr.filter((x) => x.statut === st).length;
    const today = todayISO();
    const month = today.slice(0, 7);
    const monthMissions = m.filter((x) => (x.date || '').startsWith(month) && x.statut !== 'Annulée');
    const ca = monthMissions.reduce((t, x) => t + (Number(x.prixVente) || 0), 0);
    const stShare = monthMissions.filter(isST).length;
    const alerts = collectAlerts();
    const todays = m.filter((x) => x.date === today && x.statut !== 'Annulée');
    const unassigned = m.filter((x) => ['Planifiée', 'En cours'].includes(x.statut) &&
      (isST(x) ? !x.soustraitant : !(x.vehicule && x.chauffeur)));

    $('#main').innerHTML = `
      <div class="page-head"><h1>Tableau de bord</h1></div>
      <div class="stats">
        ${stat('#vehicules', 'Véhicules', v.length, `${count(v, 'Disponible')} dispo · ${count(v, 'En mission')} en mission · ${count(v, 'Atelier')} atelier`)}
        ${stat('#chauffeurs', 'Chauffeurs', c.length, `${count(c, 'Actif')} actifs`)}
        ${stat('#soustraitants', 'Sous-traitants', s.length, `${count(s, 'Actif')} actifs`)}
        ${stat('#missions', 'CA du mois (HT)', fmtEur.format(ca), `${monthMissions.length} missions · ${stShare} sous-traitées`)}
      </div>
      <div class="grid-2">
        <section class="card panel">
          <h2>Alertes documents (${alerts.length})</h2>
          ${alerts.length ? `<ul class="list">${alerts.map((a) => `
            <li>
              <span class="badge ${a.state}">${a.state === 'bad' ? 'Expiré' : 'Bientôt'}</span>
              <span class="grow"><a href="#" data-open="${a.entity}:${a.item.id}">${esc(ENTITIES[a.entity].title(a.item))}</a>
                <span class="meta"> · ${esc(a.field.label)}</span></span>
              <span class="meta">${relDays(a.days)}</span>
            </li>`).join('')}</ul>` : '<p class="empty">Aucune échéance dans les 30 prochains jours.</p>'}
        </section>
        <section class="card panel">
          <h2>Missions du jour (${todays.length})</h2>
          ${missionList(todays, 'Aucune mission aujourd’hui.')}
          <h2 style="margin-top:20px">À affecter (${unassigned.length})</h2>
          ${missionList(unassigned, 'Toutes les missions sont affectées.')}
        </section>
      </div>`;
  }
  function stat(href, label, value, sub) {
    return `<a class="card stat" href="${href}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></a>`;
  }
  function missionList(list, emptyMsg) {
    if (!list.length) return `<p class="empty">${esc(emptyMsg)}</p>`;
    return `<ul class="list">${list.map((x) => `
      <li>
        <span class="grow"><a href="#" data-open="missions:${x.id}">${esc(x.ref)}</a> · ${esc(x.client)}
          <div class="meta">${esc([[x.enlevement, x.livraison].filter(Boolean).join(' → '), affectation(x)].filter(Boolean).join(' · '))}</div></span>
        <span class="badge ${STATUS_CLASS[x.statut] || ''}">${esc(x.statut || '')}</span>
      </li>`).join('')}</ul>`;
  }

  // ---------- Listes ----------
  function columnDef(def, col) {
    if (typeof col !== 'string') return col;
    const f = def.fields.find((x) => x.key === col);
    return { label: f.label, field: f };
  }
  function cellHtml(item, col) {
    if (col.html) return col.html(item);
    if (col.get) return esc(col.get(item));
    const f = col.field, val = item[f.key];
    if (val === undefined || val === '') return '';
    if (f.key === 'statut') return `<span class="badge ${STATUS_CLASS[val] || ''}">${esc(val)}</span>`;
    if (f.type === 'date') {
      const st = f.expiry ? expiryState(val) : null;
      return st && st !== 'ok'
        ? `<span class="badge ${st}" title="${esc(relDays(daysUntil(val)))}">${fmtDate(val)}</span>`
        : fmtDate(val);
    }
    if (f.type === 'ref') return esc(refTitle(f.entity, val));
    if (f.type === 'number') return f.key.startsWith('prix') ? fmtEur.format(val) : fmtNum.format(val);
    return esc(val);
  }

  function renderList(entity) {
    const def = ENTITIES[entity];
    const cols = def.columns.map((c) => columnDef(def, c));
    $('#main').innerHTML = `
      <div class="page-head">
        <h1>${esc(def.label)}</h1>
        <span class="spacer"></span>
        <input type="search" class="search" id="search" placeholder="Rechercher…" value="${esc(search)}" aria-label="Rechercher">
        <button type="button" class="btn primary" data-new="${entity}">+ Ajouter</button>
      </div>
      <div class="card table-wrap">
        <table>
          <thead><tr>${cols.map((c) => `<th class="${isNumCol(c) ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>`;
    $('#search').addEventListener('input', (e) => { search = e.target.value; fillRows(entity, cols); });
    fillRows(entity, cols);
  }
  const isNumCol = (c) => c.num || (c.field && c.field.type === 'number');

  function fillRows(entity, cols) {
    const def = ENTITIES[entity];
    const q = search.trim().toLowerCase();
    let items = db[entity].slice();
    if (entity === 'missions') items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (q) {
      items = items.filter((it) => {
        const text = cols.map((c) => (c.get ? c.get(it) : c.field ? (c.field.type === 'ref' ? refTitle(c.field.entity, it[c.field.key]) : it[c.field.key]) : ''))
          .concat(def.fields.map((f) => (f.type === 'ref' ? '' : it[f.key])))
          .join(' ').toLowerCase();
        return text.includes(q);
      });
    }
    $('#rows').innerHTML = items.length
      ? items.map((it) => `<tr data-open="${entity}:${it.id}">${cols.map((c) => `<td class="${isNumCol(c) ? 'num' : ''}">${cellHtml(it, c)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">${q ? 'Aucun résultat.' : `Aucun ${esc(def.singular)} pour le moment.`}</td></tr>`;
  }

  // ---------- Formulaire ----------
  const modal = $('#modal'), form = $('#form');
  let editing = null; // { entity, id }

  function openForm(entity, id) {
    const def = ENTITIES[entity];
    const item = id ? findById(entity, id) : null;
    if (id && !item) return;
    editing = { entity, id: item ? item.id : null };
    const values = item ? { ...item } : defaults(entity);
    $('#modal-title').textContent = item ? `${def.title(item)}` : `Nouveau ${def.singular}`;
    $('#btn-delete').hidden = !item;
    $('#form-error').textContent = '';
    $('#form-fields').innerHTML = def.fields.map((f) => fieldHtml(f, values[f.key])).join('');
    applyShowIf();
    modal.showModal();
    const first = form.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  function defaults(entity) {
    const d = {};
    for (const f of ENTITIES[entity].fields) if (f.type === 'select') d[f.key] = f.options[0];
    if (entity === 'missions') {
      d.date = todayISO();
      d.ref = 'M-' + todayISO().replace(/-/g, '').slice(2) + '-' + String(db.missions.length + 1).padStart(3, '0');
    }
    return d;
  }

  function fieldHtml(f, value) {
    const id = 'f-' + f.key;
    const req = f.required ? ' required' : '';
    const v = value ?? '';
    let input;
    if (f.type === 'select') {
      input = `<select id="${id}" name="${f.key}">${f.options.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (f.type === 'ref') {
      const opts = db[f.entity].map((x) => {
        const warn = ENTITIES[f.entity].fields.some((ff) => ff.expiry && expiryState(x[ff.key]) === 'bad');
        return `<option value="${esc(x.id)}"${x.id === v ? ' selected' : ''}>${esc(ENTITIES[f.entity].title(x))}${x.statut ? ' — ' + esc(x.statut) : ''}${warn ? ' ⚠ document expiré' : ''}</option>`;
      });
      input = `<select id="${id}" name="${f.key}"><option value="">— Aucun —</option>${opts.join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" name="${f.key}">${esc(v)}</textarea>`;
    } else {
      const type = f.type || 'text';
      const extra = type === 'number' ? ' min="0" step="any" inputmode="decimal"' : '';
      input = `<input id="${id}" name="${f.key}" type="${type}" value="${esc(v)}"${req}${extra}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>`;
    }
    return `<div class="field${f.type === 'textarea' ? ' full' : ''}" data-key="${f.key}">
      <label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  }

  function formValues() {
    const values = {};
    for (const f of ENTITIES[editing.entity].fields) {
      const el = form.elements[f.key];
      if (!el) continue;
      values[f.key] = f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    }
    return values;
  }

  function applyShowIf() {
    const def = ENTITIES[editing.entity];
    const values = formValues();
    for (const f of def.fields) {
      if (!f.showIf) continue;
      form.querySelector(`[data-key="${f.key}"]`).hidden = !f.showIf(values);
    }
  }

  form.addEventListener('change', applyShowIf);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const def = ENTITIES[editing.entity];
    const values = formValues();
    // Les champs masqués ne sont pas conservés (ex. véhicule d'une mission sous-traitée).
    for (const f of def.fields) if (f.showIf && !f.showIf(values)) values[f.key] = '';
    const missing = def.fields.filter((f) => f.required && !values[f.key]).map((f) => f.label);
    if (missing.length) { $('#form-error').textContent = 'Champs obligatoires : ' + missing.join(', '); return; }
    const list = db[editing.entity];
    if (editing.id) {
      Object.assign(findById(editing.entity, editing.id), values);
    } else {
      list.push({ id: uid(), ...values });
    }
    save();
    modal.close();
    render();
  });

  $('#btn-delete').addEventListener('click', () => {
    const { entity, id } = editing;
    const item = findById(entity, id);
    if (!item || !confirm(`Supprimer « ${ENTITIES[entity].title(item)} » ?`)) return;
    db[entity] = db[entity].filter((x) => x.id !== id);
    save();
    modal.close();
    render();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close]')) modal.close();
  });

  // ---------- Événements globaux ----------
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open && !modal.contains(open)) {
      e.preventDefault();
      const [entity, id] = open.dataset.open.split(':');
      openForm(entity, id);
      return;
    }
    const add = e.target.closest('[data-new]');
    if (add) openForm(add.dataset.new, null);
  });

  window.addEventListener('hashchange', () => { search = ''; render(); $('#main').focus(); });

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `winfleet-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#input-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Object.keys(ENTITIES).every((k) => Array.isArray(data[k] ?? []))) throw new Error('format');
      if (!confirm('Remplacer toutes les données actuelles par ce fichier ?')) return;
      db = Object.assign(emptyDb(), data);
      save();
      render();
    } catch (err) {
      alert('Fichier invalide : ce n’est pas un export WinFleet.');
    }
  });

  $('#btn-demo').addEventListener('click', () => {
    if (!confirm('Remplacer toutes les données par le jeu de démonstration ?')) return;
    db = demoData();
    save();
    render();
  });

  // ---------- Jeu de démonstration ----------
  function demoData() {
    const d = todayISO;
    const v = [
      { id: 'v1', immat: 'GH-412-KT', type: 'Tracteur', marque: 'Renault T 480', km: 412300, statut: 'En mission', ct: d(-4), assurance: d(210), tachy: d(95), revision: d(18) },
      { id: 'v2', immat: 'FZ-118-LM', type: 'Tracteur', marque: 'Volvo FH 500', km: 288900, statut: 'Disponible', ct: d(160), assurance: d(210), tachy: d(22), revision: d(60) },
      { id: 'v3', immat: 'EK-902-PA', type: 'Porteur', marque: 'DAF XF 19 t', km: 199450, statut: 'Atelier', ct: d(75), assurance: d(12), tachy: d(300), revision: d(-2) },
      { id: 'v4', immat: 'HB-057-RS', type: 'VUL', marque: 'Iveco Daily 3,5 t', km: 64200, statut: 'Disponible', ct: d(320), assurance: d(210), tachy: '', revision: d(120) },
      { id: 'v5', immat: 'DS-733-NC', type: 'Semi-remorque', marque: 'Krone frigo', km: 0, statut: 'En mission', ct: d(41), assurance: d(210), tachy: '', revision: d(200) },
    ];
    const c = [
      { id: 'c1', nom: 'Benali', prenom: 'Karim', telephone: '06 12 34 56 78', permis: 'C, CE', statut: 'Actif', permisExp: d(1500), fco: d(25), carte: d(400), medical: d(200) },
      { id: 'c2', nom: 'Martin', prenom: 'Sophie', telephone: '06 98 76 54 32', permis: 'C, CE', statut: 'Actif', permisExp: d(2100), fco: d(700), carte: d(-10), medical: d(90) },
      { id: 'c3', nom: 'Rousseau', prenom: 'Julien', telephone: '07 45 12 89 63', permis: 'C', statut: 'Congé', permisExp: d(900), fco: d(1100), carte: d(600), medical: d(15) },
      { id: 'c4', nom: 'Haddad', prenom: 'Yacine', telephone: '06 33 21 47 85', permis: 'B, C, CE', statut: 'Actif', permisExp: d(1300), fco: d(500), carte: d(800), medical: d(340) },
    ];
    const s = [
      { id: 's1', raison: 'Transports Lefèvre SARL', siret: '812 345 678 00021', contact: 'Marc Lefèvre', telephone: '04 72 11 22 33', email: 'exploitation@lefevre-transports.fr', statut: 'Actif', licence: '2021/84/0001234', licenceExp: d(800), urssaf: d(9), assurance: d(150) },
      { id: 's2', raison: 'Express Sud Logistique', siret: '901 222 333 00015', contact: 'Nadia Ferhat', telephone: '04 91 55 66 77', email: 'contact@expresssud.fr', statut: 'Actif', licence: '2019/13/0005678', licenceExp: d(400), urssaf: d(120), assurance: d(-3) },
      { id: 's3', raison: 'Atlas Fret', siret: '799 888 111 00034', contact: 'Paul Girard', telephone: '03 20 44 55 66', statut: 'Suspendu', licence: '2018/59/0009012', licenceExp: d(60), urssaf: d(-40), assurance: d(60) },
    ];
    const m = [
      { id: 'm1', ref: 'M-001', client: 'Carrefour Supply', date: d(0), statut: 'En cours', enlevement: 'Lyon (69)', livraison: 'Marseille (13)', mode: 'Interne', vehicule: 'v1', chauffeur: 'c1', prixVente: 980 },
      { id: 'm2', ref: 'M-002', client: 'Leroy Matériaux', date: d(0), statut: 'Planifiée', enlevement: 'Villefranche (69)', livraison: 'Grenoble (38)', mode: 'Sous-traitance', soustraitant: 's1', prixVente: 640, prixAchat: 520 },
      { id: 'm3', ref: 'M-003', client: 'Danone Frais', date: d(1), statut: 'Planifiée', enlevement: 'Saint-Priest (69)', livraison: 'Dijon (21)', mode: 'Interne', vehicule: 'v2', chauffeur: '', prixVente: 720 },
      { id: 'm4', ref: 'M-004', client: 'Brico Pro', date: d(-1), statut: 'Livrée', enlevement: 'Lyon (69)', livraison: 'Clermont-Ferrand (63)', mode: 'Interne', vehicule: 'v4', chauffeur: 'c4', prixVente: 410 },
      { id: 'm5', ref: 'M-005', client: 'Carrefour Supply', date: d(-3), statut: 'Facturée', enlevement: 'Marseille (13)', livraison: 'Toulouse (31)', mode: 'Sous-traitance', soustraitant: 's2', prixVente: 1150, prixAchat: 930 },
      { id: 'm6', ref: 'M-006', client: 'Agri Rhône', date: d(2), statut: 'Planifiée', enlevement: 'Valence (26)', livraison: 'Paris (75)', mode: 'Sous-traitance', soustraitant: '', prixVente: 1450 },
    ];
    return { vehicules: v, chauffeurs: c, soustraitants: s, missions: m };
  }

  save();
  render();
})();
