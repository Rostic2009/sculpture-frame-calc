/* Розділ «Проєкт»: головна сторінка (UI-2), загальні дані, статуси й журнал (UI-9). */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};

  P.home = {
    render(c) {
      const { state, f, esc, card, fmt } = c;
      const R = state.R, pr = state.pr;
      const rd = c.readiness();
      let tiles = '';
      if (R && R.ok) {
        const gm = R.govMember, gs = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
        const fu = Math.max(R.found.govSls.chk.max, R.found.govUls.chk.max, R.found.slab.max, R.found.settle.uS, R.found.settle.uT);
        const wu = Math.max(0, ...R.welds.map(w => w.u));
        const cls = u => u > 1 ? 'bad' : u > 0.9 ? 'warn' : 'ok';
        const T = [
          ['Каркас, max U', f(gm.best.u, 3), `${esc(gm.e.group)} · ${gm.e.sec.name}`, cls(gm.best.u), 'secCheck'],
          ['Зварні шви, max U', f(wu, 3), `${R.welds.length} швів каркаса`, cls(wu), 'welds'],
          ['Опорний вузол, max U', f(gs.best.u, 3), `база: ${gs.best.cls || '—'}`, cls(gs.best.u), 'basePlate'],
          ['Фундамент, max U', f(fu, 3), `p_max ${f(R.found.govSls.chk.p.pmax / 1000, 1)} кПа; s = ${f(R.found.settle.s * 1000, 1)} мм`, cls(fu), 'foundation'],
          ['Переміщення верху', f(R.uMax * 1000, 1) + ' мм', `гранично ${f(R.uLim * 1000, 1)} мм`, cls(R.uMax / R.uLim), 'fem'],
          ['Період T₁ · α_cr', `${f(R.T1, 3)} с · ${f(R.alphaCr, 0)}`, `таблиця C_h ${R.clim.ChTable}`, R.T1 > 0.25 ? 'warn' : 'ok', 'stability'],
          ['Метал', f(R.spec.tubeMass + R.spec.sheetMass + R.spec.ribMass, 0) + ' кг', `каркас ${f(R.spec.tubeMass, 0)} · лист ${f(R.spec.sheetMass, 0)} · ребра ${f(R.spec.ribMass, 0)}`, '', 'spec'],
          ['Кошторис матеріалів', f(R.spec.total, 0) + ' грн', `бетон ${f(R.spec.Vc, 2)} м³ · арматура ${f(R.spec.rebarMass, 0)} кг`, '', 'spec'],
        ];
        tiles = `<div class="tiles">${T.map(([k, v, s, cl, to]) => `<button class="tile ${cl}" data-tab="${to}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></button>`).join('')}</div>`;
      }
      const crit = R && R.ok ? R.warn.filter(w => w.level !== 'info') : [];
      return `<h2>Головна</h2>
        ${c.staleBanner()}
        <div class="home-head card"><div><div class="eyebrow">${esc(pr.meta.stage)} · ${esc(pr.meta.location)}</div><h3 style="font-size:20px">${esc(pr.meta.name)}</h3>
          <p class="note">Замовник: ${esc(pr.meta.customer || '—')} · Строк служби: ${pr.site.Tlife} р. · Клас наслідків: ${pr.site.cc} · Нормативний профіль: ДБН (+ EN для стійкості й анкерів) · Роль: ${esc(pr.role)}</p></div>
          <div class="ready">${rd.map(([k, s, to]) => `<button class="rd ${c.stCls(s)}" data-tab="${to}"><span>${k}</span><b>${s}</b></button>`).join('')}</div></div>
        ${tiles}
        ${R && R.ok ? card('Попередження', `<ul class="warns">${crit.map(w => `<li class="${w.level}"><a href="#" data-tab="${c.PAGE_REF[w.ref] || 'home'}">${esc(w.msg)}</a></li>`).join('') || '<li class="info">Критичних попереджень немає.</li>'}</ul>`, `${crit.length} · клацніть, щоб перейти до розділу`) : c.needCalc()}
        ${card('Порядок роботи', `<ol class="steps">
          <li><a href="#" data-tab="site">Майданчик</a>: місто, висота, тип місцевості, середовище (корозія).</li>
          <li><a href="#" data-tab="images">Зображення виробу</a>: завантажте фото/рендери, виділіть скульптуру й частини, задайте розміри → <a href="#" data-tab="model3d">3D-модель</a> → передайте в розрахунок. Або введіть <a href="#" data-tab="parts">частини</a> вручну / імпортуйте STL.</li>
          <li><a href="#" data-tab="supports">Опори</a>: підтвердьте реальні точки опирання.</li>
          <li><a href="#" data-tab="registry">Навантаження</a>: вітер, сніг, ожеледь, температура, сейсміка, монтаж.</li>
          <li><a href="#" data-tab="frame">Каркас</a>: схема ядра, вузли, перерізи — або «Підібрати перерізи», <a href="#" data-tab="variants">порівняння варіантів</a>.</li>
          <li><a href="#" data-tab="basePlate">Опорна плита</a>, <a href="#" data-tab="anchors">анкери</a>, <a href="#" data-tab="foundation">фундамент</a>, <a href="#" data-tab="rebar">армування</a>.</li>
          <li>«Розрахувати» → результати → <a href="#" data-tab="spec">специфікація</a>, <a href="#" data-tab="drawings">креслення</a>, <a href="#" data-tab="report">звіт</a>.</li></ol>`)}`;
    },
  };

  P.project = {
    input: true,
    render(c) {
      const { fld, card, N, state, f } = c;
      return `<h2>Загальні дані</h2>
      ${card('Об\'єкт', `<div class="form">
        ${fld('meta.name', 'Назва', '', { type: 'text' })}${fld('meta.customer', 'Замовник', '', { type: 'text' })}
        ${fld('meta.location', 'Місце встановлення', '', { type: 'text' })}${fld('meta.author', 'Виконавець', '', { type: 'text' })}
        ${fld('meta.date', 'Дата', '', { type: 'text' })}
        ${fld('meta.stage', 'Стадія', '', { options: [['Попередній розрахунок', 'Попередній розрахунок'], ['Ескізний проєкт', 'Ескізний проєкт'], ['Проєкт', 'Проєкт'], ['Робочий проєкт', 'Робочий проєкт']] })}
        ${fld('role', 'Ваша роль (ТЗ 2.1.2)', '', { options: ['Інженер-конструктор', 'Художник / скульптор', 'Замовник', 'Виробник / монтажник', 'Геотехнік', 'Адміністратор проєкту'].map(r => [r, r]), rerender: true, hint: 'Погоджувати розрахунок може лише інженер-конструктор' })}
      </div>`)}
      ${card('Надійність і нормативний профіль', `<div class="form">
        ${fld('site.Tlife', 'Установлений строк експлуатації T', 'років', { options: [[25, '25'], [50, '50'], [70, '70'], [100, '100 (монументальні споруди)'], [150, '150']], num: true, rerender: true })}
        ${fld('site.cc', 'Клас наслідків (ДБН В.1.2-14)', '', { options: N.gammaN.map(g => [g.id, `${g.id} (γn = ${g.g})`]), rerender: true })}
        ${fld('site.gammaN', 'Коефіцієнт відповідальності γn', '', { step: 0.01 })}
        ${fld('design.norm', 'Критерій прийняття перевірок сталі', '', { options: [['both', 'Більше з ДБН і EN'], ['dbn', 'ДБН В.2.6-198'], ['en', 'ДСТУ-Н Б EN 1993-1-1']] })}
      </div><p class="note">γ<sub>fm</sub> вітру при T = ${state.pr.site.Tlife}: <b>${f(N.windGamma(state.pr.site.Tlife), 3)}</b>; снігу: <b>${f(N.snowGamma(state.pr.site.Tlife), 3)}</b>.</p>`)}
      ${card('Файл проєкту', `<p class="note">Проєкт автоматично зберігається в цьому браузері. Для перенесення — JSON. Великі зображення можуть не вміститися в пам'ять браузера — тоді зберігайте JSON.</p>
        <div class="row">
          <button class="btn" data-act="copyjson">Скопіювати JSON</button>
          ${c.inFrame ? '' : '<button class="btn" data-act="downloadjson">Зберегти файл .json</button>'}
          <label class="btn" for="loadjson">Відкрити файл .json</label><input type="file" id="loadjson" accept=".json,application/json" hidden>
          <button class="btn" data-act="applyjson">Застосувати JSON з поля</button>
          <button class="btn danger" data-act="reset">Скинути до прикладу</button></div>
        <textarea class="json" id="jsonbox" spellcheck="false" placeholder="Вставте JSON проєкту"></textarea>`)}`;
    },
    onAct(a, b, c) {
      const { state } = c;
      if (a === 'copyjson') { c.copy(JSON.stringify(state.pr), 'JSON проєкту скопійовано.'); return true; }
      if (a === 'downloadjson') { c.download((state.pr.meta.name || 'project') + '.json', JSON.stringify(state.pr, null, 1), 'application/json'); return true; }
      if (a === 'applyjson') { try { state.pr = c.migrate(JSON.parse(document.getElementById('jsonbox').value)); state.R = null; c.changed('проєкт', '', 'завантажено з JSON'); c.render(); c.toast('Проєкт завантажено.'); } catch (err) { c.toast('У полі не коректний JSON.'); } return true; }
      if (a === 'reset') {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Підтвердити скидання'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Скинути до прикладу'; }, 4000); return true; }
        state.pr = SC.model.defaultProject(); state.R = null; c.changed('проєкт', '', 'скинуто'); c.render(); c.toast('Відновлено приклад.'); return true;
      }
      return false;
    },
    onChange(e, c) {
      if (e.target.id !== 'loadjson') return false;
      const file = e.target.files[0]; if (!file) return true;
      const rd = new FileReader();
      rd.onload = () => { try { c.state.pr = c.migrate(JSON.parse(rd.result)); c.state.R = null; c.changed('проєкт', '', 'відкрито файл'); c.render(); } catch (err) { c.toast('Файл не є коректним JSON проєкту.'); } };
      rd.readAsText(file);
      return true;
    },
  };

  P.status = {
    render(c) {
      const { state, esc, card, fmt } = c;
      const s = state.pr.status;
      const opts = c.STATUSES.map(t => { const why = c.canSet(t); return `<option value="${t}" ${why ? 'disabled' : ''}>${t}${why ? ' — ' + why : ''}</option>`; }).join('');
      const j = (state.pr.journal || []).slice().reverse().slice(0, 200);
      return `<h2>Статуси та журнал змін</h2>
      <p class="lead">Статус «Погоджено конструктором» не присвоюється автоматично і недоступний за критичних попереджень, застарілих даних чи попереднього результату (ТЗ 2.1.3, UI-9.3). Будь-яка зміна вихідних даних переводить погоджений результат у «Застарілий» (ТЗ 2.1.4).</p>
      ${card('Поточний статус', `<p><span class="pill big">${esc(s.value)}</span></p>
        <div class="form"><div class="fld"><label for="newStatus">Новий статус</label><select id="newStatus">${opts}</select></div>
        <div class="fld" style="grid-column: span 2"><label for="statusReason">Причина / коментар (обов'язково)</label><input id="statusReason" type="text" placeholder="напр.: перевірено розрахункову схему, навантаження та вузли"></div></div>
        <div class="row"><button class="btn primary" data-act="setstatus">Змінити статус</button></div>`)}
      ${card('Історія статусів', fmt.tbl(['Дата', 'Хто', 'Було', 'Стало', 'Причина'], s.log.slice().reverse().map(l => [l.t, esc(l.user), esc(l.from), esc(l.to), esc(l.reason)])))}
      ${card('Журнал змін вихідних даних', fmt.tbl(['Дата', 'Роль', 'Параметр', 'Було', 'Стало'], j.map(l => [l.t, esc(l.user), esc(l.path), esc(l.old), esc(l.nw)])) + `<div class="row"><button class="btn" data-act="copyjournal">Скопіювати журнал (CSV)</button></div>`, `${(state.pr.journal || []).length} записів`)}`;
    },
    onAct(a, b, c) {
      if (a === 'setstatus') {
        const to = document.getElementById('newStatus').value, reason = document.getElementById('statusReason').value.trim();
        if (!reason) { c.toast('Вкажіть причину зміни статусу.'); return true; }
        const why = c.canSet(to); if (why) { c.toast('Неможливо: ' + why); return true; }
        c.setStatus(to, reason); c.render(); c.toast('Статус змінено.'); return true;
      }
      if (a === 'copyjournal') { c.copy(['Дата;Роль;Параметр;Було;Стало'].concat((c.state.pr.journal || []).map(l => [l.t, l.user, l.path, l.old, l.nw].join(';'))).join('\n'), 'Журнал скопійовано.'); return true; }
      return false;
    },
  };
})(window.SC = window.SC || {});
