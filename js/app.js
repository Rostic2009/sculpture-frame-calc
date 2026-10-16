/* Каркас інтерфейсу: стан проєкту, меню розділів, події, скасування/повторення, журнал змін, статуси.
 * Сторінки розділів — у файлах pages-*.js (SC.pages[id] = { render(ctx), after(ctx), onAct, onChange }). */
(function (SC) {
  'use strict';

  const N = SC.norms;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const KEY = 'sculpture-frame-calc.project.v2';
  const state = { pr: null, R: null, stale: true, tab: 'home', undo: [], redo: [], ui: {} };
  SC.pages = SC.pages || {};

  // ---------- збереження ----------
  function migrate(p) { const d = SC.model.defaultProject(); return deepMerge(d, p); }
  function deepMerge(a, b) { if (Array.isArray(b)) return b; if (b && typeof b === 'object') { const o = Object.assign({}, a); for (const k in b) o[k] = (a && typeof a[k] === 'object' && !Array.isArray(a[k]) && a[k] !== null) ? deepMerge(a[k], b[k]) : b[k]; return o; } return b; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? migrate(JSON.parse(s)) : null; } catch (e) { return null; } }
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state.pr)); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('Проєкт завеликий для пам\'яті браузера (зображення). Збережіть JSON проєкту вручну.'); } }
  }
  state.pr = load() || SC.model.defaultProject();

  // ---------- шляхи ----------
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const set = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; };

  const fmt = SC.report.fmt, f = fmt.f, esc = fmt.esc;

  /** Поле форми. o: {type:'text'|'check', options:[[v,l]], num, step, hint, rerender} */
  function fld(path, label, unit, o) {
    o = o || {};
    const v = get(state.pr, path);
    const id = 'f_' + path.replace(/\./g, '_');
    if (o.type === 'check') return `<div class="fld check"><input type="checkbox" id="${id}" data-path="${path}" data-type="check" ${v ? 'checked' : ''} ${o.rerender ? 'data-rerender="1"' : ''}><label for="${id}">${label}</label></div>`;
    let input;
    if (o.options) input = `<select id="${id}" data-path="${path}" data-type="${o.num ? 'num' : 'str'}" ${o.rerender ? 'data-rerender="1"' : ''}>${o.options.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else input = `<input id="${id}" data-path="${path}" data-type="${o.type === 'text' ? 'str' : 'num'}" type="${o.type === 'text' ? 'text' : 'number'}" ${o.step ? `step="${o.step}"` : 'step="any"'} ${o.min != null ? `min="${o.min}" data-min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} value="${esc(v)}" ${o.rerender ? 'data-rerender="1"' : ''}>`;
    return `<div class="fld"><label for="${id}"><span>${label}</span>${unit ? `<span class="unit">${unit}</span>` : ''}</label>${input}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  }
  const secOptions = () => SC.sections.list().map(s => [s.name, `${s.name} — ${f(s.mass, 2)} кг/м`]);
  const pill = (txt, cls) => `<span class="pill ${cls || ''}">${txt}</span>`;
  const normPill = st => st === 'checked' ? pill('звірено', 'ok') : st === 'verify' ? pill('звірити', 'warn') : pill('користувач');
  const card = (title, body, sub) => `<section class="card"><h3>${title}${sub ? ` <small>${sub}</small>` : ''}</h3>${body}</section>`;
  const needCalc = () => !state.R || !state.R.ok ? `<div class="card"><p>Розрахунок ще не виконано або містить помилку схеми. Натисніть «Розрахувати».</p>${state.R && !state.R.ok ? `<ul class="warns"><li class="error">${esc(state.R.error)}</li></ul>` : ''}</div>` : '';
  const staleBanner = () => state.R && state.stale ? '<div class="banner warn">Вихідні дані змінено після розрахунку — результати <b>застарілі</b>. Натисніть «Розрахувати».</div>' : '';

  // ---------- меню ----------
  const MENU = [
    ['Проєкт', [['home', 'Головна'], ['project', 'Загальні дані'], ['status', 'Статуси та журнал']]],
    ['1 · Вихідні дані', [['site', 'Майданчик і експлуатація'], ['images', 'Зображення виробу'], ['parts', 'Частини скульптури'], ['model3d', '3D-модель'], ['supports', 'Опори'], ['shellIn', 'Оболонка']]],
    ['2 · Навантаження', [['registry', 'Реєстр впливів'], ['wind', 'Вітер'], ['aero', 'Аеродинаміка'], ['snow', 'Сніг'], ['ice', 'Ожеледь'], ['temp', 'Температура'], ['seismic', 'Сейсміка'], ['userLoads', 'Монтаж і обслуговування'], ['combos', 'Сполучення']]],
    ['3 · Каркас', [['frame', 'Схема і генерація'], ['nodes', 'Вузли та стрижні'], ['sections', 'Перерізи і підбір'], ['variants', 'Порівняння варіантів'], ['catalog', 'Сортамент труб']]],
    ['4 · Розрахунок', [['fem', 'Рама (МСЕ)'], ['secCheck', 'Перевірка перерізів'], ['stability', 'Стійкість і динаміка'], ['welds', 'Зварні шви'], ['basePlate', 'Опорна плита і ребра'], ['anchors', 'Анкери і закладні деталі'], ['foundation', 'Фундаментна плита'], ['rebar', 'Армування'], ['shell', 'Оболонка (лист)']]],
    ['5 · Документи', [['spec', 'Специфікація і кошторис'], ['drawings', 'Креслення'], ['report', 'Звіт']]],
    ['Довідка', [['norms', 'Нормативна база'], ['tz', 'Аналіз ТЗ'], ['tests', 'Перевірка ядра'], ['help', 'Методика']]],
  ];
  const PAGE_REF = { members: 'secCheck', welds: 'welds', base: 'basePlate', found: 'foundation', wind: 'wind', seis: 'seismic', fem: 'fem', sls: 'fem', shell: 'shell', geom: 'supports', dyn: 'stability' };

  function readiness() {
    const pr = state.pr, R = state.R;
    const assumed = pr.parts.some(p => p.status === 'assumed');
    return [
      ['Вихідні дані', pr.meta.location && pr.site.W0 && pr.site.S0 ? 'підтверджено' : 'чернетка', 'site'],
      ['Геометрія', !pr.parts.length ? 'відсутня' : assumed ? 'потребує уточнення' : pr.parts.some(p => p.areaTable) ? 'підтверджено' : 'чернетка', 'parts'],
      ['Матеріали', 'підтверджено', 'catalog'],
      ['Навантаження', pr.site.aero.confirmed ? 'підтверджено' : 'чернетка', 'registry'],
      ['Каркас', !R ? 'не згенеровано' : R.ok ? 'перевірено' : 'помилка', 'frame'],
      ['Опори та фундамент', !pr.supports.confirmed ? 'не підтверджено' : !R || !R.ok ? 'попередньо' : (R.found.govSls.chk.max <= 1 && R.found.govUls.chk.max <= 1) ? 'перевірено' : 'не проходить', 'supports'],
      ['Результати', !R ? 'відсутні' : state.stale ? 'застарілі' : !R.ok ? 'помилка' : R.status === 'ok' ? 'перевірені' : R.status === 'preliminary' ? 'попередні' : 'не проходять', 'fem'],
      ['Експорт', !R || state.stale ? 'недоступний' : R.status === 'ok' ? 'доступний' : 'обмежений', 'report'],
    ];
  }
  const stCls = s => /підтвердж|перевірен|доступн/.test(s) && !/не /.test(s) ? 'ok' : /помилка|не проходять|не проходить|застарілі|недоступн/.test(s) ? 'bad' : 'warn';

  function dot(id) {
    const R = state.R; if (!R || !R.ok) return '';
    let u;
    try {
      u = {
        secCheck: Math.max(...R.memberRes.map(m => m.best.u)),
        welds: Math.max(0, ...R.welds.map(w => w.u)),
        basePlate: Math.max(...R.supportRes.map(s => s.best.u)),
        anchors: Math.max(...R.supportRes.map(s => s.best.b ? Math.max(s.best.b.anchorSteel, s.best.b.concrete.max, s.best.b.washer.max) : 0)),
        foundation: Math.max(R.found.govSls.chk.max, R.found.govUls.chk.max, R.found.settle.uS, R.found.settle.uT),
        rebar: R.found.slab.max,
        shell: Math.max(...R.shellRes.map(s => s.u)),
      }[id];
    } catch (e) { u = null; }
    if (u == null || !isFinite(u)) return '';
    return `<span class="dot ${u > 1 ? 'bad' : u > 0.9 ? 'warn' : 'ok'}" title="max U = ${f(u, 2)}"></span>`;
  }
  function navHTML() {
    return MENU.map(([g, items]) => `<div class="grp">${g}</div>` + items.map(([id, l]) => `<button data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}><span>${l}</span>${dot(id)}</button>`).join('')).join('');
  }

  function render() {
    document.getElementById('nav').innerHTML = navHTML();
    const ns = document.getElementById('navsel');
    if (ns) ns.innerHTML = MENU.map(([g, items]) => `<optgroup label="${g}">${items.map(([id, l]) => `<option value="${id}" ${state.tab === id ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('');
    const page = SC.pages[state.tab] || SC.pages.home;
    const c = document.getElementById('content');
    try { c.innerHTML = page.render(ctx); }
    catch (err) { c.innerHTML = `<div class="card"><ul class="warns"><li class="error">Помилка відображення розділу: ${esc(err.message)}</li></ul></div>`; console.error(err); }
    document.getElementById('ptitle').textContent = state.pr.meta.name;
    updateStatus();
    if (page.after) try { page.after(ctx); } catch (err) { console.error(err); }
    try { localStorage.setItem(KEY + '.tab', state.tab); } catch (e) { /* */ }
  }
  function updateStatus() {
    const st = document.getElementById('pstatus'); if (!st) return;
    const map = { ok: 'перевірки виконуються', preliminary: 'попередній розрахунок', 'not-ok': 'є невиконані перевірки' };
    if (!state.R) { st.className = 'status stale'; st.textContent = 'не розраховано'; }
    else if (!state.R.ok) { st.className = 'status not-ok'; st.textContent = 'помилка схеми'; }
    else { st.className = 'status ' + (state.stale ? 'stale' : state.R.status); st.textContent = state.stale ? 'застарілий — перерахуйте' : map[state.R.status]; }
    document.getElementById('pstat2').textContent = state.pr.status.value;
    document.getElementById('undoBtn').disabled = !state.undo.length; document.getElementById('redoBtn').disabled = !state.redo.length;
  }

  // ---------- зміни, журнал, скасування ----------
  let snapT = null, lastSnap = JSON.stringify(state.pr);
  function snapshot() {
    clearTimeout(snapT);
    snapT = setTimeout(() => { const s = JSON.stringify(state.pr); if (s !== lastSnap) { state.undo.push(lastSnap); if (state.undo.length > 40) state.undo.shift(); state.redo = []; lastSnap = s; updateStatus(); } }, 400);
  }
  function logChange(path, oldV, newV) {
    const j = state.pr.journal = state.pr.journal || [];
    const short = v => typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v);
    j.push({ t: new Date().toISOString().slice(0, 19).replace('T', ' '), user: state.pr.role, path, old: short(oldV), nw: short(newV) });
    if (j.length > 500) j.splice(0, j.length - 500);
  }
  function changed(path, oldV, newV) {
    if (path) logChange(path, oldV, newV);
    if (state.pr.status.value === 'Погоджено конструктором' || state.pr.status.value === 'Перевірено системою') {
      setStatus('Застарілий', `змінено «${path}» (ТЗ 2.1.4)`, 'система');
    }
    state.stale = true; save(); snapshot(); updateStatus();
  }
  function undo() { if (!state.undo.length) return; state.redo.push(JSON.stringify(state.pr)); const s = state.undo.pop(); state.pr = JSON.parse(s); lastSnap = s; state.stale = true; save(); render(); }
  function redo() { if (!state.redo.length) return; state.undo.push(JSON.stringify(state.pr)); const s = state.redo.pop(); state.pr = JSON.parse(s); lastSnap = s; state.stale = true; save(); render(); }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.path) {
      const old = get(state.pr, t.dataset.path);
      let v = t.dataset.type === 'check' ? t.checked : t.dataset.type === 'num' ? (t.value === '' ? 0 : parseFloat(String(t.value).replace(',', '.'))) : t.value;
      if (t.dataset.type === 'num' && !isFinite(v)) { toast('Введіть число.'); return; }
      if (t.dataset.min != null && v < +t.dataset.min) toast(`Значення менше допустимого мінімуму ${t.dataset.min}.`);
      set(state.pr, t.dataset.path, v);
      const p = t.dataset.path;
      if (p === 'site.city') { const c = N.cities.find(x => x.name === v); if (c) { if (c.W0) state.pr.site.W0 = c.W0; if (c.S0) state.pr.site.S0 = c.S0; state.pr.meta.location = 'м. ' + c.name; } }
      if (p === 'site.windDistrict') state.pr.site.W0 = N.windDistricts.find(d => d.id === v).W0;
      if (p === 'site.snowDistrict') state.pr.site.S0 = N.snowDistricts.find(d => d.id === v).S0;
      if (p === 'site.cc') state.pr.site.gammaN = N.gammaN.find(g => g.id === v).g;
      if (p === 'meta.name') document.getElementById('ptitle').textContent = v;
      changed(p, old, v);
      if (t.dataset.rerender) render();
      return;
    }
    for (const page of Object.values(SC.pages)) if (page.onChange && page.onChange(e, ctx)) return;
  }
  function onClick(e) {
    const b = e.target.closest('[data-tab],[data-act]'); if (!b) return;
    if (b.tagName === 'A') e.preventDefault();
    if (b.dataset.tab) { go(b.dataset.tab); return; }
    const a = b.dataset.act;
    if (a === 'run') return runCalc();
    if (a === 'opt') return runOpt();
    if (a === 'undo') return undo();
    if (a === 'redo') return redo();
    for (const page of Object.values(SC.pages)) if (page.onAct && page.onAct(a, b, ctx, e)) return;
  }
  function go(tab) { state.tab = tab; render(); window.scrollTo(0, 0); }

  // ---------- розрахунок ----------
  function progress(p) { const b = document.getElementById('bar'); if (b) b.style.width = (Math.max(0, Math.min(1, p)) * 100) + '%'; }
  function runCalc(next) {
    const btn = document.getElementById('runbtn'); btn.disabled = true; btn.textContent = 'Розрахунок…'; progress(0.2);
    setTimeout(() => {
      try {
        state.R = SC.analysis.run(state.pr); state.stale = false;
        if (state.R.ok && ['Чернетка', 'Застарілий'].includes(state.pr.status.value)) setStatus(state.R.status === 'ok' ? 'Перевірено системою' : 'Попередній розрахунок', 'автоматично після розрахунку', 'система');
      } catch (err) { state.R = { ok: false, error: 'Помилка розрахунку: ' + err.message }; console.error(err); }
      btn.disabled = false; btn.textContent = 'Розрахувати'; progress(1); setTimeout(() => progress(0), 300);
      if (typeof next === 'string') state.tab = next;
      render();
    }, 30);
  }
  function runOpt() {
    const btn = document.getElementById('optbtn'); btn.disabled = true; btn.textContent = 'Підбір…'; progress(0.1);
    setTimeout(() => {
      try {
        const o = SC.analysis.optimize(state.pr);
        o.keys.forEach(k => logChange('переріз: ' + k.group, '', k.sec));
        state.pr.frame.secPost = o.pr.frame.secPost; state.pr.frame.secRing = o.pr.frame.secRing; state.pr.frame.secBrace = o.pr.frame.secBrace;
        state.pr.parts.forEach((p, i) => { if (o.pr.parts[i]) p.sec = o.pr.parts[i].sec; });
        state.ui.optHist = o.hist;
        save(); snapshot();
        state.R = SC.analysis.run(state.pr); state.stale = false;
        toast('Підібрано: ' + o.keys.map(k => `${k.group} — ${k.sec}`).join('; '));
      } catch (err) { toast('Підбір не вдався: ' + err.message); console.error(err); }
      btn.disabled = false; btn.textContent = 'Підібрати перерізи'; progress(0); state.tab = 'sections'; render();
    }, 30);
  }

  // ---------- статуси (ТЗ 2.1.3, UI-9) ----------
  const STATUSES = ['Чернетка', 'Потребує уточнення', 'Підтверджено користувачем', 'Попередній розрахунок', 'Перевірено системою', 'Погоджено конструктором', 'Застарілий', 'Відхилено'];
  function canSet(to) {
    const R = state.R, role = state.pr.role;
    if (to === 'Погоджено конструктором') {
      if (role !== 'Інженер-конструктор') return 'лише роль «Інженер-конструктор»';
      if (!R || !R.ok) return 'немає розрахунку';
      if (state.stale) return 'вихідні дані змінено — результати застарілі';
      if (R.warn.some(w => w.level === 'error')) return 'є критичні попередження';
      if (R.status === 'preliminary') return 'результат попередній (аеродинаміка або нормативні дані не підтверджені)';
      if (!state.pr.supports.confirmed) return 'опори не підтверджені';
    }
    if (to === 'Перевірено системою' && (!R || !R.ok || R.status === 'not-ok' || state.stale)) return 'немає актуального успішного розрахунку';
    if (to === 'Застарілий') return 'встановлюється системою автоматично';
    return '';
  }
  function setStatus(to, reason, user) {
    const s = state.pr.status;
    s.log.push({ t: new Date().toISOString().slice(0, 19).replace('T', ' '), user: user || state.pr.role, from: s.value, to, reason });
    s.value = to; save();
  }

  // ---------- утиліти ----------
  function toast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 4500); }
  async function copy(text, okMsg, boxId) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) { const box = document.getElementById(boxId || 'jsonbox'); if (box) { box.value = text; box.select(); toast('Скопіюйте виділений текст (Ctrl+C).'); } else toast('Буфер обміну недоступний.'); }
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  const ctx = { state, get, set, fld, secOptions, pill, normPill, card, needCalc, staleBanner, f, esc, fmt, N, inFrame, render, go, changed, toast, copy, download, runCalc, readiness, stCls, STATUSES, canSet, setStatus, save, PAGE_REF, MENU, logChange, migrate, progress };
  SC.ctx = ctx;

  function init() {
    // не перезаписуємо <body>: у вікні перегляду там лежать стилі сторінки — додаємо власний контейнер
    let root = document.getElementById('app-root');
    if (!root) { root = document.createElement('div'); root.id = 'app-root'; document.body.appendChild(root); }
    root.innerHTML = `<div class="progress" id="bar"></div>
    <div class="app"><aside class="side"><div class="brand"><b>Каркас скульптури</b><small>розрахунок за ДБН · EN · у браузері, без API</small></div>
      <label class="search" for="navsearch"><span class="sr">Пошук розділу</span><input id="navsearch" type="search" placeholder="Пошук розділу…"></label>
      <label class="navsel" for="navsel"><span class="sr">Розділ</span><select id="navsel"></select></label>
      <nav class="nav" id="nav" aria-label="Розділи"></nav></aside>
    <main class="main"><div class="top"><h1 id="ptitle"></h1><span class="status" id="pstatus"></span><span class="pill" id="pstat2" title="Статус проєкту"></span>
      <div class="tbtns"><button class="btn icon" id="undoBtn" data-act="undo" title="Скасувати (Ctrl+Z)" aria-label="Скасувати">↶</button><button class="btn icon" id="redoBtn" data-act="redo" title="Повторити (Ctrl+Y)" aria-label="Повторити">↷</button>
      <button class="btn" id="optbtn" data-act="opt">Підібрати перерізи</button><button class="btn primary" id="runbtn" data-act="run" title="Ctrl+Enter">Розрахувати</button></div></div>
      <div class="content" id="content"></div></main></div>
    <div id="toast" class="toast" hidden role="status"></div>`;
    document.addEventListener('change', e => { if (e.target.id === 'navsel') { go(e.target.value); return; } onChange(e); });
    document.addEventListener('click', onClick);
    document.addEventListener('input', e => { for (const page of Object.values(SC.pages)) if (page.onInput && page.onInput(e, ctx)) return; });
    document.getElementById('navsearch').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#nav button').forEach(b => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); });
      document.querySelectorAll('#nav .grp').forEach(g => { g.hidden = !!q; });
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.target.closest('input,textarea,select')) {
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCalc(); }
    });
    try { const t = localStorage.getItem(KEY + '.tab'); if (t && SC.pages[t]) state.tab = t; } catch (e) { /* */ }
    const h = (location.hash || '').slice(1); if (h && SC.pages[h]) state.tab = h;
    render();
    setTimeout(() => {
      try {
        state.R = SC.analysis.run(state.pr); state.stale = false;
        if (state.R.ok && state.pr.status.value === 'Чернетка') setStatus(state.R.status === 'ok' ? 'Перевірено системою' : 'Попередній розрахунок', 'автоматично після розрахунку', 'система');
        render();
      } catch (e) { console.error(e); }
    }, 60);
    window.addEventListener('resize', () => { const p = SC.pages[state.tab]; if (p && p.resize) p.resize(ctx); });
  }

  SC.app = { state, init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})(window.SC = window.SC || {});
