/* Розділ «Зображення виробу»: завантаження фото/рендерів/креслень, ракурси (колаж → види), маска скульптури,
 * дерево частин, розміри й масштаб, точка основи, перевірка якості, OCR (за наявності мережі), побудова 3D з проєкцій,
 * чек-лист підтвердження (ТЗ, 9) і передача частин у розрахунок. Обробка — у браузері, без зовнішніх API. */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};
  const V = SC.vision;
  const COLORS = ['#d9480f', '#1971c2', '#2b8a3e', '#ae3ec9', '#e8590c', '#0c8599', '#f08c00', '#c2255c', '#5c940d', '#4263eb', '#862e9c', '#495057'];
  const PRESET = ['Тулуб', 'Голова', 'Шия', 'Ліва рука', 'Права рука', 'Книга', 'Плащ', 'Ноги', 'Нижні опорні частини'];
  const MAXPX = 900;

  const vs = () => { const s = SC.ctx.state; s.ui.vis = s.ui.vis || { tool: 'brush', r: 8, tol: 18, label: 1, poly: [], dimPts: [], zoom: 1, masks: new Map(), labs: new Map(), imgs: new Map(), undo: new Map(), onlyObj: true }; return s.ui.vis; };
  const proj = () => { const pr = SC.ctx.state.pr; pr.images = pr.images || []; pr.vision = pr.vision || { parts: [], depthRatio: 0.6, checklist: {} }; pr.vision.checklist = pr.vision.checklist || {}; return pr; };
  const curImg = () => { const pr = proj(); return pr.images.find(i => i.id === pr.vision.activeImg) || pr.images[0]; };
  const curView = () => { const im = curImg(); if (!im) return null; return im.views.find(v => v.id === proj().vision.activeView) || im.views[0]; };
  const uid = p => p + Math.random().toString(36).slice(2, 8);

  /** Зображення ракурсу як ImageData (кеш). */
  function viewImage(im, v) {
    const u = vs();
    const key = v.id;
    if (u.imgs.has(key)) return u.imgs.get(key);
    const el = u.imgs.get('el:' + im.id);
    if (!el || !el.complete) return null;
    const cv = document.createElement('canvas'); cv.width = v.crop[2]; cv.height = v.crop[3];
    const g = cv.getContext('2d'); g.drawImage(el, v.crop[0], v.crop[1], v.crop[2], v.crop[3], 0, 0, v.crop[2], v.crop[3]);
    const data = g.getImageData(0, 0, cv.width, cv.height);
    u.imgs.set(key, data);
    return data;
  }
  function ensureImgEl(im, cb) {
    const u = vs();
    let el = u.imgs.get('el:' + im.id);
    if (el && el.complete) return el;
    if (!el) { el = new Image(); el.onload = () => cb && cb(); el.src = im.src; u.imgs.set('el:' + im.id, el); }
    return null;
  }
  function getMask(v) {
    const u = vs();
    if (!u.masks.has(v.id)) u.masks.set(v.id, V.unrle(v.mask, v.crop[2] * v.crop[3]));
    return u.masks.get(v.id);
  }
  function commitMask(v, c) { v.mask = V.rle(getMask(v)); c.changed('маска ракурсу ' + v.name, '', 'змінено'); }
  function pushUndo(v) { const u = vs(); const st = u.undo.get(v.id) || []; st.push(V.rle(getMask(v))); if (st.length > 15) st.shift(); u.undo.set(v.id, st); }
  function labelName(l) { if (l === 0) return 'фон'; if (l === 1) return 'скульптура (без частини)'; const p = proj().vision.parts[l - 2]; return p ? p.name : '?'; }

  async function addFiles(files, c) {
    const pr = proj();
    for (const file of files) {
      if (!/^image\//.test(file.type)) { c.toast(`${file.name}: не зображення (підтримуються JPG, PNG, WebP).`); continue; }
      const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = url; });
      const k = Math.min(1, MAXPX / Math.max(img.width, img.height));
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const src = cv.toDataURL('image/jpeg', 0.86);
      const id = uid('img');
      const view = { id: uid('v'), name: 'Фронтальний', orient: 'front', crop: [0, 0, w, h], mask: '', dims: [], base: null, sideSign: 1 };
      pr.images.push({ id, name: file.name, size: file.size, date: new Date().toISOString().slice(0, 10), origW: img.width, origH: img.height, w, h, src, views: [view], author: pr.role });
      pr.vision.activeImg = id; pr.vision.activeView = view.id;
      const data = cv.getContext('2d').getImageData(0, 0, w, h);
      const q = V.quality(data);
      pr.images[pr.images.length - 1].quality = q.warnings;
    }
    c.changed('зображення', '', 'завантажено'); c.render();
  }

  P.images = {
    input: true,
    render(c) {
      const pr = proj(), u = vs(), { esc, f, card, fmt } = c;
      const im = curImg(), v = curView();
      const parts = pr.vision.parts;
      const files = pr.images.map(i => `<tr class="${im && im.id === i.id ? 'sel' : ''}"><td><button class="link" data-act="visImg" data-id="${i.id}">${esc(i.name)}</button></td><td>${i.origW}×${i.origH} → ${i.w}×${i.h}</td><td>${f((i.size || 0) / 1024, 0)} КБ</td><td>${esc(i.date)}</td><td>${(i.quality || []).map(w => c.pill(esc(w), 'warn')).join(' ') || c.pill('якість прийнятна', 'ok')}</td><td><button class="btn small" data-act="visDelImg" data-id="${i.id}" aria-label="Видалити">✕</button></td></tr>`).join('');
      const tools = [['brush', 'Пензель'], ['erase', 'Гумка'], ['wand', 'Чарівна паличка'], ['poly', 'Багатокутник'], ['dim', 'Розмір'], ['base', 'Точка основи'], ['crop', 'Новий ракурс (рамка)']];
      const labelOpts = [[1, 'скульптура (без частини)']].concat(parts.map((p, i) => [i + 2, p.name])).concat([[0, 'фон (стерти)']]);
      const conf = v ? viewScale(v) : null;
      const dims = v ? v.dims.map((d, i) => { const cf = conf && conf.list.find(x => x.id === d.id); return `<tr>
        <td><input data-dim="${i}.value" type="number" step="any" value="${d.value || ''}" placeholder="число" style="width:90px"></td>
        <td><select data-dim="${i}.unit">${['мм', 'см', 'м'].map(x => `<option ${d.unit === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><select data-dim="${i}.type">${[['vertical', 'вертикальна висота'], ['horizontal', 'горизонтальна ширина'], ['distance', 'відстань між точками'], ['depth', 'глибина (боковий вид)']].map(([k, l]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><select data-dim="${i}.part"><option value="">габарит скульптури</option>${parts.map(p => `<option value="${p.id}" ${d.part === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
        <td>${f(Math.hypot(d.p2[0] - d.p1[0], d.p2[1] - d.p1[1]), 0)} пкс${d.ocr ? ` · OCR ${f(d.ocr * 100, 0)} %` : ''}</td>
        <td><input type="radio" name="dimMain" data-dimmain="${i}" ${d.main ? 'checked' : ''} aria-label="головний"></td>
        <td><input type="checkbox" data-dim="${i}.confirmed" ${d.confirmed ? 'checked' : ''} aria-label="підтверджено"></td>
        <td>${cf ? (cf.conflict ? c.pill(`ε = ${f(cf.eps * 100, 1)} %`, 'bad') : c.pill(`ε = ${f(cf.eps * 100, 1)} %`, 'ok')) : '—'}</td>
        <td><button class="btn small" data-act="visDelDim" data-i="${i}" aria-label="Видалити">✕</button></td></tr>`; }).join('') : '';
      const counts = v ? (() => { const m = getMask(v); const n = new Array(parts.length + 2).fill(0); for (let i = 0; i < m.length; i++) n[m[i]]++; return n; })() : [];
      const partRows = parts.map((p, i) => `<tr><td><span class="sw" style="background:${p.color}"></span><input data-vpart="${i}.name" value="${esc(p.name)}" style="min-width:120px"></td>
        <td><select data-vpart="${i}.parent"><option value="">— скульптура</option>${parts.filter(q => q.id !== p.id).map(q => `<option value="${q.id}" ${p.parent === q.id ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}</select></td>
        <td><select data-vpart="${i}.shape"><option value="volume" ${p.shape !== 'sheet' ? 'selected' : ''}>об'ємна</option><option value="sheet" ${p.shape === 'sheet' ? 'selected' : ''}>відкритий лист</option></select></td>
        <td><select data-vpart="${i}.kind"><option value="auto" ${!p.kind || p.kind === 'auto' ? 'selected' : ''}>авто</option><option value="dist" ${p.kind === 'dist' ? 'selected' : ''}>по висоті ядра</option><option value="cant" ${p.kind === 'cant' ? 'selected' : ''}>консоль</option></select></td>
        <td>${v ? `<select data-vvis="${i}">${['повністю видима', 'частково перекрита', 'виходить за кадр', 'не видима', 'геометрія припущена'].map(s => `<option ${((p.vis || {})[v.id] || 'повністю видима') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : '—'}</td>
        <td class="num">${counts[i + 2] || 0}</td>
        <td><button class="btn small" data-act="visDelPart" data-i="${i}" aria-label="Видалити">✕</button></td></tr>`).join('');
      const views = im ? im.views.map(w => `<button class="chip ${v && v.id === w.id ? 'on' : ''}" data-act="visView" data-id="${w.id}">${esc(w.name)}</button>`).join('') : '';
      const cl = pr.vision.checklist;
      const checklist = [['dims', 'Загальні габарити'], ['parts', 'Основні розміри частин'], ['orient', 'Орієнтація моделі (фронт/бік, напрямок осі Y)'], ['scale', 'Масштаб'], ['shell', 'Відкритість або замкненість оболонки'], ['holes', 'Положення технологічних отворів'], ['supports', 'Реальні точки опирання'], ['cant', 'Довжини виносних елементів'], ['unknown', 'Невідомі або умовно відновлені ділянки']];
      return `<h2>Зображення виробу</h2>
      <p class="lead">Завантажте фото, художні рендери або креслення (фронтальний і боковий вигляди). Система виділяє скульптуру автоматично за кольором фону; частини (тулуб, голова, руки, книга, плащ) позначаються пензлем, «чарівною паличкою» чи багатокутником. Розміри задаються розмірними лініями й обов'язково підтверджуються — ШІ не переводить припущення в «виміряно» (ТЗ 6.3, UI-ACC-004). Усе працює у браузері, без API.</p>
      ${card('1. Файли', `<div class="row"><label class="btn primary" for="visFiles">Завантажити зображення…</label><input type="file" id="visFiles" accept="image/*" multiple hidden><span class="note">Перетягніть файли сюди або оберіть. Оригінали не змінюються; робоча копія — до ${MAXPX} пкс.</span></div>
        ${pr.images.length ? fmt.tbl(['Файл', 'Роздільність', 'Розмір', 'Дата', 'Перевірка якості', ''], []).replace('<tbody></tbody>', '<tbody>' + files + '</tbody>') : '<p class="note">Зображень ще немає. Для 3D потрібні щонайменше фронтальний вигляд із розміром і точкою основи; боковий — для глибини.</p>'}`)}
      ${im ? card('2. Ракурси', `<div class="row">${views}<button class="btn small" data-act="visAddView">+ Ракурс із цього файлу</button></div>
        ${v ? `<div class="form">
          <div class="fld"><label for="vName">Назва ракурсу</label><input id="vName" data-vview="name" value="${esc(v.name)}"></div>
          <div class="fld"><label for="vOrient">Орієнтація</label><select id="vOrient" data-vview="orient">${[['front', 'Фронтальний (площина XZ)'], ['side', 'Боковий (площина YZ)'], ['back', 'Задній'], ['top', 'Вигляд зверху'], ['other', 'Перспектива / інше']].map(([k, l]) => `<option value="${k}" ${v.orient === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${v.orient === 'side' ? `<div class="fld"><label for="vSign">Праворуч на боковому вигляді</label><select id="vSign" data-vview="sideSign"><option value="1" ${v.sideSign == 1 ? 'selected' : ''}>+Y</option><option value="-1" ${v.sideSign == -1 ? 'selected' : ''}>−Y</option></select></div>` : ''}
          <div class="fld check"><input type="checkbox" id="vConf" data-vview="confirmed" ${v.confirmed ? 'checked' : ''}><label for="vConf">Орієнтацію підтверджено</label></div>
          <div class="note">Рамка: ${v.crop.join(' × ')} пкс. Масштаб: ${conf && isFinite(conf.scale) ? f(conf.scale * 1000, 3) + ' мм/пкс' : c.pill('не задано', 'warn')} · Основа: ${v.base ? `(${v.base[0]}, ${v.base[1]})` : c.pill('не задано', 'warn')}</div>
        </div>` : ''}`) : ''}
      ${v ? `<section class="card"><h3>3. Маска та частини <small>${esc(v.name)}</small></h3>
        <div class="toolbar">${tools.map(([k, l]) => `<button class="chip ${u.tool === k ? 'on' : ''}" data-act="visTool" data-tool="${k}">${l}</button>`).join('')}</div>
        <div class="toolbar">
          <label>Мітка <select id="visLabel">${labelOpts.map(([k, l]) => `<option value="${k}" ${+u.label === +k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label>Пензель <input id="visR" type="range" min="2" max="40" value="${u.r}"> <span id="visRv">${u.r}</span> пкс</label>
          <label>Допуск кольору ΔE <input id="visTol" type="range" min="4" max="50" value="${u.tol}"> <span id="visTolv">${u.tol}</span></label>
          <label class="mini"><input type="checkbox" id="visOnlyObj" ${u.onlyObj ? 'checked' : ''}> лише в межах скульптури</label>
        </div>
        <div class="toolbar">
          <button class="btn" data-act="visAuto">Виділити скульптуру автоматично</button>
          <button class="btn" data-act="visHoles">Авто + отвори як фон</button>
          <button class="btn" data-act="visClean">Очистити дрібні плями</button>
          <button class="btn" data-act="visUndo">Скасувати дію маски</button>
          <button class="btn" data-act="visClear">Очистити маску</button>
          ${u.tool === 'poly' ? `<button class="btn primary" data-act="visPolyDone">Завершити багатокутник (${u.poly.length} т.)</button>` : ''}
          <button class="btn" data-act="visOCR">Розпізнати числа (OCR)</button>
        </div>
        <div class="vis-wrap"><canvas id="visCv" class="vis-cv" aria-label="Редактор маски"></canvas></div>
        <p class="note" id="visHint">${hint(u.tool)}</p></section>
      ${card('Дерево частин', `<div class="row">${PRESET.map(n => `<button class="chip" data-act="visAddPart" data-name="${n}">+ ${n}</button>`).join('')}<button class="chip" data-act="visAddPart" data-name="">+ інша…</button></div>
        <div class="tw"><table class="edit"><thead><tr><th>Частина</th><th>Батьківська</th><th>Форма</th><th>Тип у каркасі</th><th>Видимість на цьому ракурсі</th><th class="num">Пікселів</th><th></th></tr></thead><tbody>${partRows || '<tr><td colspan="7">Додайте частини (ліва й права руки — окремі частини з власними ідентифікаторами).</td></tr>'}</tbody></table></div>`)}
      ${card('Розміри й масштаб', `<p class="note">Інструмент «Розмір»: клацніть дві точки, введіть число й одиницю, оберіть тип і позначте «підтверджено». Головний розмір задає масштаб s = L<sub>real</sub>/L<sub>px</sub>; решта перевіряються на розбіжність ε (допуск 3 %). Масштаб не переноситься на глибину перспективного зображення.</p>
        <div class="tw"><table class="edit"><thead><tr><th>Значення</th><th>Од.</th><th>Тип</th><th>Частина</th><th>Довжина</th><th>Головний</th><th>Підтв.</th><th>Узгодженість</th><th></th></tr></thead><tbody>${dims || '<tr><td colspan="9">Розмірів немає.</td></tr>'}</tbody></table></div>
        ${conf && conf.list.some(x => x.conflict) ? '<ul class="warns"><li class="error">Конфлікт розмірів: значення не узгоджуються з головним масштабом. Перевірте точки або числа — система не усереднює суперечливі розміри.</li></ul>' : ''}`)}` : ''}
      ${card('4. Побудова 3D і передача в розрахунок', `<div class="form">
          ${c.fld('vision.depthRatio', 'Глибина частини без бокового виду: частка ширини', '', { step: 0.05, hint: 'позначається як «припущена» геометрія' })}
          ${c.fld('vision.yCenter', 'Центр глибини (y) без бокового виду', 'м', { step: 0.05 })}
        </div>
        <fieldset class="checklist"><legend>Перед передаванням у розрахунок підтвердіть (ТЗ, 9 «Людина в контурі»):</legend>${checklist.map(([k, l]) => `<label class="mini"><input type="checkbox" data-vcheck="${k}" ${cl[k] ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
        <div class="row"><button class="btn" data-act="visBuild">Побудувати 3D-модель</button><button class="btn primary" data-act="visApply">Передати частини в розрахунок</button></div>
        ${c.state.ui.visionBuild ? `<p class="note">Побудовано: ${c.state.ui.visionBuild.parts.length} частин. Перегляд — у розділі <a href="#" data-tab="model3d">3D-модель</a>.</p>` : ''}
        ${(c.state.ui.visionIssues || []).length ? `<ul class="warns">${c.state.ui.visionIssues.map(t => `<li class="warn">${esc(t)}</li>`).join('')}</ul>` : ''}`)}`;
    },
    after(c) {
      const drop = document.getElementById('content');
      drop.ondragover = e => { e.preventDefault(); };
      drop.ondrop = e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files], c); } };
      const v = curView(); if (!v) return;
      const im = curImg();
      if (!ensureImgEl(im, () => P.images.after(c))) return;
      draw(c);
      const cv = document.getElementById('visCv');
      let down = false;
      const pt = e => { const r = cv.getBoundingClientRect(); const s = cv.width / r.width; return [Math.round((e.clientX - r.left) * s), Math.round((e.clientY - r.top) * s)]; };
      cv.onpointerdown = e => { down = true; cv.setPointerCapture(e.pointerId); act(c, 'down', pt(e), e); };
      cv.onpointermove = e => { if (down) act(c, 'move', pt(e), e); else hover(c, pt(e)); };
      cv.onpointerup = e => { if (down) { down = false; act(c, 'up', pt(e), e); } };
      cv.ondblclick = () => { if (vs().tool === 'poly') finishPoly(c); };
    },
    onChange(e, c) {
      const t = e.target, pr = proj(), v = curView(), u = vs();
      if (t.id === 'visFiles') { addFiles([...t.files], c); return true; }
      if (t.id === 'visLabel') { u.label = +t.value; return true; }
      if (t.id === 'visOnlyObj') { u.onlyObj = t.checked; return true; }
      if (t.dataset.vview && v) {
        const k = t.dataset.vview; v[k] = t.type === 'checkbox' ? t.checked : k === 'sideSign' ? +t.value : t.value;
        const names = { front: 'Фронтальний', side: 'Боковий', back: 'Задній', top: 'Вигляд зверху', other: 'Перспектива' };
        if (k === 'orient' && (Object.values(names).includes(v.name) || /^Ракурс/.test(v.name))) v.name = names[v.orient];
        c.changed('ракурс.' + k, '', v[k]); if (k !== 'name') c.render(); return true;
      }
      if (t.dataset.dim && v) { const [i, k] = t.dataset.dim.split('.'); const d = v.dims[+i]; d[k] = t.type === 'checkbox' ? t.checked : k === 'value' ? parseFloat(t.value) : t.value; recomputeDim(d); c.changed('розмір', '', d[k]); c.render(); return true; }
      if (t.dataset.dimmain != null && v) { v.dims.forEach((d, i) => { d.main = i === +t.dataset.dimmain; }); c.changed('головний розмір', '', t.dataset.dimmain); c.render(); return true; }
      if (t.dataset.vpart) { const [i, k] = t.dataset.vpart.split('.'); pr.vision.parts[+i][k] = t.value; c.changed('частина зображення.' + k, '', t.value); if (k !== 'name') c.render(); return true; }
      if (t.dataset.vvis != null && v) { const p = pr.vision.parts[+t.dataset.vvis]; p.vis = p.vis || {}; p.vis[v.id] = t.value; c.changed('видимість', '', t.value); return true; }
      if (t.dataset.vcheck) { pr.vision.checklist[t.dataset.vcheck] = t.checked; c.save(); return true; }
      return false;
    },
    onInput(e) {
      const t = e.target, u = vs();
      if (t.id === 'visR') { u.r = +t.value; document.getElementById('visRv').textContent = t.value; return true; }
      if (t.id === 'visTol') { u.tol = +t.value; document.getElementById('visTolv').textContent = t.value; return true; }
      return false;
    },
    onAct(a, b, c) {
      const pr = proj(), u = vs();
      if (!a.startsWith('vis')) return false;
      const im = curImg(), v = curView();
      switch (a) {
        case 'visImg': pr.vision.activeImg = b.dataset.id; pr.vision.activeView = (curImg().views[0] || {}).id; c.render(); return true;
        case 'visDelImg': {
          if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Так?'; return true; }
          pr.images = pr.images.filter(i => i.id !== b.dataset.id); c.changed('зображення', '', 'видалено'); c.render(); return true;
        }
        case 'visView': pr.vision.activeView = b.dataset.id; u.poly = []; u.dimPts = []; c.render(); return true;
        case 'visAddView': u.tool = 'crop'; c.toast('Виділіть рамкою ділянку з потрібним ракурсом на зображенні.'); c.render(); return true;
        case 'visTool': u.tool = b.dataset.tool; u.poly = []; u.dimPts = []; if (u.tool === 'crop' && im) { pr.vision.activeView = '__full'; } c.render(); return true;
        case 'visAddPart': {
          const name = b.dataset.name || `Частина ${pr.vision.parts.length + 1}`;
          if (pr.vision.parts.length >= 250) return true;
          pr.vision.parts.push({ id: uid('p'), name, parent: '', shape: /плащ/i.test(name) ? 'sheet' : 'volume', kind: 'auto', color: COLORS[pr.vision.parts.length % COLORS.length], vis: {} });
          u.label = pr.vision.parts.length + 1; c.changed('частини зображення', '', name); c.render(); return true;
        }
        case 'visDelPart': {
          const i = +b.dataset.i;
          // перенумерація міток у всіх масках
          pr.images.forEach(img => img.views.forEach(w => { const m = getMask(w); for (let k = 0; k < m.length; k++) { if (m[k] === i + 2) m[k] = 1; else if (m[k] > i + 2) m[k]--; } w.mask = V.rle(m); }));
          pr.vision.parts.splice(i, 1); u.label = 1; c.changed('частини зображення', '', 'видалено'); c.render(); return true;
        }
        case 'visDelDim': v.dims.splice(+b.dataset.i, 1); c.changed('розміри', '', 'видалено'); c.render(); return true;
        case 'visAuto': case 'visHoles': {
          const data = viewImage(im, v); if (!data) return true;
          pushUndo(v);
          const r = V.autoMask(data, { tol: u.tol, holes: a === 'visHoles' });
          const m = getMask(v);
          for (let k = 0; k < m.length; k++) m[k] = r.mask[k] ? (m[k] >= 2 ? m[k] : 1) : 0;
          commitMask(v, c); draw(c); c.toast('Скульптуру виділено. Перевірте межі та за потреби виправте пензлем.'); return true;
        }
        case 'visClean': { pushUndo(v); const m = getMask(v); V.keepLarge(m, v.crop[2], v.crop[3], 0.002); commitMask(v, c); draw(c); return true; }
        case 'visClear': { pushUndo(v); getMask(v).fill(0); commitMask(v, c); draw(c); return true; }
        case 'visUndo': { const st = u.undo.get(v.id) || []; if (!st.length) { c.toast('Немає дій для скасування.'); return true; } const s = st.pop(); u.masks.set(v.id, V.unrle(s, v.crop[2] * v.crop[3])); commitMask(v, c); draw(c); return true; }
        case 'visPolyDone': finishPoly(c); return true;
        case 'visOCR': runOCR(c); return true;
        case 'visBuild': build(c); return true;
        case 'visApply': apply(c); return true;
      }
      return false;
    },
  };

  function hint(tool) {
    return {
      brush: 'Пензель: малює обраною міткою (частиною). «Лише в межах скульптури» не дає частині вийти на фон.',
      erase: 'Гумка: стирає до фону.',
      wand: 'Чарівна паличка: клацніть — заливка схожих за кольором пікселів обраною міткою (допуск ΔE).',
      poly: 'Багатокутник: клацайте вершини, подвійний клік або «Завершити» — заливка обраною міткою. Зручно, щоб відокремити руку чи голову від тулуба.',
      dim: 'Розмір: клацніть початок і кінець розмірної лінії, потім введіть значення в таблиці «Розміри й масштаб».',
      base: 'Точка основи: клацніть центр основи каркаса (низ стійки на постаменті) — це початок координат x = 0, z = 0.',
      crop: 'Новий ракурс: протягніть рамку навколо потрібного вигляду на повному зображенні (для колажів).',
    }[tool] || '';
  }

  function draw(c) {
    const cv = document.getElementById('visCv'); if (!cv) return;
    const pr = proj(), u = vs(), im = curImg();
    const crop = pr.vision.activeView === '__full' ? { crop: [0, 0, im.w, im.h] } : curView();
    const el = vs().imgs.get('el:' + im.id);
    cv.width = crop.crop[2]; cv.height = crop.crop[3];
    const g = cv.getContext('2d');
    g.drawImage(el, crop.crop[0], crop.crop[1], crop.crop[2], crop.crop[3], 0, 0, crop.crop[2], crop.crop[3]);
    if (pr.vision.activeView === '__full') {
      g.strokeStyle = '#e8590c'; g.lineWidth = 2;
      im.views.forEach(w => { g.strokeRect(w.crop[0], w.crop[1], w.crop[2], w.crop[3]); g.fillStyle = '#e8590c'; g.font = '14px sans-serif'; g.fillText(w.name, w.crop[0] + 4, w.crop[1] + 16); });
      if (u.cropRect) { g.setLineDash([6, 4]); g.strokeRect(...u.cropRect); g.setLineDash([]); }
      return;
    }
    const v = crop, m = getMask(v), w = v.crop[2], h = v.crop[3];
    const id = g.getImageData(0, 0, w, h), d = id.data;
    const cols = [null, [255, 255, 255]].concat(pr.vision.parts.map(p => hex(p.color)));
    for (let i = 0; i < w * h; i++) {
      const l = m[i];
      if (l === 0) { d[i * 4] *= 0.45; d[i * 4 + 1] *= 0.45; d[i * 4 + 2] *= 0.45; continue; }
      const col = cols[l]; if (!col) continue;
      const a = l === 1 ? 0.15 : 0.45;
      d[i * 4] = d[i * 4] * (1 - a) + col[0] * a; d[i * 4 + 1] = d[i * 4 + 1] * (1 - a) + col[1] * a; d[i * 4 + 2] = d[i * 4 + 2] * (1 - a) + col[2] * a;
    }
    g.putImageData(id, 0, 0);
    // контури міток
    g.fillStyle = '#ffd43b';
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, l = m[i]; if (l && (m[i - 1] !== l || m[i + 1] !== l || m[i - w] !== l || m[i + w] !== l)) g.fillRect(x, y, 1, 1); }
    // розміри
    g.lineWidth = 2;
    v.dims.forEach(dm => {
      g.strokeStyle = dm.confirmed ? '#2f9e44' : '#f08c00'; g.beginPath(); g.moveTo(...dm.p1); g.lineTo(...dm.p2); g.stroke();
      for (const p of [dm.p1, dm.p2]) { g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.stroke(); }
      g.fillStyle = g.strokeStyle; g.font = 'bold 14px sans-serif';
      g.fillText(`${dm.value || '?'} ${dm.unit || ''}${dm.main ? ' (масштаб)' : ''}`, (dm.p1[0] + dm.p2[0]) / 2 + 6, (dm.p1[1] + dm.p2[1]) / 2 - 6);
    });
    if (v.base) { g.strokeStyle = '#e03131'; g.lineWidth = 2; g.beginPath(); g.moveTo(v.base[0] - 12, v.base[1]); g.lineTo(v.base[0] + 12, v.base[1]); g.moveTo(v.base[0], v.base[1] - 12); g.lineTo(v.base[0], v.base[1] + 12); g.stroke(); g.fillStyle = '#e03131'; g.fillText('0', v.base[0] + 6, v.base[1] - 6); }
    if (u.poly.length) { g.strokeStyle = '#ffd43b'; g.beginPath(); g.moveTo(...u.poly[0]); u.poly.forEach(p => g.lineTo(...p)); g.stroke(); }
    if (u.dimPts.length) { g.fillStyle = '#f08c00'; g.beginPath(); g.arc(u.dimPts[0][0], u.dimPts[0][1], 4, 0, 7); g.fill(); }
  }
  function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hover() { /* підказка курсора не потрібна */ }

  function act(c, ph, p, e) {
    const pr = proj(), u = vs(), im = curImg();
    if (pr.vision.activeView === '__full' || u.tool === 'crop') {
      if (pr.vision.activeView !== '__full') { pr.vision.activeView = '__full'; draw(c); return; }
      if (ph === 'down') u.cropStart = p;
      if (ph === 'move' && u.cropStart) { u.cropRect = [Math.min(u.cropStart[0], p[0]), Math.min(u.cropStart[1], p[1]), Math.abs(p[0] - u.cropStart[0]), Math.abs(p[1] - u.cropStart[1])]; draw(c); }
      if (ph === 'up' && u.cropRect && u.cropRect[2] > 20 && u.cropRect[3] > 20) {
        const nv = { id: uid('v'), name: im.views.length === 1 ? 'Боковий' : 'Ракурс ' + (im.views.length + 1), orient: im.views.length === 1 ? 'side' : 'other', crop: u.cropRect.map(Math.round), mask: '', dims: [], base: null, sideSign: 1 };
        im.views.push(nv); pr.vision.activeView = nv.id; u.cropRect = null; u.cropStart = null; u.tool = 'brush';
        c.changed('ракурси', '', 'додано'); c.render();
      }
      return;
    }
    const v = curView(); if (!v) return;
    const w = v.crop[2], h = v.crop[3];
    const m = getMask(v);
    const label = +u.label;
    if (u.tool === 'brush' || u.tool === 'erase') {
      if (ph === 'down') pushUndo(v);
      if (ph === 'down' || ph === 'move') { V.brush(m, w, h, p[0], p[1], u.r, u.tool === 'erase' ? 0 : label, u.tool !== 'erase' && label >= 2 && u.onlyObj); draw(c); }
      if (ph === 'up') commitMask(v, c);
    } else if (u.tool === 'wand' && ph === 'down') {
      const data = viewImage(im, v); if (!data) return;
      let lab = u.labs.get(v.id); if (!lab) { lab = V.labMap(data); u.labs.set(v.id, lab); }
      pushUndo(v);
      const region = V.wand(data, lab, Math.max(0, Math.min(w - 1, p[0])), Math.max(0, Math.min(h - 1, p[1])), u.tol, label >= 2 && u.onlyObj ? m : null);
      for (let k = 0; k < m.length; k++) if (region[k]) m[k] = label;
      commitMask(v, c); draw(c);
    } else if (u.tool === 'poly' && ph === 'down') {
      u.poly.push(p); draw(c);
      const btn = document.querySelector('[data-act="visPolyDone"]'); if (btn) btn.textContent = `Завершити багатокутник (${u.poly.length} т.)`;
    } else if (u.tool === 'dim' && ph === 'down') {
      u.dimPts.push(p);
      if (u.dimPts.length === 2) {
        const [p1, p2] = u.dimPts; u.dimPts = [];
        const type = Math.abs(p2[0] - p1[0]) < Math.abs(p2[1] - p1[1]) * 0.2 ? 'vertical' : Math.abs(p2[1] - p1[1]) < Math.abs(p2[0] - p1[0]) * 0.2 ? 'horizontal' : 'distance';
        v.dims.push({ id: uid('d'), p1, p2, value: 0, unit: 'мм', type, part: '', confirmed: false, main: !v.dims.length });
        c.changed('розміри', '', 'додано'); c.render();
        setTimeout(() => { const inp = document.querySelector(`[data-dim="${v.dims.length - 1}.value"]`); if (inp) inp.focus(); }, 50);
      } else draw(c);
    } else if (u.tool === 'base' && ph === 'down') {
      v.base = p; c.changed('точка основи', '', p.join(',')); c.render();
    }
    void e;
  }
  function finishPoly(c) {
    const u = vs(), v = curView();
    if (u.poly.length < 3) { c.toast('Потрібно щонайменше 3 вершини.'); return; }
    pushUndo(v);
    V.polygon(getMask(v), v.crop[2], v.crop[3], u.poly, +u.label, +u.label >= 2 && u.onlyObj);
    u.poly = []; commitMask(v, c); c.render();
  }
  function recomputeDim(d) {
    const k = d.unit === 'мм' ? 0.001 : d.unit === 'см' ? 0.01 : 1;
    d.valueSI = (d.value || 0) * k;
  }
  function viewScale(v) {
    const dims = v.dims.filter(d => d.confirmed && d.value > 0).map(d => Object.assign({}, d, { value: d.value * (d.unit === 'мм' ? 0.001 : d.unit === 'см' ? 0.01 : 1), type: d.type === 'depth' ? 'horizontal' : d.type }));
    return V.dimConflicts({ dims }, 0.03);
  }

  async function runOCR(c) {
    const v = curView(), im = curImg(); if (!v) return;
    c.toast('Завантаження модуля OCR…');
    try {
      if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const cv = document.createElement('canvas'); cv.width = v.crop[2]; cv.height = v.crop[3];
      cv.getContext('2d').drawImage(vs().imgs.get('el:' + im.id), v.crop[0], v.crop[1], v.crop[2], v.crop[3], 0, 0, v.crop[2], v.crop[3]);
      const worker = await window.Tesseract.createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.,ммcm ' });
      const { data } = await worker.recognize(cv);
      await worker.terminate();
      let n = 0;
      (data.words || []).forEach(wd => {
        const num = parseFloat(String(wd.text).replace(',', '.').replace(/[^\d.]/g, ''));
        if (!isFinite(num) || num <= 0) return;
        const b = wd.bbox;
        v.dims.push({ id: uid('d'), p1: [b.x0, (b.y0 + b.y1) / 2], p2: [b.x1, (b.y0 + b.y1) / 2], value: num, unit: num > 50 ? 'мм' : 'м', type: 'distance', part: '', confirmed: false, ocr: (wd.confidence || 0) / 100, main: false });
        n++;
      });
      c.changed('OCR', '', n); c.render();
      c.toast(n ? `Знайдено ${n} чисел. Перепризначте кінцеві точки (інструмент «Розмір») і підтвердьте кожне значення.` : 'Чисел не знайдено.');
    } catch (err) {
      c.toast('OCR недоступний у цьому середовищі (потрібен доступ до мережі для завантаження моделі розпізнавання). Введіть розміри вручну інструментом «Розмір».');
    }
  }

  /** Побудова 3D з фронтального та бокового ракурсів. */
  function build(c) {
    const pr = proj(), issues = [];
    const views = pr.images.flatMap(im => im.views.map(v => ({ im, v })));
    const fr = views.find(x => x.v.orient === 'front'), sd = views.find(x => x.v.orient === 'side');
    if (!fr) { c.toast('Потрібен ракурс з орієнтацією «Фронтальний».'); return; }
    const sF = viewScale(fr.v);
    if (!isFinite(sF.scale)) { c.toast('На фронтальному ракурсі немає підтвердженого розміру — масштаб невідомий.'); return; }
    if (!fr.v.base) { c.toast('Задайте точку основи на фронтальному ракурсі.'); return; }
    if (sF.list.some(x => x.conflict)) issues.push('Конфлікт розмірів на фронтальному ракурсі — перевірте розмірні лінії.');
    let side = null;
    if (sd) {
      const sS = viewScale(sd.v);
      if (!isFinite(sS.scale) || !sd.v.base) issues.push('Боковий ракурс без підтвердженого розміру або точки основи — глибина буде припущена.');
      else side = { m: getMask(sd.v), w: sd.v.crop[2], h: sd.v.crop[3], s: sS.scale, u0: sd.v.base[0], v0: sd.v.base[1], sign: sd.v.sideSign || 1 };
    } else issues.push('Немає бокового ракурсу — глибина всіх частин припущена (позначено окремо).');
    const front = { m: getMask(fr.v), w: fr.v.crop[2], h: fr.v.crop[3], s: sF.scale, u0: fr.v.base[0], v0: fr.v.base[1] };
    const parts = [], allTris = [];
    pr.vision.parts.forEach((p, i) => {
      const lab = i + 2;
      const r = V.buildPart(front, side, lab, lab, { shape: p.shape, depthRatio: pr.vision.depthRatio || 0.6, yCenter: pr.vision.yCenter || 0, sideSign: side ? side.sign : 1, nSeg: 20 });
      if (!r || !r.tris.length) { issues.push(`Частина «${p.name}» не позначена на фронтальному ракурсі.`); return; }
      const an = SC.mesh.analyze(r.tris, { noRecenter: true, step: pr.design.dirStep || 15, res: 220 });
      const iou = V.iouFront(r.tris, front, lab);
      if (iou < 0.85) issues.push(`Частина «${p.name}»: збіг силуету IoU = ${iou.toFixed(2)} < 0,85 — перевірте маску.`);
      if (p.vis && side && /не видима|припущена/.test(p.vis[sd.v.id] || '')) issues.push(`Частина «${p.name}» на боковому ракурсі: ${p.vis[sd.v.id]} — глибина не підтверджена.`);
      parts.push({ id: p.id, name: p.name, shape: p.shape, kind: p.kind, H: r.zTop - r.zBot, z1: r.zBot, z2: r.zTop, area: p.shape === 'sheet' ? an.area : an.area, Ax: an.Ax, Ay: an.Ay, Ah: an.Ah, areaTable: an.areaTable, c: an.centroid, iou, assumed: r.assumed || (p.vis && sd && /не видима|припущена/.test(p.vis[sd.v.id] || '')) });
      for (const t of r.tris) allTris.push(t);
    });
    // габарит (вся скульптура): контроль розмірів-габаритів
    c.state.ui.visionBuild = { parts, tris: Float64Array.from(allTris), scale: sF.scale };
    c.state.ui.visionIssues = issues;
    c.toast(`3D побудовано: ${parts.length} частин.`); c.render();
  }

  function apply(c) {
    const pr = proj(), vb = c.state.ui.visionBuild;
    if (!vb || !vb.parts.length) { c.toast('Спочатку побудуйте 3D-модель.'); return; }
    const miss = Object.entries({ dims: 'габарити', parts: 'розміри частин', orient: 'орієнтація', scale: 'масштаб', shell: 'відкритість оболонки', holes: 'отвори', supports: 'точки опирання', cant: 'виноси', unknown: 'невідомі ділянки' }).filter(([k]) => !pr.vision.checklist[k]).map(([, l]) => l);
    if (miss.length) { c.toast('Не підтверджено: ' + miss.join(', ') + '. Позначте пункти чек-листа.'); return; }
    const old = pr.parts.slice();
    const H = Math.max(...vb.parts.map(p => p.z2));
    pr.parts = vb.parts.map(p => {
      const prev = old.find(q => q.name === p.name) || {};
      const nearAxis = Math.abs(p.c[0]) < 0.25 * H && Math.abs(p.c[1]) < 0.25 * H;
      const kind = p.kind && p.kind !== 'auto' ? p.kind : (nearAxis && p.H > 0.3 * H ? 'dist' : 'cant');
      return {
        name: p.name, kind, shape: p.shape, x: +p.c[0].toFixed(3), y: +p.c[1].toFixed(3), z: +p.c[2].toFixed(3), z1: +Math.max(0.05, p.z1).toFixed(2), z2: +p.z2.toFixed(2),
        shellArea: +p.area.toFixed(3), tShell: prev.tShell || 2, rhoShell: prev.rhoShell || 7850, extraMass: prev.extraMass || 0,
        Ax: +p.Ax.toFixed(3), Ay: +p.Ay.toFixed(3), Ah: +p.Ah.toFixed(3), areaTable: p.areaTable.map(a => +a.toFixed(4)),
        Cf: prev.Cf || (p.shape === 'sheet' ? 1.8 : 1.2), CfConfirmed: !!prev.CfConfirmed, mu: prev.mu || 1, sec: prev.sec || '□80×5',
        source: 'image', status: p.assumed ? 'assumed' : 'confirmed',
      };
    });
    // рівні ядра під висоту тулуба: верх ядра — верх «розподілених» частин, крок ≈ 1,5 м
    const dist = pr.parts.filter(p => p.kind === 'dist');
    const zTop = dist.length ? Math.max(...dist.map(p => p.z2)) : Math.max(...pr.parts.map(p => p.z));
    const n = Math.max(2, Math.round(zTop / 1.5));
    const oldLv = pr.frame.levels.join('; ');
    pr.frame.levels = Array.from({ length: n + 1 }, (_, i) => +(zTop * i / n).toFixed(2));
    c.logChange('рівні ядра', oldLv, pr.frame.levels.join('; '));
    c.toast(`Рівні ядра підігнано під скульптуру: ${pr.frame.levels.join('; ')} м. Перевірте в розділі «Каркас».`);
    c.changed('частини', `${old.length} шт.`, `${pr.parts.length} шт. із зображень`);
    c.go('parts');
  }
})(window.SC = window.SC || {});
