/* Розділ «Вихідні дані»: майданчик і експлуатація, частини скульптури, 3D-модель, опори, оболонка. */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};

  P.regionTable = function (c, reg) {
    const cls = { ok: 'ok', diff: 'warn', range: 'bad', nodata: 'warn', info: '' };
    return c.fmt.tbl(['Параметр', 'Введено', 'За нормою', 'Джерело', 'Висновок'], reg.rows.map(r => [r.param, `${c.esc(r.entered)} ${r.unit}`, r.ref == null ? '—' : c.esc(r.ref), c.esc(r.src), `<span class="pill ${cls[r.status]}">${SC.norms.regionStatusText[r.status]}</span>${r.note ? '<br><small>' + c.esc(r.note) + '</small>' : ''}`]));
  };
  P.site = {
    input: true,
    render(c) {
      const { fld, card, N, state } = c;
      const env = state.pr.site.env;
      const cr = N.corrosivity.find(x => x.id === env.corrosivity) || N.corrosivity[1];
      const reg = N.checkRegion(state.pr);
      const regCard = card('Перевірка даних регіону на відповідність нормам', P.regionTable(c, reg) + `<p class="note">Кожне значення звіряється з рядком міста Додатка Е ДБН В.1.2-2, з картою районів і з діапазоном, допустимим для території України. «Немає табличного значення» означає, що таблицю для цього параметра або міста в застосунок не внесено — звірте вручну й зафіксуйте джерело.</p>`, N.regionStatusText[reg.worst]);
      return `<h2>Майданчик і умови експлуатації</h2>${regCard}
      <p class="lead">Місце встановлення визначає кліматичні впливи; середовище — захист від корозії та корозійний припуск (ТЗ 2.6).</p>
      <div class="cols">
      ${card('Розташування', `<div class="form">
        ${fld('meta.location', 'Адреса / населений пункт', '', { type: 'text' })}
        ${fld('site.city', 'Місто для кліматичних даних (Додаток Е)', '', { options: N.cities.map(x => [x.name, x.name + (x.dbn ? ' (' + x.dbn + ')' : '')]), rerender: true })}
        ${fld('site.Hsea', 'Висота над рівнем моря H', 'км', { step: 0.01 })}
        ${fld('site.terrain', 'Тип місцевості (вітер)', '', { options: N.terrainTypes.map(t => [t.id, t.name]) })}
        ${fld('site.hPed', 'Висота постаменту (низ каркаса над землею)', 'м', { step: 0.05 })}
      </div>`)}
      ${card('Довговічність і захист <small>ТЗ 2.6</small>', `<div class="form">
        ${fld('site.env.corrosivity', 'Корозійна агресивність (ДСТУ ISO 12944-2)', '', { options: N.corrosivity.map(x => [x.id, x.name]), rerender: true })}
        ${fld('site.env.protection', 'Захисна система', '', { type: 'text' })}
        ${fld('site.env.approach', 'Врахування втрати товщини', '', { options: [['none', 'Не враховувати (захист покриттям, огляди)'], ['residual', 'Розрахунок на залишковий переріз'], ['allowance', 'Конструктивний припуск (додається до товщини)']], rerender: true })}
        ${fld('site.env.corrAllow', 'Корозійний припуск / втрата Δt', 'мм', { step: 0.1, hint: `орієнтовно: ${cr.loss} мм/рік × роки без покриття` })}
        ${fld('site.env.inspection', 'Регламент оглядів', '', { type: 'text' })}
        ${fld('site.env.drainage', 'Порожнини труб герметизовані або мають дренаж і вентиляцію', '', { type: 'check' })}
      </div><p class="note">${N.corrMeta.src} ${c.normPill(N.corrMeta.status)}. Одночасне застосування припуску й розрахунку на залишковий переріз не допускається (ТЗ 2.6.3).</p>`)}
      </div>`;
    },
  };

  P.parts = {
    input: true,
    render(c) {
      const { state, f, esc, secOptions } = c;
      const ps = state.pr.parts;
      const st = p => p.source === 'image' ? c.pill('з картинки — не допускається', 'bad') : p.status === 'needs3d' ? c.pill('потрібні розміри / 3D', 'bad') : p.status === 'assumed' ? c.pill('припущено', 'warn') : p.status === 'confirmed' ? c.pill(p.source === '3d' ? 'з 3D' : 'підтверджено', 'ok') : c.pill(p.areaTable ? 'з 3D' : 'введено');
      const row = (p, i) => `<tr>
        <td><input data-ppath="${i}.name" data-type="str" value="${esc(p.name)}" style="min-width:140px"><div>${st(p)}</div></td>
        <td><select data-ppath="${i}.kind" data-type="str" data-rr="1"><option value="dist" ${p.kind === 'dist' ? 'selected' : ''}>по висоті ядра</option><option value="cant" ${p.kind === 'cant' ? 'selected' : ''}>консоль</option><option value="train" ${p.kind === 'train' ? 'selected' : ''}>шлейф (лежача частина)</option></select>
            <select data-ppath="${i}.shape" data-type="str"><option value="volume" ${p.shape !== 'sheet' ? 'selected' : ''}>об'ємна</option><option value="sheet" ${p.shape === 'sheet' ? 'selected' : ''}>відкритий лист</option></select></td>
        ${['x', 'y', 'z'].map(k => p.kind === 'train' ? `<td class="num" title="центр шлейфу — обчислюється з гребеня">${f(p[k], 2)}</td>` : `<td><input data-ppath="${i}.${k}" data-type="num" type="number" step="0.01" value="${p[k]}"></td>`).join('')}
        <td>${p.kind === 'dist' ? `<input data-ppath="${i}.z1" data-type="num" type="number" step="0.1" value="${p.z1}"><input data-ppath="${i}.z2" data-type="num" type="number" step="0.1" value="${p.z2}">` : '—'}</td>
        <td><input data-ppath="${i}.shellArea" data-type="num" type="number" step="0.1" value="${p.shellArea}"></td>
        <td><input data-ppath="${i}.tShell" data-type="num" type="number" step="0.5" value="${p.tShell}"></td>
        <td><select data-ppath="${i}.rhoShell" data-type="num">${[[7850, 'сталь'], [7900, 'нерж.'], [8900, 'мідь'], [8800, 'бронза'], [2700, 'алюміній']].map(([v, l]) => `<option value="${v}" ${p.rhoShell == v ? 'selected' : ''}>${l} ${v}</option>`).join('')}</select></td>
        <td><input data-ppath="${i}.extraMass" data-type="num" type="number" step="1" value="${p.extraMass}"></td>
        <td><input data-ppath="${i}.Ax" data-type="num" type="number" step="0.05" value="${p.Ax}"></td>
        <td><input data-ppath="${i}.Ay" data-type="num" type="number" step="0.05" value="${p.Ay}"></td>
        <td><input data-ppath="${i}.Cf" data-type="num" type="number" step="0.05" value="${p.Cf}"><label class="mini"><input type="checkbox" data-ppath="${i}.CfConfirmed" data-type="check" ${p.CfConfirmed ? 'checked' : ''}>підтв.</label></td>
        <td><input data-ppath="${i}.Ah" data-type="num" type="number" step="0.05" value="${p.Ah}"></td>
        <td><input data-ppath="${i}.mu" data-type="num" type="number" step="0.05" value="${p.mu}"></td>
        <td>${p.kind === 'train' ? '<a href="#train' + i + '">параметри нижче</a>' : p.kind === 'cant' ? `<select data-ppath="${i}.sec" data-type="str">${secOptions().map(([v]) => `<option value="${v}" ${v === p.sec ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '—'}</td>
        <td class="num">${f((p.shellArea || 0) * (p.tShell || 0) / 1000 * (p.rhoShell || 7850) + (p.extraMass || 0), 1)}</td>
        <td class="nowrap"><label class="btn small" for="mesh${i}">3D…</label><input type="file" id="mesh${i}" data-mesh="${i}" accept=".stl,.obj" hidden>
          <button class="btn small" data-act="dupPart" data-i="${i}" title="Копія">⧉</button> <button class="btn small" data-act="delPart" data-i="${i}" aria-label="Видалити">✕</button></td></tr>`;
      return `<h2>Частини скульптури</h2>
      <p class="lead">Кожна частина передає на каркас вагу оболонки (m = ρ·t·A + m<sub>дод</sub>), вітер F = q<sub>m</sub>(z)·C<sub>F</sub>·A(θ) і сніг F = S<sub>m</sub>·μ·A<sub>h</sub>. «По висоті ядра» — тулуб, плащ; «консоль» — голова, руки, книга на виносній трубі; «шлейф» — лежача частина (мантія до землі): окрема просторова ферма з власними опорами, секції Ш1, Ш2… Розміри — з <a href="#" data-tab="model3d">3D-моделі</a> (імпорт STL/OBJ для кожної частини) або з креслення вручну; <a href="#" data-tab="images">зображення</a> дає лише ідею поділу на частини.</p>
      <section class="card"><h3>Таблиця частин <small>координати від центру основи каркаса, м; A<sub>x</sub> — проєкція при вітрі вздовж X</small></h3>
      <div class="tw"><table class="edit"><thead><tr><th>Назва / статус</th><th>Тип / форма</th><th>x</th><th>y</th><th>z</th><th>z₁ … z₂</th><th>A обол., м²</th><th>t, мм</th><th>Матеріал</th><th>m дод., кг</th><th>A_x, м²</th><th>A_y, м²</th><th>C_F</th><th>A_h, м²</th><th>μ</th><th>Консоль</th><th class="num">Маса, кг</th><th></th></tr></thead>
      <tbody>${ps.map(row).join('')}</tbody></table></div>
      <div class="row"><button class="btn" data-act="addPart">Додати частину</button> <button class="btn" data-act="addTrain">Додати шлейф (лежачу частину)</button>
        <label class="btn" for="meshNew">Імпорт 3D (STL / OBJ) як нової частини…</label><input type="file" id="meshNew" data-mesh="new" accept=".stl,.obj" hidden>
        ${c.fld('design.meshUnit', 'Одиниці 3D-файлу', '', { options: [['0.001', 'мм'], ['0.01', 'см'], ['1', 'м']] })}
        ${c.fld('design.meshUp', 'Вертикальна вісь у файлі', '', { options: [['z', 'Z'], ['y', 'Y']] })}</div>
      </section>${ps.map((p, i) => p.kind === 'train' ? trainCard(c, p, i) : '').join('')}<section class="card">
      <p class="note">C<sub>F</sub> художньої форми потрібно обґрунтувати (продування, CFD, погоджена схема). Орієнтири для попередньої оцінки: компактне тіло 1,0…1,3; плащ/пластина поперек потоку 1,8…2,0; призма квадратного перерізу 2,0. ${state.ui.meshInfo ? '<br>' + state.ui.meshInfo : ''}</p></section>`;
    },
    onChange(e, c) {
      const t = e.target;
      if (t.dataset.ppath) {
        const [i, ...k] = t.dataset.ppath.split('.');
        const key = k.join('.');
        const p = c.state.pr.parts[+i];
        const old = p[key];
        if (t.dataset.type === 'path' || t.dataset.type === 'list') {
          const nums = line => line.split(/[;\s]+/).map(x => parseFloat(x.replace(',', '.'))).filter(isFinite);
          const v = t.dataset.type === 'path' ? t.value.split(/\n/).map(nums).filter(q => q.length === 3) : nums(t.value.replace(/\n/g, ' '));
          if (t.dataset.type === 'path' && v.length < 2) { c.toast('Гребінь шлейфу: щонайменше 2 точки «x; y; z», кожна з нового рядка.'); return true; }
          if (t.dataset.type === 'list' && v.some(x => x <= 0 || x > 1)) { c.toast('Опори — частки довжини шлейфу від 0 до 1, напр. «0,5; 1».'); return true; }
          const old = JSON.stringify(p[key]); p[key] = v; if (key === 'path') { if (p.status === 'needs3d') p.status = 'confirmed'; if (p.source === 'sketch') p.source = 'manual'; } c.changed(`шлейф «${p.name}».${key}`, old, JSON.stringify(v)); c.render(); return true;
        }
        const v = t.dataset.type === 'check' ? t.checked : t.dataset.type === 'num' ? parseFloat(t.value) : t.value;
        if (t.dataset.type === 'num' && !isFinite(v)) { c.toast('Введіть число.'); return true; }
        p[key] = v;
        if (key === 'kind' && v === 'train' && !(p.path && p.path.length >= 2)) {
          Object.keys(SC.model.trainDefaults).forEach(k => { if (p[k] == null) p[k] = JSON.parse(JSON.stringify(SC.model.trainDefaults[k])); });
          p.path = [[0, 0, +(p.z2 || p.z || 3).toFixed(2)], [+(p.x || -2).toFixed(2), +(p.y || 0).toFixed(2), 0.4]];
        }
        if (['Ax', 'Ay'].includes(key)) delete p.areaTable;
        if ((p.status === 'assumed' || p.status === 'needs3d') && ['x', 'y', 'z', 'z1', 'z2', 'Ax', 'Ay', 'shellArea'].includes(key)) p.status = 'confirmed';
        if ((p.source === 'image' || p.source === 'sketch') && ['x', 'y', 'z', 'z1', 'z2', 'Ax', 'Ay', 'shellArea', 'Ah'].includes(key)) { p.source = 'manual'; delete p.areaTable; }
        c.changed(`частина «${p.name}».${key}`, old, v);
        if (t.dataset.rr) c.render();
        return true;
      }
      if (t.dataset.mesh != null) { importMesh(t, c); return true; }
      return false;
    },
    onAct(a, b, c) {
      const ps = c.state.pr.parts;
      if (a === 'addPart') { ps.push({ name: 'Нова частина', kind: 'cant', shape: 'volume', x: 0.3, y: 0, z: 3, shellArea: 1, tShell: 2, rhoShell: 7850, extraMass: 0, Ax: 0.3, Ay: 0.3, Cf: 1.2, Ah: 0.1, mu: 1, sec: '□60×4' }); c.changed('частини', '', 'додано'); c.render(); return true; }
      if (a === 'addTrain') {
        const H = Math.max(...(c.state.pr.frame.levels || [6]));
        ps.push(Object.assign({ name: 'Шлейф', kind: 'train', shape: 'volume', path: [[-0.2, 0, +(0.75 * H).toFixed(2)], [-0.6 * H, 0, +(0.45 * H).toFixed(2)], [-1.2 * H, 0, +(0.2 * H).toFixed(2)], [-1.6 * H, 0, 0.4]].map(q => q.map(v => +v.toFixed(2))), shellArea: 20, tShell: 2, rhoShell: 7850, extraMass: 0, Ax: 2, Ay: 8, Cf: 1.2, Ah: 5, mu: 1, sec: '' }, JSON.parse(JSON.stringify(SC.model.trainDefaults))));
        c.changed('частини', '', 'додано шлейф'); c.render(); return true;
      }
      if (a === 'delPart') { const p = ps.splice(+b.dataset.i, 1)[0]; c.changed('частини', p.name, 'видалено'); c.render(); return true; }
      if (a === 'dupPart') { const p = JSON.parse(JSON.stringify(ps[+b.dataset.i])); p.name += ' (копія)'; ps.splice(+b.dataset.i + 1, 0, p); c.changed('частини', '', 'копія'); c.render(); return true; }
      return false;
    },
  };


  /** Картка параметрів шлейфу: гребінь, ширина й висота ферми, опори, перерізи. */
  function trainCard(c, p, i) {
    const { f, esc, secOptions } = c, D = SC.model.trainDefaults, sm = SC.model.trainSummary(p);
    const v = k => p[k] != null ? p[k] : D[k];
    const num = (k, l, u, st) => `<div class="fld"><label>${l}${u ? ` <small>${u}</small>` : ''}</label><input data-ppath="${i}.${k}" data-type="num" type="number" step="${st || 0.05}" value="${v(k)}"></div>`;
    const sel = (k, l) => `<div class="fld"><label>${l}</label><select data-ppath="${i}.${k}" data-type="str">${secOptions().map(([o]) => `<option value="${o}" ${o === v(k) ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
    const R = c.state.R, segs = R && R.ok ? R.mdl.sections.filter(sc => sc.kind === 'train' && sc.part === i) : [];
    return `<section class="card" id="train${i}"><h3>Шлейф «${esc(p.name)}» <small>просторова тригранна ферма: хребет по гребеню + два нижні пояси, поперечні рами, розкоси; власні опори з анкерами</small></h3>
      <div class="cols"><div>
        <div class="fld"><label for="tp${i}">Гребінь шлейфу: точки «x; y; z», м — від кріплення до ядра (біля плечей) до кінця на землі, кожна з нового рядка</label>
        <textarea id="tp${i}" data-ppath="${i}.path" data-type="path" rows="5">${(p.path || []).map(q => q.join('; ')).join('\n')}</textarea></div>
        <p class="note">${sm ? `Довжина по гребеню ${f(sm.L, 2)} м, панелей ${sm.n}, висоти ${f(sm.z1, 2)}…${f(sm.z2, 2)} м; центр (${f(sm.c[0], 2)}; ${f(sm.c[1], 2)}; ${f(sm.c[2], 2)}) м.` : 'Задайте щонайменше 2 точки.'} Точки беруться з 3D-моделі (переріз гребеня) або креслення скульптора — не з картинки.</p>
        <div class="fld"><label for="ts${i}">Опори: частки довжини від кріплення (0…1), напр. «0,5; 1»</label><input id="ts${i}" data-ppath="${i}.supports" data-type="list" value="${(v('supports') || []).join('; ')}"></div>
        <div class="fld"><label>Тип опор</label><select data-ppath="${i}.supType" data-type="str">${[['auto', 'Авто: проміжні шарнірні, крайня рухома вздовж шлейфу'], ['pinned', 'Усі шарнірні'], ['fixed', 'Усі жорсткі']].map(([o, l]) => `<option value="${o}" ${o === v('supType') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div><div class="form">
        ${num('w', 'Ширина ферми біля кріплення', 'м')}${num('wEnd', 'Ширина ферми в кінці', 'м')}
        ${num('h', 'Висота ферми біля кріплення', 'м')}${num('hEnd', 'Висота ферми в кінці', 'м')}
        ${num('panel', 'Довжина панелі (крок поперечних рам)', 'м', 0.1)}${num('clear', 'Зазор нижніх поясів над землею', 'м', 0.05)}
        ${sel('secChord', 'Пояси (хребет і нижні)')}${sel('secWeb', 'Решітка й поперечні рами')}${sel('secPost', 'Стійки опор')}
      </div></div>
      ${segs.length ? c.fmt.tbl(['Секція', 'Проліт', 'Стрижнів', 'max U'], segs.map(sc => { const ms = R.memberRes.filter(m => m.e.sect === sc.code); return [`<span class="sect-chip" style="background:${sc.color}">${sc.code}</span>`, esc(sc.name), ms.length, c.fmt.U(Math.max(0, ...ms.map(m => m.best.u)))]; })) : ''}
      <p class="note">Тип «авто» не защемлює температурне видовження ферми між ядром і кінцевою опорою (кінцева опора — рухома вздовж осі шлейфу, на практиці — овальні отвори під анкери або ковзна опорна частина). Фундаменти під опори — у розділі «Фундамент».</p></section>`;
  }


  /** Перерізи 3D-моделі: таблиця рівнів і смуг, план контурів, пропозиція ядра. */
  function sliceCard(c) {
    const { state, f, esc, fld } = c, pr = state.pr, sl = pr.slices;
    const form = `<div class="form">${fld('design.sliceStep', 'Крок перерізів', 'м', { step: 0.05 })}${fld('design.coreClr', 'Зазор між ядром і оболонкою', 'мм', { step: 10 })}${fld('design.beltStep', 'Крок поясів ядра', 'м', { step: 0.1 })}</div>
      <div class="row"><button class="btn primary" data-act="slice">Нарізати модель</button>${sl && sl.core ? '<button class="btn" data-act="sliceApply">Застосувати ядро й пояси до каркаса</button>' : ''}</div>
      <p class="note">${state.ui.lastMesh ? 'Ріжеться остання імпортована модель (' + esc(state.ui.meshName || '') + ').' : 'Імпортуйте 3D-модель усієї скульптури (STL / OBJ) — перерізи будуються лише з 3D, не з картинки.'} Площа перерізу коректна для замкненої поверхні; для відкритої оболонки (лист) рахуються периметр і габарит.</p>`;
    if (!sl) return c.card('Перерізи по висоті → пояси, площі, центр мас', form);
    const dists = pr.parts.map((p, i) => [p, i]).filter(([p]) => p.kind === 'dist');
    const rows = sl.secs.map((q, k) => { const b = sl.bands[k]; return [f(q.z, 2), q.open ? '— (відкритий)' : f(q.A, 3), f(q.per, 2), `${f((q.bbox.mx[0] - q.bbox.mn[0]) * 1000, 0)} × ${f((q.bbox.mx[1] - q.bbox.mn[1]) * 1000, 0)}`, `${f(Math.abs(q.c[0]) < 5e-4 ? 0 : q.c[0], 3)}; ${f(Math.abs(q.c[1]) < 5e-4 ? 0 : q.c[1], 3)}`, q.aFit == null ? '—' : isFinite(q.aFit) ? f(q.aFit * 1000, 0) : 'основа', b ? `${f(b.z0, 2)}…${f(b.z1, 2)}` : '', b ? f(b.A, 3) : '', b ? f(b.m, 1) : '', b ? f(b.Ax, 3) : '', b ? f(b.Ay, 3) : '']; });
    return c.card('Перерізи по висоті → пояси, площі, центр мас', form + plan(sl, pr) + c.fmt.tbl(['z, м', 'Площа перерізу, м²', 'Периметр, м', 'Габарит X×Y, мм', 'Центр x; y, м', 'Ядро вміщується, мм', 'Смуга z, м', 'Поверхня смуги, м²', 'Маса смуги, кг', 'A_x смуги, м²', 'A_y смуги, м²'], rows) +
      `<p>Маса оболонки (t = ${f(sl.t, 1)} мм, ρ = ${sl.rho}): <b>${f(sl.M, 1)} кг</b>; центр мас (${f(sl.cg[0], 3)}; ${f(sl.cg[1], 3)}; ${f(sl.cg[2], 3)}) м. Розміри моделі: z = ${f(sl.z0, 2)}…${f(sl.z1, 2)} м.</p>` +
      (sl.core ? `<p>Пропозиція ядра (найбільший прямокутник із зазором ${f(pr.design.coreClr, 0)} мм на кожному перерізі, лінійне звуження): низ <b>${f(sl.core.a, 2)} × ${f(sl.core.b, 2)} м</b>, верх <b>${f(sl.core.aTop, 2)} × ${f(sl.core.bTop, 2)} м</b>, висота ядра ${f(sl.core.zTop, 2)} м; пояси на рівнях ${sl.core.levels.join('; ')} м.</p>` : '<p class="note">Ядро ≥ 250 мм не вписується в перерізи навколо осі (0; 0) — перевірте положення моделі або зменшіть зазор.</p>') +
      (dists.length ? `<div class="row"><label>Частина <select id="slPart">${dists.map(([p, i]) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select></label><button class="btn" data-act="sliceProfile">Розподіл маси й вітру по висоті — за перерізами</button></div>
        <p class="note">Без профілю маса й вітер «розподіленої» частини діляться рівномірно по висоті z₁…z₂; з профілем — пропорційно поверхні й навітряній площі кожної смуги 3D-моделі. ${dists.filter(([p]) => p.zProfile).map(([p, i]) => `«${esc(p.name)}» — профіль із 3D <button class="btn small" data-act="sliceProfileOff" data-i="${i}">скинути</button>`).join(' ')}</p>` : ''));
  }

  /** План: контури перерізів (колір — висота) і ядро на кожному рівні. */
  function plan(sl, pr) {
    const all = sl.secs.flatMap(q => q.loops.flatMap(L => L.pts));
    if (!all.length) return '';
    const x0 = Math.min(...all.map(p => p[0]), -pr.frame.a / 2), x1 = Math.max(...all.map(p => p[0]), pr.frame.a / 2), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
    const s = Math.min(420 / Math.max(x1 - x0, 0.1), 300 / Math.max(y1 - y0, 0.1)), W = (x1 - x0) * s + 60, H = (y1 - y0) * s + 50;
    const X = x => 30 + (x - x0) * s, Y = y => 25 + (y1 - y) * s;
    const col = z => `hsl(${(220 - 200 * (z - sl.z0) / Math.max(sl.z1 - sl.z0, 1e-6)).toFixed(0)} 65% 45%)`;
    let b = '';
    sl.secs.forEach(q => q.loops.forEach(L => { b += `<polyline fill="none" stroke="${col(q.z)}" stroke-width="1.2" points="${L.pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}${L.closed ? ' ' + X(L.pts[0][0]).toFixed(1) + ',' + Y(L.pts[0][1]).toFixed(1) : ''}"/>`; }));
    const k = sl.core;
    if (k) [[k.a, k.b, 'низ'], [k.aTop, k.bTop, 'верх']].forEach(([a, bb, t], i) => { b += `<rect x="${X(-a / 2).toFixed(1)}" y="${Y(bb / 2).toFixed(1)}" width="${(a * s).toFixed(1)}" height="${(bb * s).toFixed(1)}" fill="none" stroke="var(--fg)" stroke-width="${i ? 1 : 2}" stroke-dasharray="${i ? '4 3' : ''}"/>`; });
    return `<p class="note">План перерізів: колір — висота (синій низ → червоний верх); суцільний прямокутник — ядро внизу, пунктир — угорі.</p><div class="dwg"><svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="100%" style="max-width:${W.toFixed(0)}px" role="img" aria-label="План перерізів">${b}</svg></div>`;
  }

  /** Розкрій обшивки: нумеровані сегменти листа (смуга × сектор), площа, маса, перевірка розміру листа. */
  function segCard(c) {
    const { state, f, fld } = c, pr = state.pr, g = pr.segments;
    const form = `<div class="form">${fld('design.sheetW', 'Ширина листа', 'м', { step: 0.05 })}${fld('design.sheetH', 'Довжина листа', 'м', { step: 0.1 })}${fld('design.sheetT', 'Товщина листа', 'мм', { step: 0.5 })}</div>
      <div class="row"><button class="btn" data-act="segment">Розкроїти обшивку</button></div>
      <p class="note">Смуги — між перерізами (крок перерізів ≤ довжини листа), сектори — по периметру з шириною ≤ ширини листа; нумерація згори вниз, у смузі — за годинниковою стрілкою від фасаду. Площі й маси — за поверхнею 3D-моделі (точно), розміри заготовок — розгорнуті середні (для гранованої форми кожна грань — плоский лист).</p>`;
    if (!g) return c.card('Розкрій обшивки', form);
    const bad = g.list.filter(q => !q.fits);
    return c.card('Розкрій обшивки', form + segScheme(g) + c.fmt.tbl(['№', 'Смуга / сектор', 'z, м', 'Площа, м²', 'Розгортка ш × в, мм', 'Маса, кг', 'Центр x; y; z, м', 'Лист'], g.list.map(q => [q.n, `${q.band} / ${q.sector}`, `${f(q.z0, 2)}…${f(q.z1, 2)}`, f(q.A, 3), `${f(q.w * 1000, 0)} × ${f(q.h * 1000, 0)}`, f(q.m, 1), `${f(q.c[0], 2)}; ${f(q.c[1], 2)}; ${f(q.c[2], 2)}`, q.fits ? c.pill('вміщується', 'ok') : c.pill('більший за лист', 'bad')])) +
      `<p>Разом: <b>${g.list.length}</b> сегментів, площа <b>${f(g.A, 2)} м²</b>, маса <b>${f(g.M, 1)} кг</b> (t = ${f(g.t, 1)} мм); листів ${f(g.wMax * 1000, 0)}×${f(g.hMax * 1000, 0)} мм з урахуванням 20 % відходів — <b>${g.sheets}</b>.${bad.length ? ` ${bad.length} сегментів більші за лист — зменшіть крок перерізів або ширину сектора.` : ''}</p>`);
  }
  function segScheme(g) {
    const nb = g.nBands, bands = [...new Set(g.list.map(q => q.band))].sort((a, b) => b - a);
    const maxS = Math.max(...g.list.map(q => q.sector)), cw = Math.min(60, 560 / maxS), ch = 26;
    const W = maxS * cw + 60, H = bands.length * ch + 30;
    let b = '';
    bands.forEach((bd, r) => { b += `<text x="8" y="${4 + r * ch + ch / 2 + 4}" font-size="10" fill="var(--muted)">с${bd}</text>`; g.list.filter(q => q.band === bd).forEach(q => { const x = 40 + (q.sector - 1) * cw, y = 4 + r * ch; b += `<rect x="${x}" y="${y}" width="${cw - 2}" height="${ch - 2}" fill="${q.fits ? 'var(--surface-2)' : '#f8d7da'}" stroke="var(--line-strong)"/><text x="${x + cw / 2 - 1}" y="${y + ch / 2 + 4}" font-size="11" text-anchor="middle" fill="var(--fg)">${q.n}</text>`; }); });
    return `<p class="note">Схема сегментів обшивки: рядок — смуга (згори вниз), стовпець — сектор від фасаду за годинниковою стрілкою; червоні — більші за лист.</p><div class="dwg"><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Схема сегментів обшивки">${b}</svg></div>`;
  }

  async function importMesh(inp, c) {
    const file = inp.files[0]; if (!file) return;
    const { state, f, esc } = c;
    try {
      const buf = await file.arrayBuffer();
      const T = SC.mesh.parse(buf, file.name);
      const m = SC.mesh.analyze(T, { scale: parseFloat(state.pr.design.meshUnit || '0.001'), upAxis: state.pr.design.meshUp || 'z', step: state.pr.design.dirStep || 15, res: 300 });
      const target = inp.dataset.mesh === 'new' ? null : state.pr.parts[+inp.dataset.mesh];
      const p = target || { name: file.name.replace(/\.\w+$/, ''), kind: 'dist', shape: 'volume', tShell: 2, rhoShell: 7850, extraMass: 0, Cf: 1.2, mu: 1, sec: '□80×5' };
      Object.assign(p, { shellArea: +m.area.toFixed(3), x: +m.centroid[0].toFixed(3), y: +m.centroid[1].toFixed(3), z: +m.centroid[2].toFixed(3), Ax: +m.Ax.toFixed(3), Ay: +m.Ay.toFixed(3), Ah: +m.Ah.toFixed(3), areaTable: m.areaTable.map(a => +a.toFixed(4)), source: '3d', status: 'confirmed' });
      if (p.kind === 'dist' && !target) { p.z1 = +Math.max(0.05, m.bbox.mn[2]).toFixed(2); p.z2 = +m.bbox.mx[2].toFixed(2); }
      if (!target) state.pr.parts.push(p);
      state.ui.lastMesh = m.tris; state.ui.meshName = file.name; state.ui.slicesFull = null;
      state.ui.meshInfo = `${esc(file.name)}: ${m.nTri} трикутників; габарити ${f(m.bbox.mx[0] - m.bbox.mn[0])} × ${f(m.bbox.mx[1] - m.bbox.mn[1])} × ${f(m.bbox.mx[2] - m.bbox.mn[2])} м; площа ${f(m.area, 2)} м²; A(0°) = ${f(m.Ax, 2)} м², A(90°) = ${f(m.Ay, 2)} м², A<sub>h</sub> = ${f(m.Ah, 2)} м².`;
      c.changed('3D-модель', '', file.name); c.render();
    } catch (err) { state.ui.meshInfo = 'Не вдалося прочитати файл: ' + esc(err.message); c.render(); }
  }
  SC.importMesh = importMesh;

  P.model3d = {
    input: true,
    render(c) {
      const { state, f, card, fmt, esc } = c;
      const vb = state.ui.visionBuild;
      return `<h2>3D-модель скульптури</h2>
      <p class="lead">Просторова поверхня потрібна для площ, проєкцій під кожним кутом вітру (об'єднання проєкцій граней без подвійного врахування), центрів мас і горизонтальних проєкцій для снігу. Джерело розмірів для розрахунку — лише готова модель STL/OBJ (від скульптора, фотограмметрія, image-to-3D з подальшим масштабуванням). Модель, побудована з картинок, показується тільки як ескіз.</p>
      ${card('Імпорт готової моделі', `<div class="row"><label class="btn primary" for="meshNew2">Відкрити STL / OBJ…</label><input type="file" id="meshNew2" data-mesh="new" accept=".stl,.obj" hidden>
        ${c.fld('design.meshUnit', 'Одиниці файлу', '', { options: [['0.001', 'мм'], ['0.01', 'см'], ['1', 'м']] })}${c.fld('design.meshUp', 'Вертикальна вісь', '', { options: [['z', 'Z'], ['y', 'Y']] })}</div>
        <p class="note">Модель вирівнюється: основа на z = 0, центр у плані — у початку координат. Кожен файл — окрема частина (імпортуйте голову, руки, плащ окремими файлами для окремого аналізу частин). ${state.ui.meshInfo || ''}</p>`)}
      ${vb ? card('Модель, побудована із зображень', fmt.tbl(['Частина', 'Висота, м', 'Площа поверхні, м²', 'A(0°), м²', 'A(90°), м²', 'A_h, м²', 'Центр x; y; z, м', 'IoU фронт', 'Глибина'], vb.parts.map(p => [esc(p.name), f(p.H, 2), f(p.area, 2), f(p.Ax, 2), f(p.Ay, 2), f(p.Ah, 2), `${f(p.c[0])}; ${f(p.c[1])}; ${f(p.c[2])}`, f(p.iou, 3), p.assumed ? c.pill('припущена', 'warn') : c.pill('з бокового виду', 'ok')]))) : ''}
      ${sliceCard(c)}
      ${segCard(c)}
      <section class="card"><h3>Перегляд <small>тягніть — обертання, колесо — масштаб</small></h3><div class="viewer"><canvas id="cv3d" aria-label="3D-модель"></canvas></div></section>`;
    },
    onAct(a, b, c) {
      const { state } = c, pr = state.pr, T = state.ui.lastMesh;
      if (a === 'slice') {
        if (!T) { c.toast('Спочатку імпортуйте 3D-модель (STL / OBJ) усієї скульптури.'); return true; }
        const tp = (pr.parts.find(p => p.kind === 'dist') || pr.parts[0] || {});
        const sl = SC.mesh.slices(T, { step: pr.design.sliceStep || 0.5, t: tp.tShell || pr.design.sheetT || 2, rho: tp.rhoShell || 7850 });
        const core = SC.mesh.proposeCore(sl, { ratio: pr.frame.b / Math.max(pr.frame.a, 1e-3) || 1, clr: (pr.design.coreClr || 80) / 1000, beltStep: pr.design.beltStep || 1.5, aMin: 0.25 });
        state.ui.slicesFull = sl;
        pr.slices = { name: state.ui.meshName || '3D-модель', date: new Date().toISOString().slice(0, 10), step: sl.step, z0: sl.z0, z1: sl.z1, M: sl.M, cg: sl.cg, t: sl.t, rho: sl.rho,
          secs: sl.secs.map(q => ({ z: q.z, A: q.A, per: q.per, c: q.c, bbox: q.bbox, open: q.open, loops: q.loops, aFit: core ? (core.fit.find(w => w.z === q.z) || {}).a : null })),
          bands: sl.bands.map(q => ({ z0: q.z0, z1: q.z1, A: q.A, m: q.m, c: q.c, Ax: q.Ax, Ay: q.Ay })), core };
        c.changed('перерізи 3D-моделі', '', `${sl.secs.length} рівнів`); c.render(); return true;
      }
      if (a === 'sliceApply') {
        const k = pr.slices && pr.slices.core; if (!k) { c.toast('Ядро не вписується в перерізи — перевірте модель або зазор.'); return true; }
        const fr = pr.frame, old = `${fr.a}×${fr.b}→${fr.aTop}×${fr.bTop}; рівні ${fr.levels.join('; ')}`;
        Object.assign(fr, { a: k.a, b: k.b, aTop: k.aTop, bTop: k.bTop, levels: k.levels.slice() });
        c.changed('каркас за перерізами 3D', old, `${fr.a}×${fr.b}→${fr.aTop}×${fr.bTop}; рівні ${fr.levels.join('; ')}`);
        c.toast('Ядро і пояси взято з перерізів 3D-моделі. Виконайте розрахунок.'); c.render(); return true;
      }
      if (a === 'sliceProfile') {
        const sl = pr.slices, p = pr.parts[+document.getElementById('slPart').value];
        if (!sl || !p) return true;
        const Atot = sl.bands.reduce((q, x) => q + x.A, 0) || 1, Wtot = sl.bands.reduce((q, x) => q + (x.Ax + x.Ay) / 2, 0) || 1;
        p.zProfile = sl.bands.map(x => ({ z0: +x.z0.toFixed(3), z1: +x.z1.toFixed(3), m: x.A / Atot, aw: (x.Ax + x.Ay) / 2 / Wtot }));
        p.z1 = +Math.max(0.05, sl.z0).toFixed(2); p.z2 = +sl.z1.toFixed(2);
        c.changed(`частина «${p.name}».zProfile`, '', `${sl.bands.length} смуг`); c.toast(`Маса і вітер частини «${p.name}» розподілятимуться по висоті за перерізами 3D.`); c.render(); return true;
      }
      if (a === 'sliceProfileOff') { const p = pr.parts[+b.dataset.i]; delete p.zProfile; c.changed(`частина «${p.name}».zProfile`, 'з 3D', 'рівномірно'); c.render(); return true; }
      if (a === 'segment') {
        const sl = state.ui.slicesFull; if (!sl) { c.toast('Спочатку нарізайте 3D-модель (кнопка «Нарізати модель»).'); return true; }
        const g = SC.mesh.segments(sl, { wMax: pr.design.sheetW || 1.25, hMax: pr.design.sheetH || 2.5, t: pr.design.sheetT || sl.t, rho: sl.rho });
        pr.segments = Object.assign({}, g, { list: g.list.map(q => Object.assign({}, q, { c: q.c.map(v => +v.toFixed(3)) })), date: new Date().toISOString().slice(0, 10) });
        c.changed('розкрій обшивки', '', `${g.list.length} сегментів`); c.render(); return true;
      }
      return false;
    },
    after(c) {
      const cv = document.getElementById('cv3d'); if (!cv) return;
      const { state } = c;
      const R = state.R;
      const nodes = R && R.ok ? R.P.model.nodes : [{ id: 'o', x: 0, y: 0, z: 0 }];
      const elems = R && R.ok ? R.mdl.elems : [];
      const v = SC.view3d.create(cv, () => ({ nodes, elems, parts: state.pr.parts }));
      v.st.mesh = state.ui.lastMesh || (state.ui.visionBuild && state.ui.visionBuild.tris) || null;
      v.draw(); P.model3d.view = v;
    },
    resize() { if (P.model3d.view) P.model3d.view.draw(); },
    onChange(e, c) { if (e.target.id === 'meshNew2') { importMesh(e.target, c); return true; } return false; },
  };

  P.supports = {
    input: true,
    render(c) {
      const { fld, card, state, fmt, f, esc } = c;
      const R = state.R;
      const sup = R && R.ok ? R.P.model.nodes.filter(n => n.sup || n.baseSpring) : [];
      return `<h2>Опори</h2>
      <p class="lead">Система не приймає видимий контакт скульптури із землею як опору без підтвердження (ТЗ UI-5.4, 9). Основні опори — низ стійок каркаса-ядра на опорних плитах. Додаткові опори (наприклад, край плаща на фундамент) задаються вузлом з закріпленням у розділі «Вузли та стрижні».</p>
      <div class="cols">
      ${card('Схема закріплення', `<div class="form">
        ${fld('frame.support', 'Тип закріплення низу стійок', '', { options: [['fixed', 'Жорстке (плита + анкери)'], ['pinned', 'Шарнірне']] })}
        ${fld('base.flex', 'Податливість бази', '', { options: [['iter', 'Ітераційно: жорсткість бази → каркас (рекомендовано)'], ['rigid', 'Абсолютно жорстка (без уточнення)']], hint: 'ТЗ: «Узгодження з моделлю каркаса», податливість бази' })}
        ${fld('supports.existingFoundation', 'Наявний фундамент / постамент (потрібні дані обстеження)', '', { type: 'check' })}
        ${fld('supports.allowDisp', 'Допустиме переміщення опор', 'мм', { step: 1 })}
        ${fld('design.defLimit', 'Граничне горизонтальне переміщення верху: H /', '', { step: 10 })}
      </div>
      <div class="fld"><label for="supNote">Опис реальних точок опирання (що торкається землі, що ні)</label><textarea id="supNote" data-path="supports.note" data-type="str" rows="3">${esc(state.pr.supports.note || '')}</textarea></div>
      ${fld('supports.confirmed', '<b>Підтверджую</b> точки й тип опирання (обов\'язково для погодження)', '', { type: 'check', rerender: true })}`)}
      ${card('Опори розрахункової моделі', sup.length ? fmt.tbl(['Вузол', 'x, м', 'y, м', 'Закріплення', 'k_θx, кН·м/рад', 'k_θy, кН·м/рад', 'Класифікація бази'], sup.map(n => { const s = R.supportRes.find(q => q.node.id === n.id); return [n.id, f(n.x, 3), f(n.y, 3), n.baseSpring ? 'пружне обертання' : (n.sup[3] ? 'жорстке' : 'шарнір'), n.spring ? f(n.spring[3] / 1e3, 0) : '∞', n.spring ? f(n.spring[4] / 1e3, 0) : '∞', s ? `${s.best.cls} (S/(EI/L) = ${f(s.best.ratio, 1)})` : '—']; })) + (R.flexLog.length ? `<p class="note">Ітерації податливості бази: ${R.flexLog.map(l => `№${l.it}: зміна ${f(l.change * 100, 1)} %`).join('; ')}.</p>` : '') : c.needCalc())}
      </div>`;
    },
  };

  P.shellIn = {
    input: true,
    render(c) {
      const { fld, card } = c;
      return `<h2>Оболонка</h2>
      <p class="lead">Перед розрахунком потрібно явно обрати конструктивну роль листа (ТЗ 2.3.1). Режим «ненесуче облицювання» — лист передає вагу, вітер і сніг на допоміжні ребра й каркас, але не входить у жорсткість системи.</p>
      <div class="cols">
      ${card('Режим роботи', `<div class="form">
        ${fld('shell.mode', 'Конструктивна роль оболонки', '', { options: [['non-structural', 'Ненесуче облицювання (підтримується)'], ['composite', 'Спільна робота з каркасом (потрібне погодження)'], ['partial', 'Частково несуча (потрібна детальна модель)']] })}
      </div>`)}
      ${card('Допоміжний каркас листа', `<div class="form">
        ${fld('shell.ribStep', 'Крок ребер (0 — підібрати)', 'мм', { step: 25 })}
        ${fld('shell.ribStepMax', 'Найбільший допустимий крок', 'мм', { step: 50 })}
        ${fld('shell.ribSpan', 'Проліт ребра між точками кріплення до каркаса', 'мм', { step: 50 })}
        ${fld('shell.cLocal', 'Коефіцієнт місцевого тиску c_loc', '', { step: 0.1, hint: 'ДБН В.1.2-2, п. 9.16: від\'ємний тиск на кромках C_aer = −2 (у кутах покриття −3,5)' })}
        ${fld('shell.wLim', 'Граничний прогин панелі: b /', '', { step: 10 })}
      </div><p class="note">Товщина й матеріал листа задаються для кожної частини в розділі «Частини скульптури». Маса ребер автоматично додається до навантаження.</p>`)}
      </div>`;
    },
  };
})(window.SC = window.SC || {});
