/* Розділ «Навантаження»: реєстр впливів (UI-6.1), вітер, аеродинаміка, сніг, ожеледь, температура, сейсміка,
 * монтаж і обслуговування, сполучення (ведучі й супутні впливи, UI-6.3). */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};

  P.registry = {
    render(c) {
      const { state, card, fmt, esc, f } = c;
      const pr = state.pr, R = state.R && state.R.ok ? state.R : null;
      const rows = [
        ['Власна вага', c.pill('автоматично', 'ok'), 'Геометрія, перерізи, оболонка, ребра, обладнання', R ? `${f((R.cases.G.info.frameMass + R.cases.G.info.shellMass) * 9.81 / 1000, 2)} кН` : '—', 'parts'],
        ['Вітер', pr.site.aero.confirmed ? c.pill('погоджено', 'ok') : c.pill('потребує аеродинаміки', 'warn'), 'ДБН В.1.2-2 р. 9 + C_F частин', R ? `max ΣF ${f(Math.max(...R.cases.W.map(W => W.info.parts.reduce((a, p) => a + p.F, 0))) * R.clim.gfmW / 1000, 2)} кН` : '—', 'wind'],
        ['Сніг', c.pill('автоматично', 'ok'), 'ДБН р. 8, зони накопичення A_h·μ', R ? `${f(R.cases.S.info.total / 1000, 2)} кН (характ.)` : '—', 'snow'],
        ['Ожеледь', pr.site.ice.on ? c.pill(pr.site.ice.mode === 'manual' ? 'ручне введення' : 'Додаток Е', pr.site.ice.mode === 'manual' ? 'warn' : 'ok') : c.pill('вимкнено'), 'ДБН р. 10: b, k(z), W_B, γ табл. 10.4–10.5', R && R.cases.I ? `${f(R.cases.I.info.total / 1000, 2)} кН` : '—', 'ice'],
        ['Температура', pr.site.temp.on ? c.pill(pr.site.temp.mode === 'manual' ? 'ручне введення' : 'за ДБН р. 11', pr.site.temp.mode === 'manual' ? 'warn' : 'ok') : c.pill('вимкнено'), 'ДБН р. 11: Δt_w, Δt_c за табл. 11.1–11.5', (() => { const tc = pr.site.temp.mode === 'manual' ? { dTw: pr.site.temp.dTplus, dTc: pr.site.temp.dTminus } : c.N.tempClimate(pr.site.temp); return `Δt = +${f(tc.dTw, 1)} / ${f(tc.dTc, 1)} °C`; })(), 'temp'],
        ['Сейсміка', pr.site.seismic.on ? c.pill('модуль увімкнено', 'ok') : c.pill('вимкнено'), 'ДБН В.1.1-12 (спектральний метод)', `${pr.site.seismic.intensity} балів`, 'seismic'],
        ['Обслуговування', (pr.loadsUser || []).some(u => u.kind === 'service') ? c.pill('ручне введення', 'warn') : c.pill('немає'), 'Користувач / експлуатант', `${(pr.loadsUser || []).filter(u => u.kind === 'service').length} шт.`, 'userLoads'],
        ['Монтаж', (pr.loadsUser || []).some(u => u.kind === 'erection') ? c.pill('ручне введення', 'warn') : c.pill('немає'), 'Виробник: схема монтажу, стропування', `${(pr.loadsUser || []).filter(u => u.kind === 'erection').length} шт.`, 'userLoads'],
        ['Аварійні впливи', (pr.loadsUser || []).some(u => u.kind === 'accidental') ? c.pill('ручне введення', 'warn') : c.pill('не задано'), 'Удар, вандалізм — за завданням', `${(pr.loadsUser || []).filter(u => u.kind === 'accidental').length} шт.`, 'userLoads'],
        ['Нерівномірне нагрівання', c.pill('зовнішнє дослідження', 'warn'), 'Сонячна експозиція оболонки', '—', 'temp'],
        ['Накопичення води', pr.site.env.drainage ? c.pill('дренаж є', 'ok') : c.pill('перевірити', 'warn'), 'Геометрія, отвори, дренаж', '—', 'site'],
        ['Доступ людей, лазіння', c.pill('не підтримується', 'bad'), 'Потрібен окремий розрахунок (ТЗ 2.1.5)', '—', 'userLoads'],
      ];
      return `<h2>Реєстр впливів</h2>
      <p class="lead">Для кожного впливу показано, чи він визначається автоматично, вводиться вручну, потребує зовнішнього дослідження чи не підтримується (ТЗ UI-6.1, 2.4.2).</p>
      ${c.staleBanner()}
      ${card('Впливи', fmt.tbl(['Вплив', 'Статус', 'Джерело', 'Величина', 'Дія'], rows.map(r => [r[0], r[1], esc(r[2]), r[3], `<button class="btn small" data-tab="${r[4]}">Відкрити</button>`])))}`;
    },
  };

  P.wind = {
    input: true,
    render(c) {
      const { state, fld, card, f, N, fmt } = c;
      const s = state.pr.site;
      const cl = SC.loads.climate(state.pr, state.R && state.R.ok ? state.R.T1 : null);
      const chRows = [1, 2, 3, 5, 7.5, 10, 15, 20, 30, 40, 60].map(z => { const a = N.Ch(z, s.terrain, 0.1), b = N.Ch(z, s.terrain, 1); return [f(z, 1), f(a.value, 3), f(b.value, 3), f(cl.q0 * a.value, 0), f(cl.q0 * b.value, 0)]; });
      return `<h2>Вітрове навантаження</h2>
      <p class="lead">W<sub>m</sub> = γ<sub>fm</sub>·W₀·C<sub>aer</sub>·C<sub>h</sub>·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub> (ДБН В.1.2-2:2006, р. 9, Зміна № 1). Для кожної частини — своя висота z = h<sub>пост</sub> + z<sub>лок</sub>; напрямки вітру θ перебираються з кроком ${state.pr.design.dirStep}°.</p>
      <div class="cols">
      ${card('Характеристичний тиск W₀', `<div class="form">
        ${fld('site.windMode', 'Спосіб визначення', '', { options: [['city', 'За містом (Додаток Е)'], ['district', 'За вітровим районом (рис. 9.1)'], ['value', 'Задати значення / метеостанція']], rerender: true })}
        ${s.windMode === 'city' ? fld('site.city', 'Місто', '', { options: N.cities.map(x => [x.name, `${x.name}${x.dbn ? ' (' + x.dbn + ')' : ''} — ${x.W0} Па`]), rerender: true }) : ''}
        ${s.windMode === 'district' ? fld('site.windDistrict', 'Вітровий район', '', { options: N.windDistricts.map(d => [d.id, `${d.id} — ${d.W0} Па`]), rerender: true }) : ''}
        ${fld('site.W0', 'W₀', 'Па', { hint: '10 м, повторюваність 1 раз на 50 років' })}
        ${fld('site.w0Station', 'W₀ — статистика метеостанції (тоді C_alt = 1)', '', { type: 'check' })}
      </div><p class="note">${N.windDistrictsMeta.src} ${c.normPill(N.windDistrictsMeta.status)}. ${N.windDistrictsMeta.note}</p>
      ${fmt.tbl(['Район', 'W₀, Па'], N.windDistricts.map(d => [d.id, d.W0]))}`)}
      ${card('Коефіцієнти майданчика', `<div class="form">
        ${fld('site.terrain', 'Тип місцевості', '', { options: N.terrainTypes.map(t => [t.id, t.name]), rerender: true })}
        ${fld('site.Hsea', 'Висота над рівнем моря H', 'км', { step: 0.01, hint: 'C_alt = 2H при H > 0,5 км' })}
        ${fld('site.Crel', 'C_rel — рельєф (пагорб, схил)', '', { step: 0.01 })}
        ${fld('site.Cdir', 'C_dir — напрямок', '', { step: 0.01 })}
        ${fld('site.Cd', 'C_d — динамічність (якщо T₁ > 0,25 с)', '', { step: 0.01 })}
        ${fld('site.CdConfirmed', 'C_d підтверджено за графіками Зміни № 1', '', { type: 'check' })}
        ${fld('design.dirStep', 'Крок напрямків вітру', '°', { options: [[10, '10°'], [15, '15°'], [30, '30°'], [45, '45°']], num: true })}
      </div>
      <p class="note">γ<sub>fm</sub>(T = ${s.Tlife}) = ${f(cl.gfmW, 3)} ${c.normPill(N.windGammaFm.status)}; C<sub>alt</sub> = ${f(cl.CaltW, 2)}; q₀ = γ<sub>fm</sub>·W₀·C<sub>alt</sub>·C<sub>rel</sub>·C<sub>dir</sub>·C<sub>d</sub> = <b>${f(cl.q0, 1)} Па</b>${state.R && state.R.ok ? `; T₁ = ${f(state.R.T1, 3)} с → табл. ${state.R.clim.ChTable}` : ''}.</p>`)}
      </div>
      ${card(`C<sub>h</sub>(z) для типу ${s.terrain} і розрахунковий тиск без C<sub>F</sub>`, fmt.tbl(['z, м', 'C_h (9.01, T ≤ 0,25 с)', 'C_h (9.02, T > 0,25 с)', 'q_m, Па (9.01)', 'q_m, Па (9.02)'], chRows), 'лінійна інтерполяція; нижче 5 м — як для 5 м')}`;
    },
  };

  P.aero = {
    input: true,
    render(c) {
      const { state, fld, card, esc, f } = c;
      const parts = state.pr.parts;
      return `<h2>Аеродинамічні дані</h2>
      <p class="lead">Аеродинаміка художньої форми — головна невизначеність розрахунку. Підтримуються два взаємовиключні способи (ТЗ 5.1): результуючі сили за коефіцієнтами C<sub>F</sub> частин (реалізовано) і поле тиску по поверхні (потребує зовнішнього дослідження). Коефіцієнти не можна отримувати з мовного опису ШІ.</p>
      ${card('Спосіб і статус', `<div class="form">
        ${fld('site.aero.mode', 'Спосіб задання', '', { options: [['forces', 'Результуючі сили (C_F частин)'], ['pressure', 'Поле тиску (зовнішній звіт CFD/продувки)']], rerender: true })}
        ${fld('site.aero.source', 'Джерело даних', '', { type: 'text' })}
        ${fld('site.aero.confirmed', 'Дані погоджені (продування / CFD / погоджена методика)', '', { type: 'check', hint: 'без цього результат має статус «попередній»' })}
      </div>${state.pr.site.aero.mode === 'pressure' ? '<ul class="warns"><li class="warn">Поле тиску по поверхні потребує оболонкової моделі й даних c_pe/c_pi для кожної грані; у цій версії розрахунок виконується за результуючими силами, а дані звіту вводяться як таблиці C_F(θ) частин нижче.</li></ul>' : ''}`)}
      ${card('Таблиці C_F(θ) зі звіту', `<p class="note">Вставте для частини рядки «кут; C_F» (наприклад, з протоколу продувки). Порожньо — використовується постійний C_F із таблиці частин.</p>
        ${parts.map((p, i) => `<div class="fld"><label for="cft${i}">${esc(p.name)} (постійний C_F = ${f(p.Cf, 2)})</label><textarea id="cft${i}" data-cftable="${i}" rows="3" placeholder="0;1.25&#10;45;1.10&#10;90;1.30">${(p.cfTable || []).map(r => `${r.theta};${r.Cf}`).join('\n')}</textarea></div>`).join('')}`)}
      ${card('Сценарій без обґрунтованих даних (ТЗ UI-6.5)', '<ol class="steps"><li>Попередня оцінка з C_F за аналогами (поточний режим) — статус «попередній».</li><li>Підготовка запиту на дослідження: частини, напрямки, швидкості, точки тиску.</li><li>Зупинка до надання даних, якщо потрібне погодження.</li></ol>')}`;
    },
    onChange(e, c) {
      const t = e.target; if (t.dataset.cftable == null) return false;
      const p = c.state.pr.parts[+t.dataset.cftable];
      const rows = t.value.split(/\n+/).map(l => l.split(/[;,\t ]+/).map(x => parseFloat(x.replace(',', '.')))).filter(r => r.length >= 2 && isFinite(r[0]) && isFinite(r[1])).map(r => ({ theta: ((r[0] % 360) + 360) % 360, Cf: r[1] }));
      p.cfTable = rows.length ? rows : undefined;
      c.changed(`C_F(θ) «${p.name}»`, '', rows.length + ' точок');
      return true;
    },
  };

  P.snow = {
    input: true,
    render(c) {
      const { state, fld, card, f, N, fmt } = c;
      const s = state.pr.site, cl = SC.loads.climate(state.pr, null);
      return `<h2>Снігове навантаження</h2>
      <p class="lead">S<sub>m</sub> = γ<sub>fm</sub>·S₀·C, C = μ·C<sub>e</sub>·C<sub>alt</sub> (ДБН В.1.2-2:2006, р. 8). F<sub>s,j</sub> = S<sub>m</sub>·μ<sub>j</sub>·A<sub>h,j</sub> — на горизонтальну проєкцію зони накопичення кожної частини, вертикально вниз.</p>
      <div class="cols">${card('S₀', `<div class="form">
        ${fld('site.snowMode', 'Спосіб визначення', '', { options: [['city', 'За містом (Додаток Е)'], ['district', 'За сніговим районом (рис. 8.1)'], ['value', 'Задати значення']], rerender: true })}
        ${s.snowMode === 'city' ? fld('site.city', 'Місто', '', { options: N.cities.map(x => [x.name, `${x.name}${x.dbn ? ' (' + x.dbn + ')' : ''} — ${x.S0} Па`]), rerender: true }) : ''}
        ${s.snowMode === 'district' ? fld('site.snowDistrict', 'Сніговий район', '', { options: N.snowDistricts.map(d => [d.id, `${d.id} — ${d.S0} Па`]), rerender: true }) : ''}
        ${fld('site.S0', 'S₀', 'Па')}
      </div>${fmt.tbl(['Район', 'S₀, Па'], N.snowDistricts.map(d => [d.id, d.S0]))}<p class="note">${N.snowDistrictsMeta.src} ${c.normPill(N.snowDistrictsMeta.status)}</p>`)}
      ${card('Коефіцієнти', `<div class="form">
        ${fld('site.Ce', 'C_e — режим експлуатації', '', { step: 0.05, hint: 'без даних — 1,0' })}
      </div><p class="note">C<sub>alt</sub> = 1,4H + 0,3 при H ≥ 0,5 км; 1 при H < 0,5 км (п. 8.10, ф. 8.5); H = ${f(s.Hsea, 3)} км задається в «Майданчику». Для вершин і перевалів Карпат значення орієнтовне — за наявності снігомірних зйомок S₀ визначається статистично, C<sub>alt</sub> = 1.</p><p class="note">γ<sub>fm</sub>(T = ${s.Tlife}) = ${f(cl.gfmS, 3)}; C<sub>alt</sub> = ${f(cl.CaltS, 3)}; S<sub>m</sub>(μ = 1) = <b>${f(cl.Sm1, 0)} Па</b>.</p>
      <p class="note">μ для схилу: 1 при α ≤ 25°, 0 при α ≥ 60°: ${[0, 30, 40, 50, 60].map(a => `${a}° → ${f(N.snowMuSlope(a), 2)}`).join('; ')}. Зони накопичення на складках плаща, книзі, плечах підтверджує інженер (μ і A<sub>h</sub> — у таблиці частин).</p>`)}</div>`;
    },
  };

  P.ice = {
    input: true,
    render(c) {
      const { fld, card, N, state, f, fmt } = c;
      const ice = state.pr.site.ice, T = state.pr.site.Tlife, ct = N.cityByName(state.pr.site.city);
      const gI = N.interp(N.iceGammaFm.T, N.iceGammaFm.g, T), gW = N.interp(N.iceWindGamma.T, N.iceWindGamma.g, T);
      return `<h2>Ожеледь</h2>
      <p class="lead">ДБН В.1.2-2:2006, р. 10. Поверхневе ожеледне навантаження G<sub>e</sub> = b·k·μ₂·ρ·g (10.3), μ₂ = 0,6, ρ = 900 кг/м³; граничне G<sub>m</sub> = γ<sub>fm</sub>·G<sub>e</sub>, γ<sub>fm</sub> — табл. 10.4. Тиск вітру на вкриті ожеледдю елементи — за (9.1), (9.3) з W<sub>B</sub> замість W₀ і C<sub>rel</sub> = C<sub>dir</sub> = C<sub>d</sub> = 1 (п. 10.9), γ<sub>fw</sub> — табл. 10.5. ${c.esc(N.iceMeta.need)}.</p>
      ${card('Параметри', `<div class="form">
        ${fld('site.ice.on', 'Враховувати ожеледь', '', { type: 'check' })}
        ${fld('site.ice.mode', 'Джерело b і W_B', '', { options: [['city', 'За містом (Додаток Е)'], ['manual', 'Задати вручну (карти рис. 10.1, 10.2)']], rerender: true })}
        ${fld('site.ice.b', 'Товщина стінки ожеледі b', 'мм', { step: 1 })}
        ${fld('site.ice.WB', 'Вітровий тиск при ожеледі W_B', 'Па', { step: 10 })}
      </div>
      <p class="note">${ice.mode !== 'manual' && ct ? `За Додатком Е для «${c.esc(ct.name)}»: b = ${ct.b} мм, W<sub>B</sub> = ${ct.WB} Па (підставляються автоматично).` : 'Значення з карт районування.'} γ<sub>fm</sub>(T = ${T}) = <b>${f(gI, 3)}</b> (табл. 10.4); γ<sub>fw</sub> = <b>${f(gW, 3)}</b> (табл. 10.5).</p>
      ${fmt.tbl(['h, м', ...N.iceK.z], [['k (табл. 10.2)', ...N.iceK.k.map(k => f(k, 2))]])}
      ${fmt.tbl(['Район (рис. 10.1)', ...N.iceDistricts.map(d => d.id)], [['b, мм', ...N.iceDistricts.map(d => d.b)]])}
      ${fmt.tbl(['Район (рис. 10.2)', ...N.iceWindDistricts.map(d => d.id)], [['W_B, Па', ...N.iceWindDistricts.map(d => d.WB)]])}
      <p class="note">${N.iceK.src} ${c.normPill(N.iceK.status)}. Для h = 10 м: G<sub>e</sub> = ${f(ice.b / 1000 * 1.0 * 0.6 * 900 * 9.81, 1)} Па, G<sub>m</sub> = ${f(gI * ice.b / 1000 * 0.6 * 900 * 9.81, 1)} Па.</p>`)}`;
    },
  };

  P.temp = {
    input: true,
    render(c) {
      const { fld, card, N, state, f, fmt } = c;
      const t = state.pr.site.temp, tc = N.tempClimate(t);
      return `<h2>Температурні кліматичні впливи</h2>
      <p class="lead">ДБН В.1.2-2:2006, р. 11. Рівномірна зміна температури каркаса задається як початкова деформація стрижнів ε₀ = α·Δt, α = 1,2·10⁻⁵ 1/°C. Для статично невизначеного ядра із защемленою базою вона викликає зусилля; для консольної стійки — лише переміщення.</p>
      ${card('Параметри', `<div class="form">
        ${fld('site.temp.on', 'Враховувати температуру', '', { type: 'check' })}
        ${fld('site.temp.mode', 'Визначення Δt', '', { options: [['dbn', 'За ДБН (табл. 11.1–11.5)'], ['manual', 'Задати вручну']], rerender: true })}
        ${t.mode !== 'manual' ? fld('site.temp.exposure', 'Каркас', '', { options: [['sun', 'не захищений від сонця (оболонка нагрівається; у запас)'], ['shade', 'захищений від сонця (внутрішній)']], rerender: true }) : ''}
        ${t.mode !== 'manual' && t.exposure !== 'shade' ? fld('site.temp.rho', 'ρ — коеф. поглинання сонячної радіації поверхні', '', { step: 0.05, hint: 'темна бронза, патина, темна фарба 0,7…0,9; світла фарба 0,4…0,5' }) : ''}
        ${t.mode !== 'manual' && t.exposure !== 'shade' ? fld('site.temp.surface', 'Поверхня', '', { options: [['horizontal', 'горизонтальна (S = 890 Вт/м², k = 1,0)'], ['south', 'вертикальна південна (540; 1,0)'], ['west', 'вертикальна західна (780; 0,9)'], ['east', 'вертикальна східна (780; 0,7)']], rerender: true }) : ''}
        ${t.mode === 'manual' ? fld('site.temp.dTplus', 'Δt_w (нагрівання)', '°C', { step: 1 }) + fld('site.temp.dTminus', 'Δt_c (охолодження)', '°C', { step: 1 }) : ''}
        ${fld('site.temp.gf', 'γ_fm (п. 11.8 — 1,1)', '', { step: 0.05 })}
      </div>
      ${t.mode !== 'manual' ? fmt.tbl(['Величина', 'Формула', 'Значення'], [
        ['t_ew; t_ec', 'п. 11.5', `${tc.tew} °C; ${tc.tec} °C`],
        ['θ₁', 'табл. 11.2 (метал)', `${tc.th1} °C`],
        ['θ₄', tc.sun ? `0,05·ρ·S<sub>max</sub>·k·k₁ = 0,05·${f(tc.rho, 2)}·${tc.Smax}·${f(tc.k, 1)}·${f(tc.k1, 1)} (11.3)` : 'захищений — 0', `${f(tc.th4, 1)} °C`],
        ['t_w', tc.sun ? 't_ew + θ₁ + θ₄ (табл. 11.1)' : 't_ew', `${f(tc.tw, 1)} °C`],
        ['t_c', tc.sun ? 't_ec − 0,5θ₁' : 't_ec', `${f(tc.tc, 1)} °C`],
        ['Δt_w', `t_w − t_0c, t_0c = ${tc.t0c} °C (11.1)`, `<b>+${f(tc.dTw, 1)} °C</b>`],
        ['Δt_c', `t_c − t_0w, t_0w = ${tc.t0w} °C (11.2)`, `<b>${f(tc.dTc, 1)} °C</b>`],
      ]) : ''}
      <p class="note">${N.tempMeta.src} ${c.normPill(N.tempMeta.status)}</p>`)}`;
    },
  };

  P.seismic = {
    input: true,
    render(c) {
      const { fld, card, N, f, fmt, state } = c;
      const sz = state.pr.site.seismic, Ts = [0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0];
      const site = N.seismicSite(sz, state.pr.site.cc, 6, 1);
      return `<h2>Сейсмічні впливи</h2>
      <p class="lead">ДБН В.1.1-12:2025 «Будівництво у сейсмічних районах» (чинний з 01.07.2026). Бальність — за переліком населених пунктів (Додаток А, карти ЗСР-2004 А, В, С), поправка на ґрунт — табл. 6.1, a₀ — п. 6.1.5 і табл. 6.2, спектр — табл. 6.3, коефіцієнти — табл. 7.3, 7.4, 7.6, 7.7; перекоси — табл. 7.5.</p>
      <div class="cols">${card('Майданчик', `<div class="form">
        ${fld('site.seismic.on', 'Враховувати сейсміку', '', { type: 'check' })}
        ${fld('site.seismic.place', 'Населений пункт (Додаток А)', '', { options: [['', '— не в переліку (бальність з карт) —']].concat(N.seisPlaces.map(p => [p.name, `${p.name} (${p.obl.replace(' область', ' обл.')}) — ${p.A || '–'}/${p.B || '–'}/${p.C || '–'}${p.note ? ' ' + p.note + ')' : ''}`])), rerender: true })}
        ${fld('site.seismic.A', 'Карта ЗСР-2004-А (10 %)', 'бал', { options: [['', '< 6'], [6, '6'], [7, '7'], [8, '8'], [9, '9']], num: true, rerender: true })}
        ${fld('site.seismic.B', 'Карта ЗСР-2004-В (5 %)', 'бал', { options: [['', '< 6'], [6, '6'], [7, '7'], [8, '8'], [9, '9']], num: true, rerender: true })}
        ${fld('site.seismic.C', 'Карта ЗСР-2004-С (1 %)', 'бал', { options: [['', '< 6'], [6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10']], num: true, rerender: true })}
        ${fld('site.seismic.soil', 'Категорія ґрунту (табл. 6.1)', '', { options: [['I', 'I — скельні, Vs > 800 м/с (−1 бал)'], ['II', 'II — середні, 500…800 м/с'], ['III', 'III — слабкі, 200…500 м/с (+1 бал)'], ['IV', 'IV — пухкі водонасичені, насипні (спец. дослідження)']], rerender: true })}
      </div>`)}
      ${card('Споруда', `<div class="form">
        ${fld('site.seismic.damage', 'γ_pl — допустимі пошкодження (табл. 7.4)', '', { options: Object.entries(N.seismicGammaPl).map(([k, v]) => [k, v.name]), rerender: true })}
        ${fld('site.seismic.cultural', 'Культурна цінність (γI = 1,4, табл. 7.3, р. 2)', '', { type: 'check', rerender: true })}
        ${fld('site.seismic.gammaI', 'γI (табл. 7.3): auto або число', '', { type: 'text', hint: 'auto: 1,4 при H/B ≥ 5 (висотна споруда невеликих у плані розмірів), інакше 1,0' })}
        ${fld('site.seismic.a1core', 'Ядро й база — категорія А1: ULS і при МРЗ (ЕР ІІІ)', '', { type: 'check', rerender: true })}
        ${fld('site.seismic.vertical', 'Вертикальна складова (п. 7.4.18 — консолі, перекидання)', '', { type: 'check' })}
        ${fld('site.seismic.nModes', 'Кількість форм', '', { step: 1, min: 1, max: 40 })}
      </div>`)}</div>
      ${card('Рівні впливу для ' + state.pr.site.cc + ' → ЕГ ' + site.EG + ' (табл. 7.1)', fmt.tbl(['Рівень', 'Джерело', 'Інтенсивність, бал', 'a₀, g', 'ЕР', 'γ_pl', 'Перекіс, ≤'], site.levels.map(L => [L.id, c.esc(L.src), L.I < 6 ? L.I + ' (< 6 — не враховується)' : L.I, f(L.a0, 2), L.ER, f(N.gammaPlOf(site.damage, L.I), 2), N.seismicDrift[L.ER]])) + (site.notes.length ? `<ul class="warns">${site.notes.map(t => `<li class="error">${c.esc(t)}</li>`).join('')}</ul>` : ''))}
      ${card('β(T) — табл. 6.3', fmt.tbl(['T, с', 'ґрунт I', 'ґрунт II', 'ґрунт III'], Ts.map(T => [f(T, 2), f(N.seismicBeta(T, 'I'), 2), f(N.seismicBeta(T, 'II'), 2), f(N.seismicBeta(T, 'III'), 2)])) + `<p class="note">${N.seismicBetaMeta.src}. ${N.seismicBetaMeta.note}</p>`)}`;
    },
  };

  P.userLoads = {
    input: true,
    render(c) {
      const { state, card, esc } = c;
      const L = state.pr.loadsUser || [];
      return `<h2>Монтажні, експлуатаційні та аварійні навантаження</h2>
      <p class="lead">Зосереджені сили в точках (прикладаються до найближчого вузла з урахуванням моменту від зміщення). Обслуговування — змінне (γ = 1,2, супутнє з ψ); монтаж — окрема монтажна ситуація; аварійні — γ = 1,0. Доступ людей усередину/на скульптуру не підтримується (ТЗ 2.1.5).</p>
      ${card('Навантаження', `<div class="tw"><table class="edit"><thead><tr><th>Назва</th><th>Тип</th><th>x, м</th><th>y, м</th><th>z, м</th><th>F_x, кН</th><th>F_y, кН</th><th>F_z, кН</th><th></th></tr></thead><tbody>
        ${L.map((u, i) => `<tr><td><input data-uload="${i}.name" value="${esc(u.name)}" style="min-width:200px"></td>
          <td><select data-uload="${i}.kind">${[['service', 'обслуговування'], ['erection', 'монтаж'], ['accidental', 'аварійне']].map(([k, l]) => `<option value="${k}" ${u.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          ${['x', 'y', 'z', 'Fx', 'Fy', 'Fz'].map(k => `<td><input data-uload="${i}.${k}" type="number" step="any" value="${u[k]}"></td>`).join('')}
          <td><button class="btn small" data-act="delULoad" data-i="${i}" aria-label="Видалити">✕</button></td></tr>`).join('') || '<tr><td colspan="9">Немає.</td></tr>'}
      </tbody></table></div><div class="row"><button class="btn" data-act="addULoad">Додати навантаження</button></div>`)}`;
    },
    onChange(e, c) {
      const t = e.target; if (t.dataset.uload == null) return false;
      const [i, k] = t.dataset.uload.split('.'); const u = c.state.pr.loadsUser[+i];
      const old = u[k]; u[k] = ['name', 'kind'].includes(k) ? t.value : parseFloat(t.value) || 0;
      c.changed(`навантаження «${u.name}».${k}`, old, u[k]); return true;
    },
    onAct(a, b, c) {
      const L = c.state.pr.loadsUser = c.state.pr.loadsUser || [];
      if (a === 'addULoad') { L.push({ name: 'Нове навантаження', kind: 'erection', x: 0, y: 0, z: 3, Fx: 0, Fy: 0, Fz: -1 }); c.changed('навантаження', '', 'додано'); c.render(); return true; }
      if (a === 'delULoad') { L.splice(+b.dataset.i, 1); c.changed('навантаження', '', 'видалено'); c.render(); return true; }
      return false;
    },
  };

  P.combos = {
    render(c) {
      const { state, card, fmt, esc, f } = c;
      if (!state.R || !state.R.ok) return '<h2>Сполучення навантажень</h2>' + c.needCalc();
      const R = state.R;
      const flt = state.ui.comboF || '';
      const list = R.combos.filter(cb => !flt || cb.id.startsWith(flt) || String(cb.theta) === flt);
      const ulsU = id => Math.max(0, ...R.memberRes.map(m => (m.byCombo.find(x => x.id === id) || { u: 0 }).u));
      return `<h2>Сполучення навантажень</h2>
      <p class="lead">Основні сполучення ДБН В.1.2-2: постійне + одне змінне (ведуче) з повним значенням; постійне + кілька змінних за формулою (4.4) ДБН В.1.2-2 (Зміна № 2): основне короткочасне — ψ = 1,0, друге — 0,9, решта — 0,7; перебираються всі варіанти основного й другого впливу. Розрахунок виконується за повними наборами зусиль кожного сполучення — штучних сполучень з незалежних максимумів не створюється (ТЗ 2.1, 4).</p>
      ${c.staleBanner()}
      ${card('Перелік', `<div class="row"><label>Фільтр <select id="comboF"><option value="">усі (${R.combos.length})</option>${['C', 'I', 'T', 'Q', 'W', 'SW', 'U', 'IW', 'M', 'A'].map(p => `<option value="${p}" ${flt === p ? 'selected' : ''}>${p}…</option>`).join('')}</select></label></div>` +
        fmt.tbl(['Код', 'Ситуація', 'Склад сполучення', 'Ведучий', 'Супутні', 'φ недоскон., ‰', 'max U каркаса'], list.map(cb => [cb.id, cb.situation, esc(cb.name), cb.lead || '—', (cb.acc || []).join(', ') || '—', f((cb.phi || 0) * 1000, 2), fmt.U(ulsU(cb.id))])))}
      ${card('Сполучення II групи (характеристичні, для переміщень, тиску на ґрунт, тріщин)', fmt.tbl(['Код', 'Склад'], R.sls.slice(0, 8).map(s => [s.id, esc(s.name)]).concat([['…', `ще ${Math.max(0, R.sls.length - 8)}`]])))}
      ${R.seis ? card('Сейсмічна розрахункова ситуація', `<p>ДБН В.1.1-12:2025, ф. (7.3): E<sub>d</sub> = γ<sub>n</sub>·(1,0·G<sub>k</sub> + 0,5·S<sub>k</sub>) ± γ<sub>n</sub>·γ<sub>I</sub>·A<sub>ek</sub>/m; A<sub>ek</sub> — SRSS форм і напрямків X, Y, Z; знаки N, M<sub>y</sub>, M<sub>z</sub> перебираються для кожного перерізу. Вітер, температура, ожеледь у сейсмічну ситуацію не входять (табл. 7.6).</p>`) : ''}`;
    },
    onChange(e, c) { if (e.target.id !== 'comboF') return false; c.state.ui.comboF = e.target.value; c.render(); return true; },
  };
})(window.SC = window.SC || {});
