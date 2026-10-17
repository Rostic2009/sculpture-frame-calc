/* Розділ «Документи» і «Довідка»: специфікація і кошторис, креслення (SVG, DXF), звіт за типами (UI-10),
 * нормативна база, аналіз ТЗ, перевірка ядра, методика. */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};

  P.spec = {
    render(c) {
      const { state, fld, card } = c;
      return `<h2>Специфікація і кошторис</h2>
      <p class="lead">Чиста кількість у конструкції, закупівельна кількість з відходами (один раз на позицію), маси та вартість (ТЗ 12): L<sub>Σ,j</sub> = ΣL<sub>e</sub>; m<sub>j</sub> = m<sub>l,j</sub>·L<sub>Σ,j</sub>; m<sub>sheet</sub> = Σρ·t·A; m<sub>r</sub> = ρ·πd²/4·L; C = ΣQ·P + C<sub>виг</sub> + C<sub>трансп</sub> + C<sub>монт</sub>.</p>
      ${c.staleBanner()}
      ${card('Ціни та запаси', `<div class="form">
        ${fld('prices.tube', 'Труба', 'грн/кг')}${fld('prices.sheet', 'Лист оболонки', 'грн/кг')}${fld('prices.plate', 'Пластини', 'грн/кг')}${fld('prices.anchor', 'Анкер у зборі', 'грн/шт')}
        ${fld('prices.concrete', 'Бетон', 'грн/м³')}${fld('prices.rebar', 'Арматура', 'грн/кг')}${fld('prices.electrode', 'Електроди', 'грн/кг')}${fld('prices.paint', 'Покриття', 'грн/м²')}
        ${fld('prices.fabrication', 'Виготовлення', 'грн')}${fld('prices.transport', 'Транспорт', 'грн')}${fld('prices.install', 'Монтаж', 'грн')}
        ${fld('design.waste', 'Відходи труб', '%')}${fld('design.sheetWaste', 'Відходи листа', '%')}
      </div><p class="note">Після зміни цін натисніть «Розрахувати», щоб оновити кошторис.</p>`)}
      ${state.R && state.R.ok ? `<section class="card">${SC.report.specTable(state.R.spec)}<div class="row"><button class="btn" data-act="copycsv">Скопіювати як CSV (Excel)</button></div></section>` : c.needCalc()}`;
    },
    onAct(a, b, c) {
      if (a !== 'copycsv') return false;
      const sp = c.state.R.spec;
      const csv = ['Розділ;Позиція;Марка;Стандарт;Од.;Чиста;Закупівля;Маса чиста кг;Маса закуп. кг;Вартість грн;Примітка'].concat(sp.rows.map(r => [r.cat, r.item, r.mark, r.std, r.unit, r.net.toFixed(3), r.buy.toFixed(3), r.massNet.toFixed(2), r.massBuy.toFixed(2), r.cost.toFixed(0), r.note].map(x => String(x).replace(/;/g, ',')).join(';'))).join('\n');
      c.copy(csv, 'Специфікацію скопійовано — вставте в Excel.'); return true;
    },
  };

  P.drawings = {
    render(c) {
      const { state, card } = c;
      if (!state.R || !state.R.ok) return '<h2>Креслення</h2>' + c.needCalc();
      const R = state.R, gs = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]);
      return `<h2>Креслення</h2>
      <p class="lead">Схеми для погодження та передачі виробнику: фасади каркаса (колір — коефіцієнт використання), опорний вузол, фундамент з армуванням. Експорт DXF містить 3D-лінії каркаса, контури плит, анкери й фундамент (шари FRAME, BRACES, BASEPLATE, ANCHORS, PEDESTAL, FOUNDATION).</p>
      ${c.staleBanner()}
      <div class="row"><button class="btn" data-act="copyDxf">Скопіювати DXF</button>${c.inFrame ? '' : '<button class="btn" data-act="saveDxf">Зберегти .dxf</button><button class="btn" data-act="saveSvg">Зберегти SVG креслень</button>'}</div>
      <textarea class="json" id="dxfbox" hidden></textarea>
      <div class="cols">${card('Фасад XZ', SC.drawings.frame(R, 'XZ'))}${card('Фасад YZ', SC.drawings.frame(R, 'YZ'))}</div>
      ${card('Опорний вузол', SC.drawings.basePlate(R, gs))}
      ${card('Фундамент', SC.drawings.foundation(R))}`;
    },
    onAct(a, b, c) {
      if (a === 'copyDxf') { const box = document.getElementById('dxfbox'); box.hidden = false; c.copy(SC.drawings.dxf(c.state.R), 'DXF скопійовано — збережіть як файл .dxf.', 'dxfbox'); return true; }
      if (a === 'saveDxf') { c.download('karkas.dxf', SC.drawings.dxf(c.state.R), 'application/dxf'); return true; }
      if (a === 'saveSvg') { const css = [...document.styleSheets].map(x => { try { return [...x.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'); const s = [...document.querySelectorAll('.dwg')].map(x => x.outerHTML).join('\n'); c.download('kreslennia.html', '<!doctype html><meta charset="utf-8"><style>' + css + '</style><body>' + s + '</body>', 'text/html'); return true; }
      return false;
    },
  };

  P.report = {
    render(c) {
      const { state, esc } = c;
      if (!state.R || !state.R.ok) return '<h2>Звіт</h2>' + c.needCalc();
      const R = state.R, type = state.ui.repType || 'full';
      const st = state.pr.status.value;
      const blockedApproval = ['Чернетка', 'Потребує уточнення', 'Попередній розрахунок', 'Застарілий'].includes(st) || state.stale || R.status !== 'ok';
      const failed = R.warn.filter(w => w.level === 'error');
      const types = [['full', 'Комплект: звіти 1–4'], ['r1', '1 · Каркас'], ['r2', '2 · Анкерні болти'], ['r3', '3 · Бетонна основа'], ['r4', '4 · Навантаження'], ['calc', 'Розрахункова записка'], ['eval', 'Оцінковий звіт'], ['approval', 'Комплект для погодження'], ['spec', 'Специфікація'], ['estimate', 'Кошторис']];
      const pre = `<section class="card noprint"><h3>Перед експортом (UI-10.2)</h3><ul class="kv">
        <li><span>Статус результату</span><b>${esc(st)}</b></li><li><span>Версія даних</span><b>${(state.pr.journal || []).length} змін, ${esc(state.pr.meta.date)}</b></li>
        <li><span>Невиконані перевірки</span><b>${failed.length ? failed.length + ' критичних' : 'немає'}</b></li><li><span>Застарілі дані</span><b>${state.stale ? 'так — перерахуйте' : 'ні'}</b></li>
        <li><span>Обмеження</span><b>${R.status === 'preliminary' ? 'попередній результат' : R.status === 'ok' ? 'немає' : 'не всі перевірки виконані'}</b></li></ul>
        <div class="row">${types.map(([k, l]) => `<button class="chip ${type === k ? 'on' : ''}" data-act="repType" data-t="${k}" ${k === 'approval' && blockedApproval ? 'disabled title="Заблоковано: статус ' + esc(st) + '"' : ''}>${l}</button>`).join('')}</div>
        ${type === 'approval' && blockedApproval ? '<ul class="warns"><li class="error">Комплект для погодження заблоковано (UI-10.3): статус «Чернетка», «Потребує уточнення», «Попередній» або «Застарілий».</li></ul>' : ''}
        <div class="row"><button class="btn primary" data-act="pdf" id="pdfBtn">Завантажити PDF</button>${c.inFrame ? '' : '<button class="btn" data-act="print">Друк</button><button class="btn" data-act="savehtml">Зберегти HTML</button>'}<button class="btn" data-act="copyreport">Скопіювати текст</button></div>
        ${state.ui.pdfMsg ? `<p class="note">${esc(state.ui.pdfMsg)}</p>` : ''}</section>`;
      const RS = SC.reports;
      const body = type === 'full' ? RS.full(R) : type === 'r1' ? RS.frame(R) : type === 'r2' ? RS.anchors(R) : type === 'r3' ? RS.base(R) : type === 'r4' ? RS.loads(R)
        : type === 'spec' ? SC.report.specTable(R.spec) : type === 'estimate' ? SC.report.estimate(R) : SC.report.build(R, { type: type === 'approval' && blockedApproval ? 'calc' : type });
      return `<h2 class="noprint">Звіт</h2>${c.staleBanner()}${pre}<article class="report" id="report">${body}</article>`;
    },
    onAct(a, b, c) {
      if (a === 'repType') { c.state.ui.repType = b.dataset.t; c.render(); return true; }
      if (a === 'print') { window.print(); return true; }
      if (a === 'pdf') {
        const el = document.getElementById('report'), btn = document.getElementById('pdfBtn');
        const names = { full: 'komplekt-zvitiv', r1: 'zvit-1-karkas', r2: 'zvit-2-ankery', r3: 'zvit-3-fundament', r4: 'zvit-4-navantazhennia', calc: 'rozrakhunkova-zapyska', eval: 'otsinkovyi-zvit', approval: 'komplekt-pohodzhennia', spec: 'spetsyfikatsiia', estimate: 'koshtorys' };
        const t = c.state.ui.repType || 'full', pr = c.state.pr;
        if (btn) { btn.disabled = true; btn.textContent = 'Формую PDF…'; }
        setTimeout(async () => {
          try {
            const h1 = el.querySelector('h1');
            const blob = await SC.pdf.fromElement(el, { title: h1 ? h1.textContent : 'Звіт', project: pr.meta.name + ' · ' + pr.meta.location, author: pr.meta.author });
            const res = await SC.pdf.save(blob, `${names[t] || 'zvit'}-${pr.meta.date}.pdf`);
            c.state.ui.pdfMsg = res === 'declined' ? 'Збереження PDF скасовано.' : `PDF сформовано (${(blob.size / 1024).toFixed(0)} КБ).`;
          } catch (e) { c.state.ui.pdfMsg = 'Не вдалося сформувати PDF: ' + (e.message || e.code || e); }
          c.render();
        }, 30);
        return true;
      }
      if (a === 'copyreport') { c.copy(document.getElementById('report').innerText, 'Текст звіту скопійовано.'); return true; }
      if (a === 'savehtml') {
        const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
        c.download('rozrakhunkova-zapyska.html', '<!doctype html><html lang="uk"><meta charset="utf-8"><title>' + c.esc(c.state.pr.meta.name) + '</title><style>' + css + '</style><body><article class="report">' + document.getElementById('report').innerHTML + '</article></body></html>', 'text/html'); return true;
      }
      return false;
    },
  };

  P.norms = {
    render(c) {
      const { state, card, fmt, f, N } = c;
      const ov = state.pr.overrides || {};
      const ChT = ov.ChTables || N.ChTables;
      const chTable = key => { const t = ChT[key]; return `<div class="tw"><table class="edit"><thead><tr><th>z, м</th>${['I', 'II', 'III', 'IV'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${t.z.map((z, i) => `<tr><td>${z}</td>${['I', 'II', 'III', 'IV'].map(x => `<td><input data-ch="${key}.${x}.${i}" type="number" step="0.01" value="${t[x][i] == null ? '' : t[x][i]}" placeholder="ввести"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`; };
      return `<h2>Нормативна база</h2>
      <p class="lead">Значення, внесені в застосунок, з джерелом і статусом перевірки: «звірено» — перевірено за відкритими фрагментами чинного тексту; «звірити» — внесено за редакцією, звірити з офіційним текстом перед робочою документацією (ТЗ 3.1.5). Таблиці C<sub>h</sub> редагуються й зберігаються в проєкті.</p>
      ${card('Документи нормативного профілю', `<ul>${Object.values(N.docs).map(d => `<li>${c.esc(d)}</li>`).join('')}</ul>`)}
      <div class="cols">${card('C<sub>h</sub>, табл. 9.01 (T ≤ 0,25 с) ' + c.normPill('checked'), chTable('9.01') + `<p class="note">${N.ChTables['9.01'].src}</p>`)}${card('C<sub>h</sub>, табл. 9.02 (T > 0,25 с) ' + c.normPill('checked'), chTable('9.02') + `<p class="note">${N.ChTables['9.02'].src}. Значення для типу IV на 60 м — ввести з офіційного тексту.</p>`)}</div>
      <div class="cols">${card('γ<sub>fm</sub> вітру ' + c.normPill(N.windGammaFm.status), fmt.tbl(['T, р.', ...N.windGammaFm.T], [['γfm', ...N.windGammaFm.g.map(g => f(g, 2))]]) + `<p class="note">${N.windGammaFm.src}</p>`)}${card('γ<sub>fm</sub> снігу ' + c.normPill(N.snowGammaFm.status), fmt.tbl(['T, р.', ...N.snowGammaFm.T], [['γfm', ...N.snowGammaFm.g.map(g => f(g, 2))]]) + `<p class="note">${N.snowGammaFm.src}</p>`)}</div>
      ${card('Міста — Додаток Е ДБН В.1.2-2 (164 міста, повна таблиця)', fmt.tbl(['Місто', 'Область', 'W₀, Па', 'S₀, Па', 'b, мм', 'W_B, Па'], N.cities.map(x => [x.name + (x.dbn ? ` <small>(${x.dbn})</small>` : ''), x.obl, x.W0, x.S0, x.b, x.WB])))}
      ${card('Інші коефіцієнти', fmt.tbl(['Параметр', 'Значення', 'Джерело', 'Статус'], [
        ['γ_fm власної ваги (метал/бетон/ґрунт/сприятлива)', `${N.gammaG.steel} / ${N.gammaG.concrete} / ${N.gammaG.soil} / ${N.gammaG.favourable}`, N.gammaG.src, c.normPill(N.gammaG.status)],
        ['ψ короткочасних: основне / друге / решта', N.psi.short.join(' / '), N.psi.src, c.normPill(N.psi.status)],
        ['γ_fm ожеледі / γ_fw вітру при ожеледі (T = 100 р.)', `${N.interp(N.iceGammaFm.T, N.iceGammaFm.g, 100)} / ${N.interp(N.iceWindGamma.T, N.iceWindGamma.g, 100)}`, N.iceGammaFm.src + '; ' + N.iceWindGamma.src, c.normPill('checked')],
        ['Особливе сполучення G / S', `${N.seismicComb.G} / ${N.seismicComb.snow}`, N.seismicComb.src, c.normPill(N.seismicComb.status)],
        ['a₀ за бальністю 6/7/8/9', `${N.seismicA0[6]} / ${N.seismicA0[7]} / ${N.seismicA0[8]} / ${N.seismicA0[9]} g`, N.seismicA0Meta.src, c.normPill(N.seismicA0Meta.status)],
        ['k(z) ожеледі, μ₂, ρ', '0,8…1,7; 0,6; 900 кг/м³', N.iceK.src, c.normPill(N.iceK.status)],
        ['Шви: R_wf, β_f, β_z; k_f,min', 'Е42: 180 МПа; 0,7; 1,0; табл. 38', SC.welds.meta.src, c.normPill(SC.welds.meta.status)],
        ['Пластина, защемлена по контуру (β, α)', '0,3078/0,0138 … 0,5/0,0284', SC.shell.meta.src, c.normPill(SC.shell.meta.status)],
        ['Анкери: γ_M2; k₁ конуса; k₂ вириву; k₉', '1,25; 8,9/12,7; 7,5/10,5; 1,7/2,4', N.docs.anchors, c.normPill('verify')],
        ['Осідання: β = 0,8; межа σ_zp = 0,2σ_zg', 'α — точний розв\'язок Буссінеска', N.docs.found, c.normPill('checked')],
        ['Корозія C2…C5', '0,025…0,2 мм/рік', N.corrMeta.src, c.normPill(N.corrMeta.status)],
      ]))}
      <div class="row"><button class="btn" data-act="resetnorms">Повернути таблиці C_h до внесених значень</button></div>`;
    },
    onChange(e, c) {
      const t = e.target; if (!t.dataset.ch) return false;
      const [key, col, i] = t.dataset.ch.split('.');
      const pr = c.state.pr; pr.overrides = pr.overrides || {};
      if (!pr.overrides.ChTables) pr.overrides.ChTables = JSON.parse(JSON.stringify(c.N.ChTables));
      pr.overrides.ChTables[key][col][+i] = t.value === '' ? null : parseFloat(t.value);
      c.changed(`C_h ${key} ${col} ${i}`, '', t.value); return true;
    },
    onAct(a, b, c) { if (a !== 'resetnorms') return false; if (c.state.pr.overrides) delete c.state.pr.overrides.ChTables; c.changed('C_h', '', 'скинуто'); c.render(); return true; },
  };

  P.tz = { render: () => `<h2>Аналіз технічного завдання</h2><p class="lead">ТЗ (≈ 12 600 рядків) описує платформу: машинний зір, генерацію каркаса, МСЕ, шви, анкери за EN 1992-4, фундамент, армування, статуси, журнал, експорт. Нижче — знайдені прогалини та суперечності і як їх закрито в застосунку.</p>${SC.report.tzAnalysis()}` };

  P.tests = {
    render(c) {
      const { card, fmt, f, esc } = c;
      const t = SC.selftest(), bad = t.filter(x => !x.ok).length;
      return `<h2>Перевірка розрахункового ядра</h2>
      <p class="lead">Еталонні задачі (ТЗ, р. 14): аналітичні розв'язки, таблиці сортаменту й норм. Запускаються щоразу при відкритті вкладки.</p>
      <div class="tiles"><div class="tile ${bad ? 'bad' : 'ok'}"><span class="k">Результат</span><span class="v">${t.length - bad} / ${t.length}</span><span class="s">${bad ? 'є розбіжності' : 'усі задачі збігаються'}</span></div></div>
      ${card('Задачі', fmt.tbl(['Задача', 'Отримано', 'Еталон', 'Допуск', 'Статус'], t.map(x => [esc(x.name), f(x.got, 5), f(x.exp, 5), (x.tol * 100).toPrecision(2) + ' %', x.ok ? c.pill('OK', 'ok') : c.pill('FAIL', 'bad')])))}`;
    },
  };

  P.help = {
    render: (c) => `<h2>Методика</h2>
    ${c.card('Алгоритм розрахунку', `<div class="formula">1. Вихідні дані → перевірка повноти; геометрія з зображень (маски, масштаб, 3D з проєкцій) або STL/OBJ.
2. Частини скульптури → маси оболонки й ребер, площі A(θ), A_h, центри.
3. Каркас-ядро + консолі + додаткові вузли/стрижні → граф G = (V, E).
4. Модальний аналіз мас G → T₁ → табл. C_h 9.01/9.02, C_d.
5. Завантаження: G, S, W(θ), I, T±, Q, M, A; сейсміка — спектрально.
6. Сполучення (ведучий/супутні, ψ), недосконалість φ.
7. Ітерація податливості бази: реакції → жорсткість плити й анкерів → пружні опори.
8. МСЕ 2-го порядку для всіх сполучень; рівновага ΣF + ΣR ≈ 0; α_cr.
9. Перевірки труб (ДБН + EN), шви всіх вузлів, опорні плити, ребра, анкери (EN 1992-4), шайби.
10. Фундамент: тиск з відривом, осідання й крен, перекидання, зсув; залізобетон, армування, відомість.
11. Лист оболонки: крок ребер, маса ребер (повертається в навантаження).
12. Специфікація, кошторис, креслення, звіт; статуси й журнал.</div>`)}
    ${c.card('Чому працює без API', '<p>Усі розрахунки й обробка зображень виконуються у вашому браузері (JavaScript). Нічого не надсилається на сервери; платні токени не потрібні. OCR чисел — необов\'язковий модуль, який завантажується з CDN за наявності мережі; без нього розміри вводяться вручну (і так вимагає ТЗ для критичних розмірів).</p>')}
    ${c.card('Клавіші', '<ul><li>Ctrl+Enter — розрахувати</li><li>Ctrl+Z / Ctrl+Y — скасувати / повторити зміну</li><li>Пошук розділу — поле над меню</li></ul>')}`,
  };
})(window.SC = window.SC || {});
