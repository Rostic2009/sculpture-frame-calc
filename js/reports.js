/* Звіти за розділами (для інженера, замовника й виробника):
 *   1 — каркас: підбір профільних труб, розрахункові перерізи, довжини й маси, перевірки по секціях;
 *   2 — анкерні болти: діаметр, клас, кількість, довжина, маса, перевірки сталі й бетону;
 *   3 — бетонна основа: розміри, бетон, сітки, кроки, кількість і маса арматури, перевірки ґрунту й залізобетону;
 *   4 — навантаження: характеристичні й розрахункові значення кожного впливу, джерела, вплив на конструкцію;
 *   full — комплект: усі чотири + перевірка даних регіону + висновки.
 * У кожній перевірці: розрахункове значення, допустиме за нормою, U = дія/опір, запас і що це означає для конструкції.
 */
(function (SC) {
  'use strict';
  const RS = {};
  const F = () => SC.report.fmt;
  const f = (v, d) => F().f(v, d == null ? 2 : d);
  const esc = s => F().esc(s);
  const kN = v => f(v / 1000, 2);
  const g = 9.81;

  // ---------- запас і вплив на конструкцію ----------
  const MECH = {
    strength: ['текучість сталі в перерізі — залишкові деформації каркаса й тріщини оболонки', 'збільшити переріз або товщину стінки'],
    stability: ['втрата стійкості (поздовжнє випинання) стрижня — раптова втрата несучої здатності', 'збільшити переріз, додати пояс/зв\'язок (зменшити розрахункову довжину)'],
    shear: ['зріз стінок труби / кручення', 'збільшити товщину стінки'],
    local: ['випинання стінки труби — раптова втрата несучої здатності при стиску', 'збільшити товщину стінки t (зменшити b/t)'],
    slender: ['надмірна гнучкість — вібрації від вітру, пошкодження при монтажі', 'збільшити переріз (радіус інерції) або зменшити довжину'],
    sls: ['надмірні переміщення верху — помітні коливання, тріщини швів і фарби оболонки', 'збільшити жорсткість ядра (перерізи стійок, план ядра)'],
    weld: ['руйнування зварного шва у вузлі', 'збільшити катет шва або переріз'],
    alpha: ['чутливість до ефектів 2-го порядку — посилення згину від власної ваги при відхиленні', 'збільшити жорсткість ядра'],
    anchorT: ['розрив анкерного болта по різьбі', 'збільшити діаметр або кількість анкерів'],
    anchorV: ['зріз анкера (з розтягом)', 'додати упор на зсув або збільшити діаметр'],
    cone: ['вирив бетонного конуса разом з анкером', 'збільшити глибину закладення h_ef, відстані до краю або додати армування анкерів'],
    pullout: ['висмикування анкера через зминання бетону під головкою', 'збільшити анкерну плиту (шайбу) на кінці'],
    split: ['розколювання бетону підколонника', 'армувати підколонник біля анкерів або збільшити його розміри'],
    blowout: ['боковий викол бетону біля краю', 'збільшити відстань до краю'],
    edge: ['сколювання краю бетону від зсуву', 'збільшити відстань до краю або встановити упор'],
    pryout: ['виколювання бетону за анкером (pry-out)', 'збільшити h_ef'],
    plate: ['пластичний згин опорної плити', 'збільшити товщину плити або додати ребра'],
    bearing: ['зминання бетону/підливки під плитою', 'збільшити розміри плити або клас бетону підливки'],
    soil: ['перевантаження ґрунту основи — нерівномірні осідання, крен', 'збільшити розміри підошви'],
    overturn: ['перекидання скульптури разом з фундаментом', 'збільшити підошву або вагу фундаменту'],
    slide: ['зсув фундаменту по ґрунту', 'збільшити вагу фундаменту / заглиблення'],
    punch: ['продавлювання плити під підколонником', 'збільшити товщину плити'],
    rc: ['недостатнє армування — розкриття тріщин, корозія арматури', 'збільшити діаметр або зменшити крок стрижнів'],
    settle: ['осідання / крен понад допустимі', 'збільшити підошву, замінити слабкий ґрунт'],
  };
  RS.reserve = u => !(u > 0) ? '—' : u > 1 ? `<b class="bad-t">дефіцит ${f((u - 1) * 100, 0)} %</b>` : `${f((1 - u) * 100, 0)} % (×${f(1 / u, 2)})`;
  RS.influence = function (mech, u) {
    const m = MECH[mech] || ['вичерпання несучої здатності', 'змінити рішення'];
    if (!(u > 0)) return 'не діє в розрахункових сполученнях';
    if (u > 1) return `<b class="bad-t">Не забезпечено:</b> ${m[0]}. Потрібно ${m[1]}.`;
    if (u > 0.9) return `На межі: ріст навантаження на ${f((1 / u - 1) * 100, 0)} % (наприклад, уточнення C<sub>F</sub> або W₀) призведе до: ${m[0]}. Рекомендовано ${m[1]} або підтвердити вихідні дані.`;
    if (u > 0.5) return 'Раціональне використання; резерв покриває невизначеність вихідних даних і монтажні відхилення.';
    return `Великий резерв (×${f(1 / u, 1)}): елемент визначено конструктивними вимогами, а не міцністю${mech === 'strength' || mech === 'stability' ? '; можливе полегшення, якщо дозволяють мінімальна товщина стінки й зварювання' : ''}.`;
  };
  // рядок перевірки: [назва, розрахункове, допустиме, U, запас, норма, вплив]
  const row = (name, calc, allow, u, norm, mech) => [name, calc, allow, F().U(u), RS.reserve(u), norm, RS.influence(mech, u)];
  const CHECK_HEAD = ['Перевірка', 'Розрахункове значення', 'Допустиме (за нормою)', 'U', 'Запас', 'Норма', 'Вплив на конструкцію'];
  const checks = rows => F().tbl(CHECK_HEAD, rows, 'checks');

  // ---------- шапка ----------
  function header(R, title, sub) {
    const pr = R.pr;
    const st = { ok: 'Перевірки виконуються', preliminary: 'ПОПЕРЕДНІЙ результат (не всі вихідні дані підтверджено)', 'not-ok': 'Є невиконані перевірки — рішення не прийнятне' }[R.status];
    return `<header class="rep-head"><div class="eyebrow">${sub} · ${esc(pr.meta.stage)}</div><h1>${title}</h1>
      <div class="rep-meta"><span>Об'єкт: ${esc(pr.meta.name)}</span><span>Замовник: ${esc(pr.meta.customer || '—')}</span><span>Місце: ${esc(pr.meta.location)}</span><span>Дата: ${esc(pr.meta.date)}</span><span>Виконавець: ${esc(pr.meta.author || '—')}</span></div>
      <div class="rep-status ${R.status}">${st}</div></header>`;
  }
  const sign = R => `<footer class="rep-sign"><div>Розрахунок виконав: ____________ ${esc(R.pr.meta.author)}</div><div>Перевірив: ____________</div></footer>`;
  const legend = () => `<p class="note">U — коефіцієнт використання (дія / опір; U ≤ 1 — перевірка виконується). Запас — (1 − U)·100 %, у дужках коефіцієнт запасу 1/U. Допустимі значення наведено з урахуванням коефіцієнтів надійності за матеріалом і умов роботи.</p>`;

  // ---------- 3D-зображення секцій (для звіту й PDF) ----------
  RS.frameImage = function (R, opt) {
    if (typeof document === 'undefined') return '';
    opt = opt || {};
    const W = opt.W || 760, H = opt.H || 520;
    const cv = document.createElement('canvas');
    const colors = { '--bg': '#ffffff', '--fg': '#1b2127', '--muted': '#5a6570', '--line': '#e1e5e9', '--line-strong': '#8b96a1', '--accent': '#c4501b', '--ok': '#2f7d4f', '--warn': '#b7791f', '--bad': '#b3261e', '--axis-x': '#c53030', '--axis-y': '#2f855a', '--axis-z': '#2b6cb0', '--mesh': 'rgba(31,95,139,.18)', '--font-mono': 'monospace', '--font-body': 'sans-serif' };
    const v = SC.view3d.create(cv, () => ({ nodes: R.P.model.nodes, elems: R.mdl.elems, parts: [], colorBy: 'sect', sections: R.mdl.sections, sectLabels: true, marks: !!opt.marks, highlight: opt.highlight, W, H, dpr: 2, colors }));
    v.draw();
    return `<figure class="rep-fig"><img src="${cv.toDataURL('image/png')}" alt="Каркас: секції кольорами" width="${W}" style="max-width:100%;height:auto"><figcaption>${opt.caption || 'Розрахункова модель каркаса: секції кольорами (Я — яруси ядра, К — консолі).'}</figcaption></figure>`;
  };

  // =====================================================================
  // ЗВІТ 1. КАРКАС
  // =====================================================================
  RS.frame = function (R, opt) {
    opt = opt || {};
    const pr = R.pr, sp = R.spec, steel = R.mdl.steel, N = SC.norms, s = [];
    const H = (n, t) => s.push(`<h${n}>${t}</h${n}>`), P = t => s.push(`<p>${t}</p>`);
    if (!opt.inner) s.push(header(R, 'Звіт 1. Каркас: підбір профільних труб', 'Розрахунок каркаса'));
    H(2, '1.1. Розрахункова схема і секції');
    P(`Просторовий каркас з квадратних гнутозварних труб: ${{ single: 'одна консольна стійка', core3: 'тригранне ядро', core4: 'чотиригранне ядро' }[pr.frame.type]}${pr.frame.type !== 'single' ? `, план ${f(pr.frame.a)}×${f(pr.frame.b)} м унизу → ${f(pr.frame.aTop)}×${f(pr.frame.bTop)} м угорі, зв'язки ${{ X: 'хрестові', Z: 'розкісні', none: 'відсутні' }[pr.frame.bracing]}` : ''}; рівні поясів ${R.mdl.levels.map(z => f(z, 2)).join('; ')} м.
      Модель розраховано цілком методом скінченних елементів (${R.P.nn} вузлів, ${R.P.els.length} стрижнів, ${R.solved.length} сполучень${pr.design.second ? ', 2-й порядок' : ''}); для зручності читання каркас поділено на <b>${R.sectionRes.length} секцій</b>. Марка стрижня: «секція-роль№» (С — стійка, Р — розкіс, П — пояс, К — консоль).`);
    if (pr.vision && pr.vision.analysis) P('Початкову ідею схеми взято з ескізу (зображення); розміри частин для розрахунку — лише з 3D-моделі або креслення.');
    s.push(RS.frameImage(R));
    s.push(F().tbl(['Секція', 'Склад', 'Стрижнів', 'Профілі', 'Довжина, м', 'Маса, кг', 'max U', 'Запас', 'Визначальний стрижень'], R.sectionRes.map(sr => [`<span class="sect-chip" style="background:${sr.color}">${sr.code}</span>`, esc(sr.name), sr.members.length, sr.profiles.map(p => `${p.sec} × ${p.n}`).join('<br>'), f(sr.L, 2), f(sr.mass, 1), F().U(sr.uMax), RS.reserve(sr.uMax), sr.gov ? `${sr.gov.e.mark} (${esc(sr.gov.best.combo.split(':')[0])})` : '—'])));

    H(2, '1.2. Матеріал');
    s.push(F().tbl(['Параметр', 'Значення', 'Джерело'], [
      ['Сталь труб', `${steel.id}: R<sub>yn</sub> = ${steel.Ryn} МПа, R<sub>un</sub> = ${steel.Run} МПа${steel.grades ? ` (марки ${steel.grades} ≡ ${steel.dbn})` : ''}`, N.steelsMeta.src],
      ['Клас виконання (EXC)', `${N.excClass(pr.site.cc, true)} — клас наслідків ${pr.site.cc}, динамічні впливи (вітер, вихрове збудження${pr.site.seismic && pr.site.seismic.on ? ', сейсміка' : ''})`, N.excMeta.src],
      ['Гранична гнучкість λ<sub>u</sub>', '200 — стиснуті, 400 — розтягнуті елементи; при перевищенні — перевірка на транспортування і монтаж (п. 13.4.2)', SC.checks.lambdaMeta.src],
      ['Корозія', 'Збільшення товщини стінок на корозію в розрахунку несучої здатності не враховується (п. 5.3.4 у ред. Зміни № 1); захист — за ДСТУ ISO 12944-3 (п. 17.1.4)', 'ДБН В.2.6-198, Зміна № 1'],
      ['Розрахунковий опір R<sub>y</sub> = R<sub>yn</sub>/γ<sub>m</sub>', `${f(steel.Ryn / (steel.norm === 'dbn' ? steel.gm : 1.025), 1)} МПа (γ<sub>m</sub> = ${steel.norm === 'dbn' ? steel.gm : 1.025})`, 'ДБН В.2.6-198'],
      ['Опір зрізу R<sub>s</sub> = 0,58R<sub>y</sub>', `${f(0.58 * steel.Ryn / (steel.norm === 'dbn' ? steel.gm : 1.025), 1)} МПа`, 'ДБН В.2.6-198'],
      ['Модуль пружності E', `${f(N.E / 1e9, 0)} ГПа`, 'ДБН В.2.6-198'],
      ['Коефіцієнт умов роботи γ<sub>c</sub>', f(pr.frame.gammaC, 2), 'ДБН В.2.6-198, табл. 1'],
      ['Корозійний захист', esc((pr.site.env || {}).protection || '—') + ((pr.site.env || {}).approach === 'residual' ? `; розрахунок за залишковою стінкою t − ${pr.site.env.corrAllow} мм` : ''), 'ДСТУ ISO 12944'],
    ]));

    H(2, '1.3. Підбір профілю: розрахункові перерізи');
    const groups = new Map();
    R.memberRes.forEach(m => { const k = m.e.group; const g0 = groups.get(k) || { group: k, sec: new Set(), n: 0, L: 0, mass: 0, gov: null }; g0.sec.add(m.e.sec.name); g0.n++; g0.L += m.L; g0.mass += m.mass; if (!g0.gov || m.best.u > g0.gov.best.u) g0.gov = m; groups.set(k, g0); });
    s.push(F().tbl(['Група стрижнів', 'Прийнятий переріз', 'A, см²', 'I, см⁴', 'W, см³', 'i, см', 'Маса 1 м, кг', 'К-сть', 'Довжина, м', 'Маса, кг', 'max U', 'Чому такий переріз'], [...groups.values()].map(g0 => {
      const sec = g0.gov.e.sec, u = g0.gov.best.u, k = g0.gov.best.chk;
      const mode = k.en.stability >= Math.max(k.en.strength, k.en.shear) && k.en.stability > 0 ? 'стійкість' : k.en.shear > k.en.strength ? 'зсув' : 'міцність';
      const why = u > 1 ? 'недостатній — потрібен більший' : u < 0.35 ? `визначено мінімальною стінкою t ≥ ${pr.design.tMin || 3} мм і гнучкістю (λ = ${f(g0.gov.lam, 0)} ≤ ${f(g0.gov.lamLim, 0)})` : `визначає ${mode} (${esc(g0.gov.best.combo.split(':')[0])})`;
      return [esc(g0.group), [...g0.sec].join(', '), f(sec.A * 1e4, 2), f(sec.Iy * 1e8, 1), f(sec.Wel * 1e6, 2), f(sec.i * 100, 2), f(sec.mass, 2), g0.n, f(g0.L, 2), f(g0.mass, 1), F().U(u), why];
    })));
    H(3, 'Відомість профільних труб');
    const prof = new Map();
    R.memberRes.forEach(m => { const q = prof.get(m.e.sec.name) || { sec: m.e.sec.name, b: m.e.sec.bmm, t: m.e.sec.tmm, mpm: m.e.sec.mass, n: 0, L: 0, mass: 0, Lmax: 0 }; q.n++; q.L += m.L; q.mass += m.mass; q.Lmax = Math.max(q.Lmax, m.L); prof.set(m.e.sec.name, q); });
    const waste = (pr.design.waste || 7) / 100;
    const profRows = [...prof.values()].sort((a, b) => b.b - a.b || b.t - a.t);
    const Ltot = profRows.reduce((a, q) => a + q.L, 0), Mtot = profRows.reduce((a, q) => a + q.mass, 0);
    s.push(F().tbl(['Профіль (труба квадратна)', 'Сторона × стінка, мм', 'Сталь', 'Маса 1 м, кг', 'К-сть стрижнів', 'Найдовший, мм', 'Загальна довжина, м', 'Маса, кг', `Закупівля (+${f(waste * 100, 0)} %), м`, 'Закупівля, кг'],
      profRows.map(q => [q.sec, `${q.b} × ${q.t}`, steel.id, f(q.mpm, 2), q.n, f(q.Lmax * 1000, 0), f(q.L, 2), f(q.mass, 1), f(q.L * (1 + waste), 2), f(q.mass * (1 + waste), 1)])
        .concat([['<b>Разом</b>', '', '', '', R.memberRes.length, '', `<b>${f(Ltot, 2)}</b>`, `<b>${f(Mtot, 1)}</b>`, `<b>${f(Ltot * (1 + waste), 2)}</b>`, `<b>${f(Mtot * (1 + waste), 1)}</b>`]])));
    P(`Загальна довжина труб каркаса <b>${f(Ltot, 2)} м</b>, загальна маса <b>${f(Mtot, 1)} кг</b> (з відходами на різання ${f(waste * 100, 0)} % — ${f(Mtot * (1 + waste), 0)} кг). Маса 1 м труби — за EN 10219-2 з урахуванням заокруглення кутів.`);

    H(2, '1.4. Перевірки каркаса: розрахункові й допустимі значення');
    const rows = [];
    for (const g0 of groups.values()) {
      const m = g0.gov, k = m.best.chk, b = m.best;
      const Rgc = k.dbn.Ry * k.dbn.gc;
      rows.push([`<b>${esc(g0.group)}</b> — ${m.e.mark} (${m.e.sec.name}), ${esc(b.combo.split(':')[0])}`, '', '', '', '', '', '']);
      rows.push(row('Міцність: σ = |N|/A + |M<sub>y</sub>|/W + |M<sub>z</sub>|/W', `σ = ${f(k.dbn.sig / 1e6, 1)} МПа (N = ${kN(b.f.N)} кН, M = ${kN(Math.hypot(b.f.My, b.f.Mz))} кН·м)`, `R<sub>y</sub>γ<sub>c</sub> = ${f(Rgc / 1e6, 1)} МПа`, k.dbn.strength, 'ДБН В.2.6-198, р. 8', 'strength'));
      rows.push(row('Зріз і кручення: τ = V/A<sub>v</sub> + T/W<sub>t</sub>', `τ = ${f(k.dbn.tau / 1e6, 1)} МПа`, `R<sub>s</sub>γ<sub>c</sub> = ${f(k.dbn.Rs * k.dbn.gc / 1e6, 1)} МПа`, k.dbn.shear, 'ДБН В.2.6-198', 'shear'));
      if (k.Nc > 0) rows.push(row(`Стійкість (стиск зі згином), λ̄ = ${f(k.dbn.lamBar, 2)}, φ = ${f(k.dbn.phi, 3)}`, `N = ${kN(k.Nc)} кН`, `φAR<sub>y</sub>γ<sub>c</sub> = ${kN(k.dbn.phi * m.e.sec.A * Rgc)} кН (з урахуванням M)`, Math.max(k.dbn.stability, k.en.stability), 'ДБН В.2.6-198; EN 1993-1-1 (6.61)–(6.62)', 'stability'));
      if (k.Nc > 0) rows.push(row(`Місцева стійкість стінки: λ̄<sub>w</sub> = (h<sub>ef</sub>/t)√(R<sub>y</sub>/E), h<sub>ef</sub> = ${f(k.dbn.hef * 1000, 0)} мм`, `λ̄<sub>w</sub> = ${f(k.dbn.lamW, 2)}`, `λ̄<sub>uw</sub> = ${f(k.dbn.lamUw0, 2)}${k.dbn.kUw > 1 ? ` × ${f(k.dbn.kUw, 2)} = ${f(k.dbn.lamUw, 2)}` : ''}`, k.dbn.local, 'ДБН В.2.6-198, 8.3.2, табл. 8.3; 8.3.5 а) (Зміна № 1)', 'local'));
      rows.push(row('Гнучкість λ = L<sub>cr</sub>/i', `λ = ${f(m.lam, 0)} (L<sub>cr</sub> = ${f(m.Lsys.Lcr, 2)} м)`, `λ<sub>u</sub> = ${f(m.lamLim, 0)}`, m.lam / m.lamLim, 'ДБН В.2.6-198 зі Зміною № 1, п. 13.4.1', 'slender'));
    }
    rows.push(['<b>Каркас у цілому</b>', '', '', '', '', '', '']);
    rows.push(row('Горизонтальне переміщення верху (характеристичні навантаження)', `${f(R.uMax * 1000, 1)} мм (${esc(R.uCombo || '')})`, `H/${pr.design.defLimit} = ${f(R.uLim * 1000, 1)} мм`, R.uMax / R.uLim, 'завдання на проєктування; ДСТУ Б В.1.2-3', 'sls'));
    if (R.alphaCr) rows.push(row('Загальна стійкість системи α<sub>cr</sub>', `α<sub>cr</sub> = ${f(R.alphaCr, 2)}`, pr.design.second ? '≥ 3 (2-й порядок враховано)' : '≥ 10 (без 2-го порядку)', (pr.design.second ? 3 : 10) / R.alphaCr, 'EN 1993-1-1, 5.2.1', 'alpha'));
    const wMax = (R.welds || []).reduce((a, w) => (!a || w.u > a.u ? w : a), null);
    if (wMax) rows.push(row(`Зварні шви: найнавантаженіший ${wMax.id} (${esc(wMax.sec)}, k<sub>f</sub> = ${f(wMax.kf * 1000, 0)} мм)`, `F<sub>w</sub> = ${f(wMax.q / 1000, 2)} кН/м`, 'f<sub>u</sub>/(β<sub>w</sub>γ<sub>M2</sub>), R<sub>wf</sub>γ<sub>wf</sub>', wMax.u, 'ДБН В.2.6-198; EN 1993-1-8, 4.5.3', 'weld'));
    s.push(checks(rows));
    s.push(legend());

    H(2, '1.5. Секції: креслення і стрижні');
    P('Кожна секція показана окремо: ярус ядра — розгорткою граней між сусідніми стійками (кожен стрижень видно без накладання), консоль — у вертикальній площині. Колір лінії: зелений U ≤ 0,9, жовтий 0,9…1, червоний U > 1; пунктир — зв\'язки. Числа біля вузлів — номери вузлів моделі.');
    for (const sr of R.sectionRes) {
      H(3, `${sr.code}. ${esc(sr.name)}`);
      s.push(SC.drawings.section(R.mdl, sr, R));
      s.push(F().tbl(['Марка', 'Роль', 'Переріз', 'Вузли', 'L, мм', 'Маса, кг', 'N, кН', 'M, кН·м', 'U', 'Запас'], sr.members.map(m => {
        const nd = id => (R.P.model.nodes[R.P.idx.get(id)] || {}).num;
        return [`<b>${m.e.mark}</b>`, SC.model.roleName(m.e.role), m.e.sec.name, `${nd(m.e.i)}–${nd(m.e.j)}`, f(m.L * 1000, 0), f(m.mass, 1), kN(m.best.f.N), kN(Math.hypot(m.best.f.My, m.best.f.Mz)), F().U(m.best.u), RS.reserve(m.best.u)];
      })));
    }
    const uMax = Math.max(...R.memberRes.map(m => m.best.u));
    H(2, '1.6. Висновок по каркасу');
    P(`Найбільший коефіцієнт використання стрижнів U = ${f(uMax, 3)} (${R.govMember.e.mark}, ${esc(R.govMember.e.group)}) — ${uMax <= 1 ? `несуча здатність забезпечена, мінімальний запас ${f((1 - uMax) * 100, 0)} %` : '<b>несуча здатність не забезпечена</b>'}.
      Переміщення верху ${f(R.uMax * 1000, 1)} мм ${R.uMax <= R.uLim ? '≤' : '>'} ${f(R.uLim * 1000, 1)} мм. Каркас: ${f(Ltot, 1)} м труб, ${f(Mtot, 0)} кг (${profRows.length} типорозмірів).`);
    if (!opt.inner) s.push(sign(R));
    return s.join('\n');
  };

  // =====================================================================
  // ЗВІТ 2. АНКЕРНІ БОЛТИ
  // =====================================================================
  const NUT_KG = { 12: 0.017, 16: 0.034, 20: 0.064, 24: 0.11, 27: 0.16, 30: 0.22, 36: 0.38, 42: 0.6, 48: 0.9 }; // ≈ ISO 4032
  RS.anchors = function (R, opt) {
    opt = opt || {};
    const pr = R.pr, bp = pr.base, s = [];
    const H = (n, t) => s.push(`<h${n}>${t}</h${n}>`), P = t => s.push(`<p>${t}</p>`);
    if (!opt.inner) s.push(header(R, 'Звіт 2. Анкерні болти', 'Опорні вузли'));
    const gs = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
    const b = gs.best.b, nS = R.supportRes.length, embed = bp.type === 'embed';
    const la = (bp.hef + bp.tp + 30 + 2 * bp.d + 40) / 1000;
    const mOne = Math.PI * (bp.d / 1000) ** 2 / 4 * la * 7850;
    const nA = bp.nAnchor * nS;
    const plateA = Math.PI / 4 * ((bp.dh / 1000) ** 2) * ((bp.tw || 10) / 1000) * 7850;
    const nut = NUT_KG[bp.d] || 0.06;
    H(2, '2.1. Прийняте рішення');
    s.push(F().tbl(['Параметр', 'Значення'], [
      ['Тип кріплення', embed ? 'закладна деталь зі шпильками з головкою (EN ISO 13918)' : 'фундаментні болти з анкерною плитою на кінці (ДСТУ ISO 898-1 / ГОСТ 24379.1)'],
      ['Діаметр, клас міцності', embed ? `Ø${bp.d} мм, S235J2+C450` : `М${bp.d}, клас ${bp.grade} (f<sub>yb</sub> = ${b.bolt.fyb} МПа, f<sub>ub</sub> = ${b.bolt.fub} МПа)`],
      ['Площа перерізу по різьбі A<sub>s</sub>', `${f(b.As * 1e6, 0)} мм²`],
      ['Кількість', `${bp.nAnchor} шт. на опору × ${nS} опор = <b>${nA} шт.</b>`],
      ['Глибина закладення h<sub>ef</sub>', `${bp.hef} мм`],
      ['Повна довжина болта', `<b>${f(la * 1000, 0)} мм</b> = h<sub>ef</sub> ${bp.hef} + плита ${bp.tp} + підливка 30 + 2 гайки (2d = ${2 * bp.d}) + 40 запас різьби`],
      ['Довжина різьби (верх)', `≥ ${bp.tp + 30 + 2 * bp.d + 40} мм`],
      ['Анкерна плита (шайба) на кінці', `Ø${bp.dh}×${bp.tw || 10} мм`],
      ['Розташування', `${bp.nAnchor} анкери, від краю пластини ${bp.edge} мм; пластина ${bp.plateB}×${bp.plateL}×${bp.tp} мм`],
      ['Сприйняття зсуву', { anchors: 'анкерами', friction: 'тертям під пластиною', lug: 'зсувним упором' }[bp.shear] || bp.shear],
    ]));
    H(2, '2.2. Відомість анкерних виробів');
    s.push(F().tbl(['Позиція', 'К-сть', 'Маса 1 шт., кг', 'Маса, кг'], [
      [embed ? `Шпилька з головкою Ø${bp.d}, L = ${bp.hef + 10} мм` : `Болт М${bp.d}, L = ${f(la * 1000, 0)} мм, кл. ${bp.grade}`, nA, f(mOne, 2), f(mOne * nA, 1)],
      ...(embed ? [] : [[`Гайка М${bp.d} (2 на болт: робоча + контргайка)`, 2 * nA, '≈ ' + f(nut, 3), '≈ ' + f(2 * nut * nA, 1)], [`Шайба М${bp.d}`, nA, '≈ ' + f(nut * 0.5, 3), '≈ ' + f(nut * 0.5 * nA, 1)]]),
      [`Анкерна плита Ø${bp.dh}×${bp.tw || 10}`, nA, f(plateA, 2), f(plateA * nA, 1)],
      [`Шаблон (кондуктор) для встановлення анкерів`, nS, '—', '—'],
      ['<b>Разом сталь анкерів</b>', '', '', `<b>${f(mOne * nA + plateA * nA + (embed ? 0 : 2.5 * nut * nA), 1)}</b>`],
    ]));
    H(2, '2.3. Зусилля в анкерах');
    P(`Визначальна опора ${gs.node.id}, сполучення ${esc(gs.best.combo)}. Розподіл: жорстка опорна плита на односторонньому контакті з бетоном (лише стиск) і анкерах (лише розтяг) — розв'язок з урахуванням відриву.`);
    s.push(F().tbl(['Анкер', 'x; y, мм', 'Розтяг N, кН', 'Зріз V, кН'], b.perAnchor.map(a => [a.i, `${f(a.x * 1000, 0)}; ${f(a.y * 1000, 0)}`, kN(a.N), kN(a.V)])));
    s.push(SC.drawings.basePlate(R, gs));
    H(2, '2.4. Перевірки: розрахункові й допустимі значення');
    const c = b.concrete;
    const rows = [
      row('Розтяг анкера (сталь)', `T<sub>max</sub> = ${kN(b.Tmax)} кН`, `F<sub>t,Rd</sub> = ${kN(b.FtRd)} кН`, b.anchorT, embed ? 'EN 1992-4, 7.2.1.3' : 'EN 1993-1-8, табл. 3.4', 'anchorT'),
      row('Зріз + розтяг анкера', `V = ${kN(b.Vmax)} кН, T = ${kN(b.Tmax)} кН`, `F<sub>v,Rd</sub> = ${kN(b.FvbRd)} кН; V/F<sub>v</sub> + T/(1,4F<sub>t</sub>) ≤ 1`, b.anchorSteel, 'EN 1993-1-8, табл. 3.4', 'anchorV'),
      row('Вирив бетонного конуса', `N<sub>Ed</sub><sup>g</sup> = ${kN(c.NEg)} кН`, `N<sub>Rk,c</sub>/γ<sub>Mc</sub> = ${kN(c.NRkc / 1.5)} кН`, c.coneEff, 'EN 1992-4, 7.2.1.4', 'cone'),
      row('Висмикування (зминання під головкою)', `T = ${kN(b.Tmax)} кН`, `N<sub>Rk,p</sub>/γ<sub>Mc</sub> = ${kN(c.NRkp / 1.5)} кН`, c.pullout, 'EN 1992-4, 7.2.1.5', 'pullout'),
      row('Розколювання бетону', c.splitNeeded ? `N = ${kN(c.NEg)} кН` : 'армування підколонника є', c.splitNeeded ? `N<sub>Rk,sp</sub>/γ<sub>Mc</sub> = ${kN(c.NRksp / 1.5)} кН` : 'перевірка не потрібна', c.split, 'EN 1992-4, 7.2.1.6', 'split'),
      row('Боковий викол', c.blowout ? `T = ${kN(b.Tmax)} кН` : `c = ${f(c.cmin, 0)} мм ≥ 0,5h<sub>ef</sub>`, c.blowout ? `N<sub>Rk,cb</sub>/γ<sub>Mc</sub> = ${kN(c.NRkcb / 1.5)} кН` : 'не перевіряється', c.blowout, 'EN 1992-4, 7.2.1.8', 'blowout'),
      row('Сколювання краю від зсуву', `V = ${kN(b.Vmax)} кН`, c.VRkc ? `V<sub>Rk,c</sub>/γ<sub>Mc</sub> = ${kN(c.VRkc / 1.5)} кН` : '—', c.edge, 'EN 1992-4, 7.2.2.5', 'edge'),
      row('Виколювання (pry-out)', `V = ${kN(b.Vmax)} кН`, c.VRkcp ? `V<sub>Rk,cp</sub>/γ<sub>Mc</sub> = ${kN(c.VRkcp / 1.5)} кН` : '—', c.pryout, 'EN 1992-4, 7.2.2.4', 'pryout'),
      row('Взаємодія N–V (бетон)', 'β<sub>N</sub><sup>1,5</sup> + β<sub>V</sub><sup>1,5</sup>', '≤ 1', c.inter, 'EN 1992-4, 7.2.3', 'cone'),
      row('Анкерна плита на кінці: зминання бетону', `σ = ${f(b.washer.sig / 1e6, 1)} МПа`, 'f<sub>cd</sub> з урахуванням місцевого стиску', b.washer.bearing, 'EN 1992-1-1, 6.7', 'pullout'),
      row('Опорна плита над анкером (згин)', `T = ${kN(b.Tmax)} кН`, `F<sub>T,1-2</sub> = ${kN(b.FT12)} кН`, b.plateT, 'EN 1993-1-8, 6.2.4', 'plate'),
      row('Бетон під опорною плитою', `σ<sub>max</sub> = ${f(b.sigmaMax / 1e6, 2)} МПа`, `f<sub>jd</sub> = ${f(b.fjd / 1e6, 2)} МПа`, b.bearing, 'EN 1993-1-8, 6.2.5', 'bearing'),
      row('Мінімальні відстані між анкерами / до краю', `s = ${f(c.smin, 0)} мм; c = ${f(c.cmin, 0)} мм`, `≥ ${Math.max(50, 4 * bp.d)} мм`, c.geomOk ? 0.5 : 1.01, 'EN 1992-4, 7.2.1.7', 'edge'),
    ];
    s.push(checks(rows)); s.push(legend());
    H(2, '2.5. Перевірка за Посібником з проєктування анкерних болтів (до СНиП 2.09.03)');
    s.push(RS.posobieBlock(R));
    H(2, '2.6. Висновок по анкерах');
    const uA = Math.max(b.anchorT, b.anchorSteel, c.max, b.washer.max, R.posobie && R.posobie.best ? R.posobie.best.u : 0);
    P(`Прийнято <b>${nA} ${embed ? 'шпильок Ø' : 'болтів М'}${bp.d}</b> довжиною ${f(la * 1000, 0)} мм${embed ? '' : `, клас ${bp.grade}`}, загальна маса ${f(mOne * nA, 1)} кг. Найбільший коефіцієнт використання U = ${f(uA, 3)} — ${uA <= 1 ? `запас ${f((1 - uA) * 100, 0)} %` : '<b>не забезпечено</b>'}. ${b.Tmax > 0 ? `Анкери розтягнуті (до ${kN(b.Tmax)} кН): момент від вітру/сейсміки перевищує утримувальну дію ваги — анкери є несучими, їх потрібно затягувати й контролювати.` : 'Анкери не розтягуються в жодному сполученні — момент урівноважується стиском, анкери сприймають зсув і забезпечують монтажну стійкість.'}`);
    if (!opt.inner) s.push(sign(R));
    return s.join('\n');
  };

  /** Сейсміка за ДБН В.1.1-12:2025: вихідні дані, рівні впливу, коефіцієнти, форми, поперечні сили, перекоси. */
  RS.seismicBlock = function (R) {
    const pr = R.pr, sz = pr.site.seismic, N = SC.norms;
    const site = R.seis ? R.seis.site : N.seismicSite(sz, pr.site.cc, R.Htot, Math.min(pr.frame.a, pr.frame.b));
    const s = [];
    s.push(`<p>Населений пункт: <b>${esc(sz.place || '—')}</b>; бальність за картами ЗСР-2004 (Додаток А, ґрунти II категорії): А — ${sz.A || '< 6'}, В — ${sz.B || '< 6'}, С — ${sz.C || '< 6'}. Категорія ґрунту — ${site.soil} (табл. 6.1: розрахункова інтенсивність ${site.soil === 'I' ? 'на 1 бал менша' : site.soil === 'III' ? 'на 1 бал більша' : 'дорівнює картовій'}). Клас наслідків ${pr.site.cc} → експлуатаційна група ЕГ ${site.EG} (п. 7.2.2; скульптура — споруда).</p>`);
    s.push(F().tbl(['Рівень впливу', 'Карта / джерело', 'Розрахункова інтенсивність, бал', 'a₀, g', 'Експлуатаційний рівень', 'γ<sub>pl</sub> каркаса (табл. 7.4)', 'Перевірка'], (R.seis ? R.seis.levels : site.levels).map(L => [`${L.id} — ${L.name}`, esc(L.src), L.I < 6 ? `${L.I} (< 6)` : L.I, f(L.a0, 2), `ЕР ${L.ER}`, L.gpl != null ? f(L.gpl, 2) : f(N.gammaPlOf(site.damage, L.I), 2), L.a0 <= 0 ? 'не потрібна' : (L.uls ? 'ULS (Ed ≤ Rd) + перекіс' : 'перекіс (SLS)')])));
    s.push(`<p>Спектральний метод: S<sub>ik</sub> = m<sub>k</sub>·g·a₀·β<sub>i</sub>·η<sub>ik</sub>, η<sub>ik</sub>·m<sub>k</sub> = m<sub>k</sub>·φ<sub>ik</sub>·Γ<sub>i</sub>; β за табл. 6.3 (0,8 ≤ β ≤ 2,5), однаковий для горизонтальних і вертикальної складових (п. 6.2.2.3). Маси — за (7.1): ΣG<sub>k</sub> + 0,5·S<sub>k</sub> (табл. 7.6). Форми поєднано SRSS, напрямки X, Y${sz.vertical ? ', Z' : ''} — SRSS (п. 7.4.13, несиметрична споруда). Розрахункове значення (7.3): E<sub>d</sub> = γ<sub>n</sub>·G<sub>k</sub> + γ<sub>n</sub>·γ<sub>I</sub>·A<sub>ek</sub>/m + γ<sub>n</sub>·ψ<sub>E</sub>·Q<sub>k</sub>; γ<sub>I</sub> = ${f(site.gammaI, 2)} (${esc(site.gIsrc)}); m — табл. 7.7: сталь 1,3 (міцність), 1,2…1,0 (стійкість за λ), шви 1,0, болти 1,1. Для анкерів, закладних деталей і загальної стійкості γ<sub>pl</sub> = 1,0 (табл. 7.4, р. 1). Формула S<sub>ik</sub> — за ДБН В.1.2-6 (норма-посилання п. 7.4.1).</p>`);
    if (!R.seis) { s.push(`<p><b>Сейсмічні навантаження не враховуються:</b> ${site.required ? 'модуль вимкнено' : 'розрахункова інтенсивність на всіх рівнях < 6 балів (п. 5.1)'}.</p>`); return s.join(''); }
    const S = R.seis;
    s.push(`<p>Множники (максимум за рівнями з перевіркою ULS): каркас γ<sub>n</sub>·γ<sub>I</sub>·γ<sub>pl</sub>·a₀ = <b>${f(S.kFrame / 1, 4)}g</b> (${S.govFrame ? S.govFrame.id : '—'}); анкери, закладні, перекидання γ<sub>n</sub>·γ<sub>I</sub>·a₀ = <b>${f(S.kFix, 4)}g</b>. Сейсмічна маса ${f(S.totalMass, 0)} кг; сума ефективних мас X ${f(S.sumMeff[0] * 100, 0)} %, Y ${f(S.sumMeff[1] * 100, 0)} %.</p>`);
    s.push(F().tbl(['Форма', 'T, с', 'β (ґрунт ' + site.soil + ')', 'm<sub>eff,X</sub>', 'm<sub>eff,Y</sub>', 'm<sub>eff,Z</sub>'], S.modal.modes.slice(0, 10).map((m, i) => [i + 1, f(m.T, 3), f(N.seismicBeta(m.T, site.soil), 2), f(m.meff[0] * 100, 0) + ' %', f(m.meff[1] * 100, 0) + ' %', f(m.meff[2] * 100, 0) + ' %'])));
    s.push(F().tbl(['Напрямок', 'Поперечна сила біля основи (каркас, γ<sub>pl</sub>), кН', 'Те саме при γ<sub>pl</sub> = 1 (анкери, фундамент), кН'], S.res.map(r => { const V = Math.sqrt(r.modes.reduce((a, m) => a + m.base * m.base, 0)); return [r.dir, kN(V * S.kFrame), kN(V * S.kFix)]; })));
    s.push(checks(S.levels.filter(L => L.a0 > 0).map(L => row(`Перекіс ярусу ядра, ${L.id} (ЕР ${L.ER})`, `${f(L.driftMax, 5)} (a₀ = ${L.a0}g, γI = ${f(S.gammaI, 2)}, пружний розрахунок)`, `${L.lim} (табл. 7.5, сталевий каркас)`, L.uDrift, 'ДБН В.1.1-12:2025, п. 7.5.3', 'sls'))));
    return s.join('');
  };

  /** Блок «Перевірка за Посібником до СНиП 2.09.03» (формули 1–19) — для звіту 2 і сторінки анкерів. */
  RS.posobieBlock = function (R) {
    const pb = R.posobie, PB = SC.posobie;
    if (!pb) return '';
    if (!pb.applicable) return `<p class="note">Посібник до СНиП 2.09.03 не застосовується: ${esc(pb.reason)}.</p>`;
    const c = pb.best.c, g0 = c.gov, bp = R.pr.base;
    const rows = [
      row(`Зусилля в розтягнутому болті, ф. (5)–(6): x = l<sub>a</sub> − √(l<sub>a</sub>² − 2(M + Nc)/(R<sub>b</sub>b<sub>s</sub>)), P = (R<sub>b</sub>b<sub>s</sub>x − N)/n`, g0.ok ? `M = ${kN(g0.M)} кН·м, N = ${kN(c.N)} кН; x = ${f(g0.x * 1000, 1)} мм → <b>P = ${kN(c.P)} кН</b>` : esc(g0.reason), `x ≤ ξ<sub>R</sub>l<sub>a</sub> = ${f(g0.xiR, 3)}·${f(g0.la * 1000, 0)} = ${f(g0.xLim * 1000, 0)} мм (ф. 7–8)`, g0.ok ? g0.x / g0.xLim : 9.99, 'Посібник, п. 3.14', 'bearing'),
      row('Площа болта за міцністю, ф. (1): A<sub>sa</sub> ≥ k₀P/R<sub>ba</sub>', `k₀ = ${c.ko}; A<sub>sa,req</sub> = ${f(c.AsaReq * 1e4, 3)} см²`, `A<sub>sa</sub> = ${f(c.Asa * 1e4, 2)} см² (М${c.d}); R<sub>ba</sub> = ${f(c.Rba / 1e6, 0)} МПа (${c.steel}, табл. 3)`, c.uStrength, 'Посібник, п. 3.7, 3.9', 'anchorT'),
    ];
    if (c.AsaFat != null) rows.push(row('Витривалість, ф. (2): A<sub>sa</sub> ≥ 1,8ηβP/(γR<sub>ba</sub>)', `η = ${c.type.eta}; β = ${c.beta}; γ = ${c.gammaN}; A = ${f(c.AsaFat * 1e4, 3)} см²`, `A<sub>sa</sub> = ${f(c.Asa * 1e4, 2)} см²`, c.uFatigue, 'Посібник, п. 3.10, табл. 4–6', 'anchorT'));
    rows.push(row('Зсув тертям від N і затягування, ф. (17): Q ≤ f(nA<sub>sa</sub>R<sub>ba</sub>/4 + N), f = 0,25', `Q = ${kN(c.H)} кН`, `${kN(c.Qf)} кН`, c.uShearFriction, 'Посібник, п. 3.18', 'slide'));
    rows.push(row('Зсув стрижнями болтів, ф. (13)–(14): Q ≤ 0,4A<sub>sa</sub>R<sub>ba</sub>n, P ≤ 0,6A<sub>sa</sub>R<sub>ba</sub>n', `Q = ${kN(c.H)} кН`, `${kN(c.Qbolt)} кН`, c.uShearBolt, 'Посібник, п. 3.17', 'anchorV'));
    rows.push(row(`Глибина закладення, ф. (19): H₀ = ${c.type.H}d·m₁·m₂ (${c.type.name})`, `h<sub>ef</sub> = ${bp.hef} мм`, `H₀ = ${f(c.H0 * 1000, 0)} мм (m₁ = 0,7/${PB.Rbt(c.cls)} = ${f(c.m1, 3)}, ${c.cls}; m₂ = ${f(c.m2, 3)})`, c.uDepth, 'Посібник, п. 3.20, табл. 4, 9', 'cone'));
    rows.push(row('Відстань між болтами (табл. 4)', `${bp.plateB - 2 * bp.edge} мм`, `≥ ${c.sMin} мм (${c.type.s}d)`, c.sMin / Math.max(1, bp.plateB - 2 * bp.edge), 'Посібник, п. 3.23', 'edge'));
    const cEdge = R.supportRes[0] && R.supportRes[0].best.b ? R.supportRes[0].best.b.concrete.cmin : null;
    if (cEdge != null) rows.push(row('Від осі болта до грані фундаменту (підколонника)', `${f(cEdge, 0)} мм`, `≥ ${c.cMin} мм (${c.type.c}d, не менше ${c.d <= 30 ? 100 : c.d <= 48 ? 150 : 200} мм)`, c.cMin / Math.max(1, cEdge), 'Посібник, п. 3.23', 'edge'));
    const mk = c.Mkr > 0 ? `F = ${c.F === 0 ? 0 : (c.ko > 1.1 ? '1,1' : '0,75')}·P = ${kN(c.F)} кН; M<sub>кр</sub> = F·χ = ${kN(c.F)}·${c.chi} = ${f(c.Mkr, 1)} Н·м (ф. 18, табл. 8)` : `розтягу немає — болти конструктивні; момент затягування не більше ${c.Mmax || '—'} Н·м (табл. 14)`;
    return `<p>Опора ${pb.best.node}, визначальне сполучення ${esc(pb.best.combo)}. Болт ${c.type.name}, сталь ${c.steel} (клас ${esc(bp.grade)} прирівняно за п. 3.2 прим.), бетон ${esc(R.pr.found.concrete)} → ${c.cls}, R<sub>b</sub> = ${f(c.Rb / 1e6, 1)} МПа (табл. 7). Навантаження ${pb.dynamic ? 'динамічні (резонансне вихрове збудження)' : 'статичні (п. 3.11 — для будівельних конструкцій)'}.</p>` + checks(rows) +
      `<p>Затягування (п. 3.8, 3.19): ${mk}.</p><p class="note">Посібник (ЦНИИпромзданий, до СНиП 2.09.03) — методичний документ; використовується як незалежна перевірка поряд з EN 1993-1-8 / EN 1992-4. Формула (5) приймає пластичну епюру R<sub>b</sub> під плитою, тому дає менший розтяг, ніж пружна модель контакту застосунку; у висновку приймається більше з двох значень U. У табл. 10 Посібника для М48 надруковано 19,72 см² — це помилка (фактично 14,7 см²); у застосунку виправлено.</p>`;
  };

  // =====================================================================
  // ЗВІТ 3. БЕТОННА ОСНОВА
  // =====================================================================
  RS.base = function (R, opt) {
    opt = opt || {};
    const pr = R.pr, Fd = R.found, fd = Fd.fd, sl = Fd.slab, s = [];
    const H = (n, t) => s.push(`<h${n}>${t}</h${n}>`), P = t => s.push(`<p>${t}</p>`);
    if (!opt.inner) s.push(header(R, 'Звіт 3. Бетонна основа (фундамент) і армування', 'Фундамент'));
    const w = SC.found.weights(fd);
    H(2, '3.1. Розміри і матеріали');
    s.push(F().tbl(['Параметр', 'Значення'], [
      ['Плита фундаменту B × L × h', `<b>${f(fd.B)} × ${f(fd.L)} × ${f(fd.h)} м</b>`],
      ['Підколонник', `${f(fd.pedB)} × ${f(fd.pedL)} × ${f(fd.pedH)} м`],
      ['Глибина закладання d', `${f(fd.depth)} м`],
      ['Бетон', `${fd.concrete}; об'єм ${f(w.Vslab, 2)} + ${f(w.Vped, 2)} = <b>${f(w.Vslab + w.Vped, 2)} м³</b>; маса ${f((w.Vslab + w.Vped) * fd.rhoC / 1000, 1)} т`],
      ['Бетонна підготовка', `C8/10, 100 мм; ${f((fd.B + 0.2) * (fd.L + 0.2) * 0.1, 2)} м³`],
      ['Арматура', `${fd.rebar}; захисний шар ${fd.cover} мм`],
      ['Ґрунт основи', Fd.soil ? `розрахунковий опір R = ${f(Fd.Rsoil, 0)} кПа (обчислено за ДБН В.2.1-10)` : `R = ${f(Fd.Rsoil, 0)} кПа (за вишукуваннями)`],
    ]));
    s.push(SC.drawings.foundation(R));
    H(2, '3.2. Армування: сітки');
    const rows = Fd.rebar.rows;
    const r = p => rows.find(x => x.pos === p);
    const mesh = (name, a, b) => [name, `${f(fd.B - 2 * fd.cover / 1000)} × ${f(fd.L - 2 * fd.cover / 1000)} м`, `Ø${a.dia} / ${b.dia}`, `${sl[a === r(1) || a === r(2) ? 'bx' : 'tx'].pick.s} / ${sl[a === r(1) || a === r(2) ? 'by' : 'ty'].pick.s} мм`, `${a.cnt} + ${b.cnt}`, `${f(a.len, 2)} / ${f(b.len, 2)}`, f(a.total + b.total, 1), f(a.mass + b.mass, 1)];
    s.push(F().tbl(['Сітка', 'Розмір у плані', 'Ø уздовж X / Y, мм', 'Крок X / Y', 'К-сть стрижнів X + Y', 'Довжина стрижня X / Y, м', 'Загальна довжина, м', 'Маса, кг'], [
      mesh('Нижня сітка С-1', r(1), r(2)), mesh('Верхня сітка С-2', r(3), r(4)),
    ]));
    P(`Кількість сіток: <b>2</b> (нижня й верхня) на фундамент; верхня сітка спирається на каркаси-підтримки (поз. 7). Підколонник армується просторовим каркасом: ${Fd.ped.n} вертикальних стрижнів Ø${Fd.ped.dia} і хомути Ø${Fd.ped.hoop.dia} з кроком ${f(Fd.ped.hoop.s, 0)} мм.`);
    H(3, 'Відомість арматури');
    s.push(F().tbl(['Поз.', 'Найменування', 'Ø, мм', 'Довжина 1 шт., м', 'К-сть', 'Загальна довжина, м', 'Маса 1 м, кг', 'Маса, кг'], rows.map(x => [x.pos, esc(x.name), x.dia, f(x.len, 2), x.cnt, f(x.total, 1), f(x.mass / Math.max(x.total, 1e-9), 3), f(x.mass, 1)])
      .concat([['', '<b>Разом</b>', '', '', rows.reduce((a, x) => a + x.cnt, 0), `<b>${f(rows.reduce((a, x) => a + x.total, 0), 1)}</b>`, '', `<b>${f(Fd.rebar.total, 1)}</b>`]])));
    const byDia = new Map(); rows.forEach(x => { const q = byDia.get(x.dia) || { L: 0, m: 0 }; q.L += x.total; q.m += x.mass; byDia.set(x.dia, q); });
    s.push(F().tbl(['Діаметр', 'Загальна довжина, м', 'Маса, кг', 'Закупівля (+5 %), кг'], [...byDia].sort((a, b) => a[0] - b[0]).map(([d, q]) => [`Ø${d} ${fd.rebar}`, f(q.L, 1), f(q.m, 1), f(q.m * 1.05, 1)])));
    H(2, '3.3. Перевірки: розрахункові й допустимі значення');
    const ss = Fd.govSls, uu = Fd.govUls;
    const ck = [
      row('Середній тиск під підошвою p<sub>m</sub> (межа лінійної моделі)', `${f(ss.chk.p.pmean / 1000, 1)} кПа (${esc(ss.cb.name)})`, ss.chk.Rlim > Fd.Rsoil * 1.01 ? `1,2R = ${f(ss.chk.Rlim, 0)} кПа (s ≤ 0,4s<sub>u</sub>, п. 8.6.9)` : `R = ${f(Fd.Rsoil, 0)} кПа (п. 8.6.7)`, ss.chk.pMean, 'ДБН В.2.1-10, п. 8.6.7, 8.6.9; R — ДСТУ-Н Б В.2.1-28', 'soil'),
      row('Крайовий тиск p<sub>max</sub>', `${f(ss.chk.p.pmax / 1000, 1)} кПа`, `1,2R = ${f(1.2 * Fd.Rsoil, 0)} кПа`, ss.chk.pMax, 'ДСТУ-Н Б В.2.1-28 / СНиП 2.02.01-83*', 'soil'),
      row('Частка підошви в контакті', `${f(ss.chk.p.contactFrac * 100, 0)} %`, `≥ ${f((fd.minContact || 0.75) * 100, 0)} %`, ss.chk.contact, 'ДБН В.2.1-10 (відрив підошви)', 'overturn'),
      row('Перекидання (M<sub>перек</sub>/M<sub>утр</sub>)', f(uu.chk.overturn, 3), `≤ 1/${f(fd.overturnSF || 1.5, 2)} = ${f(1 / (fd.overturnSF || 1.5), 3)}`, uu.chk.overturn * (fd.overturnSF || 1.5), 'ДБН В.2.1-10, п. 8.9.1 (коефіцієнт запасу 1,5 — прийнято проєктувальником)', 'overturn'),
      ...(() => { const bx = Fd.fUls.filter(x => x.chk.bear && x.chk.bear.ok).reduce((m, x) => (!m || x.chk.bear.u > m.chk.bear.u ? x : m), null), sx = Fd.fUls.filter(x => x.chk.bear && x.chk.bear.ok).reduce((m, x) => (!m || x.chk.bear.uSlide > m.chk.bear.uSlide ? x : m), null);
        if (!bx) return [row('Несуча здатність основи', 'рівнодійна поза підошвою', 'F ≤ γ<sub>c</sub>F<sub>u</sub>/γ<sub>n</sub>', 9.99, 'ДБН В.2.1-10, п. 8.9.2', 'overturn')];
        const b0 = bx.chk.bear, b1 = sx.chk.bear;
        return [row(`Несуча здатність основи, ф. (8.4): F ≤ γ<sub>c</sub>F<sub>u</sub>/γ<sub>n</sub> (${esc(bx.cb.id)})`, `F = ${kN(b0.V)} кН; B'×L' = ${f(b0.Bp, 2)}×${f(b0.Lp, 2)} м`, `γ<sub>c</sub>F<sub>u</sub>/γ<sub>n</sub> = ${f(b0.gC, 2)}·${kN(b0.Fu)}/${f(b0.gn, 2)} = ${kN(b0.gC * b0.Fu / b0.gn)} кН (φ<sub>I</sub> = ${f(b0.phI, 1)}°, c<sub>I</sub> = ${f(b0.cI / 1000, 1)} кПа; N<sub>q</sub> = ${f(b0.Nq, 1)}, N<sub>c</sub> = ${f(b0.Nc, 1)}, N<sub>γ</sub> = ${f(b0.Ng, 1)}; i<sub>q</sub> = ${f(b0.iq, 3)})`, b0.u, 'ДБН В.2.1-10, п. 8.9.2; F<sub>u</sub> — EN 1997-1, дод. D', 'overturn'),
          row(`Зсув по підошві, ф. (8.7): F<sub>s,a</sub> ≤ γ<sub>c</sub>F<sub>s,r</sub>/γ<sub>n</sub> (${esc(sx.cb.id)})`, `F<sub>s,a</sub> = ${kN(b1.H)} кН`, `γ<sub>c</sub>·V·tgφ<sub>I</sub>/γ<sub>n</sub> = ${kN(b1.gC * b1.Fsr / b1.gn)} кН`, b1.uSlide, 'ДБН В.2.1-10, п. 8.9.5', 'slide')]; })(),
      row('Осідання s (пошарове підсумовування)', `${f(Fd.settle.s * 1000, 1)} мм`, `s<sub>u</sub> = ${f(fd.sLim * 1000, 0)} мм`, Fd.settle.uS, 'ДБН В.2.1-10, ф. (8.2), дод. А, табл. А.1 (р. 6 — жорсткі споруди до 100 м)', 'settle'),
      row('Крен i', Fd.settle.tilt.toExponential(2), `i<sub>u</sub> = ${fd.tiltLim}`, Fd.settle.uT, 'ДБН В.2.1-10, п. 8.7, табл. А.1 (р. 6)', 'settle'),
      row('Продавлювання плити', `v<sub>Ed</sub> = ${f(sl.vEd / 1e6, 3)} МПа`, `v<sub>Rd,c</sub> = ${f(sl.vRdc / 1e6, 3)} МПа`, sl.punching, 'EN 1992-1-1, 6.4', 'punch'),
      row('Поперечна сила в плиті', '—', 'V<sub>Rd,c</sub>', Math.max(sl.shearX, sl.shearY), 'EN 1992-1-1, 6.2.2', 'punch'),
      row('Згин: нижня арматура уздовж X', `M = ${kN(sl.bx.M)} кН·м/м; A<sub>s,req</sub> = ${f(sl.bx.Areq * 1e6, 0)} мм²/м`, `прийнято Ø${sl.bx.pick.dia}/${sl.bx.pick.s} = ${f(sl.bx.pick.As * 1e6, 0)} мм²/м`, sl.bx.Areq / sl.bx.pick.As, 'EN 1992-1-1, 6.1; 9.3', 'rc'),
      row('Згин: нижня арматура уздовж Y', `M = ${kN(sl.by.M)} кН·м/м; A<sub>s,req</sub> = ${f(sl.by.Areq * 1e6, 0)} мм²/м`, `прийнято Ø${sl.by.pick.dia}/${sl.by.pick.s} = ${f(sl.by.pick.As * 1e6, 0)} мм²/м`, sl.by.Areq / sl.by.pick.As, 'EN 1992-1-1, 6.1; 9.3', 'rc'),
      row('Верхня арматура', `A<sub>s,req</sub> = ${f(Math.max(sl.tx.Areq, sl.ty.Areq) * 1e6, 0)} мм²/м`, `Ø${sl.tx.pick.dia}/${sl.tx.pick.s} = ${f(sl.tx.pick.As * 1e6, 0)} мм²/м`, Math.max(sl.tx.Areq / sl.tx.pick.As, sl.ty.Areq / sl.ty.pick.As), 'EN 1992-1-1, 9.3', 'rc'),
      row('Ширина розкриття тріщин (через діаметр)', `σ<sub>s</sub> = ${f(sl.sigS, 0)} МПа`, `φ ≤ φ*<sub>s</sub> = ${sl.phiMax} мм`, sl.crack, 'EN 1992-1-1, табл. 7.2N', 'rc'),
      row('Анкерування стрижнів', `l<sub>bd</sub> = ${f(sl.lb.lbd, 0)} мм`, 'забезпечено відгинами', 0.5, 'EN 1992-1-1, 8.4', 'rc'),
      row('Підколонник: вертикальна арматура', `${Fd.ped.n} Ø${Fd.ped.dia}`, 'A<sub>s,min</sub> і M<sub>Ed</sub>', Fd.ped.util, 'EN 1992-1-1, 9.5', 'rc'),
    ];
    s.push(checks(ck)); s.push(legend());
    if (sl.deep) P(`<b>Масивна плита:</b> виліт від грані підколонника a<sub>v</sub> = ${f(sl.av * 1000, 0)} мм, робоча висота d = ${f(sl.dBot * 1000, 0)} мм, a<sub>v</sub>/d = ${f(sl.avd, 2)} ≤ 2. Навантаження від підколонника передається на ґрунт значною мірою стиснутими «підкосами» через товщину плити, тому армування, визначене за згином консолі (теорія пластин Кірхгофа), іде в запас. Тривимірні розрахунки товстих фундаментних плит (Є.О. Гоцуляк, П.В. Войтенко, «Опір матеріалів і теорія споруд», 2011, № 87) показують, що плоска модель завищує розтяг в арматурі під колонами; уточнення можливе моделлю «підкіс–затяжка» (EN 1992-1-1, 6.5).`);
    if (Fd.settle.edgeZone) P(`Зони руйнування ґрунту під краями підошви (В.А. Барвашов, НИИОСП; за розв'язком Н.П. Пузиревського при K₀ = 1): H₀ = (p − γh)(ctgφ + φ − π/2)/(πγ) − c/(γ·tgφ) − h = ${f(Fd.settle.edgeZone.H0 * 1000, 0)} мм при крайовому тиску p = ${f(Fd.settle.edgeZone.p, 1)} кПа. ${Fd.settle.edgeZone.H0 > 0 ? `У межах H₀ тиск не розподіляється (компресія) — осідання уточнено: ${f(Fd.settle.sLinear * 1000, 1)} → ${f(Fd.settle.s * 1000, 1)} мм.` : 'Зона не утворюється — основа працює в лінійній стадії, крайові концентрації тиску не виникають.'}`);
    if (Fd.pads && Fd.pads.length) {
      H(2, '3.3а. Фундаменти опор шлейфу');
      P(`Схема: ${Fd.mode === 'tie' ? 'подушки під опори шлейфу, з\'єднані з основною плитою Ф1 рандбалками — горизонтальні сили опор передаються на Ф1' : 'окремі подушки під кожну опору шлейфу'}. Основна плита Ф1 приймає лише опори ядра. Перевірки — ті самі, що для Ф1 (ДБН В.2.1-10, п. 8.6–8.9), плюс відрив подушки (рівнодійна вгору) і різниця осідань з ядром (табл. А.1).`);
      s.push(SC.drawings.foundPlan(R));
      Fd.pads.forEach(pd => {
        const g1 = pd.govUls, g2 = pd.govSls, b0 = g1.chk.bear;
        H(3, `${pd.id}: опора ${pd.supType === 'slide' ? 'рухома' : pd.supType === 'pinned' ? 'шарнірна' : 'жорстка'} (${pd.nodes.join(', ')}), центр (${f(pd.cx, 2)}; ${f(pd.cy, 2)}) м`);
        s.push(F().tbl(['Параметр', 'Значення'], [
          ['Подушка B × L × h', `<b>${f(pd.fd.B)} × ${f(pd.fd.L)} × ${f(pd.fd.h)} м</b>; підколонник ${f(pd.fd.pedB)} × ${f(pd.fd.pedL)} × ${f(pd.fd.pedH)} м; d = ${f(pd.fd.depth)} м`],
          ['Бетон', `${pd.fd.concrete}; <b>${f(pd.Vc, 2)} м³</b>`],
          ['Армування', `2 сітки Ø${pd.reinf.pick.dia} крок ${pd.reinf.pick.s} мм (низ — за розрахунком M = ${kN(Math.max(pd.reinf.Mx, pd.reinf.My))} кН·м/м; верх — конструктивна); разом ${f(pd.rebar.total, 1)} кг`],
          ...(pd.tieBeam ? [['Рандбалка до Ф1', `0,3 × 0,4 м, L = ${f(pd.tieBeam.len, 2)} м, 4Ø14 ${fd.rebar}, хомути Ø8/200; N = ${kN(pd.tieBeam.N)} кН ≤ N<sub>Rd</sub> = ${kN(pd.tieBeam.Nrd)} кН`]] : []),
        ]));
        s.push(checks([
          row('Середній тиск p<sub>m</sub>', `${f(g2.chk.p.pmean / 1000, 1)} кПа`, `R = ${f(pd.Rsoil, 0)} кПа`, g2.chk.pMean, 'ДБН В.2.1-10, п. 8.6.7', 'soil'),
          row('Крайовий тиск p<sub>max</sub>', `${f(g2.chk.p.pmax / 1000, 1)} кПа`, `1,2R = ${f(1.2 * pd.Rsoil, 0)} кПа`, g2.chk.pMax, 'ДСТУ-Н Б В.2.1-28', 'soil'),
          row(`Несуча здатність, зсув, перекидання, відрив (${esc(g1.cb.id)})`, b0 && b0.ok ? `F = ${kN(b0.V)} кН; H = ${kN(b0.H)} кН` : (g1.chk.fail || '—'), b0 && b0.ok ? `γ<sub>c</sub>F<sub>u</sub>/γ<sub>n</sub> = ${kN(b0.gC * b0.Fu / b0.gn)} кН` : '—', g1.chk.max, 'ДБН В.2.1-10, п. 8.9; ф. (8.4), (8.7)', 'overturn'),
          ...(pd.settle ? [row('Осідання s', `${f(pd.settle.s * 1000, 1)} мм`, `s<sub>u</sub> = ${f(fd.sLim * 1000, 0)} мм`, pd.settle.uS, 'ДБН В.2.1-10, дод. А', 'settle')] : []),
          ...(pd.diff ? [row('Різниця осідань з ядром Δs/L', `|${f(pd.settle.s * 1000, 1)} − ${f(pd.diff.s0 * 1000, 1)}| мм / ${f(pd.diff.L, 2)} м = ${f(pd.diff.ratio, 5)}`, `(Δs/L)<sub>u</sub> = ${pd.diff.lim}`, pd.diff.u, 'ДБН В.2.1-10, табл. А.1', 'settle')] : []),
          ...(pd.tieBeam ? [row('Рандбалка: осьова сила', `N = ${kN(pd.tieBeam.N)} кН`, `N<sub>Rd</sub> = A<sub>s</sub>f<sub>yd</sub> = ${kN(pd.tieBeam.Nrd)} кН`, pd.tieBeam.u, 'EN 1992-1-1, 3.2', 'rc')] : []),
        ]));
        H(3, `Відомість арматури ${pd.id}`);
        s.push(F().tbl(['Поз.', 'Найменування', 'Ø, мм', 'Довжина 1 шт., м', 'К-сть', 'Загальна довжина, м', 'Маса, кг'], pd.rebar.rows.map((x, i) => [`${pd.id}.${i + 1}`, esc(x.name), x.dia, f(x.len, 2), x.cnt, f(x.total, 1), f(x.mass, 1)])));
      });
    }
    H(2, '3.4. Висновок по фундаменту');
    const uF = Math.max(ss.chk.max, uu.chk.max, Fd.settle.uS, Fd.settle.uT, sl.max || 0);
    P(`Фундамент ${f(fd.B)}×${f(fd.L)}×${f(fd.h)} м з підколонником, бетон ${f(w.Vslab + w.Vped, 2)} м³ ${fd.concrete}, арматура ${f(Fd.rebar.total, 0)} кг (2 сітки + каркас підколонника). Визначає ${ss.chk.max >= uu.chk.max ? 'тиск на ґрунт' : 'стійкість проти перекидання/зсуву'}; найбільший U = ${f(uF, 3)} — ${uF <= 1 ? `запас ${f((1 - uF) * 100, 0)} %` : '<b>не забезпечено</b>'}.`);
    if (!opt.inner) s.push(sign(R));
    return s.join('\n');
  };

  // =====================================================================
  // ЗВІТ 4. НАВАНТАЖЕННЯ
  // =====================================================================
  RS.loads = function (R, opt) {
    opt = opt || {};
    const pr = R.pr, c = R.clim, N = SC.norms, s = [];
    const H = (n, t) => s.push(`<h${n}>${t}</h${n}>`), P = t => s.push(`<p>${t}</p>`);
    if (!opt.inner) s.push(header(R, 'Звіт 4. Навантаження і впливи', 'Навантаження'));
    H(2, '4.1. Перевірка вихідних даних регіону будівництва');
    const reg = R.region || N.checkRegion(pr);
    s.push(F().tbl(['Параметр', 'Введено', 'За нормою', 'Джерело', 'Висновок'], reg.rows.map(r => [r.param, `${esc(r.entered)} ${r.unit}`, r.ref == null ? '—' : esc(r.ref), esc(r.src), `<b>${N.regionStatusText[r.status]}</b>${r.note ? '<br>' + esc(r.note) : ''}`])));
    P('Значення зі статусом «немає табличного значення» потрібно звірити з чинним текстом ДБН і зафіксувати джерело перед випуском робочої документації.');

    // вплив кожного навантаження на конструкцію: де воно провідне у визначальному сполученні
    const leadOf = id => { if (/^E/.test(id)) return 'A'; const cb = R.combos.find(x => x.id === id); return cb ? (cb.lead === 'T+' || cb.lead === 'T−' ? 'T' : cb.lead) : '?'; };
    const gov = {}; R.memberRes.forEach(m => { const L = leadOf(m.best.cbId); const q = gov[L] = gov[L] || { n: 0, u: 0, mark: '' }; q.n++; if (m.best.u > q.u) { q.u = m.best.u; q.mark = m.e.mark; } });
    const effect = L => gov[L] ? `провідне для ${gov[L].n} з ${R.memberRes.length} стрижнів (max U = ${f(gov[L].u, 2)}, ${gov[L].mark})` : 'не є визначальним для жодного стрижня';

    H(2, '4.2. Зведена таблиця впливів');
    const G = (R.cases.G.info.frameMass + R.cases.G.info.shellMass) * g;
    const Wsum = th => { const W = R.cases.W.find(x => x.theta === th); return W ? W.info.parts.reduce((a, p) => a + p.F, 0) : 0; };
    const Wg = R.cases.W.reduce((m, W) => { const Fw = W.info.parts.reduce((a, p) => a + p.F, 0); return Fw > m.F ? { F: Fw, th: W.theta, M: W.info.parts.reduce((a, p) => a + p.F * p.zcp, 0) } : m; }, { F: -1, th: 0, M: 0 });
    const sum = [
      ['Власна вага G (каркас + оболонка + ребра)', `${kN(G)} кН`, `γ<sub>f</sub> = ${N.gammaG.steel} (0,9 — сприятлива)`, `${kN(G * N.gammaG.steel)} кН`, N.gammaG.src, effect('G')],
      ['Вітер W (найбільший напрямок θ = ' + Wg.th + '°)', `ΣF = ${kN(Wg.F)} кН; M = ${kN(Wg.M)} кН·м`, `γ<sub>fm</sub> = ${f(c.gfmW, 3)}`, `ΣF = ${kN(Wg.F * c.gfmW)} кН; M = ${kN(Wg.M * c.gfmW)} кН·м`, N.windGammaFm.src, effect('W')],
      ['Сніг S', `${kN(R.cases.S.info.total)} кН`, `γ<sub>fm</sub> = ${f(c.gfmS, 3)}`, `${kN(R.cases.S.info.total * c.gfmS)} кН`, N.snowGammaFm.src, effect('S')],
    ];
    if (R.cases.I) sum.push(['Ожеледь I', `${kN(R.cases.I.info.total)} кН`, `γ<sub>fm</sub> = ${f(N.interp(N.iceGammaFm.T, N.iceGammaFm.g, pr.site.Tlife), 3)} (табл. 10.4)`, `${kN(R.cases.I.info.total * N.interp(N.iceGammaFm.T, N.iceGammaFm.g, pr.site.Tlife))} кН`, N.iceK.src, effect('I')]);
    if (R.cases.Tp) sum.push(['Температура ΔT', `+${pr.site.temp.dTplus} / ${pr.site.temp.dTminus} °C`, `γ<sub>f</sub> = ${f(pr.site.temp.gf, 2)}`, `ε = α·ΔT = ${f(N.alphaT * pr.site.temp.dTplus * pr.site.temp.gf * 1e6, 0)}·10⁻⁶`, N.tempMeta.src, effect('T')]);
    if (R.seis) { const V = R.seis.kFix * Math.max(...R.seis.res.filter(r => r.dir !== 'Z').map(r => Math.sqrt(r.modes.reduce((a, m) => a + m.base * m.base, 0)))); sum.push(['Сейсміка E (сейсмічна ситуація, ф. 7.3)', `${R.seis.levels.filter(L => L.a0 > 0).map(L => `${L.id}: ${L.I} бал., a₀ = ${L.a0}g`).join('; ')}`, `γI = ${f(R.seis.gammaI, 2)}; γpl, m — табл. 7.4, 7.7`, `V<sub>основи</sub> = ${kN(V)} кН`, N.docs.seismic, effect('A')]); }
    if (R.cases.Q) sum.push(['Обслуговування / монтаж Q', (pr.loadsUser || []).map(l => esc(l.name)).join('; '), 'γ<sub>f</sub> = 1,2', '—', 'ДБН В.1.2-2, р. 6', effect('Q')]);
    s.push(F().tbl(['Вплив', 'Характеристичне (нормативне)', 'Коефіцієнт надійності', 'Розрахункове', 'Джерело', 'Вплив на конструкцію'], sum));
    P(`Для порівняння: сумарна розрахункова сила вітру становить ${f(Wg.F * c.gfmW / Math.max(G, 1) * 100, 0)} % від ваги конструкції; утримувальний момент від ваги та фундаменту перевіряється у звіті 3.`);

    H(2, '4.3. Вітрове навантаження');
    P(`W<sub>m</sub> = γ<sub>fm</sub>·W₀·C<sub>h</sub>(z)·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub>; F<sub>j</sub>(θ) = W<sub>m</sub>(z<sub>j</sub>)·C<sub>F,j</sub>·A<sub>j</sub>(θ). W₀ = ${f(c.W0, 0)} Па; γ<sub>fm</sub> = ${f(c.gfmW, 3)} (T = ${pr.site.Tlife} р.); тип місцевості ${pr.site.terrain}; C<sub>alt</sub> = ${f(c.CaltW, 3)}; C<sub>rel</sub> = ${f(c.Crel, 2)}; C<sub>dir</sub> = ${f(c.Cdir, 2)}; C<sub>d</sub> = ${f(c.Cd, 2)}; T₁ = ${f(R.T1, 3)} с → табл. ${c.ChTable}. Напрямки θ = 0…360° з кроком ${pr.design.dirStep}°.`);
    const hp = pr.site.hPed || 0;
    s.push(F().tbl(['Частина', 'z, м', 'C<sub>h</sub>', 'W<sub>m</sub>, Па', 'C<sub>F</sub>', 'A<sub>max</sub>, м² (θ)', 'F характ., кН', 'F розрах., кН'], pr.parts.map(p => {
      const z = p.kind === 'cant' ? p.z + hp : (p.z1 + p.z2) / 2 + hp, q = c.qAt(z);
      let Am = 0, thm = 0; for (let th = 0; th < 360; th += pr.design.dirStep) { const a = SC.loads.partArea(p, th); if (a > Am) { Am = a; thm = th; } }
      return [esc(p.name), f(z, 2), f(q.Ch, 3), f(q.q, 0), f(p.Cf, 2) + (p.CfConfirmed ? '' : '*'), `${f(Am, 2)} (${thm}°)`, kN(q.q / c.gfmW * p.Cf * Am), kN(q.q * p.Cf * Am)];
    })));
    s.push(F().tbl(['θ', 'ΣF характ., кН', 'ΣF розрах., кН', 'M<sub>перек</sub> розрах., кН·м', 'z<sub>cp</sub>, м'], R.cases.W.filter(W => W.theta % 45 === 0).map(W => { const Fw = W.info.parts.reduce((a, p) => a + p.F, 0), M = W.info.parts.reduce((a, p) => a + p.F * p.zcp, 0); return [W.theta + '°', kN(Fw), kN(Fw * c.gfmW), kN(M * c.gfmW), f(Fw ? M / Fw : 0, 2)]; })));
    P('* аеродинамічний коефіцієнт не підтверджено продуванням/CFD — результат попередній.');

    H(2, '4.4. Снігове навантаження');
    P(`S<sub>m</sub> = γ<sub>fm</sub>·S₀·μ·C<sub>e</sub>·C<sub>alt</sub>; S₀ = ${f(c.S0, 0)} Па, γ<sub>fm</sub> = ${f(c.gfmS, 3)}, C<sub>e</sub> = ${f(c.Ce, 2)}, C<sub>alt</sub> = ${f(c.CaltS, 3)} → S<sub>m</sub>(μ = 1) = ${f(c.Sm1, 0)} Па. Сніг діє на горизонтальні проєкції частин A<sub>h</sub>.`);
    s.push(F().tbl(['Частина', 'A<sub>h</sub>, м²', 'μ', 'F характ., кН', 'F розрах., кН'], pr.parts.map(p => [esc(p.name), f(p.Ah, 2), f(p.mu, 2), kN(c.Sk1 * p.mu * p.Ah), kN(c.Sm1 * p.mu * p.Ah)])));

    if (R.cases.I) {
      H(2, '4.5. Ожеледь');
      P(`Товщина стінки ожеледі b = ${pr.site.ice.b} мм (з коефіцієнтом k(z) за висотою), щільність ρ = ${N.iceRho} кг/м³, μ₂ = ${N.iceMu2}; вітер при ожеледі W<sub>B</sub> = ${pr.site.ice.WB} Па. Сумарна маса ожеледі ${f(R.cases.I.info.total / g, 0)} кг (${kN(R.cases.I.info.total)} кН).`);
    }
    if (R.cases.Tp) {
      H(2, '4.6. Температурні впливи');
      P(`ΔT<sub>+</sub> = +${pr.site.temp.dTplus} °C, ΔT<sub>−</sub> = ${pr.site.temp.dTminus} °C, α = ${N.alphaT}·1/°C, γ<sub>f</sub> = ${pr.site.temp.gf}. Прикладено як початкові деформації стрижнів ε = α·ΔT; зусилля виникають через защемлення бази й статичну невизначеність ядра.`);
    }
    H(2, '4.7. Сейсмічні впливи (ДБН В.1.1-12:2025)');
    s.push(RS.seismicBlock(R));
    if ((pr.loadsUser || []).length) {
      H(2, '4.8. Монтажні та експлуатаційні навантаження');
      s.push(F().tbl(['Навантаження', 'Тип', 'Точка x; y; z, м', 'F<sub>x</sub>; F<sub>y</sub>; F<sub>z</sub>, кН'], pr.loadsUser.map(l => [esc(l.name), esc(l.kind), `${f(l.x)}; ${f(l.y)}; ${f(l.z)}`, `${f(l.Fx)}; ${f(l.Fy)}; ${f(l.Fz)}`])));
    }
    H(2, '4.9. Розрахункові сполучення');
    P(`Основні: G + один змінний вплив з повним значенням; G + кілька змінних за формулою (4.4) ДБН В.1.2-2 (Зміна № 2): основне короткочасне — ψ = 1,0, друге — 0,9, решта — 0,7; перебираються всі варіанти основного й другого впливу; для перекидання й відриву — ${N.gammaG.favourable}·G + W. Особливе: ${N.seismicComb.G}·G + ${N.seismicComb.snow}·S ± E. Усього ${R.combos.length} сполучень ULS і ${R.sls.length} SLS; коефіцієнт відповідальності γ<sub>n</sub> = ${f(pr.site.gammaN, 2)}.`);
    const ld = {}; R.combos.forEach(cb => { ld[cb.lead] = (ld[cb.lead] || 0) + 1; });
    s.push(F().tbl(['Провідний вплив', 'Кількість сполучень', 'Приклад'], Object.entries(ld).map(([k, n]) => [k, n, esc((R.combos.find(cb => cb.lead === k) || {}).name || '')])));
    if (!opt.inner) s.push(sign(R));
    return s.join('\n');
  };

  // =====================================================================
  // КОМПЛЕКТ
  // =====================================================================
  /** Підсумкова таблиця: розраховані габарити і розміри деталей (каркас, опорні вузли, анкери, фундамент, армування, оболонка). */
  RS.dimTable = function (R) {
    const pr = R.pr, bp = pr.base, fd = pr.found, sp = R.spec, nS = R.supportRes.length;
    const U = u => (u == null || !isFinite(u)) ? '—' : `U = ${f(u, 2)}`;
    const head = t => [`<b>${t}</b>`, '', '', '', '', ''];
    const rows = [];
    const ns = R.P.model.nodes, ext = k => [Math.min(...ns.map(n => n[k])), Math.max(...ns.map(n => n[k]))];
    const [x0, x1] = ext('x'), [y0, y1] = ext('y'), [, z1] = ext('z');
    rows.push(head('1. Габарити'));
    rows.push(['Скульптура — повна висота', `H = ${f(R.Htot, 2)} м`, '1', '—', `${f(sp.tubeMass + sp.sheetMass + sp.ribMass, 0)} (метал)`, 'вихідні дані / аналіз зображення']);
    (pr.parts || []).forEach(p => p.kind === 'train' ? rows.push([`— шлейф «${esc(p.name)}»`, (() => { const sm = SC.model.trainSummary(p); return sm ? `довжина по гребеню ${f(sm.L, 2)} м; висота ${f(sm.z1, 2)}…${f(sm.z2, 2)} м; ферма ${f(p.w, 2)}…${f(p.wEnd, 2)} × ${f(p.h, 2)}…${f(p.hEnd, 2)} м` : '—'; })(), '1', p.shellArea ? `${f(p.shellArea, 1)} м² оболонки` : '—', '—', `опори на ${(p.supports || []).map(x => f(x * 100, 0) + ' %').join(', ')} довжини`]) : rows.push([`— частина «${esc(p.name)}»`, p.kind === 'dist' ? `z = ${f(p.z1, 2)}…${f(p.z2, 2)} м; A<sub>x</sub> = ${f(p.Ax, 2)} м², A<sub>y</sub> = ${f(p.Ay, 2)} м²` : `консоль до (${f(p.x, 2)}; ${f(p.y, 2)}; ${f(p.z, 2)}) м; A<sub>x</sub> = ${f(p.Ax, 2)} м²`, '1', p.shellArea ? `${f(p.shellArea, 1)} м² оболонки` : '—', '—', 'навітряна площа для вітру']));
    rows.push(['Каркас — габарит за осями', `${f(x1 - x0, 2)} × ${f(y1 - y0, 2)} × ${f(z1, 2)} м (X × Y × Z)`, `стрижнів: ${R.P.els.length}, вузлів: ${ns.length}`, `${f(R.memberRes.reduce((a, m) => a + m.L, 0), 1)} м`, f(sp.tubeMass, 0), `${R.sectionRes.length} секцій`]);
    rows.push(['Ядро каркаса', `низ ${f(pr.frame.a, 2)} × ${f(pr.frame.b, 2)} м, верх ${f(pr.frame.aTop, 2)} × ${f(pr.frame.bTop, 2)} м; яруси ${pr.frame.levels.map(z => f(z, 2)).join(' / ')} м`, '1', '—', '—', 'конструктивно, вписано в оболонку']);
    rows.push(head('2. Каркас — профілі труб'));
    const byP = new Map();
    R.memberRes.forEach(m => { const k = m.e.sec.name, r = byP.get(k) || { n: 0, L: 0, Lmax: 0, mass: 0, u: 0, groups: new Set() }; r.n++; r.L += m.L; r.Lmax = Math.max(r.Lmax, m.L); r.mass += m.mass; r.u = Math.max(r.u, m.best.u); r.groups.add(m.e.group); byP.set(k, r); });
    [...byP].sort((a, b) => b[1].mass - a[1].mass).forEach(([k, r]) => rows.push([`Труба ${k} (${esc([...r.groups].join(', '))})`, `${k} мм, сталь ${esc(R.mdl.steel.id)}; найдовший стрижень ${f(r.Lmax, 2)} м`, `${r.n} шт.`, `${f(r.L, 2)} м`, f(r.mass, 1), U(r.u)]));
    rows.push(head('3. Опорні вузли й анкерні болти'));
    const uSup = Math.max(0, ...R.supportRes.map(x => x.best.u));
    rows.push(['Опорна плита', `${bp.plateB} × ${bp.plateL} × ${bp.tp} мм`, `${nS} шт.`, '—', f(sp.plateMass, 1), U(uSup)]);
    if (bp.nRibs) rows.push(['Ребра жорсткості', `h = ${bp.hr} мм, t = ${bp.tr} мм`, `${bp.nRibs * nS} шт.`, '—', '—', 'розрахунок плити']);
    const la = bp.type === 'embed' ? bp.hef + 10 : bp.hef + bp.tp + 30 + 2 * bp.d + 40;
    rows.push([bp.type === 'embed' ? 'Анкер-шпилька з головкою' : 'Фундаментний болт', `М${bp.d}, клас ${esc(bp.grade)}; L = ${f(la, 0)} мм; h<sub>ef</sub> = ${bp.hef} мм; анкерна плита Ø${bp.dh}`, `${bp.nAnchor * nS} шт. (${bp.nAnchor} на вузол)`, `${f(la * bp.nAnchor * nS / 1000, 2)} м`, f(sp.anchorMass, 1), U(uSup)]);
    rows.push(head('4. Бетонна основа'));
    const uF = R.found.govUls && R.found.govUls.chk ? R.found.govUls.chk.max : null;
    rows.push([(R.found.pads || []).length ? 'Фундаментна плита Ф1 (ядро)' : 'Фундаментна плита', `${f(fd.B, 2)} × ${f(fd.L, 2)} × ${f(fd.h, 2)} м, бетон ${esc(fd.concrete)}`, '1', `${f(fd.B * fd.L * fd.h, 2)} м³`, f(fd.B * fd.L * fd.h * fd.rhoC, 0), U(uF)]);
    if (fd.pedH > 0) rows.push(['Підколонник', `${f(fd.pedB, 2)} × ${f(fd.pedL, 2)} × ${f(fd.pedH, 2)} м`, '1', `${f(fd.pedB * fd.pedL * fd.pedH, 2)} м³`, f(fd.pedB * fd.pedL * fd.pedH * fd.rhoC, 0), 'конструктивно (під анкери)']);
    rows.push(['Глибина закладання', `d = ${f(fd.depth, 2)} м`, '—', `разом бетону ${f(sp.Vc, 2)} м³`, f(sp.Vc * fd.rhoC, 0), `осідання s = ${f(R.found.settle.s * 1000, 1)} мм ≤ ${f(fd.sLim * 1000, 0)} мм`]);
    (R.found.pads || []).forEach(pd => {
      rows.push([`Фундамент ${pd.id} (опора шлейфу)`, `${f(pd.fd.B, 2)} × ${f(pd.fd.L, 2)} × ${f(pd.fd.h, 2)} м; підколонник ${f(pd.fd.pedB, 2)} × ${f(pd.fd.pedL, 2)} × ${f(pd.fd.pedH, 2)} м; d = ${f(pd.fd.depth, 2)} м`, '1', `${f(pd.Vc, 2)} м³`, f(pd.Vc * pd.fd.rhoC, 0), U(Math.max(pd.govUls.chk.max, pd.govSls.chk.max))]);
      if (pd.tieBeam) rows.push([`Рандбалка Ф1–${pd.id}`, `0,3 × 0,4 м, 4Ø14 + Ø8/200`, '1', `${f(pd.tieBeam.len, 2)} м`, '—', U(pd.tieBeam.u)]);
    });
    rows.push(head('5. Армування'));
    (R.found.rebar.rows || []).forEach(r => rows.push([`Поз. ${r.pos}. ${esc(r.name)}`, `Ø${r.dia} ${esc(fd.rebar)}, l = ${f(r.len, 2)} м`, `${r.cnt} шт.`, `${f(r.total, 1)} м`, f(r.mass, 1), r.pos <= 4 && R.found.slab.bx ? `сітка Ø${R.found.slab.bx.pick.dia} крок ${R.found.slab.bx.pick.s} мм` : '—']));
    (R.found.pads || []).forEach(pd => pd.rebar.rows.forEach((r, i) => rows.push([`Поз. ${pd.id}.${i + 1}. ${esc(r.name)}`, `Ø${r.dia} ${esc(fd.rebar)}, l = ${f(r.len, 2)} м`, `${r.cnt} шт.`, `${f(r.total, 1)} м`, f(r.mass, 1), i < 4 ? `сітка Ø${pd.reinf.pick.dia} крок ${pd.reinf.pick.s} мм` : '—'])));
    const padsR = (R.found.pads || []).reduce((a, pd) => a + pd.rebar.total, 0), padsL = (R.found.pads || []).reduce((a, pd) => a + pd.rebar.rows.reduce((b, r) => b + r.total, 0), 0);
    rows.push(['Разом арматури', '', '', `${f(R.found.rebar.rows.reduce((a, r) => a + r.total, 0) + padsL, 1)} м`, f(R.found.rebar.total + padsR, 1), '']);
    if ((R.shellRes || []).length) {
      rows.push(head('6. Оболонка і допоміжні ребра'));
      R.shellRes.forEach(x => rows.push([`Оболонка «${esc(x.part)}»`, `лист t = ${f(x.t * 1000, 1)} мм; ребра ${x.rib.h}×${x.rib.t} мм з кроком ${f(x.s * 1000, 0)} мм`, '—', '—', f(x.ribMass, 1) + ' (ребра)', U(x.u)]));
    }
    if (pr.segments) rows.push([`Обшивка: сегменти листа (розкрій за 3D)`, `t = ${f(pr.segments.t, 1)} мм; ${pr.segments.list.length} сегментів, найбільший ${f(Math.max(...pr.segments.list.map(q => q.w)) * 1000, 0)} × ${f(Math.max(...pr.segments.list.map(q => q.h)) * 1000, 0)} мм`, `${pr.segments.sheets} листів`, `${f(pr.segments.A, 2)} м²`, f(pr.segments.M, 1), pr.segments.list.every(q => q.fits) ? 'усі вміщуються в лист' : 'є більші за лист']);
    rows.push(['<b>Разом металу (каркас + оболонка + вузли)</b>', '', '', '', `<b>${f(sp.tubeMass + sp.sheetMass + sp.ribMass + sp.plateMass + sp.anchorMass, 0)}</b>`, '']);
    return '<h2>Підсумкова таблиця: розраховані габарити і розміри деталей</h2><p>Усі розміри — результат розрахунку або конструктивні (зазначено). U — коефіцієнт використання визначальної перевірки (U ≤ 1 — умова виконана; запас = 1 − U).</p>' +
      F().tbl(['Елемент', 'Габарити / розміри / переріз', 'Кількість', 'Довжина / об’єм', 'Маса, кг', 'Підстава'], rows);
  };

  /** Перерізи 3D-моделі (пояси, площі, центр мас) і розкрій обшивки — для звітів. */
  RS.geom3d = function (R) {
    const pr = R.pr, sl = pr.slices, g = pr.segments, s = [];
    if (!sl && !g) return '';
    if (sl) {
      s.push(`<h3>Перерізи 3D-моделі по висоті (${esc(sl.name || '')}, крок ${f(sl.step, 2)} м)</h3>`);
      s.push(F().tbl(['z, м', 'Площа перерізу, м²', 'Периметр, м', 'Габарит X×Y, мм', 'Центр x; y, м', 'Смуга, м', 'Поверхня, м²', 'Маса, кг', 'A_x / A_y, м²'], sl.secs.map((q, k) => { const b = sl.bands[k]; return [f(q.z, 2), q.open ? '—' : f(q.A, 3), f(q.per, 2), `${f((q.bbox.mx[0] - q.bbox.mn[0]) * 1000, 0)}×${f((q.bbox.mx[1] - q.bbox.mn[1]) * 1000, 0)}`, `${f(q.c[0], 3)}; ${f(q.c[1], 3)}`, b ? `${f(b.z0, 2)}…${f(b.z1, 2)}` : '', b ? f(b.A, 3) : '', b ? f(b.m, 1) : '', b ? `${f(b.Ax, 2)} / ${f(b.Ay, 2)}` : '']; })));
      s.push(`<p>Маса оболонки за 3D: ${f(sl.M, 1)} кг; центр мас (${f(sl.cg[0], 3)}; ${f(sl.cg[1], 3)}; ${f(sl.cg[2], 3)}) м.${sl.core ? ` Ядро вписано в перерізи із зазором: низ ${f(sl.core.a, 2)}×${f(sl.core.b, 2)} м, верх ${f(sl.core.aTop, 2)}×${f(sl.core.bTop, 2)} м, пояси на ${sl.core.levels.join('; ')} м.` : ''}${(pr.parts || []).some(p => p.zProfile) ? ` Маса й вітер частин ${(pr.parts || []).filter(p => p.zProfile).map(p => '«' + esc(p.name) + '»').join(', ')} розподілено по висоті за смугами 3D-моделі.` : ''}</p>`);
    }
    if (g) {
      s.push(`<h3>Розкрій обшивки: ${g.list.length} сегментів листа t = ${f(g.t, 1)} мм</h3>`);
      s.push(F().tbl(['№', 'Смуга / сектор', 'z, м', 'Площа, м²', 'Розгортка ш×в, мм', 'Маса, кг', 'Лист'], g.list.map(q => [q.n, `${q.band} / ${q.sector}`, `${f(q.z0, 2)}…${f(q.z1, 2)}`, f(q.A, 3), `${f(q.w * 1000, 0)}×${f(q.h * 1000, 0)}`, f(q.m, 1), q.fits ? 'вміщується' : '<b>більший за лист</b>']).concat([['', '<b>Разом</b>', '', `<b>${f(g.A, 2)}</b>`, '', `<b>${f(g.M, 1)}</b>`, `${g.sheets} листів ${f(g.wMax * 1000, 0)}×${f(g.hMax * 1000, 0)}`]])));
    }
    return s.join('\n');
  };

  RS.full = function (R) {
    const pr = R.pr, sp = R.spec;
    const s = [header(R, 'Розрахунок каркаса скульптури: комплект звітів', 'Комплект')];
    s.push('<h2>Зміст</h2><ol class="toc"><li>Звіт 4. Навантаження і впливи (з перевіркою даних регіону)</li><li>Звіт 1. Каркас: підбір профільних труб</li><li>Звіт 2. Анкерні болти</li><li>Звіт 3. Бетонна основа й армування</li><li>Підсумок: габарити й розміри деталей, матеріали, висновки</li></ol>');
    s.push('<section class="rep-part"><h1>Звіт 4. Навантаження і впливи</h1>' + RS.loads(R, { inner: true }) + '</section>');
    s.push('<section class="rep-part"><h1>Звіт 1. Каркас</h1>' + RS.frame(R, { inner: true }) + RS.geom3d(R) + '</section>');
    s.push('<section class="rep-part"><h1>Звіт 2. Анкерні болти</h1>' + RS.anchors(R, { inner: true }) + '</section>');
    s.push('<section class="rep-part"><h1>Звіт 3. Бетонна основа</h1>' + RS.base(R, { inner: true }) + '</section>');
    s.push('<section class="rep-part"><h1>Підсумок</h1>');
    s.push(RS.dimTable(R));
    s.push('<h2>Матеріали і вартість</h2>');
    s.push(F().tbl(['Матеріал', 'Кількість', 'Маса'], [
      ['Труби каркаса', `${f(R.memberRes.reduce((a, m) => a + m.L, 0), 1)} м`, `${f(sp.tubeMass, 0)} кг`],
      ['Лист оболонки + ребра', '—', `${f(sp.sheetMass + sp.ribMass, 0)} кг`],
      ['Опорні плити', `${R.supportRes.length} шт.`, `${f(sp.plateMass, 0)} кг`],
      ['Анкери', `${pr.base.nAnchor * R.supportRes.length} шт.`, `${f(sp.anchorMass, 0)} кг`],
      ['Бетон', `${f(sp.Vc, 2)} м³`, `${f(sp.Vc * pr.found.rhoC / 1000, 1)} т`],
      ['Арматура', '—', `${f(sp.rebarMass, 0)} кг`],
      ['Орієнтовна вартість матеріалів', '', `${f(sp.total, 0)} грн`],
    ]));
    s.push('<h2>Висновки</h2><ul class="concl">' + SC.report.conclusions(R).map(t => `<li>${t}</li>`).join('') + '</ul>');
    s.push('<h2>Попередження</h2><ul class="warns">' + R.warn.map(w => `<li class="${w.level}">${esc(w.msg)}</li>`).join('') + '</ul>');
    s.push(sign(R) + '</section>');
    return s.join('\n');
  };

  SC.reports = RS;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
