/* Розділ «Каркас»: схема і генерація, редактор вузлів і стрижнів (граф G = (V, E)), перерізи й підбір,
 * порівняння варіантів (UI-7.3), сортамент труб. */
(function (SC) {
  'use strict';
  const P = SC.pages = SC.pages || {};

  P.frame = {
    input: true,
    render(c) {
      const { state, fld, card } = c;
      const fr = state.pr.frame;
      return `<h2>Схема каркаса і параметри генерації</h2>
      <p class="lead">Основний каркас — силове ядро з квадратних труб усередині тулуба; виносні консолі до голови, рук і атрибутів будуються автоматично від найближчого вузла ядра. Геометричний «скелет» форми — лише підказка, а не готовий несучий каркас (ТЗ 7.2).</p>
      <div class="cols">
      ${card('Ядро', `<div class="form">
        ${fld('frame.type', 'Тип ядра', '', { options: [['single', 'Одна стійка (консоль)'], ['core3', 'Тригранне ядро'], ['core4', 'Чотиригранне ядро']], rerender: true })}
        ${fr.type !== 'single' ? fld('frame.a', 'Розмір у плані внизу a', 'м', { step: 0.05 }) + fld('frame.b', 'b (для 4 стійок)', 'м', { step: 0.05 }) + fld('frame.aTop', 'a вгорі', 'м', { step: 0.05 }) + fld('frame.bTop', 'b вгорі', 'м', { step: 0.05 }) + fld('frame.bracing', 'Зв\'язки граней', '', { options: [['X', 'Хрестові'], ['Z', 'Розкісні'], ['none', 'Без зв\'язків (рамне)']], rerender: true }) : ''}
        <div class="fld"><label for="f_levels"><span>Рівні поперечних рам (через ;)</span><span class="unit">м</span></label><input id="f_levels" data-levels="1" value="${fr.levels.join('; ')}"><span class="hint">Верх ядра — останній рівень. Крок рівнів — крок поясів (ребер) ядра.</span></div>
        ${fld('frame.steel', 'Марка сталі', '', { options: c.N.steels.map(s => [s.id, `${s.id} (Ryn ${s.Ryn} МПа)`]) })}
        ${fld('frame.gammaC', 'γc — коефіцієнт умов роботи', '', { step: 0.05 })}
        ${fld('frame.exposed', 'Каркас відкритий вітру (без оболонки)', '', { type: 'check' })}
      </div>`)}
      ${card('Розрахункова модель', `<div class="form">
        ${fld('design.second', 'Розрахунок 2-го порядку (P-Δ) з глобальними недосконалостями', '', { type: 'check' })}
        ${fld('design.method', 'Розрахункова довжина', '', { options: [['A', 'A: 2-й порядок, L_cr = системна довжина'], ['B', 'B: 1-й порядок, μ = 2 для консолей']] })}
        ${fld('design.curve', 'Крива стійкості EN', '', { options: [['c', 'c — холодноформовані труби'], ['a', 'a — гарячеформовані труби']] })}
        ${fld('design.gammaM0', 'γ_M0', '', { step: 0.05 })}${fld('design.gammaM1', 'γ_M1', '', { step: 0.05 })}
      </div>`)}
      ${card('Обмеження генерації і підбору <small>UI-7.1</small>', `<div class="form">
        ${fld('design.target', 'Цільовий коефіцієнт використання U', '', { step: 0.05 })}
        ${fld('design.tMin', 'Мінімальна товщина стінки (зварювання, корозія)', 'мм', { step: 0.5 })}
        ${fld('design.bMin', 'Мінімальний розмір труби стійок', 'мм', { step: 10 })}
        ${fld('design.bMax', 'Максимальний розмір труби (габарит у тулубі)', 'мм', { step: 10 })}
        ${fld('design.lockPost', 'Заблокувати переріз стійок (не змінювати підбором)', '', { type: 'check' })}
      </div>`)}
      </div>`;
    },
    onChange(e, c) {
      const t = e.target; if (!t.dataset.levels) return false;
      const lv = t.value.split(/[;,\s]+/).map(x => parseFloat(x.replace(',', '.'))).filter(x => isFinite(x) && x >= 0).sort((a, b) => a - b);
      if (lv.length >= 2) { const old = c.state.pr.frame.levels.join(';'); c.state.pr.frame.levels = lv; c.changed('рівні ядра', old, lv.join(';')); } else c.toast('Потрібно щонайменше два рівні.');
      return true;
    },
  };

  P.nodes = {
    input: true,
    render(c) {
      const { state, card, fmt, f, esc, secOptions } = c;
      const fr = state.pr.frame;
      const mdl = SC.model.build(state.pr);
      const ids = mdl.nodes.map(n => n.id);
      const nodeOpts = sel => ids.map(id => `<option ${id === sel ? 'selected' : ''}>${id}</option>`).join('');
      return `<h2>Вузли та стрижні</h2>
      <p class="lead">Каркас зберігається як граф G = (V, E): вузли з координатами й закріпленнями, стрижні з перерізом, типом роботи та групою (ТЗ 7.1). Згенеровані автоматично елементи показано нижче; власні вузли й стрижні (додаткові опори, підкоси плаща, тяжі) додаються в таблицях редактора.</p>
      <section class="card"><h3>Перегляд схеми <small>тягніть — обертання; позначки вузлів</small></h3><div class="viewer"><canvas id="cvNodes"></canvas></div></section>
      ${card('Додаткові вузли', `<div class="tw"><table class="edit"><thead><tr><th>Ідентифікатор</th><th>x, м</th><th>y, м</th><th>z, м</th><th>Закріплення</th><th></th></tr></thead><tbody>
        ${(fr.extraNodes || []).map((n, i) => `<tr><td><input data-xn="${i}.id" value="${esc(n.id)}"></td>${['x', 'y', 'z'].map(k => `<td><input data-xn="${i}.${k}" type="number" step="0.01" value="${n[k]}"></td>`).join('')}<td><select data-xn="${i}.sup"><option value="none" ${n.sup === 'none' ? 'selected' : ''}>вільний</option><option value="fixed" ${n.sup === 'fixed' ? 'selected' : ''}>защемлення</option><option value="pinned" ${n.sup === 'pinned' ? 'selected' : ''}>шарнір</option></select></td><td><button class="btn small" data-act="delXN" data-i="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="6">Немає.</td></tr>'}
      </tbody></table></div><div class="row"><button class="btn" data-act="addXN">Додати вузол</button></div>`)}
      ${card('Додаткові стрижні', `<div class="tw"><table class="edit"><thead><tr><th>Початок</th><th>Кінець</th><th>Переріз</th><th>Робота</th><th>Група</th><th></th></tr></thead><tbody>
        ${(fr.extraElems || []).map((e, i) => `<tr><td><select data-xe="${i}.i">${nodeOpts(e.i)}</select></td><td><select data-xe="${i}.j">${nodeOpts(e.j)}</select></td><td><select data-xe="${i}.sec">${secOptions().map(([v]) => `<option ${v === e.sec ? 'selected' : ''}>${v}</option>`).join('')}</select></td><td><select data-xe="${i}.type"><option value="beam" ${e.type !== 'truss' ? 'selected' : ''}>балка (згин)</option><option value="truss" ${e.type === 'truss' ? 'selected' : ''}>ферма (осьова)</option></select></td><td><input data-xe="${i}.group" value="${esc(e.group || 'Додаткові елементи')}"></td><td><button class="btn small" data-act="delXE" data-i="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="6">Немає.</td></tr>'}
      </tbody></table></div><div class="row"><button class="btn" data-act="addXE">Додати стрижень</button></div>`)}
      ${card('Згенеровані вузли', fmt.tbl(['Вузол', 'x, м', 'y, м', 'z, м', 'Закріплення'], mdl.nodes.map(n => [n.id, f(n.x, 3), f(n.y, 3), f(n.z, 3), n.sup ? (n.sup[3] ? 'защемлення' : 'шарнір') : '—'])), `${mdl.nodes.length}`)}
      ${card('Згенеровані стрижні', fmt.tbl(['Елемент', 'Вузли', 'Група', 'Переріз', 'Робота', 'Довжина, м'], mdl.elems.map(e => { const a = mdl.nodes.find(n => n.id === e.i), b = mdl.nodes.find(n => n.id === e.j); return [e.id, `${e.i} → ${e.j}`, esc(e.group), e.sec.name, e.type === 'truss' ? 'ферма' : 'балка', f(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), 3)]; })), `${mdl.elems.length}`)}`;
    },
    after(c) {
      const cv = document.getElementById('cvNodes'); if (!cv) return;
      const mdl = SC.model.build(c.state.pr);
      const v = SC.view3d.create(cv, () => ({ nodes: mdl.nodes, elems: mdl.elems, parts: c.state.pr.parts, labels: true }));
      v.draw(); P.nodes.view = v;
    },
    resize() { if (P.nodes.view) P.nodes.view.draw(); },
    onChange(e, c) {
      const t = e.target, fr = c.state.pr.frame;
      if (t.dataset.xn) { const [i, k] = t.dataset.xn.split('.'); fr.extraNodes[+i][k] = ['x', 'y', 'z'].includes(k) ? parseFloat(t.value) || 0 : t.value; c.changed('вузол.' + k, '', t.value); c.render(); return true; }
      if (t.dataset.xe) { const [i, k] = t.dataset.xe.split('.'); fr.extraElems[+i][k] = t.value; c.changed('стрижень.' + k, '', t.value); c.render(); return true; }
      return false;
    },
    onAct(a, b, c) {
      const fr = c.state.pr.frame; fr.extraNodes = fr.extraNodes || []; fr.extraElems = fr.extraElems || [];
      if (a === 'addXN') { fr.extraNodes.push({ id: 'N' + (fr.extraNodes.length + 1), x: 0.8, y: 0, z: 0, sup: 'fixed' }); c.changed('вузли', '', 'додано'); c.render(); return true; }
      if (a === 'delXN') { fr.extraNodes.splice(+b.dataset.i, 1); c.changed('вузли', '', 'видалено'); c.render(); return true; }
      if (a === 'addXE') { const m = SC.model.build(c.state.pr); fr.extraElems.push({ i: m.nodes[0].id, j: m.nodes[m.nodes.length - 1].id, sec: '□60×4', type: 'beam', group: 'Додаткові елементи' }); c.changed('стрижні', '', 'додано'); c.render(); return true; }
      if (a === 'delXE') { fr.extraElems.splice(+b.dataset.i, 1); c.changed('стрижні', '', 'видалено'); c.render(); return true; }
      return false;
    },
  };

  P.sections = {
    render(c) {
      const { state, fld, card, fmt, f, esc, secOptions } = c;
      const fr = state.pr.frame;
      const R = state.R && state.R.ok ? state.R : null;
      const gU = g => R ? Math.max(0, ...R.memberRes.filter(m => m.e.group === g).map(m => m.best.u)) : null;
      const rows = [['Стійки ядра', 'frame.secPost'], ...(fr.type !== 'single' ? [['Пояси (кільця)', 'frame.secRing']] : []), ...(fr.type !== 'single' && fr.bracing !== 'none' ? [["Зв'язки", 'frame.secBrace']] : [])];
      const hist = state.ui.optHist;
      return `<h2>Перерізи і підбір</h2>
      <p class="lead">Перерізи груп задаються вручну або підбираються автоматично: для кожної групи — найлегший типорозмір сортаменту, для якого всі перевірки дають U ≤ ціль (${state.pr.design.target}); товщина ≥ ${state.pr.design.tMin} мм, клас перерізу ≤ 3. Після кожної зміни власна вага перераховується (ТЗ 1). Результат — «найкращий знайдений», не доведений глобальний оптимум (UI-7.4).</p>
      ${c.staleBanner()}
      ${card('Групи елементів', `<div class="form">${rows.map(([g, p]) => fld(p, g + (R ? ` — U = ${f(gU(g), 3)}` : ''), '', { options: secOptions() })).join('')}</div>` +
        `<div class="tw"><table class="edit"><thead><tr><th>Консоль</th><th>Переріз</th><th>U</th></tr></thead><tbody>${state.pr.parts.map((p, i) => p.kind === 'cant' ? `<tr><td>${esc(p.name)}</td><td><select data-ppath="${i}.sec" data-type="str">${secOptions().map(([v, l]) => `<option value="${v}" ${v === p.sec ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td>${R ? fmt.U(gU('Консоль: ' + p.name)) : '—'}</td></tr>` : '').join('')}</tbody></table></div>
        <div class="row"><button class="btn primary" data-act="opt">Підібрати перерізи автоматично</button></div>`)}
      ${hist ? card('Ітерації підбору', fmt.tbl(['№', 'Перерізи груп', 'U груп', 'Маса каркаса, кг'], hist.map(h => [h.it + 1, h.sections.join(' · '), h.U.map(u => f(u, 2)).join(' · '), f(h.mass, 0)]))) : ''}
      ${card('Шви каркаса', `<div class="form">
        ${fld('design.weldLegFrame', 'Катет швів балкових елементів', 'мм', { options: [['auto', 'авто (за ДБН табл. 38 і міцністю)'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8']] })}
        ${fld('design.weldLegBrace', 'Катет швів зв\'язків', 'мм', { options: [['auto', 'авто'], [3, '3'], [4, '4'], [5, '5'], [6, '6']] })}
        ${fld('design.electrode', 'Зварювальні матеріали', '', { options: SC.welds.electrodes.map(e => [e.id, e.id]) })}
      </div>`)}`;
    },
    onChange(e, c) { if (e.target.dataset.ppath) return SC.pages.parts.onChange(e, c); return false; },
  };

  P.variants = {
    render(c) {
      const { state, card, fmt, f, esc } = c;
      const res = state.ui.variants || [];
      const feas = res.filter(r => r.ok && r.feasible);
      const best = feas.reduce((m, r) => (!m || r.cost < m.cost ? r : m), null);
      return `<h2>Порівняння конструктивних варіантів</h2>
      <p class="lead">Для кожної схеми ядра виконується автоматичний підбір перерізів і повний розрахунок (крок вітру 30° для швидкості). Порівнюються лише допустимі варіанти: нижча ціна не компенсує непроходження міцності чи стійкості (ТЗ 7.3, 3.4.4). Підсумок — «найкращий знайдений» серед перевірених, а не доведений оптимум.</p>
      ${card('Запуск', `<div class="row"><button class="btn primary" data-act="runVariants">Порівняти ${SC.analysis.variantList(state.pr).length} варіантів</button><span class="note" id="varProg">${state.ui.varProg || 'Займає 20–60 с.'}</span></div>`)}
      ${res.length ? card('Результати', fmt.tbl(['Варіант', 'Статус', 'Маса каркаса, кг', 'Вартість, грн', 'Профілів', 'Типорозмірів', 'Шви, м', 'Вузлів', 'max U', 'Переміщення, мм', 'Реакція M, кН·м', 'T₁, с', 'Перерізи', ''], res.map(r => r.ok ? [esc(r.v.name), r.feasible ? (r === best ? c.pill('найкращий знайдений', 'ok') : c.pill('допустимий', 'ok')) : c.pill('відхилено: ' + r.reason, 'bad'), f(r.mass, 0), f(r.cost, 0), r.nMembers, r.nTypes, f(r.weld, 1), r.joints, fmt.U(r.maxU), f(r.uMax * 1000, 1), f(r.Rmax / 1000, 2), f(r.T1, 3), r.keys.map(k => k.sec).join(' · '), r.feasible ? `<button class="btn small" data-act="applyVariant" data-i="${res.indexOf(r)}">Прийняти</button>` : ''] : [esc(r.v.name), c.pill('помилка', 'bad'), esc(r.reason || ''), '', '', '', '', '', '', '', '', '', '', '']))) : ''}`;
    },
    onAct(a, b, c) {
      if (a === 'runVariants') {
        const list = SC.analysis.variantList(c.state.pr), out = [];
        let i = 0;
        const step = () => {
          if (i >= list.length) { c.state.ui.variants = out; c.state.ui.varProg = 'Готово.'; c.progress(0); c.render(); return; }
          const el = document.getElementById('varProg'); if (el) el.textContent = `Варіант ${i + 1} з ${list.length}: ${list[i].name}…`;
          c.progress((i + 0.5) / list.length);
          setTimeout(() => { try { out.push(SC.analysis.variant(c.state.pr, list[i])); } catch (err) { out.push({ v: list[i], ok: false, reason: err.message }); } i++; step(); }, 20);
        };
        step(); return true;
      }
      if (a === 'applyVariant') {
        const r = c.state.ui.variants[+b.dataset.i];
        const pr = c.state.pr;
        pr.frame.type = r.pr.frame.type; pr.frame.bracing = r.pr.frame.bracing; pr.frame.secPost = r.pr.frame.secPost; pr.frame.secRing = r.pr.frame.secRing; pr.frame.secBrace = r.pr.frame.secBrace;
        pr.parts.forEach((p, k) => { if (r.pr.parts[k]) p.sec = r.pr.parts[k].sec; });
        c.changed('варіант каркаса', '', r.v.name); c.runCalc('frame'); return true;
      }
      return false;
    },
  };

  P.catalog = {
    render(c) {
      const { state, card, fmt, f, N } = c;
      const steel = N.steels.find(s => s.id === state.pr.frame.steel) || N.steels[1];
      const flt = state.ui.catFilter || '';
      const rows = SC.sections.list().filter(s => !flt || String(s.bmm) === flt).map(s => {
        const cl = SC.checks.sectionClass(s, steel.Ryn);
        return [s.name, f(s.bmm, 0), f(s.tmm, 1), f(s.ro * 1000, 1), f(s.A * 1e4, 2), f(s.Iy * 1e8, 1), f(s.Wel * 1e6, 2), f(s.Wpl * 1e6, 2), f(s.i * 100, 2), f(s.J * 1e8, 1), f(s.mass, 2), f(s.perim, 3), cl.cls];
      });
      return `<h2>Сортамент квадратних труб і сталей</h2>
      <p class="lead">База гнутозварних квадратних труб: січення b×b, товщина стінки t, радіус кута, площа, моменти інерції та опору, радіус інерції, момент інерції при крученні, маса 1 м, площа фарбування, клас перерізу для обраної сталі ${steel.id}. Характеристики — з урахуванням радіусів кутів за ДСТУ EN 10219-2.</p>
      ${card('Труби', `<div class="row"><label>Типорозмір b <select id="catf"><option value="">усі</option>${SC.sections.catalog.map(([b]) => `<option ${String(b) === flt ? 'selected' : ''}>${b}</option>`).join('')}</select></label></div>` + fmt.tbl(['Переріз', 'b, мм', 't, мм', 'r_o, мм', 'A, см²', 'I, см⁴', 'W_el, см³', 'W_pl, см³', 'i, см', 'I_t, см⁴', 'Маса, кг/м', 'Фарбування, м²/м', 'Клас'], rows), `${rows.length} типорозмірів`)}
      ${card('Сталі', fmt.tbl(['Марка', 'R_yn (f_y), МПа', 'R_un (f_u), МПа', 'γ_m', 'R_y, МПа', 'Товщина до, мм', 'Густина, кг/м³'], N.steels.map(s => [s.id, s.Ryn, s.Run, s.gm, f(s.Ryn / (s.norm === 'dbn' ? s.gm : 1.025), 1), s.tmax, 7850])) + `<p class="note">${N.steelsMeta.src} ${c.normPill(N.steelsMeta.status)}. ${N.steelsMeta.note}</p>`)}
      ${card('Анкерні болти та бетон', fmt.tbl(['Клас', 'f_yb, МПа', 'f_ub, МПа'], N.boltGrades.map(b => [b.id, b.fyb, b.fub])) + fmt.tbl(['Діаметр', 'A_s, мм²'], Object.entries(N.boltAs).map(([d, a]) => ['М' + d, a])) + fmt.tbl(['Бетон', 'f_ck, МПа', 'f_ctm, МПа', 'E_cm, ГПа'], N.concretes.map(x => [x.id, x.fck, x.fctm, x.Ecm])))}`;
    },
    onChange(e, c) { if (e.target.id !== 'catf') return false; c.state.ui.catFilter = e.target.value; c.render(); return true; },
  };
})(window.SC = window.SC || {});
