/* Розділ «Розрахунок»: окремі сторінки для рами (МСЕ), перерізів, стійкості, швів, опорної плити й ребер,
 * анкерів і закладних деталей, фундаментної плити, армування, листа оболонки. У кожній — формули з підстановкою,
 * визначальне сполучення, коефіцієнти використання. */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};
  const kN = v => SC.report.fmt.kN(v), kNm = v => SC.report.fmt.kNm(v), MPa = v => SC.report.fmt.MPa(v);

  // ---------- епюри зусиль уздовж елемента (SVG) ----------
  function diagram(vals, label, unit, w, h) {
    w = w || 300; h = h || 70;
    const mx = Math.max(1e-9, ...vals.map(Math.abs));
    const pts = vals.map((v, i) => [10 + i * (w - 20) / (vals.length - 1), h / 2 - v / mx * (h / 2 - 8)]);
    const poly = `10,${h / 2} ` + pts.map(p => p.join(',')).join(' ') + ` ${w - 10},${h / 2}`;
    return `<figure class="diag"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${label}"><line x1="10" y1="${h / 2}" x2="${w - 10}" y2="${h / 2}" stroke="var(--line-strong)"/><polygon points="${poly}" fill="color-mix(in oklab, var(--accent) 25%, transparent)" stroke="var(--accent)"/>${pts.map((p, i) => i % 2 === 0 ? `<text x="${p[0]}" y="${p[1] < h / 2 ? p[1] - 3 : p[1] + 11}" font-size="10" text-anchor="middle" fill="var(--fg)">${(vals[i] / 1000).toFixed(2)}</text>` : '').join('')}</svg><figcaption>${label}, ${unit}</figcaption></figure>`;
  }

  P.fem = {
    render(c) {
      const { state, card, fmt, f, esc } = c;
      if (!state.R || !state.R.ok) return '<h2>Рама (МСЕ)</h2>' + c.needCalc();
      const R = state.R, ui = state.ui.fem = state.ui.fem || { combo: '', group: '', umin: 0, sort: 'u', q: '', sel: null, mode: 'U', def: 0 };
      const combos = R.solved.map(s => s.cb);
      const sel = ui.combo ? R.solved.find(s => s.cb.id === ui.combo) : null;
      let rows = R.memberRes.map(m => {
        const f0 = sel ? sel.forces[m.k] : null;
        const u = sel ? (m.byCombo.find(x => x.id === ui.combo) || { u: 0 }).u : m.best.u;
        const fm = f0 ? f0.reduce((a, x) => (Math.abs(x.My) + Math.abs(x.Mz) > Math.abs(a.My) + Math.abs(a.Mz) ? x : a), f0[0]) : m.best.f;
        return { m, u, fm };
      });
      if (ui.group) rows = rows.filter(r => r.m.e.group === ui.group);
      if (ui.umin) rows = rows.filter(r => r.u >= ui.umin);
      if (ui.q) rows = rows.filter(r => (r.m.e.id + ' ' + (r.m.e.mark || '') + ' ' + r.m.e.group + ' ' + r.m.e.sec.name).toLowerCase().includes(ui.q.toLowerCase()));
      rows.sort((a, b) => ui.sort === 'id' ? a.m.k - b.m.k : b.u - a.u);
      const groups = [...new Set(R.memberRes.map(m => m.e.group))];
      const det = ui.sel != null ? R.memberRes[ui.sel] : null;
      let detail = '';
      if (det) {
        const s = sel || R.solved.find(x => x.cb.id === det.best.cbId) || R.solved[0];
        const fr = s.forces[det.k];
        detail = card(`Елемент ${det.e.mark || ''} (${det.e.id}) · ${esc(det.e.group)} · ${det.e.sec.name}`, `<p class="note">Вузли ${det.e.i} → ${det.e.j}; L = ${f(det.L, 3)} м; сполучення ${esc(s.cb.id)}: ${esc(s.cb.name)}. Зусилля в 5 перерізах (0; ¼; ½; ¾; 1)·L, локальні осі елемента.</p>
          <div class="diags">${diagram(fr.map(x => x.N), 'N', 'кН')}${diagram(fr.map(x => x.My), 'M_y', 'кН·м')}${diagram(fr.map(x => x.Mz), 'M_z', 'кН·м')}${diagram(fr.map(x => Math.hypot(x.Vy, x.Vz)), 'V', 'кН')}${diagram(fr.map(x => x.T), 'T', 'кН·м')}</div>
          ${fmt.tbl(['x/L', 'N, кН', 'V_y, кН', 'V_z, кН', 'T, кН·м', 'M_y, кН·м', 'M_z, кН·м'], fr.map((x, i) => [R.stations[i], kN(x.N), kN(x.Vy), kN(x.Vz), kNm(x.T), kNm(x.My), kNm(x.Mz)]))}
          <div class="row"><button class="btn small" data-tab="secCheck">Перевірка перерізу →</button><button class="btn small" data-act="femSel" data-k="">Закрити</button></div>`);
      }
      const reac = (sel ? sel.r.reactions : R.solved[0].r.reactions);
      return `<h2>Рама — метод скінченних елементів</h2>
      <p class="lead">Просторова стрижнева модель: ${R.P.nn} вузлів × 6 ступенів свободи, ${R.P.els.length} елементів (балкові 12×12, зв'язки — ферменні), ${R.solved.length} сполучень ULS ${R.pr.design.second ? 'з розрахунком 2-го порядку (K + K_G(N))·u = f' : '(лінійно)'}. Контроль рівноваги ΣF + ΣR: нев'язка ${R.eqMax.toExponential(1)}.</p>
      ${c.staleBanner()}
      <section class="card"><h3>Схема <small>колір — U; пунктир — зв'язки</small></h3>
        <div class="viewer"><canvas id="cvFem"></canvas>
        <div class="ctl"><label for="femDef">Деформації ×</label><select id="femDef">${[0, 20, 50, 100, 300].map(v => `<option ${+ui.def === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label for="femMode">Показати</label><select id="femMode">${[['U', 'коефіцієнт використання'], ['N', 'осьові сили'], ['M', 'згинальні моменти'], ['modes', 'форма коливань 1']].map(([k, l]) => `<option value="${k}" ${ui.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="legend"><span><i style="background:var(--ok)"></i>≤ 0,9</span><span><i style="background:var(--warn)"></i>0,9…1</span><span><i style="background:var(--bad)"></i>&gt; 1</span></div></div></section>
      ${card('Фільтри (UI-8.2)', `<div class="form">
        <div class="fld"><label for="femCombo">Сполучення / напрямок вітру</label><select id="femCombo"><option value="">огинаюча (визначальне)</option>${combos.map(cb => `<option value="${cb.id}" ${ui.combo === cb.id ? 'selected' : ''}>${esc(cb.id + ': ' + cb.name)}</option>`).join('')}</select></div>
        <div class="fld"><label for="femGroup">Група</label><select id="femGroup"><option value="">усі</option>${groups.map(g => `<option ${ui.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
        <div class="fld"><label for="femU">U не менше</label><select id="femU">${[0, 0.5, 0.9, 1].map(v => `<option value="${v}" ${+ui.umin === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="fld"><label for="femQ">Пошук</label><input id="femQ" value="${esc(ui.q)}" placeholder="E12, стійки, □80…"></div>
        <div class="fld"><label for="femSort">Сортування</label><select id="femSort"><option value="u" ${ui.sort === 'u' ? 'selected' : ''}>за U</option><option value="id" ${ui.sort === 'id' ? 'selected' : ''}>за номером</option></select></div>
      </div>`)}
      ${detail}
      ${card('Елементи', fmt.tbl(['Елемент', 'Група', 'Переріз', 'L, м', 'N, кН', 'M_y, кН·м', 'M_z, кН·м', 'U', 'Визначальне', ''], rows.map(r => [`<b>${r.m.e.mark || ''}</b> ${r.m.e.id}`, esc(r.m.e.group), r.m.e.sec.name, f(r.m.L, 2), kN(r.fm.N), kNm(r.fm.My), kNm(r.fm.Mz), fmt.U(r.u), esc(ui.combo || r.m.best.combo.split(':')[0]), `<button class="btn small" data-act="femSel" data-k="${r.m.k}">Епюри</button>`])) + `<div class="row"><button class="btn" data-act="femCsv">Скопіювати таблицю (CSV)</button></div>`, `${rows.length} з ${R.memberRes.length}`)}
      ${card('Реакції опор', fmt.tbl(['Вузол', 'R_x, кН', 'R_y, кН', 'R_z, кН', 'M_x, кН·м', 'M_y, кН·м', 'M_z, кН·м'], reac.map(r => [r.node, ...r.r.slice(0, 3).map(kN), ...r.r.slice(3).map(kNm)])), sel ? sel.cb.id : R.solved[0].cb.id)}
      ${card('Переміщення (II група)', `<p>Найбільше горизонтальне: <b>${f(R.uMax * 1000, 1)} мм</b> (вузол ${R.uNode ? R.uNode.id : '—'}, ${esc(R.uCombo || '')}); граничне H/${R.pr.design.defLimit} = ${f(R.uLim * 1000, 1)} мм → ${R.uMax <= R.uLim ? c.pill('виконується', 'ok') : c.pill('не виконується', 'bad')}.</p>`)}`;
    },
    after(c) {
      const cv = document.getElementById('cvFem'); if (!cv) return;
      const R = c.state.R, ui = c.state.ui.fem;
      const sel = ui.combo ? R.solved.find(s => s.cb.id === ui.combo) : R.solved.find(s => s.cb.id === (R.govMember && R.govMember.best.cbId)) || R.solved[0];
      let U = R.memberRes.map(m => ui.combo ? (m.byCombo.find(x => x.id === ui.combo) || { u: 0 }).u : m.best.u);
      let u = sel && sel.r.u;
      if (ui.mode === 'N' || ui.mode === 'M') {
        const v = sel.forces.map(fr => ui.mode === 'N' ? Math.max(...fr.map(x => Math.abs(x.N))) : Math.max(...fr.map(x => Math.hypot(x.My, x.Mz))));
        const mx = Math.max(...v, 1e-9); U = v.map(x => x / mx * 0.95);
      }
      if (ui.mode === 'modes') { const md = R.modalG.modes[0]; u = md.phi; }
      const v = SC.view3d.create(cv, () => ({ nodes: R.P.model.nodes, elems: R.mdl.elems, U, parts: R.pr.parts, u, windTheta: sel && sel.cb.theta }));
      v.st.defScale = ui.mode === 'modes' ? (ui.def || 50) * 0.002 : +ui.def; v.draw(); P.fem.view = v;
    },
    resize() { if (P.fem.view) P.fem.view.draw(); },
    onChange(e, c) {
      const ui = c.state.ui.fem; if (!ui) return false;
      const map = { femCombo: 'combo', femGroup: 'group', femU: 'umin', femSort: 'sort', femDef: 'def', femMode: 'mode' };
      const k = map[e.target.id]; if (!k) return false;
      ui[k] = ['umin', 'def'].includes(k) ? +e.target.value : e.target.value; c.render(); return true;
    },
    onInput(e, c) { if (e.target.id !== 'femQ') return false; c.state.ui.fem.q = e.target.value; clearTimeout(P.fem.t); P.fem.t = setTimeout(() => { c.render(); const q = document.getElementById('femQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 350); return true; },
    onAct(a, b, c) {
      if (a === 'femSel') { c.state.ui.fem.sel = b.dataset.k === '' ? null : +b.dataset.k; c.render(); window.scrollTo(0, 0); return true; }
      if (a === 'femCsv') { const R = c.state.R; c.copy(['Елемент;Група;Переріз;L;N кН;My кНм;Mz кНм;U;Сполучення'].concat(R.memberRes.map(m => [m.e.id, m.e.group, m.e.sec.name, m.L.toFixed(3), (m.best.f.N / 1000).toFixed(2), (m.best.f.My / 1000).toFixed(2), (m.best.f.Mz / 1000).toFixed(2), m.best.u.toFixed(3), m.best.combo].join(';'))).join('\n'), 'Таблицю скопійовано.'); return true; }
      return false;
    },
  };

  // ---------- секції каркаса: розбиття на яруси й консолі, марки, 2D-креслення, результати по секціях ----------
  const reserve = u => u > 0 ? (u > 1 ? `<b class="bad-t">−${SC.report.fmt.f((u - 1) * 100, 0)} %</b>` : SC.report.fmt.f((1 - u) * 100, 0) + ' %') : '—';
  P.sectionMemberTable = function (c, sr) {
    const { fmt, f } = c;
    return fmt.tbl(['Марка', 'Роль', 'Переріз', 'Вузли', 'L, мм', 'Маса, кг', 'N, кН', 'M<sub>y</sub>; M<sub>z</sub>, кН·м', 'U', 'Запас', 'Визначальне'], sr.members.map(m => {
      const nd = id => (c.state.R.P.model.nodes[c.state.R.P.idx.get(id)] || {}).num;
      return [`<b>${m.e.mark}</b>`, SC.model.roleName(m.e.role), m.e.sec.name, `${nd(m.e.i)}–${nd(m.e.j)}`, f(m.L * 1000, 0), f(m.mass, 1), kN(m.best.f.N), `${kNm(m.best.f.My)}; ${kNm(m.best.f.Mz)}`, fmt.U(m.best.u), reserve(m.best.u), c.esc(m.best.combo.split(':')[0])];
    }));
  };
  P.sects = {
    render(c) {
      const { state, card, fmt, f, esc } = c;
      const R = state.R && state.R.ok ? state.R : null;
      const mdl = R ? R.mdl : SC.model.build(state.pr);
      const ui = state.ui.sects = state.ui.sects || { hl: '', marks: true };
      const list = R ? R.sectionRes : mdl.sections;
      const chip = sc => `<span class="sect-chip" style="background:${sc.color}">${sc.code}</span>`;
      const summary = R ? fmt.tbl(['Секція', 'Склад', 'Стрижнів', 'Профілі', 'L, м', 'Маса, кг', 'max U', 'Запас', 'Визначальний стрижень'], list.map(sr => [
        `<button class="link" data-act="sectHl" data-c="${sr.code}">${chip(sr)}</button>`, esc(sr.name), sr.members.length, sr.profiles.map(p => `${p.sec} × ${p.n}`).join('<br>'), f(sr.L, 2), f(sr.mass, 1), fmt.U(sr.uMax), reserve(sr.uMax), sr.gov ? `${sr.gov.e.mark} · ${esc(sr.gov.best.combo.split(':')[0])}` : '—'])) : `<p class="note">Креслення побудовано за поточною схемою. Зусилля й коефіцієнти використання з'являться після розрахунку.</p>`;
      const sheets = list.filter(sc => !ui.hl || sc.code === ui.hl).map(sc => `<section class="card sect-card" style="border-top:4px solid ${sc.color}"><h3>${chip(sc)} ${esc(sc.name)} <small>${sc.elems.length} стрижн.${R ? ` · max U = ${f(sc.uMax, 3)}` : ''}</small></h3>
        ${SC.drawings.section(mdl, sc, R)}
        ${R ? P.sectionMemberTable(c, sc) : ''}</section>`).join('');
      return `<h2>Секції каркаса</h2>
      <p class="lead">Каркас поділено на розрахункові секції: <b>Я</b> — яруси ядра між рівнями (стійки, зв'язки ярусу й верхній пояс), <b>К</b> — консолі частин скульптури, <b>Д</b> — додаткові елементи. Кожен стрижень має марку «секція-роль№»: С — стійка, Р — розкіс/зв'язок, П — пояс, К — консоль. Наприклад, <b>Я2-Р3</b> — третій розкіс другого ярусу. Модель розраховується цілком (МСЕ), а результати й креслення подаються по секціях, щоб не заплутатися.</p>
      ${c.staleBanner ? c.staleBanner() : ''}
      <section class="card"><h3>3D: секції кольорами</h3>
        <div class="viewer"><canvas id="cvSect"></canvas>
          <div class="ctl"><label for="sectHlSel">Секція</label><select id="sectHlSel"><option value="">усі</option>${list.map(sc => `<option value="${sc.code}" ${ui.hl === sc.code ? 'selected' : ''}>${sc.code} — ${esc(sc.name)}</option>`).join('')}</select>
          <label><input type="checkbox" id="sectMarks" ${ui.marks ? 'checked' : ''}> марки</label></div>
          <div class="legend">${list.map(sc => `<span><i style="background:${sc.color}"></i>${sc.code}</span>`).join('')}</div></div></section>
      ${card('Підсумок по секціях', summary)}
      ${sheets}`;
    },
    after(c) {
      const cv = document.getElementById('cvSect'); if (!cv) return;
      const R = c.state.R && c.state.R.ok ? c.state.R : null, ui = c.state.ui.sects;
      const mdl = R ? R.mdl : SC.model.build(c.state.pr);
      const v = SC.view3d.create(cv, () => ({ nodes: R ? R.P.model.nodes : mdl.nodes, elems: mdl.elems, parts: [], colorBy: 'sect', sections: mdl.sections, sectLabels: true, marks: ui.marks && !!ui.hl, highlight: ui.hl }));
      v.draw(); P.sects.view = v;
    },
    resize() { if (P.sects.view) P.sects.view.draw(); },
    onChange(e, c) {
      if (e.target.id === 'sectHlSel') { c.state.ui.sects.hl = e.target.value; c.render(); return true; }
      if (e.target.id === 'sectMarks') { c.state.ui.sects.marks = e.target.checked; c.render(); return true; }
      return false;
    },
    onAct(a, b, c) { if (a === 'sectHl') { c.state.ui.sects.hl = c.state.ui.sects.hl === b.dataset.c ? '' : b.dataset.c; c.render(); return true; } return false; },
  };

  /** Детальна перевірка перерізу з формулами (використовується і на сторінці, і в калькуляторі). */
  function sectionDetail(c, sec, steel, f0, Lcr, opt, title) {
    const { fmt } = c, f = c.f;
    const k = SC.checks.member(sec, steel, f0, Lcr, opt);
    const E = SC.norms.E;
    return `<h4>${title}</h4>
      ${fmt.tbl(['Величина', 'Значення'], [
        ['Переріз', `${sec.name}: A = ${f(sec.A * 1e4, 2)} см²; I = ${f(sec.Iy * 1e8, 1)} см⁴; W<sub>el</sub> = ${f(sec.Wel * 1e6, 2)} см³; W<sub>pl</sub> = ${f(sec.Wpl * 1e6, 2)} см³; i = ${f(sec.i * 100, 2)} см; I<sub>t</sub> = ${f(sec.J * 1e8, 1)} см⁴${sec.corr ? `; залишкова стінка t = ${f(sec.tmm, 1)} мм` : ''}`],
        ['Зусилля', `N = ${kN(f0.N)} кН (${f0.N < 0 ? 'стиск' : 'розтяг'}); V = ${kN(Math.hypot(f0.Vy, f0.Vz))} кН; T = ${kNm(f0.T)} кН·м; M<sub>y</sub> = ${kNm(f0.My)}; M<sub>z</sub> = ${kNm(f0.Mz)} кН·м`],
        ['Гнучкість', `L<sub>cr</sub> = ${f(Lcr, 3)} м; λ = L<sub>cr</sub>/i = ${f(k.dbn.lam, 1)}; N<sub>cr</sub> = π²EI/L<sub>cr</sub>² = ${kN(k.dbn.NcrE)} кН`],
      ])}
      <div class="cols">
      <div>${fmt.tbl(['ДБН В.2.6-198', 'Формула з підстановкою', 'U'], [
        ['R<sub>y</sub>', `R<sub>yn</sub>/γ<sub>m</sub> = ${steel.Ryn}/${steel.norm === 'dbn' ? steel.gm : 1.025} = ${MPa(k.dbn.Ry)} МПа; γ<sub>c</sub> = ${opt.gammaC || 1}`, ''],
        ['Міцність', `(|N|/A + |M<sub>y</sub>|/W + |M<sub>z</sub>|/W)/(R<sub>y</sub>γ<sub>c</sub>)`, fmt.U(k.dbn.strength)],
        ['Зріз', `(V/A<sub>v</sub> + T/W<sub>t</sub>)/(R<sub>s</sub>γ<sub>c</sub>), R<sub>s</sub> = 0,58R<sub>y</sub>`, fmt.U(k.dbn.shear)],
        ['Приведені напруження', `√(σ² + 3τ²)/(1,15R<sub>y</sub>γ<sub>c</sub>)`, fmt.U(k.dbn.eq)],
        ['Стійкість', `λ̄ = λ√(R<sub>y</sub>/E) = ${f(k.dbn.lamBar, 3)}; φ = ${f(k.dbn.phi, 3)}; N/(φAR<sub>y</sub>γ<sub>c</sub>) + C<sub>m</sub>·M/((1−N/N<sub>cr</sub>)WR<sub>y</sub>γ<sub>c</sub>)`, fmt.U(k.dbn.stability)],
      ])}</div>
      <div>${fmt.tbl(['EN 1993-1-1', 'Формула з підстановкою', 'U'], [
        ['Клас', `c/t = (b − 3t)/t = ${f(k.en.ct, 1)}; ε = √(235/f<sub>y</sub>) → клас ${k.en.cls}`, ''],
        ['Міцність (6.2.1)', `|N|/N<sub>Rd</sub> + M<sub>y</sub>/M<sub>Rd</sub> + M<sub>z</sub>/M<sub>Rd</sub>, M<sub>Rd</sub> = ${k.en.cls <= 2 ? 'W<sub>pl</sub>' : 'W<sub>el</sub>'}·f<sub>y</sub>/γ<sub>M0</sub>`, fmt.U(k.en.strength)],
        ['Зсув + кручення (6.2.6–6.2.7)', `V/V<sub>pl,T,Rd</sub>; τ<sub>t</sub>/(f<sub>y</sub>/√3)`, fmt.U(Math.max(k.en.shear, k.en.torsion))],
        ['σ<sub>eq</sub> (6.1)', `√(σ<sub>x</sub>² + 3τ²)/(f<sub>y</sub>/γ<sub>M0</sub>)`, fmt.U(k.en.eq)],
        ['Стійкість (6.61/6.62)', `λ̄ = ${f(k.en.lam, 3)}; χ = ${f(k.en.chi, 3)} (крива ${opt.curve || 'c'}); k<sub>yy</sub> = ${k.en.k ? f(k.en.k.kyy, 3) : '—'}`, fmt.U(k.en.stability)],
      ])}</div></div>`;
  }

  P.secCheck = {
    render(c) {
      const { state, card, fmt, f, esc, secOptions, N } = c;
      const ui = state.ui.sec = state.ui.sec || { sec: '□100×5', steel: state.pr.frame.steel, N: -50, My: 5, Mz: 2, V: 5, T: 0.5, L: 3, mu: 1 };
      const calcSec = SC.sections.byName(ui.sec), calcSteel = N.steels.find(s => s.id === ui.steel) || N.steels[1];
      const opt = { gammaC: state.pr.frame.gammaC, gammaM0: state.pr.design.gammaM0, gammaM1: state.pr.design.gammaM1, curve: state.pr.design.curve, Cm: 0.9 };
      const calc = sectionDetail(c, calcSec, calcSteel, { N: ui.N * 1000, Vy: ui.V * 1000, Vz: 0, T: ui.T * 1000, My: ui.My * 1000, Mz: ui.Mz * 1000 }, ui.L * ui.mu, opt, 'Результат калькулятора');
      let per = '';
      if (state.R && state.R.ok) {
        const R = state.R;
        const groups = new Map(); R.memberRes.forEach(m => { const g = groups.get(m.e.group); if (!g || m.best.u > g.best.u) groups.set(m.e.group, m); });
        per = [...groups.values()].map(m => card(`${esc(m.e.group)}: визначальний ${m.e.id}`, `<p class="note">Сполучення ${esc(m.best.combo)}; переріз x = ${f(m.best.station * m.L, 2)} м; розрахункова довжина: ${esc(m.Lsys.note)}, μ = ${m.Lsys.mu}.</p>` + sectionDetail(c, m.e.sec, m.e.steel, m.best.f, m.Lsys.Lcr, opt, `${m.e.sec.name}, ${m.e.steel.id}: U = ${f(m.best.u, 3)}`))).join('');
      }
      return `<h2>Перевірка перерізів</h2>
      <p class="lead">Перевірки квадратних труб за ДБН В.2.6-198 і ДСТУ-Н Б EN 1993-1-1 з підстановкою чисел. Нижче — визначальний елемент кожної групи та окремий калькулятор перерізу.</p>
      ${c.staleBanner()}
      ${card('Калькулятор перерізу', `<div class="form">
        <div class="fld"><label for="scSec">Переріз</label><select id="scSec" data-sc="sec">${secOptions().map(([v, l]) => `<option value="${v}" ${v === ui.sec ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fld"><label for="scSteel">Сталь</label><select id="scSteel" data-sc="steel">${N.steels.map(s => `<option ${s.id === ui.steel ? 'selected' : ''}>${s.id}</option>`).join('')}</select></div>
        ${[['N', 'N (стиск −)', 'кН'], ['My', 'M_y', 'кН·м'], ['Mz', 'M_z', 'кН·м'], ['V', 'V', 'кН'], ['T', 'T', 'кН·м'], ['L', 'Довжина L', 'м'], ['mu', 'μ', '']].map(([k, l, u]) => `<div class="fld"><label for="sc${k}"><span>${l}</span><span class="unit">${u}</span></label><input id="sc${k}" data-sc="${k}" type="number" step="any" value="${ui[k]}"></div>`).join('')}
      </div>${calc}`)}
      ${per || c.needCalc()}`;
    },
    onChange(e, c) {
      const k = e.target.dataset.sc; if (!k) return false;
      c.state.ui.sec[k] = ['sec', 'steel'].includes(k) ? e.target.value : parseFloat(e.target.value) || 0; c.render(); return true;
    },
  };

  P.stability = {
    render(c) {
      const { state, card, fmt, f, esc } = c;
      if (!state.R || !state.R.ok) return '<h2>Стійкість і динаміка</h2>' + c.needCalc();
      const R = state.R;
      return `<h2>Стійкість і динаміка</h2>
      ${c.staleBanner()}
      ${card('Загальна стійкість', `<p>Критичний коефіцієнт пружної стійкості системи α<sub>cr</sub> = <b>${f(R.alphaCr, 2)}</b> (сполучення ${R.alphaCombo}): ${R.alphaCr >= 10 ? 'α_cr ≥ 10 — ефекти 2-го порядку малі' : R.alphaCr >= 3 ? '3 ≤ α_cr < 10 — розрахунок 2-го порядку обов\'язковий (виконано)' : 'α_cr < 3 — система надто податлива'} (EN 1993-1-1, 5.2.1). Глобальна недосконалість φ = φ₀·α<sub>h</sub>·α<sub>m</sub> = ${f((R.solved[0].cb.phi || 0) * 1000, 3)}·10⁻³ рад.</p>`)}
      ${card('Власні коливання (маси G)', fmt.tbl(['Форма', 'T, с', 'f, Гц', 'm_eff X', 'm_eff Y', 'm_eff Z'], R.modalG.modes.map((m, i) => [i + 1, f(m.T, 3), f(m.f, 2), fmt.pc(m.meff[0]), fmt.pc(m.meff[1]), fmt.pc(m.meff[2])])) + `<p class="note">T₁ = ${f(R.T1, 3)} с → таблиця C<sub>h</sub> ${R.clim.ChTable}${R.T1 > 0.25 ? '; потрібне підтвердження C_d' : '; C_d = 1'}.</p>`)}
      ${R.seis ? card('Сейсміка: форми й поперечні сили', fmt.tbl(['Форма', 'T, с', 'β', 'S_a, м/с²', 'm_eff X', 'm_eff Y'], R.seis.modal.modes.map((m, i) => [i + 1, f(m.T, 3), f(SC.norms.seismicBeta(m.T, R.clim.seis.soil), 2), f(R.seis.res[0].modes[i] ? R.seis.res[0].modes[i].Sa : 0, 3), fmt.pc(m.meff[0]), fmt.pc(m.meff[1])])) + `<p>Поперечна сила біля опор (SRSS): ${R.seis.res.map(r => `${r.dir}: <b>${kN(Math.sqrt(r.modes.reduce((a, m) => a + m.base * m.base, 0)))} кН</b>`).join('; ')}. Маса: ${f(R.seis.totalMass, 0)} кг.</p>`) : ''}
      ${R.vortex ? card('Вихрове збудження (ДБН В.1.2-2, п. 9.17, дод. К)', `<p class="note">V<sub>cr</sub> = n·d/St (К.1), St = ${R.vortex.St} (${R.vortex.shape === 'round' ? 'округлий переріз' : 'гострі кромки'}); резонансу немає, якщо V<sub>cr</sub> > V<sub>max</sub> = 1,28·√(C<sub>h</sub>(z<sub>e</sub>)·W₀) (К.2, К.3), z<sub>e</sub> = 0,8H. При резонансі F(z) = 0,75·V<sub>cr</sub>²·C<sub>e,cr</sub>·φ(z)·d/δ, δ = ${R.vortex.delta} (К.4) + W<sub>m,cr</sub> = (V<sub>cr</sub>/V<sub>max</sub>)²·W<sub>m</sub> (К.6) — сполучення VX. За п. 9.17 перевірка обов'язкова при h/d > 10.</p>` + c.fmt.tbl(['Форма', 'T, с', 'd, м', 'h/d', 'V<sub>cr</sub>, м/с', 'z<sub>e</sub>, м', 'C<sub>h</sub>(z<sub>e</sub>)', 'V<sub>max</sub>, м/с', 'C<sub>e,cr</sub>', 'Висновок'], R.vortex.modes.map(v => [v.dir, f(v.T, 3), f(v.d, 2), f(v.Hd, 1), f(v.Vcr, 1), f(v.ze, 2), f(v.Che, 2), f(v.Vmax, 1), f(v.Ce, 2), v.resonance ? c.pill('резонанс можливий — навантаження враховано', 'warn') : c.pill('V_cr > V_max — резонансу немає', 'ok')]))) : ''}
      ${card('Втома', `<p class="note">${R.vortex && R.vortex.gov ? 'Є ознаки циклічного навантаження: шви кінців консолей і анкери позначаються «Потребує зовнішнього дослідження» (ТЗ WLD-072), статус «Погоджено» блокується до втомної перевірки.' : 'Ознак резонансного циклічного навантаження не виявлено; втомна перевірка за ТЗ WLD-070 не вимагається для статичних декоративних елементів.'}</p>`)}`;
    },
  };

  P.welds = {
    render(c) {
      const { state, card, fmt, f, esc } = c;
      if (!state.R || !state.R.ok) return '<h2>Зварні шви</h2>' + c.needCalc();
      const R = state.R, W = R.welds.slice().sort((a, b) => b.u - a.u);
      const g = W[0];
      const base = R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]).best.b;
      return `<h2>Зварні шви</h2>
      <p class="lead">Кутові шви по контуру труб у кожному вузлі каркаса та шви опорних вузлів. Для кожного шва — катет, ефективна товщина горла a = 0,7k<sub>f</sub>, довжина, компоненти зусиль на одиницю довжини (від N, M<sub>y</sub>, M<sub>z</sub>, V, T), перевірка в найнебезпечнішій точці (кут контуру) за ДБН і методом напрямків EN 1993-1-8.</p>
      ${c.staleBanner()}
      ${g ? card(`Визначальний шов ${g.id} (${esc(g.group)}, вузол ${g.node})`, fmt.tbl(['Величина', 'Формула', 'Значення'], [
        ['Катет / горло', 'a = 0,7·k<sub>f</sub>', `k<sub>f</sub> = ${f(g.kf * 1000, 1)} мм; a = ${f(g.a * 1000, 2)} мм (межі ${f(g.lim.kmin, 1)}…${f(g.lim.kmax, 1)} мм)`],
        ['Довжина, момент інерції контуру', 'L<sub>w</sub> = 4b; I<sub>w</sub> = 2b(b/2)² + 2b³/12', `${f(g.Lw * 1000, 0)} мм; ${f(g.Iw * 1e6, 1)}·10⁻⁶ м³`],
        ['Від N', 'q = N/L<sub>w</sub>', `${f(g.contributions.N / 1000, 2)} кН/м`],
        ['Від M<sub>y</sub>, M<sub>z</sub>', 'q = M·(b/2)/I<sub>w</sub>', `${f(g.contributions.My / 1000, 2)}; ${f(g.contributions.Mz / 1000, 2)} кН/м`],
        ['Від T (Бредт)', 'q = T/(2b²)', `${f(g.contributions.T / 1000, 2)} кН/м`],
        ['Від V', 'q = V/(2b)', `${f(g.contributions.Vy / 1000, 2)}; ${f(g.contributions.Vz / 1000, 2)} кН/м`],
        ['Напруження в горлі', 'σ⊥ = τ⊥ = (q<sub>n</sub> + q<sub>t</sub>)/(a√2); τ∥ = q<sub>∥</sub>/a', `${MPa(g.sp)}; ${MPa(g.tp)}; ${MPa(g.tpar)} МПа (${g.wall})`],
        ['EN 1993-1-8', '√(σ⊥² + 3(τ⊥² + τ∥²)) ≤ f<sub>u</sub>/(β<sub>w</sub>γ<sub>M2</sub>)', fmt.U(g.uEN)],
        ['ДБН В.2.6-198', 'q/(β<sub>f</sub>k<sub>f</sub>) ≤ R<sub>wf</sub>γ<sub>c</sub>; q/(β<sub>z</sub>k<sub>f</sub>) ≤ R<sub>wz</sub>γ<sub>c</sub>', fmt.U(g.uDBN)],
        ['Сполучення', '', esc(g.combo)],
      ])) : ''}
      ${base ? card('Шов стійка — опорна плита', `<p>a = ${f(base.weldA * 1000, 2)} мм; U = ${fmt.U(base.weld)}; межі катета ${f(base.weldLim.kmin, 1)}…${f(base.weldLim.kmax, 1)} мм ${base.weldLim.ok ? c.pill('в межах', 'ok') : c.pill('поза межами', 'warn')}. Шви ребер і зсувного упору — у розділі «Опорна плита і ребра».</p>`) : ''}
      ${card('Таблиця швів (WLD 11.1)', fmt.tbl(['Шов', 'Тип', 'Елемент', 'Вузол', 'Переріз', 'k_f, мм', 'a, мм', 'L, мм', 'F_w,Ed, кН/м', 'F_w,Rd, кН/м', 'U', 'Катет', 'Визначальне'], W.map(w => [w.id, w.type, w.elem, w.node, w.sec, f(w.kf * 1000, 1), f(w.a * 1000, 2), f(w.Lgeom * 1000, 0), f(w.q / 1000, 2), f(w.FwRd / 1000, 1), fmt.U(w.u), w.lim.ok ? c.pill('ok', 'ok') : c.pill('поза межами', 'warn'), esc(w.combo.split(':')[0])])), `${W.length} швів`)}
      ${card('Вимоги до виконання (WLD-080)', `<ul><li>Зварювальні матеріали: ${esc(R.pr.design.electrode)}; сумісність з основним металом ${R.mdl.steel.id}.</li><li>Підготовка кромок і зазори — за ДСТУ EN ISO 9692-1; торці труб — герметичні шви по всьому контуру (захист порожнин від корозії).</li><li>Контроль: візуальний 100 % (VT), вибірковий капілярний/магнітопорошковий (PT/MT) для швів з U > 0,7 та швів опорних вузлів.</li><li>Доступність: шви всередині оболонки виконуються до її монтажу; обмежений доступ — попередження в протоколі.</li></ul>`)}`;
    },
  };

  P.basePlate = {
    render(c) {
      const { state, card, fmt, f, esc, fld } = c;
      const R = state.R && state.R.ok ? state.R : null;
      const gs = R ? R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]) : null;
      const b = gs && gs.best.b, r = gs && gs.best.r;
      return `<h2>Опорна плита і ребра жорсткості</h2>
      <p class="lead">Стійка → шов → плита (± ребра) → анкери, контакт із підливкою/бетоном → фундамент. Розподіл зусиль — жорстка плита на односторонньому пружному контакті в ефективній зоні c = t<sub>p</sub>√(f<sub>y</sub>/(3f<sub>jd</sub>γ<sub>M0</sub>)) навколо стінок труби й ребер; анкери працюють лише на розтяг; рівновага з відривом (ТЗ 4.2).</p>
      ${c.staleBanner()}
      <div class="cols">
      ${card('Плита і шов', `<div class="form">
        ${fld('base.type', 'Тип кріплення', '', { options: [['bolts', 'Опорна плита + фундаментні болти'], ['embed', 'Закладна деталь (плита з приварними шпильками)']], rerender: true })}
        ${fld('base.plateB', 'Розмір B', 'мм', { step: 10 })}${fld('base.plateL', 'Розмір L', 'мм', { step: 10 })}${fld('base.tp', 'Товщина t_p', 'мм', { step: 1 })}
        ${fld('base.weldLeg', 'Катет шва стійка–плита', 'мм', { step: 1 })}
        ${fld('base.alphaBearing', 'α = √(A_c1/A_c0)', '', { options: [['auto', 'авто (з розмірів підколонника)'], [1, '1,0'], [1.5, '1,5'], [2, '2,0'], [3, '3,0']] })}
      </div>`)}
      ${card('Ребра і передавання зсуву', `<div class="form">
        ${fld('base.nRibs', 'Ребра жорсткості', '', { options: [[0, 'без ребер'], [4, '4 (по осях)'], [8, '8 (осі + діагоналі)']], num: true, rerender: true })}
        ${state.pr.base.nRibs ? fld('base.hr', 'Висота ребра h_r', 'мм', { step: 10 }) + fld('base.tr', 'Товщина ребра t_r', 'мм', { step: 1 }) + fld('base.ribWeldLeg', 'Катет швів ребер', 'мм', { step: 1 }) : ''}
        ${fld('base.shear', 'Передавання горизонтальних сил (ТЗ 4.3)', '', { options: [['anchors', 'Анкерами'], ['friction', 'Тертям у контакті (решта — анкерами)'], ['lug', 'Зсувним упором']], rerender: true })}
        ${state.pr.base.shear === 'friction' ? fld('base.cf', 'C_f,d (тертя по підливці)', '', { step: 0.05 }) : ''}
        ${state.pr.base.shear === 'lug' ? fld('base.lugB', 'Упор: ширина', 'мм', { step: 10 }) + fld('base.lugH', 'висота', 'мм', { step: 10 }) + fld('base.lugT', 'товщина', 'мм', { step: 1 }) : ''}
      </div><p class="note">Повний опір тертя не додається до повного опору анкерів без обґрунтування: тертя сприймає частину сили, решту — анкери.</p>`)}
      </div>
      ${b ? card(`Визначальна опора ${gs.node.id} · ${esc(gs.best.combo)}`, fmt.tbl(['Перевірка', 'Формула / дія', 'Опір', 'U'], [
        ['Реакція (дія опори на каркас)', `N = ${kN(r[2])} кН; H = ${kN(Math.hypot(r[0], r[1]))} кН; M<sub>x</sub> = ${kNm(r[3])}; M<sub>y</sub> = ${kNm(r[4])}; M<sub>z</sub> = ${kNm(r[5])} кН·м`, '', ''],
        ['Зминання під плитою', `σ<sub>max</sub> = ${MPa(b.sigmaMax)} МПа; контакт ${fmt.pc(b.sol.contactFrac)} ефективної зони`, `f<sub>jd</sub> = ⅔·α·f<sub>cd</sub> = ⅔·${f(b.alpha, 2)}·${MPa(b.fcd)} = ${MPa(b.fjd)} МПа`, fmt.U(b.bearing)],
        ['Згин плити в зоні стиску', `c = ${f(b.c * 1000, 1)} мм; виліт від труби`, 'm ≤ t²f<sub>y</sub>/4', fmt.U(b.plateC)],
        ['Згин плити над анкером (Т-ділянка)', `T = ${kN(b.Tmax)} кН; m = ${f(b.m * 1000, 0)} мм; l<sub>eff</sub> = ${f(b.leff * 1000, 0)} мм`, `F<sub>T,1-2</sub> = 2M<sub>pl</sub>/m = ${kN(b.FT12)} кН`, fmt.U(b.plateT)],
        ['Шов стійка–плита', `a = ${f(b.weldA * 1000, 2)} мм`, 'метод напрямків + ДБН', fmt.U(b.weld)],
        ...(b.ribs ? [
          ['Ребро: міцність', `F = ${kN(b.ribs.F)} кН; M = ${kNm(b.ribs.M)} кН·м; переріз ребро + b<sub>eff</sub> = ${f(b.ribs.beff * 1000, 0)} мм плити`, `σ = ${MPa(b.ribs.sig)}; τ = ${MPa(b.ribs.tau)} МПа`, fmt.U(b.ribs.strength)],
          ['Ребро: місцева стійкість', `h<sub>r</sub>/t<sub>r</sub> = ${f(state.pr.base.hr / state.pr.base.tr, 1)}`, '≤ 14ε (виступна стінка, клас 3)', fmt.U(b.ribs.local)],
          ['Шви ребро–стійка', `2 шви k = ${f(b.ribs.k * 1000, 0)} мм`, 'зсув + згин', fmt.U(b.ribs.weldV)],
          ['Шви ребро–плита', 'потік зсуву q = V·S/I', '', fmt.U(b.ribs.weldH)],
        ] : []),
        ...(b.lug ? [['Зсувний упор', 'зминання бетону; згин; шви', '', fmt.U(b.lug.max)]] : []),
      ])) : c.needCalc()}
      ${b ? card('Жорсткість бази (податливість)', `<p>Дотична обертальна жорсткість (з моделі контакту й анкерів): S<sub>j,x</sub> = ${f(b.stiff.kx / 1e3, 0)} кН·м/рад; S<sub>j,y</sub> = ${f(b.stiff.ky / 1e3, 0)} кН·м/рад; вертикальна k<sub>z</sub> = ${f(b.stiff.kz / 1e6, 0)} МН/м. Класифікація (EN 1993-1-8, 5.2.2.5): <b>${gs.best.cls}</b>, S<sub>j</sub>/(EI<sub>c</sub>/L<sub>c</sub>) = ${f(gs.best.ratio, 1)} (жорстка ≥ 30, шарнірна ≤ 0,5). ${state.pr.base.flex === 'iter' ? 'Жорсткість передано в модель каркаса ітераційно.' : ''}</p>`) : ''}
      <section class="card"><h3>Схема вузла</h3>${R ? SC.drawings.basePlate(R, gs) : ''}</section>`;
    },
  };

  P.anchors = {
    render(c) {
      const { state, card, fmt, f, esc, fld } = c;
      const R = state.R && state.R.ok ? state.R : null;
      const gs = R ? R.supportRes.reduce((m, x) => x.best.u > m.best.u ? x : m, R.supportRes[0]) : null;
      const b = gs && gs.best.b, k = b && b.concrete;
      const bp = state.pr.base;
      return `<h2>Анкери і закладні деталі</h2>
      <p class="lead">Анкери розраховуються як група за EN 1992-4 для кожного сполучення: зусилля в кожному анкері з моделі контакту, всі механізми руйнування сталі й бетону, анкерні плити/шайби на кінці закладного болта, за потреби — додаткове армування в зоні бетонного конуса.</p>
      ${c.staleBanner()}
      <div class="cols">
      ${card(bp.type === 'embed' ? 'Закладна деталь' : 'Фундаментні болти', `<div class="form">
        ${fld('base.type', 'Тип', '', { options: [['bolts', 'Фундаментні болти з анкерною плитою'], ['embed', 'Закладна деталь з шпильками (EN ISO 13918)']], rerender: true })}
        ${fld('base.nAnchor', 'Кількість на опору', '', { options: [[4, '4'], [6, '6'], [8, '8']], num: true })}
        ${fld('base.d', bp.type === 'embed' ? 'Діаметр шпильки' : 'Діаметр болта', 'мм', { options: Object.keys(c.N.boltAs).map(d => [d, (bp.type === 'embed' ? 'Ø' : 'М') + d]), num: true })}
        ${bp.type === 'embed' ? '' : fld('base.grade', 'Клас / сталь', '', { options: c.N.boltGrades.map(x => [x.id, x.id]) })}
        ${bp.type === 'embed' ? '' : fld('base.boltType', 'Конструкція болта (Посібник, табл. 4)', '', { options: Object.entries(SC.posobie.types).map(([k, t]) => [k, `${t.name}: H = ${t.H}d`]) })}
        ${fld('base.edge', 'Відстань осі до краю плити', 'мм', { step: 5 })}
        ${fld('base.hef', 'Ефективне закладання h_ef', 'мм', { step: 10 })}
        ${fld('base.dh', 'Діаметр головки / анкерної шайби d_w', 'мм', { step: 5 })}
        ${fld('base.tw', 'Товщина анкерної шайби t_w', 'мм', { step: 1 })}
        ${fld('base.concrete', 'Бетон', '', { options: c.N.concretes.map(x => [x.id, x.id]) })}
        ${fld('base.cracked', 'Бетон з тріщинами (якщо не доведено інше)', '', { type: 'check' })}
      </div>`)}
      ${card('Додаткове армування анкерів <small>EN 1992-4, 7.2.1.9</small>', `<div class="form">
        ${fld('base.anchorReinf.on', 'Врахувати додаткове армування (хомути біля анкерів)', '', { type: 'check', rerender: true })}
        ${bp.anchorReinf.on ? fld('base.anchorReinf.ds', 'Діаметр d_s (≤ 16 мм)', 'мм', { options: [[8, '8'], [10, '10'], [12, '12'], [14, '14'], [16, '16']], num: true }) + fld('base.anchorReinf.nPerAnchor', 'Хомутів на анкер', '', { step: 1 }) + fld('base.anchorReinf.dist', 'Відстань від анкера (≤ 0,75h_ef)', 'мм', { step: 10 }) + fld('base.anchorReinf.hooked', 'Гаки / петлі (l₁ ≥ 4d_s), інакше прямі (≥ 10d_s)', '', { type: 'check' }) : ''}
        ${fld('base.splitReinf', 'Армування проти розколювання в підколоннику є', '', { type: 'check' })}
      </div><p class="note">Додаткове армування не компенсує недостатні відстані до країв або товщину фундаменту.</p>`)}
      </div>
      ${b ? card(`Зусилля в анкерах — опора ${gs.node.id}, ${esc(gs.best.combo.split(':')[0])}`, fmt.tbl(['Анкер', 'x, мм', 'y, мм', 'N_Ed, кН', 'V_Ed,x, кН', 'V_Ed,y, кН', 'V_Ed, кН', 'U сталі'], b.perAnchor.map(a => [a.i, f(a.x * 1000, 0), f(a.y * 1000, 0), kN(a.N), kN(a.Vx), kN(a.Vy), kN(a.V), fmt.U(bp.type === 'embed' ? (a.N / b.FtRd) ** 2 + (a.V / b.FvbRd) ** 2 : a.V / b.FvbRd + a.N / (1.4 * b.FtRd))]))) : c.needCalc()}
      ${b ? card('Механізми руйнування (EN 1992-4)', fmt.tbl(['Механізм', 'Розрахунковий вплив', 'Опір', 'U'], [
        ['Сталь при розтягу', `N = ${kN(b.Tmax)} кН`, bp.type === 'embed' ? `N<sub>Rd,s</sub> = A·f<sub>uk</sub>/1,5 = ${kN(b.FtRd)} кН` : `F<sub>t,Rd</sub> = 0,9·f<sub>ub</sub>·A<sub>s</sub>/γ<sub>M2</sub> = ${kN(b.FtRd)} кН`, fmt.U(b.anchorT)],
        ['Сталь при зрізі + розтяг', `V<sub>max</sub> = ${kN(b.Vmax)} кН (тертя ${kN(b.frictionTakes)}, упор ${kN(b.lugTakes)} кН)`, `F<sub>vb,Rd</sub> = ${kN(b.FvbRd)} кН`, fmt.U(b.anchorSteel)],
        ['Бетонний конус', `N<sub>Ed</sub><sup>g</sup> = ${kN(k.NEg)} кН`, `N⁰<sub>Rk,c</sub> = k₁√f<sub>ck</sub>·h<sub>ef</sub><sup>1,5</sup> = ${kN(k.N0)}; N<sub>Rk,c</sub> = ${kN(k.NRkc)} кН (A<sub>c,N</sub>/A⁰ = ${k.psi.A0 ? f(k.psi.Ac / k.psi.A0, 2) : '—'}, ψ<sub>s</sub> = ${k.psi.psiS ? f(k.psi.psiS, 2) : '—'}, ψ<sub>ec</sub> = ${k.psi.psiEc ? f(k.psi.psiEc, 2) : '—'}), γ<sub>Mc</sub> = 1,5`, fmt.U(k.cone)],
        ...(k.reinf ? [['Додаткове армування (замість конуса)', `n = ${k.reinf.nb} гілок Ø${k.reinf.ds}; l₁ = ${f(k.reinf.l1, 0)} мм (min ${f(k.reinf.l1min, 0)})`, `N<sub>Rd,re</sub> = ${kN(k.reinf.NRdre)}; N<sub>Rd,a</sub> = ${kN(k.reinf.NRda)} кН`, fmt.U(k.reinfU)]] : []),
        ['Вирив (головка/шайба)', `N = ${kN(b.Tmax)} кН`, `N<sub>Rk,p</sub> = k₂·A<sub>h</sub>·f<sub>ck</sub> = ${kN(k.NRkp)} кН, A<sub>h</sub> = π/4(d<sub>w</sub>² − d²) = ${f(k.Ah, 0)} мм²`, fmt.U(k.pullout)],
        ['Розколювання', k.splitNeeded ? 'потрібна перевірка' : 'не потрібна (c ≥ 1,5c<sub>cr,N</sub>, h ≥ 2h<sub>ef</sub> або армування)', k.NRksp ? `N<sub>Rk,sp</sub> = ${kN(k.NRksp)} кН` : '', fmt.U(k.split || 0)],
        ['Боковий викол', `c<sub>min</sub> = ${f(k.cmin, 0)} мм ${k.cmin < 0.5 * bp.hef ? '< 0,5h<sub>ef</sub>' : '≥ 0,5h<sub>ef</sub> — не визначальний'}`, k.NRkcb ? `N<sub>Rk,cb</sub> = ${kN(k.NRkcb)} кН` : '', fmt.U(k.blowout || 0)],
        ['Крайове сколювання при зрізі', `c₁ = ${f(k.cmin, 0)} мм`, k.VRkc ? `V<sub>Rk,c</sub> = ${kN(k.VRkc)} кН` : '—', fmt.U(k.edge || 0)],
        ['Виколювання (pry-out)', '', k.VRkcp ? `V<sub>Rk,cp</sub> = 2·N<sub>Rk,c</sub> = ${kN(k.VRkcp)} кН` : '—', fmt.U(k.pryout || 0)],
        ['Взаємодія N–V (бетон)', '(β<sub>N</sub>)<sup>1,5</sup> + (β<sub>V</sub>)<sup>1,5</sup> ≤ 1', '', fmt.U(k.inter)],
        ['Конструктивні вимоги', `s<sub>min</sub> = ${f(k.smin, 0)} мм; c<sub>min</sub> = ${f(k.cmin, 0)} мм; h = ${f(k.h, 0)} мм`, 's, c ≥ max(50; 4d); h ≥ h<sub>ef</sub> + 30', k.geomOk ? c.pill('виконуються', 'ok') : c.pill('не виконуються', 'bad')],
      ])) : ''}
      ${b ? card('Анкерна плита / шайба (ТЗ «Вимоги до анкерних плит і шайб»)', fmt.tbl(['Перевірка', 'Формула', 'Значення', 'U'], [
        ['Опорна площа', 'A<sub>brg</sub> = π/4·(d<sub>w</sub>² − d²)', `${f(b.washer.Abrg * 1e6, 0)} мм²`, ''],
        ['Тиск на бетон', 'σ = N/A<sub>brg</sub> ≤ 3f<sub>cd</sub>', `${MPa(b.washer.sig)} МПа`, fmt.U(b.washer.bearing)],
        ['Згин шайби', 'консоль від гайки: m = σc²/2 ≤ t²f<sub>y</sub>/4', `t<sub>w</sub> = ${f(b.washer.tw * 1000, 0)} мм`, fmt.U(b.washer.bend)],
      ])) : ''}
      ${R ? card('Перевірка за Посібником з проєктування анкерних болтів (до СНиП 2.09.03)', SC.reports.posobieBlock(R), R.posobie && R.posobie.best ? 'U = ' + f(R.posobie.best.u, 3) : '') : ''}
      ${card('Монтажні вимоги', '<ul><li>Фундаментні болти встановлювати за шаблоном (кондуктором), допуск положення ±3 мм, за висотою +20/−0 мм.</li><li>Гайки — з контргайками або пружинними шайбами; момент затягування — без урахування попереднього натягу в розрахунку.</li><li>Підливка — безусадковий розчин ≥ C30/37 товщиною 30…50 мм.</li><li>Захист від корозії виступаючої частини — цинкування або консервація.</li></ul>')}`;
    },
  };

  P.foundation = {
    render(c) {
      const { state, card, fmt, f, esc, fld } = c;
      const R = state.R && state.R.ok ? state.R : null;
      const fd = state.pr.found;
      const layers = fd.layers || [];
      const F = R && R.found;
      return `<h2>Фундаментна плита</h2>
      <p class="lead">Монолітна плита з підколонником. Зусилля всіх опор переносяться в центр підошви: F<sub>Σ</sub> = ΣF<sub>i</sub>, M<sub>O</sub> = Σ[M<sub>i</sub> + (r<sub>i</sub> − r<sub>O</sub>) × F<sub>i</sub>]. Тиск — жорстка плита з відривом (ґрунт не сприймає розтяг); II група — тиск, осідання, крен; I група — перекидання, зсув.</p>
      ${c.staleBanner()}
      <div class="cols">
      ${card('Геометрія і матеріали', `<div class="form">
        ${fld('found.B', 'Плита B (вздовж X)', 'м', { step: 0.1 })}${fld('found.L', 'Плита L (вздовж Y)', 'м', { step: 0.1 })}${fld('found.h', 'Товщина плити h', 'м', { step: 0.05 })}
        ${fld('found.pedB', 'Підколонник B', 'м', { step: 0.05 })}${fld('found.pedL', 'Підколонник L', 'м', { step: 0.05 })}${fld('found.pedH', 'Висота підколонника', 'м', { step: 0.05 })}
        ${fld('found.depth', 'Глибина закладання d', 'м', { step: 0.1 })}
        ${fld('found.concrete', 'Бетон', '', { options: c.N.concretes.map(x => [x.id, x.id]) })}
        ${fld('found.existing', 'Наявний фундамент (потрібні дані обстеження)', '', { type: 'check' })}
      </div><div class="row"><button class="btn" data-act="optFound">Підібрати розміри плити</button></div>${state.ui.optFound ? `<p class="note">${state.ui.optFound}</p>` : ''}`)}
      ${card('Основа', `<div class="form">
        ${fld('found.soilMode', 'Розрахунковий опір R', '', { options: [['R', 'Задати (з вишукувань)'], ['calc', 'Обчислити за ДБН В.2.1-10 (верхній шар)']], rerender: true })}
        ${fd.soilMode === 'R' ? fld('found.R', 'R', 'кПа') : fld('found.gammaC1', 'γ_c1', '', { step: 0.05 }) + fld('found.gammaC2', 'γ_c2', '', { step: 0.05 }) + fld('found.kfactor', 'k', '', { step: 0.1 })}
        ${fld('found.gwl', 'Рівень ґрунтових вод від поверхні', 'м', { step: 0.1 })}
        ${fld('found.frictionMu', 'Тертя по підошві μ', '', { step: 0.05 })}
        ${fld('found.minContact', 'Мінімальна частка контакту', '', { step: 0.05 })}
        ${fld('found.overturnSF', 'Запас на перекидання', '', { step: 0.1 })}
        ${fld('found.sLim', 'Граничне осідання s_u', 'м', { step: 0.01 })}
        ${fld('found.tiltLim', 'Граничний крен i_u', '', { step: 0.001 })}
      </div>`)}
      </div>
      ${card('Шари ґрунту (ТЗ 2.3)', `<div class="tw"><table class="edit"><thead><tr><th>Шар</th><th>h, м</th><th>γ, кН/м³</th><th>E, МПа</th><th>ν</th><th>φ, °</th><th>c, кПа</th><th></th></tr></thead><tbody>
        ${layers.map((L, i) => `<tr><td><input data-layer="${i}.name" value="${esc(L.name)}" style="min-width:180px"></td>${['h', 'gamma', 'E', 'nu', 'phi', 'c'].map(k => `<td><input data-layer="${i}.${k}" type="number" step="any" value="${L[k]}"></td>`).join('')}<td><button class="btn small" data-act="delLayer" data-i="${i}">✕</button></td></tr>`).join('')}
      </tbody></table></div><div class="row"><button class="btn" data-act="addLayer">Додати шар</button></div><p class="note">Без даних інженерно-геологічних вишукувань рішення фундаменту — лише попереднє.</p>`)}
      ${F ? card('Перевірки', fmt.tbl(['Перевірка', 'Сполучення', 'Значення', 'Критерій', 'U'], [
        ['Середній тиск p<sub>m</sub>', esc(F.govSls.cb.name), f(F.govSls.chk.p.pmean / 1000, 1) + ' кПа', `≤ R = ${f(F.Rsoil, 0)} кПа`, fmt.U(F.govSls.chk.pMean)],
        ['Крайовий тиск p<sub>max</sub>', esc(F.govSls.cb.name), f(F.govSls.chk.p.pmax / 1000, 1) + ' кПа', `≤ 1,2R = ${f(1.2 * F.Rsoil, 0)} кПа`, fmt.U(F.govSls.chk.pMax)],
        ['Частка контакту', esc(F.govSls.cb.name), fmt.pc(F.govSls.chk.p.contactFrac), `≥ ${fmt.pc(fd.minContact)}`, fmt.U(F.govSls.chk.contact)],
        ['Осідання s', 'SLS max p<sub>m</sub>', f(F.settle.s * 1000, 1) + ' мм', `≤ ${f(fd.sLim * 1000, 0)} мм`, fmt.U(F.settle.uS)],
        ['Крен i', 'SLS max M', F.settle.tilt.toExponential(2), `≤ ${fd.tiltLim}`, fmt.U(F.settle.uT)],
        ['Перекидання', esc(F.govUls.cb.name), f(F.govUls.chk.overturn, 3), `M<sub>перек</sub>/M<sub>утр</sub> ≤ 1/${fd.overturnSF}`, fmt.U(F.govUls.chk.overturn * fd.overturnSF)],
        ['Зсув', esc(F.govUls.cb.name), f(F.govUls.chk.slide, 3), `H/(μN) ≤ 1/1,2`, fmt.U(F.govUls.chk.slide * 1.2)],
      ]) + `<p class="note">Для повного контакту тиск збігається з q = N/(BL) ± M<sub>x</sub>y/I<sub>x</sub> ± M<sub>y</sub>x/I<sub>y</sub>: q<sub>max</sub> = ${f(F.govSls.chk.p.qmaxLin / 1000, 1)}, q<sub>min</sub> = ${f(F.govSls.chk.p.qminLin / 1000, 1)} кПа.${F.soil ? ` R = γ<sub>c1</sub>γ<sub>c2</sub>/k·(M<sub>γ</sub>bγ + M<sub>q</sub>dγ + M<sub>c</sub>c) = ${f(F.Rsoil, 1)} кПа (M<sub>γ</sub> = ${f(F.soil.mg, 2)}, M<sub>q</sub> = ${f(F.soil.mq, 2)}, M<sub>c</sub> = ${f(F.soil.mc, 2)}).` : ''}</p>`) : c.needCalc()}
      ${F ? card('Осідання — пошарове підсумовування', `<p>p₀ = p<sub>m</sub> − σ<sub>zg,0</sub> = ${f(F.settle.p0, 1)} кПа; стислива товща H<sub>c</sub> = ${f(F.settle.Hc, 2)} м (σ<sub>zp</sub> = 0,2σ<sub>zg</sub>); s = 0,8·Σσ<sub>zp,i</sub>h<sub>i</sub>/E<sub>i</sub> = <b>${f(F.settle.s * 1000, 1)} мм</b>.</p>` + fmt.tbl(['z, м', 'α', 'σ_zp, кПа', 'σ_zg, кПа', 'E, МПа', 'Δs, мм', 'Шар'], F.settle.rows.slice(0, 30).map(r => [f(r.z, 2), f(r.alpha, 3), f(r.szp, 1), f(r.szg, 1), f(r.E, 0), f(r.ds * 1000, 2), esc(r.layer)]))) : ''}
      ${F ? `<section class="card"><h3>План і розріз</h3>${SC.drawings.foundation(R)}</section>` : ''}`;
    },
    onChange(e, c) {
      const t = e.target; if (t.dataset.layer == null) return false;
      const [i, k] = t.dataset.layer.split('.'); const L = c.state.pr.found.layers[+i];
      L[k] = k === 'name' ? t.value : parseFloat(t.value) || 0; c.changed('шар ґрунту.' + k, '', L[k]); return true;
    },
    onAct(a, b, c) {
      const L = c.state.pr.found.layers = c.state.pr.found.layers || [];
      if (a === 'addLayer') { L.push({ name: 'Новий шар', h: 2, gamma: 18, E: 15, nu: 0.3, phi: 25, c: 5 }); c.changed('шари', '', 'додано'); c.render(); return true; }
      if (a === 'delLayer') { L.splice(+b.dataset.i, 1); c.changed('шари', '', 'видалено'); c.render(); return true; }
      if (a === 'optFound') {
        if (!c.state.R || !c.state.R.ok) { c.toast('Спочатку виконайте розрахунок.'); return true; }
        const o = SC.analysis.optimizeFoundation(c.state.R);
        if (!o.best) { c.state.ui.optFound = 'Рішення не знайдено в заданих обмеженнях (до 6×6 м). Змініть схему фундаменту або ґрунтові умови.'; c.render(); return true; }
        const fd = c.state.pr.found, old = `${fd.B}×${fd.L}×${fd.h}`;
        fd.B = o.best.B; fd.L = o.best.L; fd.h = o.best.h;
        c.state.ui.optFound = `Підібрано: ${o.best.B}×${o.best.L}×${o.best.h} м, бетон ${c.f(o.best.V, 2)} м³; визначає: ${c.esc(o.best.gov)} (U = ${c.f(o.best.u, 2)}). Розглянуто ${o.tried.length + 1} варіантів.`;
        c.changed('фундамент', old, `${fd.B}×${fd.L}×${fd.h}`); c.runCalc('foundation'); return true;
      }
      return false;
    },
  };

  P.rebar = {
    render(c) {
      const { state, card, fmt, f, fld } = c;
      const R = state.R && state.R.ok ? state.R : null;
      const F = R && R.found, s = F && F.slab;
      return `<h2>Армування фундаменту</h2>
      <p class="lead">Основне армування плити — за епюрами моментів від реактивного тиску ULS (з відривом) біля граней підколонника; перевірки поперечної сили, продавлювання, тріщин, мінімального армування й анкерування (EN 1992-1-1 / ДБН В.2.6-98). Підколонник — вертикальна арматура й хомути; додаткове армування анкерів — у розділі «Анкери».</p>
      ${c.staleBanner()}
      ${card('Матеріали', `<div class="form">${fld('found.rebar', 'Клас арматури', '', { options: c.N.rebars.map(r => [r.id, r.id]) })}${fld('found.cover', 'Захисний шар', 'мм', { step: 5 })}${fld('found.concrete', 'Бетон', '', { options: c.N.concretes.map(x => [x.id, x.id]) })}</div>`)}
      ${s ? card('Плита', fmt.tbl(['Перевірка', 'Розрахунок', 'Прийнято', 'U'], [
        ['Низ, уздовж X', `M<sub>Ed</sub> = ${kNm(s.bx.M)} кН·м/м; d = ${f(s.dBot * 1000, 0)} мм; A<sub>s</sub> = M/(0,9d·f<sub>yd</sub>) = ${f(s.bx.As * 1e6, 0)}; A<sub>s,min</sub> = ${f(s.bx.Asmin * 1e6, 0)} мм²/м`, `Ø${s.bx.pick.dia} крок ${s.bx.pick.s} (${f(s.bx.pick.As * 1e6, 0)} мм²/м)`, fmt.U(s.bx.Areq / s.bx.pick.As)],
        ['Низ, уздовж Y', `M<sub>Ed</sub> = ${kNm(s.by.M)} кН·м/м; A<sub>s</sub> = ${f(s.by.As * 1e6, 0)} мм²/м`, `Ø${s.by.pick.dia} крок ${s.by.pick.s}`, fmt.U(s.by.Areq / s.by.pick.As)],
        ['Верх, уздовж X / Y', `M<sub>Ed</sub> = ${kNm(s.tx.M)} / ${kNm(s.ty.M)} кН·м/м (від ваги консолей при відриві)`, `Ø${s.tx.pick.dia}/${s.tx.pick.s}; Ø${s.ty.pick.dia}/${s.ty.pick.s}`, fmt.U(Math.max(s.tx.Areq / s.tx.pick.As, s.ty.Areq / s.ty.pick.As))],
        ['Поперечна сила (6.2.2)', 'V<sub>Rd,c</sub> = C<sub>Rd,c</sub>k(100ρf<sub>ck</sub>)<sup>1/3</sup>·bd', '', fmt.U(Math.max(s.shearX, s.shearY))],
        ['Продавлювання (6.4)', `u₁ = ${f(s.u1, 2)} м (2d від підколонника); v<sub>Ed</sub> = βV/(u₁d) = ${MPa(s.vEd)} МПа`, `v<sub>Rd,c</sub> = ${MPa(s.vRdc)} МПа`, fmt.U(s.punching)],
        ['Тріщини (7.3.3, w<sub>k</sub> = 0,3 мм)', `σ<sub>s</sub> (квазіпостійне) = ${f(s.sigS, 0)} МПа`, `φ*<sub>s,max</sub> = ${s.phiMax} мм`, fmt.U(s.crack)],
        ['Анкерування (8.4)', `f<sub>bd</sub> = 2,25η₁η₂f<sub>ctd</sub> = ${f(s.lb.fbd, 2)} МПа`, `l<sub>bd</sub> = ${f(s.lb.lbd, 0)} мм`, ''],
      ])) : c.needCalc()}
      ${F ? card('Підколонник', `<p>M = M<sub>опор</sub> + H·h<sub>пк</sub> = ${kNm(F.ped.M)} кН·м; A<sub>s,грань</sub> = ${f(F.ped.AsFace * 1e6, 0)} мм²; A<sub>s,min</sub> = max(0,002A<sub>c</sub>; 0,1N/f<sub>yd</sub>) = ${f(F.ped.AsMinTot * 1e6, 0)} мм² → <b>${F.ped.n} Ø${F.ped.dia}</b> по периметру; хомути Ø${F.ped.hoop.dia} крок ${f(F.ped.hoop.s, 0)} мм.</p>`) : ''}
      ${F ? card('Відомість деталей арматури', fmt.tbl(['Поз.', 'Найменування', 'Ø, мм', 'Довжина, м', 'К-сть', 'Загальна довжина, м', 'Маса, кг'], F.rebar.rows.map(r => [r.pos, r.name, r.dia, f(r.len, 2), r.cnt, f(r.total, 1), f(r.mass, 1)])) + `<p class="note">Усього: <b>${f(F.rebar.total, 1)} кг</b>.</p>`) : ''}`;
    },
  };

  P.shell = {
    render(c) {
      const { state, card, fmt, f, esc } = c;
      if (!state.R || !state.R.ok) return '<h2>Оболонка (лист)</h2>' + c.needCalc();
      const R = state.R;
      return `<h2>Розрахунок листа оболонки</h2>
      <p class="lead">Режим: ${state.pr.shell.mode === 'non-structural' ? 'ненесуче облицювання' : 'спільна робота (потрібне погодження)'}. Панель листа між ребрами — пластина, защемлена по контуру: σ = β·p·b²/t², w = α·p·b⁴/(E·t³), D = Et³/(12(1−ν²)). Товщина листа впливає на жорсткість у кубі — крок ребер підбирається разом із товщиною (ТЗ 9). Прогин обмежено min(b/${state.pr.shell.wLim}; t).</p>
      ${c.staleBanner()}
      ${card('Частини', fmt.tbl(['Частина', 'Матеріал, t', 'p (тиск + вага), Па', 'Крок ребер s, мм', 'σ, МПа (β)', 'w, мм (гран.)', 'D, Н·м', 'Ребро (штаба)', 'Маса ребер, кг', 'U'], R.shellRes.map(s => [esc(s.part), `${s.mat.name}, ${f(s.t * 1000, 1)} мм`, f(s.pTot, 0), f(s.s * 1000, 0), `${MPa(s.panel.sig)} (${f(s.panel.beta, 3)})`, `${f(s.panel.w * 1000, 2)} (${f(s.panel.wLim * 1000, 2)})`, f(s.panel.D, 1), `${s.rib.h}×${s.rib.t}, L = ${f(s.Lr, 2)} м`, f(s.ribMass, 1), fmt.U(s.u)])))}
      ${card('Кріплення листа', `<p>Зусилля на 1 м з'єднання листа з ребром: q = p·s/2 = ${R.shellRes.map(s => `${esc(s.part)}: ${f(s.qWeld / 1000, 2)} кН/м`).join('; ')}. Переривчастий шов 30/150 мм катетом ≥ t листа або заклепки — за розрахунком виробника. Стики й розриви листа, технологічні отвори і дренаж задаються при деталюванні.</p>`)}`;
    },
  };
})(window.SC = window.SC || {});
