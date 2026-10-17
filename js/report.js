/* Розрахункова записка (звіт) і аналіз ТЗ. Генерує HTML з усіма вихідними даними, формулами з підстановкою,
 * визначальними сполученнями, поясненнями та відомістю матеріалів. */
(function (SC) {
  'use strict';

  const Rp = {};
  const f = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d });
  const kN = v => f(v / 1000, 2);
  const kNm = v => f(v / 1000, 2);
  const MPa = v => f(v / 1e6, 1);
  const pc = v => f(v * 100, 0) + ' %';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = s => s === 'checked' ? '<span class="pill ok">звірено</span>' : s === 'verify' ? '<span class="pill warn">звірити</span>' : '<span class="pill">користувач</span>';
  const U = u => `<span class="u ${u > 1 ? 'bad' : u > 0.9 ? 'warn' : 'ok'}">${f(u, 3)}</span>`;
  const tbl = (head, rows, cls) => `<div class="tw"><table class="${cls || ''}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  Rp.fmt = { f, kN, kNm, MPa, U, esc, tbl, pc };

  // опис визначального сполучення за його кодом: W…, S…, Tp/Tm…, Q…, I…, IW…, U…, VX, E…, M1, A1
  function actionOf(name) {
    const id = String(name).split(':')[0].trim();
    if (/^E/.test(id)) return 'сейсміка';
    if (/^U/.test(id)) return 'вітер при мінімальній вазі (відрив, перекидання)';
    if (/^IW/.test(id)) return 'ожеледь з вітром';
    if (/^VX/.test(id)) return 'резонансне вихрове збудження';
    if (/^M1/.test(id)) return 'монтаж';
    if (/^A1/.test(id)) return 'аварійний вплив';
    const tok = id.replace(/\d+$/, '').match(/W|S|Tp|Tm|Q|I/g) || [];
    const nm = { W: 'вітер', S: 'сніг', Tp: 'нагрівання', Tm: 'охолодження', Q: 'обслуговування', I: 'ожеледь' };
    if (!tok.length) return id;
    return nm[tok[0]] + (tok[1] ? ' + ' + nm[tok[1]] + ' (ψ = 0,9)' : '') + (tok.length > 2 ? ' + інші (ψ = 0,7)' : '');
  }

  Rp.build = function (R, opt) {
    opt = opt || {};
    if (opt.type === 'eval') return Rp.evalReport(R);
    const pr = R.pr, c = R.clim, N = SC.norms;
    const s = [];
    const H = (n, t) => s.push(`<h${n}>${t}</h${n}>`);
    const P = t => s.push(`<p>${t}</p>`);
    const statusText = { ok: 'Перевірки виконуються', preliminary: 'ПОПЕРЕДНІЙ результат (не всі вихідні дані підтверджено)', 'not-ok': 'Є невиконані перевірки — рішення не прийнятне' }[R.status];
    s.push(`<header class="rep-head"><div class="eyebrow">Розрахункова записка · ${esc(pr.meta.stage)}</div><h1>${esc(pr.meta.name)}</h1>
      <div class="rep-meta"><span>Замовник: ${esc(pr.meta.customer || '—')}</span><span>Місце: ${esc(pr.meta.location)}</span><span>Дата: ${esc(pr.meta.date)}</span><span>Виконавець: ${esc(pr.meta.author || '—')}</span></div>
      <div class="rep-status ${R.status}">${statusText}</div></header>`);

    // 1
    H(2, '1. Призначення та межі розрахунку');
    P(`Розраховано сталевий просторовий каркас скульптури з квадратних гнутозварних труб, опорні вузли (пластини, шви, анкери) і монолітний фундамент.
       Розрахункова модель — стрижнева система з 6 ступенями свободи у вузлі (МСЕ), ${R.P.nn} вузлів, ${R.P.els.length} елементів, ${R.solved.length} розрахункових сполучень ULS
       ${pr.design.second ? 'з урахуванням геометричної нелінійності (2-й порядок, P-Δ/P-δ) та глобальних недосконалостей' : 'у лінійній постановці (1-й порядок)'}.`);
    P('Оболонка прийнята <b>ненесучим облицюванням</b>: вона передає на каркас власну вагу, вітер і сніг, але не включається в роботу каркаса (ТЗ, 2.3.2). Спільна робота оболонки потребує оболонкової моделі МСЕ і в цій версії не виконується.');

    // 2
    H(2, '2. Нормативна база');
    s.push('<ul class="norms">' + Object.values(N.docs).map(d => `<li>${esc(d)}</li>`).join('') + '</ul>');
    P('Кожен табличний коефіцієнт у застосунку має позначку статусу: «звірено» — значення перевірено за відкритими фрагментами чинного тексту; «звірити» — внесено за редакцією норми, перед випуском робочої документації потрібно звірити з офіційним текстом (ТЗ, 3.1.5).');

    // 3
    H(2, '3. Вихідні дані');
    H(3, '3.1. Майданчик і клімат');
    s.push(tbl(['Параметр', 'Значення', 'Джерело / статус'], [
      ['Місце встановлення', esc(pr.meta.location), '—'],
      ['Характеристичний тиск вітру W₀', f(c.W0, 0) + ' Па', (pr.site.windMode === 'district' ? `район ${pr.site.windDistrict}, ${N.windDistrictsMeta.src} ` + st(N.windDistrictsMeta.status) : N.citiesMeta.src)],
      ['Тип місцевості', pr.site.terrain, 'ДБН В.1.2-2, п. 9.9 (визначається для кожного напрямку; прийнято однаковим)'],
      ['Висота над рівнем моря H', f(pr.site.Hsea, 3) + ' км', 'топографія'],
      ['Висота постаменту над землею', f(pr.site.hPed, 2) + ' м', 'z_j = h_пост + z_j,лок'],
      ['Характеристичне снігове навантаження S₀', f(c.S0, 0) + ' Па', pr.site.snowMode === 'district' ? `район ${pr.site.snowDistrict}, ${N.snowDistrictsMeta.src} ` + st(N.snowDistrictsMeta.status) : N.citiesMeta.src],
      ['Установлений строк експлуатації T', pr.site.Tlife + ' років', 'завдання на проєктування; ДБН В.1.2-14'],
      ['Клас наслідків / γn', `${pr.site.cc} / ${f(pr.site.gammaN, 2)}`, N.gammaNMeta.src + ' ' + st(N.gammaNMeta.status)],
      ['Сейсмічність', pr.site.seismic.on ? `${pr.site.seismic.intensity} балів, ґрунт кат. ${pr.site.seismic.soil}` : 'не враховано', N.docs.seismic],
    ]));
    H(3, '3.2. Частини скульптури');
    s.push(tbl(['Частина', 'Тип', 'Центр x; y; z, м', 'Оболонка A, м² × t, мм', 'Маса, кг', 'Aₓ / A_y, м²', 'C_F', 'A_h, м² · μ'],
      pr.parts.map((p, i) => { const pa = R.mdl.partAttach.find(a => a.part === i); return [esc(p.name), p.kind === 'cant' ? 'консоль' : `по висоті ${f(p.z1, 2)}…${f(p.z2, 2)} м`, `${f(p.x)}; ${f(p.y)}; ${f(p.z)}`, `${f(p.shellArea, 2)} × ${f(p.tShell, 1)}`, f(pa.mass, 1), `${f(p.Ax)} / ${f(p.Ay)}${p.areaTable ? ' (3D)' : ''}`, f(p.Cf, 2) + (p.CfConfirmed ? '' : ' *'), `${f(p.Ah)} · ${f(p.mu, 2)}`]; })));
    P('Маса оболонки частини: m = ρ·t·A + m<sub>дод</sub> (m<sub>дод</sub> включає ребра допоміжного каркаса листа). * — аеродинамічний коефіцієнт не підтверджено експериментом/CFD. Джерела геометрії: ' + [...new Set(pr.parts.map(p => p.source === 'image' ? 'зображення (маски, масштаб, 3D з проєкцій)' : p.source === '3d' ? '3D-модель STL/OBJ' : 'ручне введення'))].join('; ') + (pr.parts.some(p => p.status === 'assumed') ? '. Частини з припущеною глибиною позначено в таблиці частин.' : '.'));
    H(3, '3.3. Каркас і матеріали');
    const steel = R.mdl.steel;
    s.push(tbl(['Параметр', 'Значення'], [
      ['Схема', { single: 'одна консольна стійка', core3: 'тригранне ядро', core4: 'чотиригранне ядро' }[pr.frame.type] + (pr.frame.type !== 'single' ? `, план ${f(pr.frame.a)}×${f(pr.frame.b)} м → ${f(pr.frame.aTop)}×${f(pr.frame.bTop)} м, зв'язки: ${{ X: 'хрестові', Z: 'розкісні', none: 'відсутні (рамне ядро)' }[pr.frame.bracing]}` : '')],
      ['Рівні, м', R.mdl.levels.map(z => f(z, 2)).join('; ')],
      ['Перерізи', `стійки ${pr.frame.secPost}; пояси ${pr.frame.secRing}; зв'язки ${pr.frame.secBrace}; консолі — за частинами`],
      ['Сталь', `${steel.id}: Ryn = ${steel.Ryn} МПа, Run = ${steel.Run} МПа, γm = ${steel.gm}; E = ${f(N.E / 1e9, 0)} ГПа`],
      ['Закріплення', pr.frame.support === 'fixed' ? 'жорстке (защемлення) — забезпечується опорною пластиною з анкерами' : 'шарнірне'],
      ['Коефіцієнт умов роботи γc', f(pr.frame.gammaC, 2)],
    ]));
    P('Геометричні характеристики труб обчислено з урахуванням заокруглення кутів (r<sub>o</sub> = 2t…3t) за EN 10219-2. Спрощена формула ТЗ A = b² − (b − 2t)² завищує площу на 2…4 % і момент інерції на 4…6 %, тому для кінцевого підбору не застосовується.');

    // 4
    H(2, '4. Навантаження');
    H(3, '4.1. Власна вага');
    P(`Маса каркаса m<sub>к</sub> = Σ ρ·A<sub>e</sub>·L<sub>e</sub> = ${f(R.cases.G.info.frameMass, 1)} кг; маса оболонки й обладнання Σm<sub>j</sub> = ${f(R.cases.G.info.shellMass, 1)} кг.
       Коефіцієнт надійності для металу γ<sub>fm</sub> = ${N.gammaG.steel} (несприятлива дія) та ${N.gammaG.favourable} (сприятлива — перекидання, відрив) — ${N.gammaG.src}. Власна вага перераховується на кожній ітерації підбору перерізів.`);
    H(3, '4.2. Вітер');
    P(`W<sub>m</sub> = γ<sub>fm</sub>·W₀·C<sub>h</sub>(z)·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub> (тиск без аеродинамічного коефіцієнта); F<sub>j</sub>(θ) = q<sub>m,j</sub>·C<sub>F,j</sub>·A<sub>ref,j</sub>(θ).`);
    s.push(tbl(['Коефіцієнт', 'Значення', 'Обґрунтування'], [
      ['γ<sub>fm</sub> (T = ' + pr.site.Tlife + ' р.)', f(c.gfmW, 3), N.windGammaFm.src + ', лінійна інтерполяція ' + st(N.windGammaFm.status)],
      ['C<sub>alt</sub>', f(c.CaltW, 3), `H = ${f(pr.site.Hsea, 3)} км ${pr.site.Hsea > 0.5 ? '> 0,5 → 2H' : '≤ 0,5 → 1,0'}${pr.site.w0Station ? '; W₀ за метеостанцією → 1,0' : ''}`],
      ['C<sub>rel</sub>; C<sub>dir</sub>', f(c.Crel, 2) + '; ' + f(c.Cdir, 2), 'задано користувачем (рельєф, напрямок)'],
      ['T₁ (1-ша форма, маси G)', f(R.T1, 3) + ' с', 'модальний аналіз МСЕ'],
      ['Таблиця C<sub>h</sub>', c.ChTable, R.T1 <= 0.25 ? 'T₁ ≤ 0,25 с → табл. 9.01' : 'T₁ > 0,25 с → табл. 9.02'],
      ['C<sub>d</sub>', f(c.Cd, 2), R.T1 <= 0.25 ? 'T₁ ≤ 0,25 с → C<sub>d</sub> = 1 (Зміна № 1)' : 'задано користувачем — підтвердити за графіками Зміни № 1'],
      ['q₀ = γ<sub>fm</sub>·W₀·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub>', f(c.q0, 1) + ' Па', `${f(c.gfmW, 3)}·${f(c.W0, 0)}·${f(c.CaltW, 2)}·${f(c.Crel, 2)}·${f(c.Cdir, 2)}·${f(c.Cd, 2)}`],
    ]));
    // по частинах для θ = 0
    const hp = pr.site.hPed || 0;
    s.push(tbl(['Частина', 'z над землею, м', 'C<sub>h</sub>', 'q<sub>m</sub>, Па', 'C<sub>F</sub>', 'A<sub>max</sub>, м² (θ)', 'F<sub>max</sub>, кН'], pr.parts.map(p => {
      const z = p.kind === 'cant' ? p.z + hp : (p.z1 + p.z2) / 2 + hp;
      const q = c.qAt(z);
      let Am = 0, thm = 0; for (let th = 0; th < 360; th += pr.design.dirStep) { const a = SC.loads.partArea(p, th); if (a > Am) { Am = a; thm = th; } }
      return [esc(p.name), f(z, 2), f(q.Ch, 3), f(q.q, 1), f(p.Cf, 2), `${f(Am, 2)} (${thm}°)`, kN(q.q * p.Cf * Am)];
    })));
    P('Для розподілених частин C<sub>h</sub> визначається для кожного шару за його висотою; у таблиці наведено середню висоту. Площі проєкцій A(θ) для частин, імпортованих з 3D-моделі, — площа об\'єднання проєкцій граней (без подвійного врахування перекриттів).');
    const wRows = R.cases.W.map(W => {
      const F = W.info.parts.reduce((a, p) => a + p.F, 0), M = W.info.parts.reduce((a, p) => a + p.F * p.zcp, 0);
      return [W.theta + '°', kN(F * c.gfmW), kNm(M * c.gfmW), f(F ? M / F : 0, 2)];
    });
    s.push('<details><summary>Сумарні розрахункові сили вітру за напрямками</summary>' + tbl(['θ', 'ΣF, кН', 'M<sub>перек</sub> на рівні землі, кН·м', 'z<sub>cp</sub>, м'], wRows) + '</details>');
    H(3, '4.3. Сніг');
    P(`S<sub>m</sub> = γ<sub>fm</sub>·S₀·μ·C<sub>e</sub>·C<sub>alt</sub>; γ<sub>fm</sub> = ${f(c.gfmS, 3)} (${N.snowGammaFm.src}, ${st(N.snowGammaFm.status)}), C<sub>e</sub> = ${f(c.Ce, 2)}, C<sub>alt</sub> = ${f(c.CaltS, 3)};
       S<sub>m</sub>(μ = 1) = ${f(c.Sm1, 0)} Па. F<sub>s,j</sub> = S<sub>m</sub>·μ<sub>j</sub>·A<sub>h,j</sub>, напрямок — вертикально вниз. Сумарне характеристичне снігове навантаження ${kN(R.cases.S.info.total)} кН.
       Зони накопичення на складках плаща, книзі, плечах приймаються за підтвердженням інженера (коефіцієнти покрівель не переносяться механічно).`);
    // сейсміка
    H(3, '4.4. Сейсмічні впливи (ДБН В.1.1-12:2025)');
    s.push(SC.reports.seismicBlock(R));

    // 5
    H(2, '5. Розрахункові сполучення');
    P(`Основні сполучення (ДБН В.1.2-2, р. 4): постійне + змінні за формулою (4.4) ДБН В.1.2-2 (Зміна № 2): основне короткочасне — ψ = 1,0, друге — 0,9, решта — 0,7; перебираються всі варіанти основного й другого впливу (${st(N.psi.status)}). Напрямки вітру θ = 0…360° з кроком ${pr.design.dirStep}°. Усі ефекти множаться на γn = ${f(pr.site.gammaN, 2)}.
       Сейсмічна розрахункова ситуація (ДБН В.1.1-12:2025, ф. 7.3): 1,0·G + 0,5·S ± γ<sub>I</sub>·E/m (вітер, температура не входять, табл. 7.6). Для перекидання/відриву — ${N.gammaG.favourable}·G + W.`);
    const cl = R.combos.filter(cb => cb.theta == null || cb.theta === 0).map(cb => [cb.id, cb.situation, esc(cb.name), cb.lead || '—', (cb.acc || []).join(', ') || '—']);
    s.push(tbl(['Код', 'Ситуація', 'Склад', 'Ведучий', 'Супутні'], cl.concat([['…', '', `усього ${R.combos.length} сполучень (θ = 0…360°)`, '', '']])));
    if (R.solved[0]) P(`Глобальна недосконалість φ = φ₀·α<sub>h</sub>·α<sub>m</sub> = ${f(R.solved[0].cb.phi * 1000, 3)}·10⁻³ рад (EN 1993-1-1, 5.3.2) — прикладена як горизонтальні сили H = φ·V у напрямку вітру.`);
    P(`Контроль рівноваги: max |ΣF<sub>зовн</sub> + ΣR| / max F = ${R.eqMax.toExponential(1)}. Критичний коефіцієнт пружної стійкості системи α<sub>cr</sub> = ${f(R.alphaCr, 2)} (сполучення ${R.alphaCombo}).`);

    // 6
    H(2, '6. Перевірка елементів каркаса');
    P(`Профіль «ДБН В.2.6-198»: R<sub>y</sub> = R<sub>yn</sub>/γ<sub>m</sub>; міцність σ = |N|/A + |M<sub>y</sub>|/W + |M<sub>z</sub>|/W ≤ R<sub>y</sub>γ<sub>c</sub>; стійкість N/(φ·A·R<sub>y</sub>·γ<sub>c</sub>) + C<sub>m</sub>·(M<sub>y</sub> + M<sub>z</sub>)/((1 − N/N<sub>cr</sub>)·W·R<sub>y</sub>·γ<sub>c</sub>) ≤ 1, φ за λ̄ = λ√(R<sub>y</sub>/E), тип перерізу b.
       Профіль «EN 1993-1-1»: клас перерізу (c/t, табл. 5.2), χ за кривою ${pr.design.curve} (холодноформовані труби), формули (6.61)–(6.62), k<sub>ij</sub> — додаток B. Розрахункова довжина: метод ${pr.design.method === 'B' ? 'B — μ = 2 для консолей, 1-й порядок' : 'A — 2-й порядок з недосконалостями, L<sub>cr</sub> = системна довжина'}. Приймається більше з двох U.`);
    const groups = new Map();
    R.memberRes.forEach(m => { const g = groups.get(m.e.group); if (!g || m.best.u > g.best.u) groups.set(m.e.group, m); });
    s.push(tbl(['Група', 'Переріз', 'L<sub>cr</sub>, м', 'λ (гран.)', 'Клас', 'φ / χ', 'N, кН', 'M<sub>y</sub>; M<sub>z</sub>, кН·м', 'U<sub>ДБН</sub>', 'U<sub>EN</sub>', 'Визначальне'], [...groups.values()].map(m => {
      const b = m.best, k = b.chk;
      return [esc(m.e.group), m.e.sec.name, f(m.Lsys.Lcr, 2), `${f(m.lam, 0)} (${f(m.lamLim, 0)})`, k.en.cls, `${f(k.dbn.phi, 3)} / ${f(k.en.chi, 3)}`, kN(b.f.N), `${kNm(b.f.My)}; ${kNm(b.f.Mz)}`, U(k.dbn.max), U(k.en.max), esc(b.combo.split(':')[0]) + ' · ' + actionOf(b.combo)];
    })));
    const gm = R.govMember;
    if (gm) {
      const k = gm.best.chk;
      H(3, `6.1. Визначальний елемент ${gm.e.id} (${esc(gm.e.group)}, ${gm.e.sec.name})`);
      const sec = gm.e.sec;
      s.push(tbl(['Величина', 'Значення'], [
        ['A; I; W<sub>el</sub>; W<sub>pl</sub>; i', `${f(sec.A * 1e4, 2)} см²; ${f(sec.Iy * 1e8, 1)} см⁴; ${f(sec.Wel * 1e6, 1)} см³; ${f(sec.Wpl * 1e6, 1)} см³; ${f(sec.i * 100, 2)} см`],
        ['Сполучення; переріз уздовж елемента', `${esc(gm.best.combo)}; x = ${f(gm.best.station * gm.L, 2)} м`],
        ['N; V; T; M<sub>y</sub>; M<sub>z</sub>', `${kN(gm.best.f.N)} кН; ${kN(Math.hypot(gm.best.f.Vy, gm.best.f.Vz))} кН; ${kNm(gm.best.f.T)} кН·м; ${kNm(gm.best.f.My)} кН·м; ${kNm(gm.best.f.Mz)} кН·м`],
        ['ДБН: R<sub>y</sub>; λ̄; φ', `${MPa(k.dbn.Ry)} МПа; ${f(k.dbn.lamBar, 3)}; ${f(k.dbn.phi, 3)}`],
        ['ДБН: міцність; зріз; σ<sub>ef</sub>; стійкість', `${U(k.dbn.strength)}; ${U(k.dbn.shear)}; ${U(k.dbn.eq)}; ${U(k.dbn.stability)}`],
        ['EN: клас (c/t); λ̄; χ', `${k.en.cls} (${f(k.en.ct, 1)}); ${f(k.en.lam, 3)}; ${f(k.en.chi, 3)}`],
        ['EN: міцність; зсув; кручення; σ<sub>eq</sub>; (6.61)/(6.62)', `${U(k.en.strength)}; ${U(k.en.shear)}; ${U(k.en.torsion)}; ${U(k.en.eq)}; ${U(k.en.stability)}`],
      ]));
    }
    H(3, '6.2. Переміщення');
    P(`Найбільше горизонтальне переміщення від характеристичних навантажень: ${f(R.uMax * 1000, 1)} мм (вузол ${R.uNode ? R.uNode.id : '—'}, ${esc(R.uCombo || '')}). Граничне H/${pr.design.defLimit} = ${f(R.uLim * 1000, 1)} мм → ${R.uMax <= R.uLim ? 'виконується' : '<b>не виконується</b>'}. Граничне значення для скульптури встановлюється завданням (естетика, тріщини оболонки, швів).`);

    // 7
    H(2, '7. Опорні вузли');
    const gs = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
    if (gs && gs.best.b) {
      const b = gs.best.b, r = gs.best.r, bp = pr.base;
      P(`Пластина ${bp.plateB}×${bp.plateL}×${bp.tp} мм, ${bp.nAnchor} анкери М${bp.d} кл. ${bp.grade}, h<sub>ef</sub> = ${bp.hef} мм, бетон ${bp.concrete} (${bp.cracked ? 'з тріщинами' : 'без тріщин'}). Визначальна опора ${gs.node.id}, сполучення ${esc(gs.best.combo)}.
         Розподіл зусиль: жорстка пластина на односторонньому пружному контакті (стиск — бетон у межах ефективної зони c = t<sub>p</sub>√(f<sub>y</sub>/(3f<sub>jd</sub>γ<sub>M0</sub>)) = ${f(b.c * 1000, 1)} мм від стінок труби), анкери працюють лише на розтяг; рівновагу розв'язано з урахуванням відриву.`);
      s.push(tbl(['Перевірка', 'Дія', 'Опір', 'U'], [
        ['Реакція: N; H; M<sub>x</sub>; M<sub>y</sub>; M<sub>z</sub>', `${kN(r[2])} кН; ${kN(Math.hypot(r[0], r[1]))} кН; ${kNm(r[3])}; ${kNm(r[4])}; ${kNm(r[5])} кН·м`, '—', '—'],
        ['Зминання бетону під пластиною', `σ<sub>max</sub> = ${MPa(b.sigmaMax)} МПа`, `f<sub>jd</sub> = ⅔·α·f<sub>cd</sub> = ${MPa(b.fjd)} МПа`, U(b.bearing)],
        ['Розтяг анкера (сталь)', `T = ${kN(b.Tmax)} кН`, `F<sub>t,Rd</sub> = 0,9·f<sub>ub</sub>·A<sub>s</sub>/γ<sub>M2</sub> = ${kN(b.FtRd)} кН`, U(b.anchorT)],
        ['Зріз + розтяг анкера', `V = ${kN(b.Vmax)} кН (тертя ${kN(b.FfRd)} кН)`, `F<sub>vb,Rd</sub> = ${kN(b.FvbRd)} кН; V/F<sub>v</sub> + T/(1,4F<sub>t</sub>)`, U(b.anchorSteel)],
        ['Згин пластини над анкером (Т-ділянка)', `T = ${kN(b.Tmax)} кН, m = ${f(b.m * 1000, 0)} мм`, `F<sub>T,1-2</sub> = 2M<sub>pl</sub>/m = ${kN(b.FT12)} кН (l<sub>eff</sub> = ${f(b.leff * 1000, 0)} мм)`, U(b.plateT)],
        ['Кутовий шов труба–пластина', `a = ${f(b.weldA * 1000, 1)} мм`, '√(σ⊥² + 3(τ⊥² + τ∥²)) ≤ f<sub>u</sub>/(β<sub>w</sub>γ<sub>M2</sub>)', U(b.weld)],
        ['Бетонний конус (EN 1992-4)', `N<sub>Ed</sub><sup>g</sup> = ${kN(b.concrete.NEg)} кН`, `N<sub>Rk,c</sub> = ${kN(b.concrete.NRkc)} кН, γ<sub>Mc</sub> = 1,5`, U(b.concrete.cone)],
        ['Вирив анкера з головкою', `T = ${kN(b.Tmax)} кН`, `N<sub>Rk,p</sub> = k₂·A<sub>h</sub>·f<sub>ck</sub> = ${kN(b.concrete.NRkp)} кН`, U(b.concrete.pullout)],
        ['Крайове сколювання при зрізі', `c₁ = ${f(Math.min(b.concrete.cx, b.concrete.cy), 0)} мм`, `V<sub>Rk,c</sub> = ${kN(b.concrete.VRkc)} кН`, U(b.concrete.edge || 0)],
        ['Виколювання (pry-out)', '', `V<sub>Rk,cp</sub> = k₈·N<sub>Rk,c</sub> = ${kN(b.concrete.VRkcp)} кН`, U(b.concrete.pryout || 0)],
        ['Взаємодія N–V (бетон)', '', '(β<sub>N</sub>)<sup>1,5</sup> + (β<sub>V</sub>)<sup>1,5</sup> ≤ 1', U(b.concrete.inter)],
      ]));
      P('Розколювання бетону не перевіряється за умови армування підколонника (вертикальні стрижні + хомути біля анкерів) і h<sub>пк</sub> ≥ 2h<sub>ef</sub>; для анкерів у сейсмічних районах і при втомних діях анкерна система повинна мати підтверджену придатність (EN 1992-4, C1/C2).');
    }

    // 8
    H(2, '8. Фундамент');
    const F = R.found, fd = F.fd;
    P(`Монолітна плита ${f(fd.B)}×${f(fd.L)}×${f(fd.h)} м з підколонником ${f(fd.pedB)}×${f(fd.pedL)}×${f(fd.pedH)} м, глибина закладання d = ${f(fd.depth)} м. Вага бетону G<sub>c</sub> = ρ<sub>c</sub>·g·V = ${kN(F.govSls.res.W.Gc)} кН, ґрунту на уступах ${kN(F.govSls.res.W.Gs)} кН.`);
    if (F.soil) P(`Розрахунковий опір ґрунту (умовна межа лінійності, ДБН В.2.1-10, п. 8.6.7; формула — ДСТУ-Н Б В.2.1-28): R = γ<sub>c1</sub>γ<sub>c2</sub>/k·(M<sub>γ</sub>·k<sub>z</sub>·b·γ<sub>II</sub> + M<sub>q</sub>·d₁·γ'<sub>II</sub> + M<sub>c</sub>·c<sub>II</sub>) = ${f(fd.gammaC1, 2)}·${f(fd.gammaC2, 2)}/${f(fd.kfactor, 2)}·(${f(F.soil.mg, 2)}·1·${f(F.soil.b, 2)}·${f(fd.gammaSoil, 1)} + ${f(F.soil.mq, 2)}·${f(fd.depth, 2)}·${f(fd.gammaSoil, 1)} + ${f(F.soil.mc, 2)}·${f(fd.cII, 1)}) = ${f(F.Rsoil, 1)} кПа (φ<sub>II</sub> = ${fd.phi}°).`);
    else P(`Розрахунковий опір ґрунту R = ${f(F.Rsoil, 0)} кПа (за висновком інженерно-геологічних вишукувань).`);
    const sl = F.govSls, ul = F.govUls;
    s.push(tbl(['Перевірка', 'Сполучення', 'Значення', 'Критерій', 'U'], [
      ['Середній тиск p<sub>m</sub>', esc(sl.cb.name), f(sl.chk.p.pmean / 1000, 1) + ' кПа', `≤ R = ${f(F.Rsoil, 0)} кПа`, U(sl.chk.pMean)],
      ['Крайовий тиск p<sub>max</sub>', esc(sl.cb.name), f(sl.chk.p.pmax / 1000, 1) + ' кПа', `≤ 1,2R = ${f(1.2 * F.Rsoil, 0)} кПа`, U(sl.chk.pMax)],
      ['Частка контакту підошви', esc(sl.cb.name), pc(sl.chk.p.contactFrac), `≥ ${pc(fd.minContact || 0.75)}`, U(sl.chk.contact)],
      ['Перекидання M<sub>перек</sub>/M<sub>утр</sub>', esc(ul.cb.name), f(ul.chk.overturn, 3), `коеф. запасу ≥ ${f(fd.overturnSF || 1.5, 2)}`, U(ul.chk.overturn * (fd.overturnSF || 1.5))],
      ...(ul.chk.bear && ul.chk.bear.ok ? [['Несуча здатність основи F ≤ γ<sub>c</sub>F<sub>u</sub>/γ<sub>n</sub> (ДБН В.2.1-10, ф. 8.4; F<sub>u</sub> — EN 1997-1, дод. D)', esc(ul.cb.name), `F = ${kN(ul.chk.bear.V)} кН`, `γ<sub>c</sub>F<sub>u</sub>/γ<sub>n</sub> = ${kN(ul.chk.bear.gC * ul.chk.bear.Fu / ul.chk.bear.gn)} кН`, U(ul.chk.bear.u)], ['Зсув по підошві (ф. 8.7)', esc(ul.cb.name), `${kN(ul.chk.bear.H)} кН`, `γ<sub>c</sub>V·tgφ<sub>I</sub>/γ<sub>n</sub> = ${kN(ul.chk.bear.gC * ul.chk.bear.Fsr / ul.chk.bear.gn)} кН`, U(ul.chk.bear.uSlide)]] : []),
      ['Продавлювання', 'ULS', `v<sub>Ed</sub> = ${MPa(F.reinf.vEd)} МПа`, `v<sub>Rd,c</sub> = ${MPa(F.reinf.vRdc)} МПа`, U(F.reinf.punching)],
    ]));
    P(`Тиск під жорсткою плитою визначено з урахуванням можливого відриву (ґрунт не сприймає розтяг). Для повного контакту це збігається з формулою q = N/(BL) ± M<sub>x</sub>y/I<sub>x</sub> ± M<sub>y</sub>x/I<sub>y</sub>: q<sub>max,лін</sub> = ${f(sl.chk.p.qmaxLin / 1000, 1)} кПа, q<sub>min,лін</sub> = ${f(sl.chk.p.qminLin / 1000, 1)} кПа.`);
    P(`Осідання (пошарове підсумовування): s = ${f(F.settle.s * 1000, 1)} мм ≤ ${f(fd.sLim * 1000, 0)} мм; крен i = ${F.settle.tilt.toExponential(2)} ≤ ${fd.tiltLim}; стислива товща ${f(F.settle.Hc, 2)} м.`);

    // 9 шви
    H(2, '9. Зварні шви');
    const Wd = (R.welds || []).slice().sort((a, b) => b.u - a.u);
    P(`Кутові шви по контуру труб у всіх ${Wd.length} приєднаннях каркаса перевірено в куті контуру (найнебезпечніша точка) методом напрямків EN 1993-1-8 і за ДБН В.2.6-198 (по металу шва та межі сплавлення). Катети призначено в межах k<sub>f,min</sub> (табл. 38 ДБН) … 1,2·t<sub>min</sub>. Зварювальні матеріали: ${esc(pr.design.electrode)}.`);
    s.push(tbl(['Шов', 'Елемент / вузол', 'Переріз', 'k_f, мм', 'F_w,Ed, кН/м', 'U', 'Сполучення'], Wd.slice(0, 12).map(w => [w.id, `${w.elem} / ${w.node}`, w.sec, f(w.kf * 1000, 1), f(w.q / 1000, 2), U(w.u), esc(w.combo.split(':')[0])])));
    // 10 база: ребра, шайби, жорсткість
    H(2, '10. Опорна плита: ребра, анкерні плити, жорсткість бази');
    const gb = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
    if (gb && gb.best.b) {
      const b = gb.best.b;
      if (b.ribs) P(`Ребра жорсткості ${pr.base.nRibs} шт. ${pr.base.hr}×${pr.base.tr} мм: F = ${kN(b.ribs.F)} кН, M = ${kNm(b.ribs.M)} кН·м; міцність ${U(b.ribs.strength)}, місцева стійкість h/t ≤ 14ε ${U(b.ribs.local)}, шви ребро–стійка ${U(b.ribs.weldV)}, ребро–плита ${U(b.ribs.weldH)}.`);
      else P('Ребра жорсткості не встановлюються: товщина плити забезпечує згин у зоні стиску й над анкерами.');
      P(`Анкерні плити (шайби) Ø${pr.base.dh}×${pr.base.tw || 10} мм: σ = N/A<sub>brg</sub> = ${MPa(b.washer.sig)} МПа (${U(b.washer.bearing)}), згин ${U(b.washer.bend)}. Тип кріплення: ${b.type}.`);
      P(`Дотична жорсткість бази S<sub>j</sub> = ${f(b.stiff.kx / 1e3, 0)} / ${f(b.stiff.ky / 1e3, 0)} кН·м/рад → база <b>${gb.best.cls}</b> (S<sub>j</sub>·L<sub>c</sub>/(EI<sub>c</sub>) = ${f(gb.best.ratio, 1)}). ${pr.base.flex === 'iter' ? `Податливість бази враховано в моделі каркаса ітераційно (${(R.flexLog || []).length} ітер.).` : 'База прийнята абсолютно жорсткою.'}`);
      s.push(tbl(['Анкер', 'x; y, мм', 'N_Ed, кН', 'V_Ed, кН'], b.perAnchor.map(a => [a.i, `${f(a.x * 1000, 0)}; ${f(a.y * 1000, 0)}`, kN(a.N), kN(a.V)])));
    }
    // 11 армування
    H(2, '11. Армування фундаменту');
    const slb = F.slab;
    s.push(tbl(['Позиція', 'M_Ed, кН·м/м', 'A_s,req, мм²/м', 'Прийнято'], [
      ['Низ уздовж X', kNm(slb.bx.M), f(slb.bx.Areq * 1e6, 0), `Ø${slb.bx.pick.dia}/${slb.bx.pick.s}`],
      ['Низ уздовж Y', kNm(slb.by.M), f(slb.by.Areq * 1e6, 0), `Ø${slb.by.pick.dia}/${slb.by.pick.s}`],
      ['Верх X / Y', `${kNm(slb.tx.M)} / ${kNm(slb.ty.M)}`, f(Math.max(slb.tx.Areq, slb.ty.Areq) * 1e6, 0), `Ø${slb.tx.pick.dia}/${slb.tx.pick.s}`],
    ]));
    P(`Поперечна сила ${U(Math.max(slb.shearX, slb.shearY))}; продавлювання ${U(slb.punching)}; тріщини (σ<sub>s</sub> = ${f(slb.sigS, 0)} МПа, φ*<sub>s</sub> ≤ ${slb.phiMax} мм) ${U(slb.crack)}; l<sub>bd</sub> = ${f(slb.lb.lbd, 0)} мм. Підколонник: ${F.ped.n} Ø${F.ped.dia}, хомути Ø${F.ped.hoop.dia}/${f(F.ped.hoop.s, 0)}.`);
    s.push(tbl(['Поз.', 'Найменування', 'Ø', 'Довжина, м', 'К-сть', 'Маса, кг'], F.rebar.rows.map(r => [r.pos, r.name, r.dia, f(r.len, 2), r.cnt, f(r.mass, 1)])));
    // 12 оболонка
    H(2, '12. Оболонка та допоміжний каркас');
    s.push(tbl(['Частина', 't, мм', 'Крок ребер, мм', 'σ, МПа', 'w, мм', 'Ребро', 'U'], (R.shellRes || []).map(x => [esc(x.part), f(x.t * 1000, 1), f(x.s * 1000, 0), MPa(x.panel.sig), f(x.panel.w * 1000, 2), `${x.rib.h}×${x.rib.t}`, U(x.u)])));
    // 13
    H(2, '13. Відомість матеріалів');
    s.push(Rp.specTable(R.spec));
    s.push(SC.reports.dimTable(R).replace('<h2>', '<h3>').replace('</h2>', '</h3>'));

    // 10
    H(2, '14. Висновки: що визначило рішення');
    s.push('<ul class="concl">' + Rp.conclusions(R).map(t => `<li>${t}</li>`).join('') + '</ul>');

    // 11
    H(2, '15. Попередження та обмеження застосування');
    s.push('<ul class="warns">' + R.warn.map(w => `<li class="${w.level}"><b>${{ error: 'Критично', warn: 'Попередження', info: 'Інформація' }[w.level]}.</b> ${esc(w.msg)}</li>`).join('') + '</ul>');
    s.push(`<ul class="limits"><li>Розрахунок не замінює авторського нагляду, експертизи та погодження відповідальним інженером-конструктором; статус результату — «${statusText}».</li>
      <li>Аеродинаміка довільної художньої форми — основна невизначеність: C<sub>F</sub> потрібно підтвердити аеродинамічним дослідженням або CFD; до цього результат залишається попереднім.</li>
      <li>Оболонка не включена в роботу каркаса; місцева міцність і стійкість листа, крок допоміжних ребер (D = Et³/(12(1−ν²))) перевіряються окремо.</li>
      <li>Температурні впливи, ожеледь, монтажні стани, втома (вихрове збудження) — потребують окремих перевірок за наявності відповідних умов.</li>
      <li>Сейсмічні навантаження — за ДБН В.1.1-12:2025; формулу S<sub>ik</sub> спектрального методу прийнято за структурою ДБН В.1.2-6 (потребує звірки з чинною редакцією).</li></ul>`);
    if (opt.type === 'approval') {
      H(2, '16. Статус і журнал погоджень');
      s.push(tbl(['Дата', 'Хто', 'Було', 'Стало', 'Причина'], (pr.status.log || []).map(l => [l.t, esc(l.user), esc(l.from), esc(l.to), esc(l.reason)])));
    }
    s.push(`<footer class="rep-sign"><div>Розрахунок виконав: ____________ ${esc(pr.meta.author)}</div><div>Перевірив: ____________</div><div>Час розрахунку: ${f(R.time / 1000, 1)} с</div></footer>`);
    return s.join('\n');
  };

  /** Оцінковий звіт: стисло — для порівняння варіантів і замовника. */
  Rp.evalReport = function (R) {
    const pr = R.pr, sp = R.spec;
    const gm = R.govMember, gs = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
    return `<header class="rep-head"><div class="eyebrow">Оцінковий звіт · попередній аналіз</div><h1>${esc(pr.meta.name)}</h1><div class="rep-meta"><span>${esc(pr.meta.location)}</span><span>${esc(pr.meta.date)}</span></div></header>
      <h2>Ключові результати</h2>` + tbl(['Показник', 'Значення'], [
      ['Схема каркаса', `${{ single: 'одна стійка', core3: 'тригранне ядро', core4: 'чотиригранне ядро' }[pr.frame.type]}; стійки ${pr.frame.secPost}`],
      ['Max U каркаса', U(gm.best.u) + ' — ' + esc(gm.e.group)],
      ['Max U опорного вузла', U(gs.best.u)],
      ['Фундамент', `${f(pr.found.B, 1)}×${f(pr.found.L, 1)}×${f(pr.found.h, 2)} м; p_max = ${f(R.found.govSls.chk.p.pmax / 1000, 1)} кПа; s = ${f(R.found.settle.s * 1000, 1)} мм`],
      ['Маса металу', `${f(sp.tubeMass + sp.sheetMass + sp.ribMass, 0)} кг`],
      ['Бетон / арматура', `${f(sp.Vc, 2)} м³ / ${f(sp.rebarMass, 0)} кг`],
      ['Вартість матеріалів', `${f(sp.total, 0)} грн`],
    ]) + '<h2>Висновки</h2><ul class="concl">' + Rp.conclusions(R).map(t => `<li>${t}</li>`).join('') + '</ul><h2>Обмеження</h2><ul class="warns">' + R.warn.map(w => `<li class="${w.level}">${esc(w.msg)}</li>`).join('') + '</ul>';
  };

  /** Кошторис: групування позицій специфікації за розділами. */
  Rp.estimate = function (R) {
    const sp = R.spec, pz = R.pr.prices || {};
    const cats = new Map(); sp.rows.forEach(r => cats.set(r.cat, (cats.get(r.cat) || 0) + r.cost));
    const rows = [...cats].map(([k, v]) => [k, f(v, 0)]);
    rows.push(['Виготовлення', f(pz.fabrication || 0, 0)], ['Транспорт', f(pz.transport || 0, 0)], ['Монтаж', f(pz.install || 0, 0)], ['<b>Разом</b>', `<b>${f(sp.total, 0)}</b>`]);
    return `<header class="rep-head"><div class="eyebrow">Кошторис (за цінами користувача)</div><h1>${esc(R.pr.meta.name)}</h1></header>` + tbl(['Розділ', 'Вартість, грн'], rows) + Rp.specTable(sp);
  };

  Rp.specTable = function (sp) {
    const rows = sp.rows.map(r => [r.cat, esc(r.item), esc(r.mark), r.unit, f(r.net, 2), f(r.buy, 2), f(r.massNet, 1), f(r.massBuy, 1), f(r.cost, 0), esc(r.note)]);
    const m = sp.rows.reduce((a, r) => a + (r.unit !== 'м³' ? r.massBuy : 0), 0);
    return tbl(['Розділ', 'Позиція', 'Марка', 'Од.', 'Кількість чиста', 'Закупівля', 'Маса чиста, кг', 'Маса закуп., кг', 'Вартість, грн', 'Примітка'], rows, 'spec') +
      `<p class="note">Сталь (каркас): ${f(sp.tubeMass, 1)} кг; оболонка: ${f(sp.sheetMass, 1)} кг; пластини: ${f(sp.plateMass, 1)} кг; анкери: ${f(sp.anchorMass, 1)} кг; бетон: ${f(sp.Vc, 2)} м³. Металу до закупівлі (без бетону): ${f(m, 0)} кг. Орієнтовна вартість матеріалів: <b>${f(sp.total, 0)} грн</b> (ціни — у вкладці «Специфікація»). Відходи враховано один раз на позицію.</p>`;
  };

  Rp.conclusions = function (R) {
    const out = [], pr = R.pr;
    const Wmax = Math.max(...R.cases.W.map(W => W.info.parts.reduce((a, p) => a + p.F, 0))) * R.clim.gfmW;
    const Wth = R.cases.W.reduce((m, W) => { const F = W.info.parts.reduce((a, p) => a + p.F, 0); return F > m.F ? { F, th: W.theta } : m; }, { F: -1, th: 0 }).th;
    const G = (R.cases.G.info.frameMass + R.cases.G.info.shellMass) * 9.81;
    out.push(`Повна вага конструкції без фундаменту ${kN(G)} кН; найбільша сумарна розрахункова сила вітру ${kN(Wmax)} кН (θ = ${Wth}°) — ${f(Wmax / G * 100, 0)} % від ваги.`);
    if (R.seis) { const V = R.seis.kFix * Math.max(...R.seis.res.filter(r => r.dir !== 'Z').map(r => Math.sqrt(r.modes.reduce((a, m) => a + m.base * m.base, 0)))); out.push(`Сейсмічна поперечна сила ${kN(V)} кН — ${V > Wmax ? 'перевищує' : 'менша за'} вітрову; тому ${V > Wmax ? 'для низки елементів визначальним є особливе сполучення з сейсмікою' : 'сейсміка не є визначальною для загальної стійкості, але перевіряє вузли консолей'}.`); }
    const groups = new Map(); R.memberRes.forEach(m => { const g = groups.get(m.e.group); if (!g || m.best.u > g.best.u) groups.set(m.e.group, m); });
    for (const m of groups.values()) {
      const why = m.best.u < 0.35 ? 'переріз визначено конструктивними обмеженнями (мінімальна товщина стінки для зварювання і корозійний запас), а не міцністю — можливий підбір легшого перерізу' : m.best.u > 1 ? 'переріз недостатній' : 'переріз використано раціонально';
      const k = m.best.chk; const mode = k.en.stability >= Math.max(k.en.strength, k.en.shear) && k.en.stability > 0 ? 'стійкість при стиску зі згином' : k.en.shear > k.en.strength ? 'зсув/кручення' : 'міцність при згині';
      out.push(`${esc(m.e.group)} (${m.e.sec.name}): U = ${f(m.best.u, 2)}, визначає ${actionOf(m.best.combo)}, механізм — ${mode}; ${why}.`);
    }
    if (R.T1 <= 0.25) out.push(`Перший період T₁ = ${f(R.T1, 3)} с ≤ 0,25 с: споруда жорстка, динамічна складова вітру мала (C<sub>d</sub> = 1, табл. 9.01).`);
    else out.push(`Перший період T₁ = ${f(R.T1, 3)} с > 0,25 с: застосовано табл. 9.02, потрібна перевірка C<sub>d</sub> і вихрового збудження.`);
    const gs = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
    if (gs && gs.best.b) out.push(`Опорний вузол: U = ${f(gs.best.u, 2)}; ${gs.best.b.Tmax > 0 ? `анкери розтягнуті (${kN(gs.best.b.Tmax)} кН) при ${actionOf(gs.best.combo)}` : 'анкери не розтягуються — момент повністю врівноважується стиском, анкери призначено конструктивно та для сприйняття зсуву'}.`);
    const F = R.found;
    out.push(`Фундамент: визначає ${F.govSls.chk.max >= F.govUls.chk.max ? 'тиск під підошвою (' + esc(F.govSls.cb.name) + ')' : 'стійкість проти перекидання/зсуву (' + esc(F.govUls.cb.name) + ')'}; розміри підошви доцільно підбирати ітераційно за цими двома умовами, а не за висотою скульптури.`);
    if (R.status === 'preliminary') out.push('Результат є попереднім: потрібне підтвердження аеродинамічних коефіцієнтів і табличних нормативних значень зі статусом «звірити».');
    return out;
  };

  /** Аналіз ТЗ: виявлені проблеми, ризики та як їх закрито в застосунку. */
  Rp.tzAnalysis = function () {
    const items = [
      ['Нормативна база', 'ТЗ посилається на ДБН В.1.2-2 «за погодженою редакцією», але не фіксує таблиць γ<sub>fm</sub>, C<sub>h</sub>, ψ, γ<sub>n</sub>.', 'Додано таблиці 8.1, 9.1, 9.01, 9.02 зі статусами «звірено/звірити», джерелом і можливістю редагування; кожне значення друкується у звіті з пунктом норми.'],
      ['Сейсміка', 'В інтерфейсі ТЗ (UI-6.1) сейсміка позначена «не підтримується», хоча для частини території України (6–9 балів) вона обов\'язкова. Крім того, ДБН В.1.1-12:2014 з 01.07.2026 замінено новою редакцією.', 'Реалізовано спектральний метод з модальним аналізом (SRSS, η за формами, вертикальна складова для консолей). Коефіцієнти k₁, k₂, k<sub>гр</sub>, k<sub>ψ</sub>, β(T) редагуються і позначені «звірити».'],
      ['Вибір таблиці C<sub>h</sub>', 'ТЗ правильно вимагає не приймати приховано T ≤ 0,25 с, але не описує, звідки береться період.', 'Період T₁ визначається модальним аналізом МСЕ перед формуванням вітрового навантаження; таблиця 9.01/9.02 і C<sub>d</sub> обираються автоматично, при T₁ > 0,25 с потрібне підтвердження C<sub>d</sub>.'],
      ['Площа квадратної труби', 'Формули A = b² − (b−2t)², I = (b⁴ − (b−2t)⁴)/12 не враховують радіусів кутів: A завищується на 2–4 %, I — на 4–6 % (не в запас).', 'Характеристики обчислюються за EN 10219-2 з r<sub>o</sub> = 2t…3t, включно з I<sub>t</sub> і W<sub>t</sub> для кручення; формула ТЗ залишена довідково.'],
      ['Стійкість', 'ТЗ наводить лише N<sub>cr</sub> Ейлера і структуру N<sub>b,Rd</sub> = χAf<sub>y</sub>/γ<sub>M1</sub>; немає правила для розрахункових довжин консольних стійок і взаємодії N–M.', 'Реалізовано: φ ДБН (λ̄), χ EN (криві a/c), формули (6.61)/(6.62) з k<sub>ij</sub>, клас перерізу та ефективна площа класу 4, розрахунок 2-го порядку з недосконалостями φ, α<sub>cr</sub> системи; метод A (2-й порядок) або B (μ = 2 для консолей).'],
      ['Сполучення', 'Не задано коефіцієнтів сполучень ψ і правил для сприятливої дії постійного навантаження.', 'Сполучення: G+S, G+W(θ), G+ψ(S+W(θ)), 0,9G+W(θ) (відрив/перекидання), особливе з сейсмікою; SLS — характеристичні.'],
      ['Вітер: подвійне врахування', 'ТЗ коректно попереджає про повторне врахування C<sub>aer</sub> і C<sub>d</sub>; у прикладі (п. 9) всі C<sub>F</sub> однакові.', 'q<sub>m,j</sub> рахується без аеродинамічного коефіцієнта; C<sub>F</sub> задається на частину з ознакою підтвердження. Без підтвердження статус — «попередній».'],
      ['Площі проєкцій', 'Потрібне об\'єднання проєкцій без подвійного врахування, але не задано алгоритм.', 'Для 3D-моделі (STL/OBJ) площа об\'єднання проєкцій A(θ) і горизонтальна проєкція A<sub>h</sub> рахуються растеризацією; для ручного введення — A(θ) = A<sub>x</sub>|cos θ| + A<sub>y</sub>|sin θ| (позначено як наближення).'],
      ['Передавання тиску на каркас', 'Вимога ΣF<sub>surface</sub> = ΣF<sub>frame</sub>, ΣM — без способу реалізації.', 'Сили частин розподіляються на вузли ядра методом RBE3 (мінімум Σ|f|² при збереженні ΣF і ΣM); рівновага моделі контролюється в кожному сполученні.'],
      ['Анкери', 'ТЗ вимагає одностороннього контакту і всіх механізмів EN 1992-4, але не задає жорсткостей контакту.', 'Жорстка пластина на односторонніх пружинах у ефективній зоні c (EN 1993-1-8, 6.2.5), анкери — лише розтяг; перевірки: сталь, конус, вирив, крайове сколювання, pry-out, взаємодія N–V, Т-ділянка пластини, шов.'],
      ['Фундамент', 'Формула q = N/(BL) ± M·y/I непридатна при відриві — ТЗ це зазначає, але не дає альтернативи; тиск ґрунту — перевірка II групи (характеристичні навантаження).', 'Тиск рахується з відривом (ітераційно), окремо SLS (тиск ≤ R, 1,2R, частка контакту) і ULS (перекидання, зсув, продавлювання, армування).'],
      ['Одиниці', 'Вимога SI правильна.', 'Ядро працює в Н, м, Па; інтерфейс показує мм, кН, кПа, МПа з явними позначеннями.'],
      ['Відсутні впливи', 'Не згадано ожеледь (ДБН В.1.2-2, р. 10), температуру для статично невизначеного ядра, вихрове збудження легких консольних скульптур.', 'Перевірка вихрового збудження (v<sub>crit</sub> = b/(T·St)) додана як попередження; ожеледь і температура — у переліку обмежень звіту.'],
      ['Машинний зір', 'Модуль машинного зору (сегментація, OCR, фотограмметрія) зазвичай потребує важких моделей, GPU або платних API.', 'Реалізовано в браузері без API: виділення скульптури за кольором фону (k-середніх у Lab + заливка від країв + морфологія), пензель/паличка/багатокутник, дерево частин з ідентифікаторами (ліва й права руки окремо), видимість частин на ракурсах, розмірні лінії з обов\'язковим підтвердженням і контролем ε, точка основи, 3D з фронтальної й бокової проєкцій (еліптичні перерізи), IoU силуету, чек-лист «людина в контурі». OCR (Tesseract) підвантажується лише за наявності мережі. Фотограмметрія SfM/MVS — окремий етап.'],
      ['Зварні шви', 'Розділ WLD вимагає розрахунку всіх швів у критичній точці, контролю катетів і ефективних довжин.', 'Шви по контуру труб у кожному вузлі каркаса, шов стійка–плита, шви ребер і зсувного упору: компоненти q від N, M, V, T, перевірка в куті контуру за ДБН і EN 1993-1-8, автопідбір катета в межах k_f,min…1,2t.'],
      ['Ребра, траверси, анкерні плити, закладні деталі', 'ТЗ вимагає окремих перевірок ребер, шайб/анкерних плит і податливості бази, але не дає моделі.', 'Ребра (4/8): міцність T-перерізу з ділянкою плити, місцева стійкість, шви; анкерні плити: A_brg = π/4(d_w² − d²), тиск, згин; закладна деталь зі шпильками; жорсткість бази S_j з моделі контакту → класифікація й ітераційне врахування в каркасі.'],
      ['Фундамент і армування', 'Потрібні шари ґрунту, ґрунтові води, осідання, крен, тріщини, анкерування, відомість арматури.', 'Шари ґрунту з РГВ, осідання пошаровим підсумовуванням (α — точний розв\'язок Буссінеска), крен, армування низу/верху в двох напрямках, поперечна сила, продавлювання, тріщини (табл. 7.2N), l_bd, підколонник, додаткове армування анкерів, відомість деталей арматури, підбір розмірів плити.'],
      ['Статуси, журнал, експорт', 'UI-9, UI-10: статуси з блокуванням, журнал змін, типи експорту з обмеженнями.', 'Реалізовано: 8 статусів ТЗ, блокування «Погоджено конструктором», автоматичний перехід у «Застарілий», журнал змін, скасування/повторення, типи звітів (оцінковий, розрахунковий, комплект для погодження з блокуванням), креслення SVG і DXF.'],
    ];
    return '<div class="tz">' + items.map(([t, p, s]) => `<article><h3>${t}</h3><p class="prob"><span>Проблема</span>${p}</p><p class="fix"><span>Рішення</span>${s}</p></article>`).join('') + '</div>';
  };

  SC.report = Rp;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
