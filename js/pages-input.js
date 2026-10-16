/* Розділ «Вихідні дані»: майданчик і експлуатація, частини скульптури, 3D-модель, опори, оболонка. */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};

  P.site = {
    input: true,
    render(c) {
      const { fld, card, N, state } = c;
      const env = state.pr.site.env;
      const cr = N.corrosivity.find(x => x.id === env.corrosivity) || N.corrosivity[1];
      return `<h2>Майданчик і умови експлуатації</h2>
      <p class="lead">Місце встановлення визначає кліматичні впливи; середовище — захист від корозії та корозійний припуск (ТЗ 2.6).</p>
      <div class="cols">
      ${card('Розташування', `<div class="form">
        ${fld('meta.location', 'Адреса / населений пункт', '', { type: 'text' })}
        ${fld('site.city', 'Місто для кліматичних даних (Додаток Е)', '', { options: N.cities.map(x => [x.name, x.name]), rerender: true })}
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
      const st = p => p.status === 'assumed' ? c.pill('припущено', 'warn') : p.status === 'confirmed' ? c.pill('підтверджено', 'ok') : c.pill(p.source === 'image' ? 'з зображень' : p.areaTable ? 'з 3D' : 'введено');
      const row = (p, i) => `<tr>
        <td><input data-ppath="${i}.name" data-type="str" value="${esc(p.name)}" style="min-width:140px"><div>${st(p)}</div></td>
        <td><select data-ppath="${i}.kind" data-type="str" data-rr="1"><option value="dist" ${p.kind === 'dist' ? 'selected' : ''}>по висоті ядра</option><option value="cant" ${p.kind === 'cant' ? 'selected' : ''}>консоль</option></select>
            <select data-ppath="${i}.shape" data-type="str"><option value="volume" ${p.shape !== 'sheet' ? 'selected' : ''}>об'ємна</option><option value="sheet" ${p.shape === 'sheet' ? 'selected' : ''}>відкритий лист</option></select></td>
        ${['x', 'y', 'z'].map(k => `<td><input data-ppath="${i}.${k}" data-type="num" type="number" step="0.01" value="${p[k]}"></td>`).join('')}
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
        <td>${p.kind === 'cant' ? `<select data-ppath="${i}.sec" data-type="str">${secOptions().map(([v]) => `<option value="${v}" ${v === p.sec ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '—'}</td>
        <td class="num">${f((p.shellArea || 0) * (p.tShell || 0) / 1000 * (p.rhoShell || 7850) + (p.extraMass || 0), 1)}</td>
        <td class="nowrap"><label class="btn small" for="mesh${i}">3D…</label><input type="file" id="mesh${i}" data-mesh="${i}" accept=".stl,.obj" hidden>
          <button class="btn small" data-act="dupPart" data-i="${i}" title="Копія">⧉</button> <button class="btn small" data-act="delPart" data-i="${i}" aria-label="Видалити">✕</button></td></tr>`;
      return `<h2>Частини скульптури</h2>
      <p class="lead">Кожна частина передає на каркас вагу оболонки (m = ρ·t·A + m<sub>дод</sub>), вітер F = q<sub>m</sub>(z)·C<sub>F</sub>·A(θ) і сніг F = S<sub>m</sub>·μ·A<sub>h</sub>. «По висоті ядра» — тулуб, плащ; «консоль» — голова, руки, книга на виносній трубі. Частини можна сформувати автоматично з <a href="#" data-tab="images">зображень</a> або <a href="#" data-tab="model3d">3D-моделі</a>.</p>
      <section class="card"><h3>Таблиця частин <small>координати від центру основи каркаса, м; A<sub>x</sub> — проєкція при вітрі вздовж X</small></h3>
      <div class="tw"><table class="edit"><thead><tr><th>Назва / статус</th><th>Тип / форма</th><th>x</th><th>y</th><th>z</th><th>z₁ … z₂</th><th>A обол., м²</th><th>t, мм</th><th>Матеріал</th><th>m дод., кг</th><th>A_x, м²</th><th>A_y, м²</th><th>C_F</th><th>A_h, м²</th><th>μ</th><th>Консоль</th><th class="num">Маса, кг</th><th></th></tr></thead>
      <tbody>${ps.map(row).join('')}</tbody></table></div>
      <div class="row"><button class="btn" data-act="addPart">Додати частину</button>
        <label class="btn" for="meshNew">Імпорт 3D (STL / OBJ) як нової частини…</label><input type="file" id="meshNew" data-mesh="new" accept=".stl,.obj" hidden>
        ${c.fld('design.meshUnit', 'Одиниці 3D-файлу', '', { options: [['0.001', 'мм'], ['0.01', 'см'], ['1', 'м']] })}
        ${c.fld('design.meshUp', 'Вертикальна вісь у файлі', '', { options: [['z', 'Z'], ['y', 'Y']] })}</div>
      <p class="note">C<sub>F</sub> художньої форми потрібно обґрунтувати (продування, CFD, погоджена схема). Орієнтири для попередньої оцінки: компактне тіло 1,0…1,3; плащ/пластина поперек потоку 1,8…2,0; призма квадратного перерізу 2,0. ${state.ui.meshInfo ? '<br>' + state.ui.meshInfo : ''}</p></section>`;
    },
    onChange(e, c) {
      const t = e.target;
      if (t.dataset.ppath) {
        const [i, ...k] = t.dataset.ppath.split('.');
        const key = k.join('.');
        const p = c.state.pr.parts[+i];
        const old = p[key];
        const v = t.dataset.type === 'check' ? t.checked : t.dataset.type === 'num' ? parseFloat(t.value) : t.value;
        if (t.dataset.type === 'num' && !isFinite(v)) { c.toast('Введіть число.'); return true; }
        p[key] = v;
        if (['Ax', 'Ay'].includes(key)) delete p.areaTable;
        if (p.status === 'assumed' && ['x', 'y', 'z', 'z1', 'z2', 'Ax', 'Ay', 'shellArea'].includes(key)) p.status = 'confirmed';
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
      if (a === 'delPart') { const p = ps.splice(+b.dataset.i, 1)[0]; c.changed('частини', p.name, 'видалено'); c.render(); return true; }
      if (a === 'dupPart') { const p = JSON.parse(JSON.stringify(ps[+b.dataset.i])); p.name += ' (копія)'; ps.splice(+b.dataset.i + 1, 0, p); c.changed('частини', '', 'копія'); c.render(); return true; }
      return false;
    },
  };

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
      state.ui.lastMesh = m.tris;
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
      <p class="lead">Просторова поверхня потрібна для площ, проєкцій під кожним кутом вітру (об'єднання проєкцій граней без подвійного врахування), центрів мас і горизонтальних проєкцій для снігу. Джерела: готова модель STL/OBJ або побудова з фронтальної та бокової проєкцій у розділі «Зображення виробу».</p>
      ${card('Імпорт готової моделі', `<div class="row"><label class="btn primary" for="meshNew2">Відкрити STL / OBJ…</label><input type="file" id="meshNew2" data-mesh="new" accept=".stl,.obj" hidden>
        ${c.fld('design.meshUnit', 'Одиниці файлу', '', { options: [['0.001', 'мм'], ['0.01', 'см'], ['1', 'м']] })}${c.fld('design.meshUp', 'Вертикальна вісь', '', { options: [['z', 'Z'], ['y', 'Y']] })}</div>
        <p class="note">Модель вирівнюється: основа на z = 0, центр у плані — у початку координат. Кожен файл — окрема частина (імпортуйте голову, руки, плащ окремими файлами для окремого аналізу частин). ${state.ui.meshInfo || ''}</p>`)}
      ${vb ? card('Модель, побудована із зображень', fmt.tbl(['Частина', 'Висота, м', 'Площа поверхні, м²', 'A(0°), м²', 'A(90°), м²', 'A_h, м²', 'Центр x; y; z, м', 'IoU фронт', 'Глибина'], vb.parts.map(p => [esc(p.name), f(p.H, 2), f(p.area, 2), f(p.Ax, 2), f(p.Ay, 2), f(p.Ah, 2), `${f(p.c[0])}; ${f(p.c[1])}; ${f(p.c[2])}`, f(p.iou, 3), p.assumed ? c.pill('припущена', 'warn') : c.pill('з бокового виду', 'ok')]))) : ''}
      <section class="card"><h3>Перегляд <small>тягніть — обертання, колесо — масштаб</small></h3><div class="viewer"><canvas id="cv3d" aria-label="3D-модель"></canvas></div></section>`;
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
        ${fld('shell.cLocal', 'Коефіцієнт місцевого тиску c_loc', '', { step: 0.1, hint: 'пікові зони кромок; без даних — 1,5…2,0' })}
        ${fld('shell.wLim', 'Граничний прогин панелі: b /', '', { step: 10 })}
      </div><p class="note">Товщина й матеріал листа задаються для кожної частини в розділі «Частини скульптури». Маса ребер автоматично додається до навантаження.</p>`)}
      </div>`;
    },
  };
})(window.SC = window.SC || {});
