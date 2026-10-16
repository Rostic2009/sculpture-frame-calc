/* Інтерфейс застосунку: меню розділів, форми вихідних даних, запуск розрахунку, результати, звіт. */
(function (SC) {
  'use strict';

  const N = SC.norms, fmt = SC.report.fmt, f = fmt.f, esc = fmt.esc;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const KEY = 'sculpture-frame-calc.project.v1';
  const state = { pr: load() || SC.model.defaultProject(), R: null, stale: true, tab: 'project', view: null, meshes: {}, windTheta: null, def: 0 };

  function load() { try { const s = localStorage.getItem(KEY); return s ? migrate(JSON.parse(s)) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state.pr)); } catch (e) { /* сховище недоступне */ } }
  function migrate(p) { const d = SC.model.defaultProject(); return deepMerge(d, p); }
  function deepMerge(a, b) { if (Array.isArray(b)) return b; if (b && typeof b === 'object') { const o = Object.assign({}, a); for (const k in b) o[k] = (a && typeof a[k] === 'object' && !Array.isArray(a[k])) ? deepMerge(a[k], b[k]) : b[k]; return o; } return b; }

  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const set = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; };

  // ---------------- елементи форми ----------------
  function fld(path, label, unit, o) {
    o = o || {};
    const v = get(state.pr, path);
    const id = 'f_' + path.replace(/\./g, '_');
    if (o.type === 'check') return `<div class="fld check"><input type="checkbox" id="${id}" data-path="${path}" data-type="check" ${v ? 'checked' : ''}><label for="${id}">${label}</label></div>`;
    let input;
    if (o.options) input = `<select id="${id}" data-path="${path}" data-type="${o.num ? 'num' : 'str'}" ${o.rerender ? 'data-rerender="1"' : ''}>${o.options.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else input = `<input id="${id}" data-path="${path}" data-type="${o.type === 'text' ? 'str' : 'num'}" type="${o.type === 'text' ? 'text' : 'number'}" ${o.step ? `step="${o.step}"` : 'step="any"'} ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} value="${esc(v)}" ${o.rerender ? 'data-rerender="1"' : ''}>`;
    return `<div class="fld"><label for="${id}"><span>${label}</span>${unit ? `<span class="unit">${unit}</span>` : ''}</label>${input}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  }
  const secOptions = () => SC.sections.list().map(s => [s.name, `${s.name} — ${f(s.mass, 2)} кг/м`]);

  // ---------------- розділи ----------------
  const TABS = [
    ['Вихідні дані', [['project', 'Проєкт'], ['wind', 'Вітер'], ['snow', 'Сніг'], ['seismic', 'Сейсміка'], ['parts', 'Скульптура'], ['frame', 'Каркас']]],
    ['Матеріали', [['catalog', 'Сортамент труб'], ['base', 'Опорний вузол'], ['found', 'Фундамент']]],
    ['Результати', [['results', 'Результати'], ['spec', 'Специфікація'], ['report', 'Звіт']]],
    ['Довідка', [['norms', 'Нормативна база'], ['tz', 'Аналіз ТЗ'], ['tests', 'Перевірка ядра'], ['help', 'Методика']]],
  ];

  const R = {};

  R.project = () => `
    <h2>Проєкт</h2>
    <p class="lead">Загальні дані, строк експлуатації та клас наслідків. Від строку експлуатації T залежать коефіцієнти надійності γ<sub>fm</sub> для вітру й снігу (ДБН В.1.2-2, табл. 8.1, 9.1).</p>
    <div class="card"><h3>Об'єкт</h3><div class="form">
      ${fld('meta.name', 'Назва', '', { type: 'text' })}${fld('meta.customer', 'Замовник', '', { type: 'text' })}
      ${fld('meta.location', 'Місце встановлення', '', { type: 'text' })}${fld('meta.author', 'Виконавець', '', { type: 'text' })}
      ${fld('meta.date', 'Дата', '', { type: 'text' })}${fld('meta.stage', 'Стадія', '', { options: [['Попередній розрахунок', 'Попередній розрахунок'], ['Ескізний проєкт', 'Ескізний проєкт'], ['Проєкт', 'Проєкт'], ['Робочий проєкт', 'Робочий проєкт']] })}
    </div></div>
    <div class="card"><h3>Надійність <small>${N.gammaNMeta.src}</small></h3><div class="form">
      ${fld('site.Tlife', 'Строк експлуатації T', 'років', { options: [[25, '25'], [50, '50'], [70, '70'], [100, '100 (монументальні споруди)'], [150, '150']], num: true, rerender: true })}
      ${fld('site.cc', 'Клас наслідків', '', { options: N.gammaN.map(g => [g.id, `${g.id} (γn = ${g.g})`]), rerender: true })}
      ${fld('site.gammaN', 'γn', '', { step: 0.01 })}
      ${fld('site.hPed', 'Висота постаменту над землею', 'м', { hint: 'Висоти частин для C_h: z = h_пост + z_лок' })}
    </div>
    <p class="note">γ<sub>fm</sub> вітру при T = ${state.pr.site.Tlife}: <b>${f(N.windGamma(state.pr.site.Tlife), 3)}</b>; снігу: <b>${f(N.snowGamma(state.pr.site.Tlife), 3)}</b>.</p></div>
    <div class="card"><h3>Збереження проєкту</h3>
      <p class="note">Проєкт автоматично зберігається в цьому браузері. Щоб перенести на інший пристрій — скопіюйте JSON або відкрийте файл.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="copyjson">Скопіювати JSON</button>
        ${inFrame ? '' : '<button class="btn" data-act="downloadjson">Зберегти файл .json</button>'}
        <label class="btn" for="loadjson">Відкрити файл .json</label><input type="file" id="loadjson" accept=".json,application/json" hidden>
        <button class="btn" data-act="applyjson">Застосувати JSON з поля</button>
        <button class="btn" data-act="reset">Скинути до прикладу</button>
      </div>
      <textarea class="json" id="jsonbox" spellcheck="false" placeholder="Вставте JSON проєкту"></textarea>
    </div>`;

  R.wind = () => {
    const s = state.pr.site;
    const c = SC.loads.climate(state.pr, state.R ? state.R.T1 : null);
    const chRows = [1, 2, 3, 5, 7.5, 10, 15, 20, 30, 40].map(z => { const a = N.Ch(z, s.terrain, 0.1), b = N.Ch(z, s.terrain, 1); return [f(z, 1), f(a.value, 3), f(b.value, 3), f(c.q0 * a.value, 0), f(c.q0 * b.value, 0)]; });
    return `
    <h2>Вітрове навантаження</h2>
    <p class="lead">W<sub>m</sub> = γ<sub>fm</sub>·W₀·C<sub>aer</sub>·C<sub>h</sub>·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub> (ДБН В.1.2-2:2006, р. 9, Зміна № 1). Для кожної частини скульптури береться своя висота z; напрямки вітру перебираються з кроком ${state.pr.design.dirStep}°.</p>
    <div class="cols">
      <div class="card"><h3>Тиск W₀</h3><div class="form">
        ${fld('site.windMode', 'Спосіб визначення', '', { options: [['city', 'За містом (Додаток Е)'], ['district', 'За вітровим районом (рис. 9.1)'], ['value', 'Задати значення']], rerender: true })}
        ${s.windMode === 'city' ? fld('site.city', 'Місто', '', { options: N.cities.map(x => [x.name, x.name + (x.W0 ? ` — ${x.W0} Па` : ' — W₀ не внесено')]), rerender: true }) : ''}
        ${s.windMode === 'district' ? fld('site.windDistrict', 'Вітровий район', '', { options: N.windDistricts.map(d => [d.id, `${d.id} — ${d.W0} Па`]), rerender: true }) : ''}
        ${fld('site.W0', 'W₀', 'Па', { hint: s.windMode === 'district' ? 'береться з району' : 'характеристичне, 10 м, T = 50 р.' })}
        ${fld('site.w0Station', 'W₀ отримано статистикою метеостанції (тоді C_alt = 1)', '', { type: 'check' })}
      </div>
      <table><tbody>${N.windDistricts.map(d => `<tr><td>Район ${d.id}</td><td class="num">${d.W0} Па</td></tr>`).join('')}</tbody></table>
      <p class="note">${N.windDistrictsMeta.src}. ${N.windDistrictsMeta.note}</p></div>
      <div class="card"><h3>Коефіцієнти майданчика</h3><div class="form">
        ${fld('site.terrain', 'Тип місцевості', '', { options: N.terrainTypes.map(t => [t.id, t.name]), rerender: true })}
        ${fld('site.Hsea', 'Висота над рівнем моря H', 'км', { step: 0.01, hint: 'C_alt = 2H при H > 0,5 км' })}
        ${fld('site.Crel', 'C_rel — рельєф', '', { step: 0.01 })}
        ${fld('site.Cdir', 'C_dir — напрямок', '', { step: 0.01 })}
        ${fld('site.Cd', 'C_d — динамічність (якщо T₁ > 0,25 с)', '', { step: 0.01 })}
        ${fld('site.CdConfirmed', 'C_d підтверджено за графіками Зміни № 1', '', { type: 'check' })}
        ${fld('design.dirStep', 'Крок напрямків вітру', '°', { options: [[10, '10°'], [15, '15°'], [30, '30°'], [45, '45°']], num: true })}
      </div>
      <p class="note">γ<sub>fm</sub> = ${f(c.gfmW, 3)}; C<sub>alt</sub> = ${f(c.CaltW, 2)}; q₀ = γ<sub>fm</sub>·W₀·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub> = <b>${f(c.q0, 1)} Па</b>${state.R ? `; T₁ = ${f(state.R.T1, 3)} с → табл. ${state.R.clim.ChTable}` : ' (період T₁ буде визначено розрахунком)'}.</p></div>
    </div>
    <div class="card"><h3>C<sub>h</sub>(z) для типу ${s.terrain} і розрахунковий тиск без C<sub>F</sub> <small>лінійна інтерполяція, нижче 5 м — як для 5 м</small></h3>
      ${SC.report.fmt.tbl(['z, м', 'C_h, T ≤ 0,25 с (9.01)', 'C_h, T > 0,25 с (9.02)', 'q_m, Па (9.01)', 'q_m, Па (9.02)'], chRows)}</div>`;
  };

  R.snow = () => {
    const s = state.pr.site, c = SC.loads.climate(state.pr, null);
    return `<h2>Снігове навантаження</h2>
    <p class="lead">S<sub>m</sub> = γ<sub>fm</sub>·S₀·C, C = μ·C<sub>e</sub>·C<sub>alt</sub> (ДБН В.1.2-2:2006, р. 8). F<sub>s,j</sub> = S<sub>m</sub>·μ<sub>j</sub>·A<sub>h,j</sub> — на горизонтальну проєкцію кожної зони накопичення (задається в розділі «Скульптура»).</p>
    <div class="cols"><div class="card"><h3>S₀</h3><div class="form">
      ${fld('site.snowMode', 'Спосіб визначення', '', { options: [['city', 'За містом (Додаток Е)'], ['district', 'За сніговим районом (рис. 8.1)'], ['value', 'Задати значення']], rerender: true })}
      ${s.snowMode === 'city' ? fld('site.city', 'Місто', '', { options: N.cities.map(x => [x.name, x.name + (x.S0 ? ` — ${x.S0} Па` : '')]), rerender: true }) : ''}
      ${s.snowMode === 'district' ? fld('site.snowDistrict', 'Сніговий район', '', { options: N.snowDistricts.map(d => [d.id, `${d.id} — ${d.S0} Па`]), rerender: true }) : ''}
      ${fld('site.S0', 'S₀', 'Па')}
    </div><table><tbody>${N.snowDistricts.map(d => `<tr><td>Район ${d.id}</td><td class="num">${d.S0} Па</td></tr>`).join('')}</tbody></table>
    <p class="note">${N.snowDistrictsMeta.src} ${SC.report.fmt.esc('')}<span class="pill warn">звірити</span>. ${N.snowDistrictsMeta.note}</p></div>
    <div class="card"><h3>Коефіцієнти</h3><div class="form">
      ${fld('site.Ce', 'C_e — режим експлуатації', '', { step: 0.05, hint: 'без даних приймається 1,0' })}
      ${fld('site.snowRegion', 'Розташування для C_alt', '', { options: [['plain', 'Рівнинна територія'], ['carpathians', 'Карпати: 1,4H + 0,32'], ['crimea', 'Гірський Крим: 2,6H + 0,22']], rerender: true })}
    </div>
    <p class="note">γ<sub>fm</sub>(T = ${s.Tlife}) = ${f(c.gfmS, 3)}; C<sub>alt</sub> = ${f(c.CaltS, 3)}; S<sub>m</sub>(μ = 1) = <b>${f(c.Sm1, 0)} Па</b>; характеристичне ${f(c.Sk1, 0)} Па.</p>
    <p class="note">Помічник μ для схилу α: μ = 1 при α ≤ 25°, 0 при α ≥ 60°: ${[0, 20, 30, 40, 50, 60].map(a => `${a}° → ${f(N.snowMuSlope(a), 2)}`).join('; ')}. Коефіцієнти покрівель не переносяться механічно на складки плаща — зони накопичення підтверджує інженер.</p></div></div>`;
  };

  R.seismic = () => {
    const z = state.pr.site.seismic;
    const Ts = [0.05, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0];
    return `<h2>Сейсмічне навантаження</h2>
    <p class="lead">Спектральний метод: S<sub>ik</sub> = k₁·k₂·k<sub>гр</sub>·m<sub>k</sub>·g·a₀·β(T<sub>i</sub>)·k<sub>ψ</sub>·η<sub>ik</sub>; форми та періоди — з модального аналізу МСЕ; зусилля поєднуються за SRSS. Особливе сполучення: 0,9·G + 0,5·S ± E.</p>
    <div class="cols"><div class="card"><h3>Параметри майданчика <small>${N.docs.seismic}</small></h3><div class="form">
      ${fld('site.seismic.on', 'Враховувати сейсміку', '', { type: 'check' })}
      ${fld('site.seismic.intensity', 'Сейсмічність (карта ЗСР-2004 / нова карта)', 'бал', { options: [5, 6, 7, 8, 9].map(b => [b, `${b} — a₀ = ${N.seismicA0[b]}g`]), num: true })}
      ${fld('site.seismic.soil', 'Категорія ґрунту за сейсмічними властивостями', '', { options: [['I', 'I (скельні)'], ['II', 'II'], ['III', 'III (слабкі)']] })}
      ${fld('site.seismic.k1', 'k₁ — допустимі пошкодження', '', { step: 0.05, hint: '1,0 — пошкодження не допускаються (монумент)' })}
      ${fld('site.seismic.k2', 'k₂ — конструктивне рішення', '', { step: 0.05 })}
      ${fld('site.seismic.kgr', 'k_гр — ґрунтові умови', '', { step: 0.05 })}
      ${fld('site.seismic.kpsi', 'k_ψ — дисипація (демпфування)', '', { step: 0.05, hint: '1,5 — високі гнучкі споруди баштового типу' })}
      ${fld('site.seismic.nModes', 'Кількість форм коливань', '', { step: 1, min: 1, max: 30 })}
      ${fld('site.seismic.vertical', 'Вертикальна складова (0,7 від горизонтальної) — для консолей', '', { type: 'check' })}
    </div><p class="note"><span class="pill warn">звірити</span> ${N.docs.seismicNew}.</p></div>
    <div class="card"><h3>Коефіцієнт динамічності β(T)</h3>
    ${SC.report.fmt.tbl(['T, с', 'β, ґрунт I', 'β, ґрунт II', 'β, ґрунт III'], Ts.map(T => [f(T, 2), f(N.seismicBeta(T, 'I'), 2), f(N.seismicBeta(T, 'II'), 2), f(N.seismicBeta(T, 'III'), 2)]))}
    <p class="note">${N.seismicBetaMeta.src}. ${N.seismicBetaMeta.note}</p></div></div>`;
  };

  R.parts = () => {
    const ps = state.pr.parts;
    const row = (p, i) => `<tr>
      <td><input data-path="parts.${i}.name" data-type="str" value="${esc(p.name)}" style="min-width:140px"></td>
      <td><select data-path="parts.${i}.kind" data-type="str" data-rerender="1"><option value="dist" ${p.kind === 'dist' ? 'selected' : ''}>по висоті ядра</option><option value="cant" ${p.kind === 'cant' ? 'selected' : ''}>консоль</option></select></td>
      ${['x', 'y', 'z'].map(k => `<td><input data-path="parts.${i}.${k}" data-type="num" type="number" step="0.01" value="${p[k]}"></td>`).join('')}
      <td>${p.kind === 'dist' ? `<input data-path="parts.${i}.z1" data-type="num" type="number" step="0.1" value="${p.z1}"> … <input data-path="parts.${i}.z2" data-type="num" type="number" step="0.1" value="${p.z2}">` : '—'}</td>
      <td><input data-path="parts.${i}.shellArea" data-type="num" type="number" step="0.1" value="${p.shellArea}"></td>
      <td><input data-path="parts.${i}.tShell" data-type="num" type="number" step="0.5" value="${p.tShell}"></td>
      <td><select data-path="parts.${i}.rhoShell" data-type="num"><option value="7850" ${p.rhoShell == 7850 ? 'selected' : ''}>сталь 7850</option><option value="8900" ${p.rhoShell == 8900 ? 'selected' : ''}>мідь 8900</option><option value="8800" ${p.rhoShell == 8800 ? 'selected' : ''}>бронза 8800</option><option value="2700" ${p.rhoShell == 2700 ? 'selected' : ''}>алюміній 2700</option><option value="7900" ${p.rhoShell == 7900 ? 'selected' : ''}>нерж. 7900</option></select></td>
      <td><input data-path="parts.${i}.extraMass" data-type="num" type="number" step="1" value="${p.extraMass}"></td>
      <td><input data-path="parts.${i}.Ax" data-type="num" type="number" step="0.05" value="${p.Ax}" ${p.areaTable ? 'title="з 3D-моделі"' : ''}></td>
      <td><input data-path="parts.${i}.Ay" data-type="num" type="number" step="0.05" value="${p.Ay}"></td>
      <td><input data-path="parts.${i}.Cf" data-type="num" type="number" step="0.05" value="${p.Cf}"><label style="font-size:11px;display:flex;gap:4px"><input type="checkbox" data-path="parts.${i}.CfConfirmed" data-type="check" ${p.CfConfirmed ? 'checked' : ''} style="width:auto;min-width:0">підтв.</label></td>
      <td><input data-path="parts.${i}.Ah" data-type="num" type="number" step="0.05" value="${p.Ah}"></td>
      <td><input data-path="parts.${i}.mu" data-type="num" type="number" step="0.05" value="${p.mu}"></td>
      <td>${p.kind === 'cant' ? `<select data-path="parts.${i}.sec" data-type="str">${secOptions().map(([v, l]) => `<option value="${v}" ${v === p.sec ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '—'}</td>
      <td class="num">${f((p.shellArea || 0) * (p.tShell || 0) / 1000 * (p.rhoShell || 7850) + (p.extraMass || 0), 1)}</td>
      <td style="white-space:nowrap"><label class="btn small" for="mesh${i}">3D…</label><input type="file" id="mesh${i}" data-mesh="${i}" accept=".stl,.obj" hidden> <button class="btn small" data-act="dup" data-i="${i}">⧉</button> <button class="btn small" data-act="del" data-i="${i}" aria-label="Видалити">✕</button>${p.areaTable ? '<div class="pill ok">A(θ) з 3D</div>' : ''}</td></tr>`;
    return `<h2>Скульптура: частини та навантаження від них</h2>
    <p class="lead">Кожна частина передає на каркас власну вагу оболонки (m = ρ·t·A + m<sub>дод</sub>), вітер F = q<sub>m</sub>(z)·C<sub>F</sub>·A(θ) і сніг F = S<sub>m</sub>·μ·A<sub>h</sub>. «По висоті ядра» — тулуб, плащ: навантаження розподіляється на рівні ядра в межах z₁…z₂ зі збереженням ΣF і ΣM. «Консоль» — голова, руки, книга: вузол у центрі частини з'єднується виносною трубою з найближчим вузлом ядра.</p>
    <div class="card"><h3>Частини <small>координати від центру основи каркаса, м; A<sub>x</sub> — проєкція при вітрі вздовж X</small></h3>
    <div class="tw"><table class="edit"><thead><tr><th>Назва</th><th>Тип</th><th>x</th><th>y</th><th>z</th><th>z₁ … z₂</th><th>A обол., м²</th><th>t, мм</th><th>Матеріал</th><th>m дод., кг</th><th>A_x, м²</th><th>A_y, м²</th><th>C_F</th><th>A_h, м²</th><th>μ</th><th>Консоль</th><th class="num">Маса, кг</th><th></th></tr></thead>
    <tbody>${ps.map(row).join('')}</tbody></table></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><button class="btn" data-act="addpart">Додати частину</button>
      <label class="btn" for="meshAll">Імпорт 3D-моделі як нової частини (STL / OBJ)…</label><input type="file" id="meshAll" data-mesh="new" accept=".stl,.obj" hidden>
      ${fld('design.meshUnit', 'Одиниці 3D-файлу', '', { options: [['0.001', 'мм'], ['0.01', 'см'], ['1', 'м']] })}
      ${fld('design.meshUp', 'Вертикальна вісь у файлі', '', { options: [['z', 'Z'], ['y', 'Y']] })}
    </div>
    <p class="note">C<sub>F</sub> для довільної художньої форми потрібно обґрунтувати (аеродинамічне дослідження, CFD, погоджена схема). Орієнтири для попередньої оцінки: компактне тіло 1,0…1,3; плоска пластина/плащ поперек потоку 1,8…2,0; призма квадратного перерізу 2,0. Без позначки «підтв.» результат має статус «попередній».</p></div>
    ${state.meshInfo ? `<div class="card"><h3>Остання імпортована модель</h3><p class="note">${state.meshInfo}</p></div>` : ''}`;
  };

  R.frame = () => {
    const fr = state.pr.frame;
    return `<h2>Каркас</h2>
    <p class="lead">Основний каркас — силове ядро з квадратних труб, що проходить усередині тулуба; виносні консолі до голови, рук і атрибутів створюються автоматично. Перерізи можна задати вручну або підібрати автоматично (кнопка «Підібрати перерізи»).</p>
    <div class="cols"><div class="card"><h3>Схема ядра</h3><div class="form">
      ${fld('frame.type', 'Тип', '', { options: [['single', 'Одна стійка (консоль)'], ['core3', 'Тригранне ядро'], ['core4', 'Чотиригранне ядро']], rerender: true })}
      ${fr.type !== 'single' ? fld('frame.a', 'Розмір у плані внизу a', 'м', { step: 0.05 }) + fld('frame.b', 'b (для 4 стійок)', 'м', { step: 0.05 }) + fld('frame.aTop', 'a вгорі', 'м', { step: 0.05 }) + fld('frame.bTop', 'b вгорі', 'м', { step: 0.05 }) + fld('frame.bracing', 'Зв\'язки граней', '', { options: [['X', 'Хрестові'], ['Z', 'Розкісні'], ['none', 'Без зв\'язків (рамне)']], rerender: true }) : ''}
      <div class="fld"><label for="f_levels"><span>Рівні (через ;)</span><span class="unit">м</span></label><input id="f_levels" data-levels="1" value="${fr.levels.join('; ')}"><span class="hint">Верх ядра — останній рівень. На рівнях — пояси й вузли кріплення.</span></div>
      ${fld('frame.support', 'Закріплення основи', '', { options: [['fixed', 'Жорстке (пластина + анкери)'], ['pinned', 'Шарнірне']] })}
    </div></div>
    <div class="card"><h3>Перерізи та сталь</h3><div class="form">
      ${fld('frame.secPost', 'Стійки ядра', '', { options: secOptions() })}
      ${fr.type !== 'single' ? fld('frame.secRing', 'Пояси', '', { options: secOptions() }) : ''}
      ${fr.type !== 'single' && fr.bracing !== 'none' ? fld('frame.secBrace', 'Зв\'язки', '', { options: secOptions() }) : ''}
      ${fld('frame.steel', 'Марка сталі', '', { options: N.steels.map(s => [s.id, `${s.id} (Ryn ${s.Ryn} МПа)`]) })}
      ${fld('frame.gammaC', 'γc — умови роботи', '', { step: 0.05 })}
      ${fld('frame.exposed', 'Каркас відкритий вітру (без оболонки)', '', { type: 'check' })}
    </div></div>
    <div class="card"><h3>Розрахунок</h3><div class="form">
      ${fld('design.second', 'Розрахунок 2-го порядку (P-Δ) з недосконалостями', '', { type: 'check' })}
      ${fld('design.method', 'Розрахункова довжина', '', { options: [['A', 'A: 2-й порядок, L_cr = системна довжина'], ['B', 'B: 1-й порядок, μ = 2 для консолей']] })}
      ${fld('design.norm', 'Критерій прийняття', '', { options: [['both', 'Більше з ДБН і EN'], ['dbn', 'ДБН В.2.6-198'], ['en', 'EN 1993-1-1']] })}
      ${fld('design.curve', 'Крива стійкості EN', '', { options: [['c', 'c — холодноформовані труби'], ['a', 'a — гарячеформовані труби']] })}
      ${fld('design.defLimit', 'Граничне переміщення H /', '', { step: 10 })}
      ${fld('design.target', 'Ціль U при підборі', '', { step: 0.05 })}
      ${fld('design.tMin', 'Мінімальна товщина стінки', 'мм', { step: 0.5, hint: 'зварювання, корозійний запас' })}
    </div></div></div>`;
  };

  R.catalog = () => {
    const steel = N.steels.find(s => s.id === state.pr.frame.steel) || N.steels[1];
    const flt = state.catFilter || '';
    const rows = SC.sections.list().filter(s => !flt || String(s.bmm) === flt).map(s => {
      const cl = SC.checks.sectionClass(s, steel.Ryn);
      return [s.name, f(s.bmm, 0), f(s.tmm, 1), f(s.ro * 1000, 1), f(s.A * 1e4, 2), f(s.Iy * 1e8, 1), f(s.Wel * 1e6, 2), f(s.Wpl * 1e6, 2), f(s.i * 100, 2), f(s.J * 1e8, 1), f(s.mass, 2), f(s.perim, 3), `${cl.cls}`];
    });
    return `<h2>Сортамент квадратних труб і сталі</h2>
    <p class="lead">Характеристики обчислені з урахуванням радіусів кутів за ДСТУ EN 10219-2 (r<sub>o</sub> = 2t при t ≤ 6 мм; 2,5t при t ≤ 10 мм; 3t понад 10 мм). Маса — при ρ = 7850 кг/м³. Клас перерізу — для стиску при сталі ${steel.id}.</p>
    <div class="card"><div class="form"><div class="fld"><label for="catf">Типорозмір b</label><select id="catf" data-catf="1"><option value="">усі</option>${SC.sections.catalog.map(([b]) => `<option ${String(b) === flt ? 'selected' : ''}>${b}</option>`).join('')}</select></div></div>
    ${fmt.tbl(['Переріз', 'b, мм', 't, мм', 'r_o, мм', 'A, см²', 'I, см⁴', 'W_el, см³', 'W_pl, см³', 'i, см', 'I_t, см⁴', 'Маса, кг/м', 'Периметр, м²/м', 'Клас'], rows)}</div>
    <div class="card"><h3>Сталі <small>${N.steelsMeta.src}</small></h3>
    ${fmt.tbl(['Марка', 'R_yn (f_y), МПа', 'R_un (f_u), МПа', 'γm', 'R_y = R_yn/γm, МПа', 'Товщина до, мм'], N.steels.map(s => [s.id, s.Ryn, s.Run, s.gm, f(s.Ryn / (s.norm === 'dbn' ? s.gm : 1.025), 1), s.tmax]))}
    <p class="note">${N.steelsMeta.note} Для товщин понад указані значення R<sub>yn</sub> зменшуються — перевірте за таблицею норми.</p></div>`;
  };

  R.base = () => `<h2>Опорний вузол</h2>
    <p class="lead">Труба → кутовий шов → опорна пластина → анкери й бетон підколонника. Зусилля в анкерах і тиск під пластиною визначаються спільно з урахуванням відриву.</p>
    <div class="cols"><div class="card"><h3>Пластина і шов</h3><div class="form">
      ${fld('base.plateB', 'Розмір B', 'мм', { step: 10 })}${fld('base.plateL', 'Розмір L', 'мм', { step: 10 })}${fld('base.tp', 'Товщина t_p', 'мм', { step: 1 })}
      ${fld('base.weldLeg', 'Катет шва', 'мм', { step: 1 })}${fld('base.alphaBearing', 'α = √(A_c1/A_c0) ≤ 3', '', { step: 0.1, hint: 'підливка + розподіл у бетоні' })}
    </div></div>
    <div class="card"><h3>Анкери</h3><div class="form">
      ${fld('base.nAnchor', 'Кількість на опору', '', { options: [[4, '4 (кути)'], [6, '6'], [8, '8']], num: true })}
      ${fld('base.d', 'Діаметр', 'мм', { options: Object.keys(N.boltAs).map(d => [d, 'М' + d]), num: true })}
      ${fld('base.grade', 'Клас/сталь', '', { options: N.boltGrades.map(b => [b.id, b.id]) })}
      ${fld('base.edge', 'Відстань осі анкера до краю пластини', 'мм', { step: 5 })}
      ${fld('base.hef', 'Ефективне закладання h_ef', 'мм', { step: 10 })}
      ${fld('base.dh', 'Діаметр головки / анкерної шайби', 'мм', { step: 5 })}
      ${fld('base.concrete', 'Бетон підколонника', '', { options: N.concretes.map(c => [c.id, c.id]) })}
      ${fld('base.cracked', 'Бетон з тріщинами (консервативно)', '', { type: 'check' })}
      ${fld('base.shear', 'Передавання зсуву', '', { options: [['anchors', 'Анкерами'], ['friction', 'Тертям + анкерами (C_f,d·N_c)']] })}
      ${fld('base.cf', 'C_f,d', '', { step: 0.05 })}
    </div></div></div>`;

  R.found = () => {
    const fd = state.pr.found;
    const sr = SC.found.soilR(fd);
    return `<h2>Фундамент</h2>
    <p class="lead">Монолітна плита з підколонником. Тиск під підошвою — від характеристичних навантажень (II група граничних станів) з урахуванням відриву; перекидання, зсув, продавлювання й армування — від розрахункових (I група).</p>
    <div class="cols"><div class="card"><h3>Геометрія</h3><div class="form">
      ${fld('found.B', 'Плита B (вздовж X)', 'м', { step: 0.1 })}${fld('found.L', 'Плита L (вздовж Y)', 'м', { step: 0.1 })}${fld('found.h', 'Товщина плити h', 'м', { step: 0.05 })}
      ${fld('found.pedB', 'Підколонник B', 'м', { step: 0.05 })}${fld('found.pedL', 'Підколонник L', 'м', { step: 0.05 })}${fld('found.pedH', 'Висота підколонника', 'м', { step: 0.05 })}
      ${fld('found.depth', 'Глибина закладання d', 'м', { step: 0.1 })}
      ${fld('found.concrete', 'Бетон', '', { options: N.concretes.map(c => [c.id, c.id]) })}${fld('found.rebar', 'Арматура', '', { options: N.rebars.map(r => [r.id, r.id]) })}${fld('found.cover', 'Захисний шар', 'мм', { step: 5 })}
    </div></div>
    <div class="card"><h3>Ґрунт</h3><div class="form">
      ${fld('found.soilMode', 'Розрахунковий опір R', '', { options: [['R', 'Задати (з вишукувань)'], ['calc', 'Обчислити за ДБН В.2.1-10']], rerender: true })}
      ${fd.soilMode === 'R' ? fld('found.R', 'R', 'кПа') : fld('found.phi', 'φ_II', '°', { step: 1 }) + fld('found.cII', 'c_II', 'кПа', { step: 1 }) + fld('found.gammaSoil', 'γ_II', 'кН/м³', { step: 0.5 }) + fld('found.gammaC1', 'γ_c1', '', { step: 0.05 }) + fld('found.gammaC2', 'γ_c2', '', { step: 0.05 }) + fld('found.kfactor', 'k (1,0 / 1,1)', '', { step: 0.1 })}
      ${fld('found.frictionMu', 'Коефіцієнт тертя по підошві μ', '', { step: 0.05 })}
      ${fld('found.minContact', 'Мінімальна частка контакту', '', { step: 0.05 })}
      ${fld('found.overturnSF', 'Коефіцієнт запасу на перекидання', '', { step: 0.1 })}
    </div>${fd.soilMode === 'calc' ? `<p class="note">M<sub>γ</sub> = ${f(sr.mg, 2)}, M<sub>q</sub> = ${f(sr.mq, 2)}, M<sub>c</sub> = ${f(sr.mc, 2)} → <b>R = ${f(sr.R, 1)} кПа</b> (b = ${f(sr.b, 2)} м).</p>` : ''}</div></div>`;
  };

  R.results = () => {
    const X = state.R;
    if (!X) return `<h2>Результати</h2><div class="card"><p>Розрахунок ще не виконано. Натисніть «Розрахувати» — це займає кілька секунд.</p></div>`;
    if (!X.ok) return `<h2>Результати</h2><div class="card"><ul class="warns"><li class="error">${esc(X.error)}</li></ul></div>`;
    const gm = X.govMember, gs = X.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, X.supportRes[0]);
    const fu = Math.max(X.found.govSls.chk.max, X.found.govUls.chk.max, X.found.reinf.punching);
    const cls = u => u > 1 ? 'bad' : u > 0.9 ? 'warn' : 'ok';
    const tiles = [
      ['Каркас, max U', f(gm.best.u, 3), `${esc(gm.e.group)} · ${gm.e.sec.name}`, cls(gm.best.u)],
      ['Опорний вузол, max U', f(gs.best.u, 3), esc(gs.best.combo.split(':')[0]), cls(gs.best.u)],
      ['Фундамент, max U', f(fu, 3), `p_max ${f(X.found.govSls.chk.p.pmax / 1000, 1)} кПа · R ${f(X.found.Rsoil, 0)}`, cls(fu)],
      ['Переміщення', f(X.uMax * 1000, 1) + ' мм', `гранично ${f(X.uLim * 1000, 1)} мм`, cls(X.uMax / X.uLim)],
      ['Період T₁', f(X.T1, 3) + ' с', `таблиця C_h ${X.clim.ChTable}`, X.T1 > 0.25 ? 'warn' : 'ok'],
      ['α_cr системи', f(X.alphaCr, 1), X.alphaCr >= 10 ? 'жорстка система' : 'потрібен 2-й порядок', X.alphaCr < 3 ? 'bad' : X.alphaCr < 10 ? 'warn' : 'ok'],
      ['Маса металу', f(X.spec.tubeMass + X.spec.sheetMass, 0) + ' кг', `каркас ${f(X.spec.tubeMass, 0)} · оболонка ${f(X.spec.sheetMass, 0)}`, ''],
      ['Вартість матеріалів', f(X.spec.total, 0) + ' грн', 'за цінами розділу «Специфікація»', ''],
    ];
    const mr = X.memberRes.slice().sort((a, b) => b.best.u - a.best.u);
    return `<h2>Результати</h2>
    <div class="tiles">${tiles.map(([k, v, s, c]) => `<div class="tile ${c}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('')}</div>
    <div class="card"><h3>Попередження <small>${X.warn.length}</small></h3><ul class="warns">${X.warn.map(w => `<li class="${w.level}">${esc(w.msg)}</li>`).join('') || '<li class="info">Попереджень немає.</li>'}</ul></div>
    <div class="card"><h3>Розрахункова схема <small>колір — коефіцієнт використання U; пунктир — зв'язки (ферма)</small></h3>
      <div class="viewer"><canvas id="cv" aria-label="3D-схема каркаса"></canvas>
        <div class="ctl"><label for="vdef">Деформації ×</label><select id="vdef"><option value="0">0</option><option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="300">300</option></select>
        <label for="vwind">Вітер</label><select id="vwind"><option value="">—</option>${X.cases.W.map(W => `<option value="${W.theta}" ${state.windTheta == W.theta ? 'selected' : ''}>${W.theta}°</option>`).join('')}</select>
        <span class="note">тягніть — обертання, Shift — зсув, колесо — масштаб</span></div>
        <div class="legend"><span><i style="background:var(--ok)"></i>U ≤ 0,9</span><span><i style="background:var(--warn)"></i>0,9…1</span><span><i style="background:var(--bad)"></i>&gt; 1</span></div></div></div>
    <div class="card"><h3>Елементи <small>${mr.length}, відсортовано за U</small></h3>
      ${fmt.tbl(['Елемент', 'Група', 'Переріз', 'L, м', 'L_cr, м', 'λ', 'N, кН', 'M_y, кН·м', 'M_z, кН·м', 'U ДБН', 'U EN', 'Сполучення'], mr.map(m => [m.e.id, esc(m.e.group), m.e.sec.name, f(m.L, 2), f(m.Lsys.Lcr, 2), f(m.lam, 0), fmt.kN(m.best.f.N), fmt.kNm(m.best.f.My), fmt.kNm(m.best.f.Mz), fmt.U(m.best.chk.dbn.max), fmt.U(m.best.chk.en.max), esc(m.best.combo)]))}</div>
    <div class="card"><h3>Реакції та опорні вузли</h3>
      ${fmt.tbl(['Опора', 'U', 'N, кН', 'H, кН', 'M, кН·м', 'T анкера, кН', 'σ бетону, МПа', 'Визначальне'], X.supportRes.map(s => { const b = s.best.b, r = s.best.r; return [s.node.id, fmt.U(s.best.u), fmt.kN(r[2]), fmt.kN(Math.hypot(r[0], r[1])), fmt.kNm(Math.hypot(r[3], r[4])), fmt.kN(b.Tmax), fmt.MPa(b.sigmaMax), esc(s.best.combo)]; }))}</div>
    <div class="cols"><div class="card"><h3>Власні коливання <small>маси G</small></h3>${fmt.tbl(['Форма', 'T, с', 'f, Гц', 'm_eff X', 'm_eff Y'], X.modalG.modes.map((m, i) => [i + 1, f(m.T, 3), f(m.f, 2), fmt.pc(m.meff[0]), fmt.pc(m.meff[1])]))}</div>
    <div class="card"><h3>Вітер за напрямками <small>розрахункові</small></h3>${fmt.tbl(['θ', 'ΣF, кН', 'M на рівні землі, кН·м'], X.cases.W.map(W => { const F = W.info.parts.reduce((a, p) => a + p.F, 0), M = W.info.parts.reduce((a, p) => a + p.F * p.zcp, 0); return [W.theta + '°', fmt.kN(F * X.clim.gfmW), fmt.kNm(M * X.clim.gfmW)]; }))}</div></div>`;
  };

  R.spec = () => {
    const pz = state.pr.prices;
    return `<h2>Специфікація матеріалів</h2>
    <p class="lead">Чиста кількість у конструкції, закупівельна кількість з відходами (один раз на позицію), маси та вартість. L<sub>Σ,j</sub> = ΣL<sub>e</sub>; m<sub>j</sub> = m<sub>l,j</sub>·L<sub>Σ,j</sub>; m<sub>sheet</sub> = Σρ·t·A; m<sub>r</sub> = ρ·πd²/4·L.</p>
    <div class="card"><h3>Ціни та запаси</h3><div class="form">
      ${fld('prices.tube', 'Труба', 'грн/кг')}${fld('prices.sheet', 'Лист оболонки', 'грн/кг')}${fld('prices.plate', 'Пластини', 'грн/кг')}${fld('prices.anchor', 'Анкер у зборі', 'грн/шт')}
      ${fld('prices.concrete', 'Бетон', 'грн/м³')}${fld('prices.rebar', 'Арматура', 'грн/кг')}${fld('prices.fabrication', 'Виготовлення', 'грн')}${fld('prices.transport', 'Транспорт', 'грн')}${fld('prices.install', 'Монтаж', 'грн')}
      ${fld('design.waste', 'Відходи труб', '%')}${fld('design.sheetWaste', 'Відходи листа', '%')}
    </div></div>
    ${state.R && state.R.ok ? `<div class="card">${SC.report.specTable(SC.analysis.specification(state.pr, state.R.mdl, state.R.P, state.R.memberRes, state.R.P.model.nodes.filter(n => n.sup), state.R.found.reinf, state.R.found.fd))}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="copycsv">Скопіювати як CSV (для Excel)</button></div></div>` : '<div class="card"><p>Специфікація з\'явиться після розрахунку.</p></div>'}`;
  };

  R.report = () => {
    if (!state.R || !state.R.ok) return '<h2>Звіт</h2><div class="card"><p>Виконайте розрахунок, щоб сформувати розрахункову записку.</p></div>';
    return `<div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><h2 style="flex:1">Розрахункова записка</h2>
      ${inFrame ? '<span class="note">Щоб отримати PDF, відкрийте застосунок з GitHub Pages і скористайтеся «Друк».</span>' : '<button class="btn primary" data-act="print">Друк / PDF</button><button class="btn" data-act="savehtml">Зберегти HTML</button>'}
      <button class="btn" data-act="copyreport">Скопіювати текст</button></div>
      ${state.stale ? '<div class="card"><ul class="warns"><li class="warn">Вихідні дані змінено після розрахунку — звіт застарів. Натисніть «Розрахувати».</li></ul></div>' : ''}
      <article class="report" id="report">${SC.report.build(state.R)}</article>`;
  };

  R.norms = () => {
    const ov = state.pr.overrides || {};
    const ChT = ov.ChTables || N.ChTables;
    const chTable = key => {
      const t = ChT[key];
      return `<div class="tw"><table class="edit"><thead><tr><th>z, м</th>${['I', 'II', 'III', 'IV'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${t.z.map((z, i) => `<tr><td>${z}</td>${['I', 'II', 'III', 'IV'].map(x => `<td><input data-ch="${key}.${x}.${i}" type="number" step="0.01" value="${t[x][i] == null ? '' : t[x][i]}" placeholder="ввести"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    };
    return `<h2>Нормативна база</h2>
    <p class="lead">Значення, внесені в застосунок, з джерелом і статусом перевірки. Таблиці C<sub>h</sub> можна доповнити (наприклад, для висот понад 60 м) — зміни зберігаються в проєкті й друкуються у звіті.</p>
    <div class="card"><h3>Документи</h3><ul>${Object.values(N.docs).map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>
    <div class="cols"><div class="card"><h3>C<sub>h</sub>, табл. 9.01 (T ≤ 0,25 с) <span class="pill ok">звірено</span></h3>${chTable('9.01')}<p class="note">${N.ChTables['9.01'].src}</p></div>
    <div class="card"><h3>C<sub>h</sub>, табл. 9.02 (T > 0,25 с) <span class="pill ok">звірено</span></h3>${chTable('9.02')}<p class="note">${N.ChTables['9.02'].src}. Значення для типу IV на 60 м у відкритих джерелах не знайдено — введіть з офіційного тексту.</p></div></div>
    <div class="cols"><div class="card"><h3>γ<sub>fm</sub> вітру <span class="pill warn">звірити</span></h3>${fmt.tbl(['T, років', ...N.windGammaFm.T], [['γfm', ...N.windGammaFm.g.map(g => f(g, 2))]])}<p class="note">${N.windGammaFm.src}</p></div>
    <div class="card"><h3>γ<sub>fm</sub> снігу <span class="pill ok">звірено</span></h3>${fmt.tbl(['T, років', ...N.snowGammaFm.T], [['γfm', ...N.snowGammaFm.g.map(g => f(g, 2))]])}<p class="note">${N.snowGammaFm.src}</p></div></div>
    <div class="card"><h3>Міста (Додаток Е) — внесено лише значення, знайдені у відкритих фрагментах</h3>${fmt.tbl(['Місто', 'W₀, Па', 'S₀, Па', 'Статус'], N.cities.map(c => [c.name, c.W0 || '—', c.S0 || '—', c.status === 'checked' ? '<span class="pill ok">звірено</span>' : '<span class="pill warn">звірити</span>']))}</div>
    <div class="card"><h3>Інші коефіцієнти</h3>${fmt.tbl(['Параметр', 'Значення', 'Джерело'], [
      ['γfm власної ваги (метал / бетон / ґрунт / сприятлива)', `${N.gammaG.steel} / ${N.gammaG.concrete} / ${N.gammaG.soil} / ${N.gammaG.favourable}`, N.gammaG.src],
      ['ψ для короткочасних у сполученні з ≥ 2 змінними', N.psi.short, N.psi.src],
      ['Особливе сполучення: G / S', `${N.seismicComb.G} / ${N.seismicComb.snow}`, N.seismicComb.src],
      ['a₀ за бальністю 6/7/8/9', `${N.seismicA0[6]} / ${N.seismicA0[7]} / ${N.seismicA0[8]} / ${N.seismicA0[9]} g`, N.seismicA0Meta.src],
      ['Анкери: γM2; k₁ конуса (тріщ./без); k₂ вириву', '1,25; 8,9 / 12,7; 7,5 / 10,5', N.docs.anchors],
      ['Глобальна недосконалість φ₀', '1/200', 'EN 1993-1-1, 5.3.2'],
    ])}</div>
    <button class="btn" data-act="resetnorms">Повернути таблиці C<sub>h</sub> до внесених значень</button>`;
  };

  R.tz = () => `<h2>Аналіз технічного завдання</h2>
    <p class="lead">ТЗ (≈ 12 600 рядків) описує повну платформу: машинний зір, генерацію каркаса, МСЕ, анкери за EN 1992-4, фундамент, звіти. Нижче — знайдені прогалини та суперечності, і як їх закрито в цій версії застосунку.</p>${SC.report.tzAnalysis()}`;

  R.tests = () => {
    const t = SC.selftest();
    const bad = t.filter(x => !x.ok).length;
    return `<h2>Перевірка розрахункового ядра</h2>
    <p class="lead">Еталонні задачі з ТЗ (р. 14): аналітичні розв'язки, таблиці сортаменту і норм. Запускаються щоразу при відкритті цієї вкладки.</p>
    <div class="tiles"><div class="tile ${bad ? 'bad' : 'ok'}"><span class="k">Результат</span><span class="v">${t.length - bad} / ${t.length}</span><span class="s">${bad ? 'є розбіжності' : 'усі задачі збігаються'}</span></div></div>
    <div class="card">${fmt.tbl(['Задача', 'Отримано', 'Еталон', 'Допуск', 'Статус'], t.map(x => [esc(x.name), f(x.got, 5), f(x.exp, 5), (x.tol * 100).toPrecision(2) + ' %', x.ok ? '<span class="pill ok">OK</span>' : '<span class="pill bad">FAIL</span>']))}</div>`;
  };

  R.help = () => `<h2>Методика розрахунку</h2>
    <div class="card"><h3>Порядок роботи</h3><ol>
      <li>Проєкт: строк експлуатації, клас наслідків.</li><li>Вітер, сніг, сейсміка: місто/район, тип місцевості, висота над рівнем моря.</li>
      <li>Скульптура: частини з координатами, площами оболонки й проєкцій (або імпорт STL/OBJ — площі A(θ), A<sub>h</sub> і центр рахуються автоматично).</li>
      <li>Каркас: схема ядра, рівні, перерізи (або «Підібрати перерізи»).</li><li>Опорний вузол і фундамент.</li><li>«Розрахувати» → Результати, Специфікація, Звіт.</li></ol></div>
    <div class="card"><h3>Алгоритм</h3><div class="formula">1. Побудова стрижневої моделі: вузли ядра на рівнях, стійки, пояси, зв'язки (ферма), консолі до частин.
2. Маси G → модальний аналіз (ітерація в підпросторі) → T₁ → вибір табл. C_h 9.01/9.02 і C_d.
3. Завантаження: G (каркас — розподілене по елементах; оболонка — у вузли методом RBE3), S, W(θ) для θ = 0…360°.
4. Сполучення ULS: γG + γS; γG + γW(θ); γG + ψ(γS + γW(θ)); 0,9G + γW(θ); особливе 0,9G + 0,5S ± E.
5. Недосконалість φ = φ₀·αh·αm як сили H = φ·V; розрахунок 2-го порядку (K + K_G(N))·u = f до збіжності 1e-4.
6. Контроль рівноваги ΣF + ΣR ≈ 0; α_cr системи (степенева ітерація).
7. Перевірки труб: ДБН (Ry, φ, σ_ef) та EN 1993-1-1 (клас, χ, 6.61/6.62) у 5 перерізах кожного елемента.
8. Опора: жорстка пластина на односторонніх пружинах → анкери, бетон, шов, EN 1992-4.
9. Фундамент: тиск з відривом (SLS), перекидання і зсув (ULS), армування, продавлювання.
10. Специфікація, вартість, звіт із поясненнями визначальних сполучень.</div></div>
    <div class="card"><h3>Чому застосунок працює без API</h3><p>Усі розрахунки виконуються у вашому браузері (JavaScript), без серверів і платних токенів. Проєкт зберігається локально; файли не передаються нікуди. Машинний зір (розпізнавання фото) потребує важких моделей і винесений в окремий етап — замість нього можна імпортувати 3D-модель.</p></div>`;

  // ---------------- рендеринг ----------------
  function navHTML() {
    const dot = id => {
      if (!state.R || !state.R.ok) return '';
      const X = state.R;
      if (id === 'results') return `<span class="dot ${X.status === 'ok' ? 'ok' : X.status === 'preliminary' ? 'warn' : 'bad'}"></span>`;
      return '';
    };
    return TABS.map(([g, items]) => `<div class="grp">${g}</div>` + items.map(([id, l]) => `<button data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}><span>${l}</span>${dot(id)}</button>`).join('')).join('');
  }
  function render() {
    document.getElementById('nav').innerHTML = navHTML();
    const c = document.getElementById('content');
    c.innerHTML = (R[state.tab] || R.project)();
    document.getElementById('ptitle').textContent = state.pr.meta.name;
    const st = document.getElementById('pstatus');
    const map = { ok: 'перевірки виконуються', preliminary: 'попередній результат', 'not-ok': 'є невиконані перевірки' };
    if (!state.R) { st.className = 'status stale'; st.textContent = 'не розраховано'; }
    else if (!state.R.ok) { st.className = 'status not-ok'; st.textContent = 'помилка схеми'; }
    else { st.className = 'status ' + (state.stale ? 'stale' : state.R.status); st.textContent = state.stale ? 'дані змінено — перерахуйте' : map[state.R.status]; }
    if (state.tab === 'results' && state.R && state.R.ok) setupViewer();
    try { localStorage.setItem(KEY + '.tab', state.tab); } catch (e) { /* */ }
  }

  function setupViewer() {
    const cv = document.getElementById('cv'); if (!cv) return;
    const X = state.R;
    const U = X.memberRes.map(m => m.best.u);
    const sel = X.solved.find(s => s.cb.theta === state.windTheta && s.cb.id.startsWith('W')) || X.solved[0];
    const v = SC.view3d.create(cv, () => ({ nodes: X.P.model.nodes, elems: X.mdl.elems, U, parts: state.pr.parts, u: sel && sel.r.u, windTheta: state.windTheta }));
    v.st.defScale = state.def; v.st.mesh = state.lastMesh || null;
    state.view = v; v.draw();
    document.getElementById('vdef').value = String(state.def);
    document.getElementById('vdef').onchange = e => { state.def = +e.target.value; v.st.defScale = state.def; v.draw(); };
    document.getElementById('vwind').onchange = e => { state.windTheta = e.target.value === '' ? null : +e.target.value; setupViewer(); };
  }

  function markStale() { state.stale = true; save(); const st = document.getElementById('pstatus'); if (state.R) { st.className = 'status stale'; st.textContent = 'дані змінено — перерахуйте'; } }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.path) {
      let v = t.dataset.type === 'check' ? t.checked : t.dataset.type === 'num' ? (t.value === '' ? 0 : parseFloat(t.value)) : t.value;
      if (t.dataset.type === 'num' && !isFinite(v)) return;
      set(state.pr, t.dataset.path, v);
      // похідні значення
      if (t.dataset.path === 'site.city') { const c = N.cities.find(x => x.name === v); if (c) { if (c.W0) state.pr.site.W0 = c.W0; if (c.S0) state.pr.site.S0 = c.S0; state.pr.meta.location = 'м. ' + c.name; } }
      if (t.dataset.path === 'site.windDistrict') state.pr.site.W0 = N.windDistricts.find(d => d.id === v).W0;
      if (t.dataset.path === 'site.snowDistrict') state.pr.site.S0 = N.snowDistricts.find(d => d.id === v).S0;
      if (t.dataset.path === 'site.cc') state.pr.site.gammaN = N.gammaN.find(g => g.id === v).g;
      markStale();
      if (t.dataset.rerender) render();
      if (t.dataset.path === 'meta.name') document.getElementById('ptitle').textContent = v;
    } else if (t.dataset.levels) {
      const lv = t.value.split(/[;,\s]+/).map(Number).filter(x => isFinite(x) && x >= 0);
      if (lv.length >= 2) { state.pr.frame.levels = lv; markStale(); }
    } else if (t.dataset.ch) {
      const [key, col, i] = t.dataset.ch.split('.');
      state.pr.overrides = state.pr.overrides || {};
      if (!state.pr.overrides.ChTables) state.pr.overrides.ChTables = JSON.parse(JSON.stringify(N.ChTables));
      state.pr.overrides.ChTables[key][col][+i] = t.value === '' ? null : parseFloat(t.value);
      markStale();
    } else if (t.dataset.catf) { state.catFilter = t.value; render(); }
    else if (t.dataset.mesh != null) importMesh(t);
    else if (t.id === 'loadjson') loadFile(t);
  }

  async function importMesh(inp) {
    const file = inp.files[0]; if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const T = SC.mesh.parse(buf, file.name);
      const scale = parseFloat(state.pr.design.meshUnit || '0.001');
      const m = SC.mesh.analyze(T, { scale, upAxis: state.pr.design.meshUp || 'z', step: state.pr.design.dirStep || 15, res: 300 });
      const target = inp.dataset.mesh === 'new' ? null : state.pr.parts[+inp.dataset.mesh];
      const p = target || { name: file.name.replace(/\.\w+$/, ''), kind: 'dist', tShell: 2, rhoShell: 7850, extraMass: 0, Cf: 1.2, mu: 1, sec: '□80×5' };
      Object.assign(p, { shellArea: +m.area.toFixed(3), x: +m.centroid[0].toFixed(3), y: +m.centroid[1].toFixed(3), z: +m.centroid[2].toFixed(3), Ax: +m.Ax.toFixed(3), Ay: +m.Ay.toFixed(3), Ah: +m.Ah.toFixed(3), areaTable: m.areaTable.map(a => +a.toFixed(4)) });
      if (p.kind === 'dist' && !target) { p.z1 = +Math.max(0.05, m.bbox.mn[2]).toFixed(2); p.z2 = +m.bbox.mx[2].toFixed(2); }
      if (!target) state.pr.parts.push(p);
      state.lastMesh = m.tris;
      state.meshInfo = `${esc(file.name)}: ${m.nTri} трикутників; габарити ${f(m.bbox.mx[0] - m.bbox.mn[0])} × ${f(m.bbox.mx[1] - m.bbox.mn[1])} × ${f(m.bbox.mx[2] - m.bbox.mn[2])} м; площа поверхні ${f(m.area, 2)} м²; центр поверхні (${f(m.centroid[0])}; ${f(m.centroid[1])}; ${f(m.centroid[2])}) м; A(0°) = ${f(m.Ax, 2)} м², A(90°) = ${f(m.Ay, 2)} м², A<sub>h</sub> (грані догори) = ${f(m.Ah, 2)} м². Модель вирівняно: основа на z = 0, центр у плані — у початку координат.`;
      markStale(); render();
    } catch (err) { state.meshInfo = 'Не вдалося прочитати файл: ' + esc(err.message); render(); }
  }

  function loadFile(inp) {
    const file = inp.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { try { state.pr = migrate(JSON.parse(rd.result)); state.R = null; markStale(); render(); } catch (e) { toast('Файл не є коректним JSON проєкту.'); } };
    rd.readAsText(file);
  }

  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3500); }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) { const box = document.getElementById('jsonbox'); if (box) { box.value = text; box.select(); toast('Скопіюйте виділений текст (Ctrl+C).'); } else toast('Буфер обміну недоступний.'); }
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  function progress(p) { const b = document.getElementById('bar'); b.style.width = (p * 100) + '%'; }
  function applyOverrides() { /* таблиці C_h з проєкту передаються в climate через pr.overrides */ }

  function runCalc() {
    const btn = document.getElementById('runbtn'); btn.disabled = true; btn.textContent = 'Розрахунок…'; progress(0.15);
    setTimeout(() => {
      try { applyOverrides(); state.R = SC.analysis.run(state.pr); state.stale = false; }
      catch (err) { state.R = { ok: false, error: 'Помилка розрахунку: ' + err.message }; console.error(err); }
      btn.disabled = false; btn.textContent = 'Розрахувати'; progress(1); setTimeout(() => progress(0), 300);
      if (['project', 'wind', 'snow', 'seismic', 'parts', 'frame', 'base', 'found', 'catalog'].includes(state.tab)) state.tab = 'results';
      render();
    }, 30);
  }
  function runOpt() {
    const btn = document.getElementById('optbtn'); btn.disabled = true; btn.textContent = 'Підбір…'; progress(0.1);
    setTimeout(() => {
      try {
        const o = SC.analysis.optimize(state.pr);
        state.pr = o.pr; save();
        state.R = SC.analysis.run(state.pr); state.stale = false;
        toast('Підібрано: ' + o.keys.map(k => `${k.group} — ${k.sec}`).join('; '));
      } catch (err) { toast('Підбір не вдався: ' + err.message); console.error(err); }
      btn.disabled = false; btn.textContent = 'Підібрати перерізи'; progress(0); state.tab = 'results'; render();
    }, 30);
  }

  function onClick(e) {
    const b = e.target.closest('[data-tab],[data-act]'); if (!b) return;
    if (b.dataset.tab) { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); return; }
    const a = b.dataset.act;
    if (a === 'run') runCalc();
    else if (a === 'opt') runOpt();
    else if (a === 'addpart') { state.pr.parts.push({ name: 'Нова частина', kind: 'cant', x: 0.3, y: 0, z: 3, shellArea: 1, tShell: 2, rhoShell: 7850, extraMass: 0, Ax: 0.3, Ay: 0.3, Cf: 1.2, Ah: 0.1, mu: 1, sec: '□60×4' }); markStale(); render(); }
    else if (a === 'del') { state.pr.parts.splice(+b.dataset.i, 1); markStale(); render(); }
    else if (a === 'dup') { const p = JSON.parse(JSON.stringify(state.pr.parts[+b.dataset.i])); p.name += ' (копія)'; state.pr.parts.splice(+b.dataset.i + 1, 0, p); markStale(); render(); }
    else if (a === 'copyjson') copy(JSON.stringify(state.pr, null, 1), 'JSON проєкту скопійовано.');
    else if (a === 'downloadjson') download((state.pr.meta.name || 'project') + '.json', JSON.stringify(state.pr, null, 1), 'application/json');
    else if (a === 'applyjson') { try { state.pr = migrate(JSON.parse(document.getElementById('jsonbox').value)); state.R = null; markStale(); render(); toast('Проєкт завантажено.'); } catch (err) { toast('У полі не коректний JSON.'); } }
    else if (a === 'reset') { state.pr = SC.model.defaultProject(); state.R = null; markStale(); render(); toast('Відновлено приклад.'); }
    else if (a === 'resetnorms') { if (state.pr.overrides) delete state.pr.overrides.ChTables; markStale(); render(); }
    else if (a === 'print') window.print();
    else if (a === 'savehtml') download('rozrakhunok.html', '<!doctype html><meta charset="utf-8"><title>' + esc(state.pr.meta.name) + '</title><style>' + [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n') + '</style><body><article class="report">' + document.getElementById('report').innerHTML + '</article></body>', 'text/html');
    else if (a === 'copyreport') copy(document.getElementById('report').innerText, 'Текст звіту скопійовано.');
    else if (a === 'copycsv') {
      const sp = SC.analysis.specification(state.pr, state.R.mdl, state.R.P, state.R.memberRes, state.R.P.model.nodes.filter(n => n.sup), state.R.found.reinf, state.R.found.fd);
      const csv = ['Розділ;Позиція;Марка;Стандарт;Од.;Чиста;Закупівля;Маса чиста кг;Маса закуп. кг;Вартість грн;Примітка'].concat(sp.rows.map(r => [r.cat, r.item, r.mark, r.std, r.unit, r.net.toFixed(3), r.buy.toFixed(3), r.massNet.toFixed(2), r.massBuy.toFixed(2), r.cost.toFixed(0), r.note].map(x => String(x).replace(/;/g, ',')).join(';'))).join('\n');
      copy(csv, 'Специфікацію скопійовано — вставте в Excel.');
    }
  }

  function init() {
    document.body.innerHTML = `<div class="progress" id="bar"></div>
    <div class="app"><aside class="side"><div class="brand"><b>Каркас скульптури</b><small>розрахунок за ДБН · EN · без API</small></div><nav class="nav" id="nav" aria-label="Розділи"></nav></aside>
    <main class="main"><div class="top"><h1 id="ptitle"></h1><span class="status" id="pstatus"></span>
      <button class="btn" id="optbtn" data-act="opt">Підібрати перерізи</button><button class="btn primary" id="runbtn" data-act="run">Розрахувати</button></div>
      <div class="content" id="content"></div></main></div>
    <div id="toast" class="toast" hidden role="status"></div>`;
    document.addEventListener('change', onChange);
    document.addEventListener('click', onClick);
    try { const t = localStorage.getItem(KEY + '.tab'); if (t) state.tab = t; } catch (e) { /* */ }
    const h = (location.hash || '').slice(1); if (h && R[h]) state.tab = h;
    render();
    // стартовий розрахунок прикладу, щоб результати були видимі одразу
    setTimeout(() => { try { state.R = SC.analysis.run(state.pr); state.stale = false; render(); } catch (e) { console.error(e); } }, 50);
    window.addEventListener('resize', () => { if (state.view && document.getElementById('cv')) state.view.draw(); });
  }

  SC.app = { state, init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.SC = window.SC || {});
