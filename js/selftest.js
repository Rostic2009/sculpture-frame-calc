/* Еталонні задачі (ТЗ, р. 14): перевірка розрахункового ядра на аналітичних розв'язках. Запускаються в браузері. */
(function (SC) {
  'use strict';
  SC.selftest = function () {
    const out = [];
    const ck = (name, got, exp, tol, ref) => out.push({ name, got, exp, ok: Math.abs(got - exp) <= tol * Math.abs(exp || 1), tol, ref });
    const { fem, sections, norms } = SC;
    const cant = (n, H, s) => {
      const nodes = [], elems = [];
      for (let i = 0; i <= n; i++) nodes.push({ id: 'n' + i, x: 0, y: 0, z: H * i / n, sup: i === 0 ? [1, 1, 1, 1, 1, 1] : null });
      for (let i = 0; i < n; i++) elems.push({ id: 'e' + i, i: 'n' + i, j: 'n' + (i + 1), sec: s, type: 'beam' });
      return { nodes, elems };
    };
    const s = sections.shs(100, 5), E = norms.E, H = 5, P = 10e3;
    let M = fem.prepare(cant(4, H, s));
    let r = fem.solve(M, { nodal: [{ node: 'n4', f: [P, 0, 0, 0, 0, 0] }] });
    ck('1. Консоль, сила на кінці: δ = PL³/(3EI), м', r.u[24], P * H ** 3 / (3 * E * s.Iy), 1e-9, 'балка Ейлера–Бернуллі');
    ck('   Реакція-момент у защемленні M = P·L, Н·м', -r.reactions[0].r[4], P * H, 1e-9, 'статика');
    r = fem.solve(M, { dist: [0, 1, 2, 3].map(k => ({ elem: k, w: [1000, 0, 0] })) });
    ck('1. Консоль, рівномірне q: δ = qL⁴/(8EI), м', r.u[24], 1000 * H ** 4 / (8 * E * s.Iy), 1e-6, '');
    const fr = { nodes: [{ id: 'a', x: 0, y: 0, z: 0, sup: [1, 1, 1, 0, 0, 0] }, { id: 'b', x: 4, y: 0, z: 0, sup: [0, 1, 1, 0, 0, 0] }, { id: 'c', x: 2, y: 0, z: 2, sup: [0, 1, 0, 0, 0, 0] }],
      elems: [{ id: 1, i: 'a', j: 'c', sec: s, type: 'truss' }, { id: 2, i: 'b', j: 'c', sec: s, type: 'truss' }, { id: 3, i: 'a', j: 'b', sec: s, type: 'truss' }] };
    const Pf = fem.prepare(fr); const rf = fem.solve(Pf, { nodal: [{ node: 'c', f: [0, 0, -1e4, 0, 0, 0] }] });
    ck('2. Ферма: стиск похилих P/(2·sin45°), Н', -fem.sectionForces(rf.ef[0], null, 0).N, 1e4 / (2 * Math.SQRT1_2), 1e-6, 'метод вирізання вузлів');
    ck('2. Ферма: рівновага ΣF + ΣR = 0 (відн.)', 1 + rf.eq.rel, 1, 1e-9, '');
    M = fem.prepare(cant(10, H, s));
    ck('3. Стійкість консолі: αcr = π²EI/(4L²), Н', fem.alphaCr(M, new Array(10).fill(-1)), Math.PI ** 2 * E * s.Iy / (4 * H * H), 1e-3, 'Ейлер, μ = 2');
    const Ncr = Math.PI ** 2 * E * s.Iy / (4 * H * H), kL = Math.PI / 2 * Math.sqrt(0.3);
    const lin = fem.solve(M, { nodal: [{ node: 'n10', f: [P, 0, -0.3 * Ncr, 0, 0, 0] }] });
    const sec = fem.solve(M, { nodal: [{ node: 'n10', f: [P, 0, -0.3 * Ncr, 0, 0, 0] }] }, { second: true });
    ck('3. P-Δ: підсилення прогину 3(tg kL − kL)/(kL)³', sec.u[60] / lin.u[60], 3 * (Math.tan(kL) - kL) / kL ** 3, 0.005, 'точний розв\'язок');
    const ms = new Float64Array(11); ms[10] = 2000;
    ck('Динаміка: T = 2π√(mL³/(3EI)), с', fem.modal(M, ms, 2).modes[0].T, 2 * Math.PI * Math.sqrt(2000 * H ** 3 / (3 * E * s.Iy)), 1e-6, '');
    // плита / фундамент
    const fd = { B: 2, L: 2 };
    let p = SC.found.pressure(fd, { Fz: -400e3, Mx: 0, My: 0 });
    ck('6. Фундамент, центральне N: p = N/(BL), Па', p.pmax, 1e5, 0.005, '');
    p = SC.found.pressure(fd, { Fz: -400e3, Mx: 0, My: 400e3 * 2 / 6 });
    ck('6. Фундамент, e = B/6: p_max = 2N/(BL), Па', p.pmax, 2e5, 0.01, 'трикутна епюра');
    const e = 0.6; p = SC.found.pressure(fd, { Fz: -400e3, Mx: 0, My: 400e3 * e });
    ck('6. Частковий контакт: p_max = 2N/(3cL), c = B/2 − e', p.pmax, 2 * 400e3 / (3 * (1 - e) * 2), 0.01, 'без розтягу ґрунту');
    // анкерна група
    const cells = []; for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const x = -0.25 + (i + 0.5) * 0.5 / 40, y = -0.25 + (j + 0.5) * 0.5 / 40, A = (0.5 / 40) ** 2; cells.push({ x, y, A, k: 1e10 * A, h: 0.25 / 40 }); }
    const an = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]].map(([x, y]) => ({ x, y, k: 5e8 }));
    const rp = SC.base.rigidPlate(cells, an, -20e3, 0, 20e3);
    const C = rp.p.reduce((a, q, i) => a + q * cells[i].A, 0), T = rp.T.reduce((a, b) => a + b, 0);
    ck('5. Анкерна група з моментом: ΣC − ΣT = N, Н', C - T, 20e3, 1e-6, 'рівновага сил');
    const Mr = rp.T.reduce((a, t, i) => a + t * an[i].x, 0) - rp.p.reduce((a, q, i) => a + q * cells[i].A * cells[i].x, 0);
    ck('5. Анкерна група: реактивний момент = −M_y, Н·м', -Mr, 20e3, 1e-6, 'рівновага моментів');
    // переріз
    ck('Переріз □100×5: A, см² (EN 10219-2: 18,4)', s.A * 1e4, 18.4, 0.005, 'таблиця сортаменту');
    ck('Переріз □100×5: I, см⁴ (EN 10219-2: 271)', s.Iy * 1e8, 271, 0.005, '');
    ck('Переріз □100×5: It, см⁴ (EN 10219-2: 441)', s.J * 1e8, 441, 0.005, '');
    ck('χ (крива c, λ̄ = 1,0) = 0,5399', SC.checks.chiEN(1.0, 'c'), 0.5399, 0.002, 'EN 1993-1-1 табл. 6.2/рис. 6.4');
    ck('χ (крива a, λ̄ = 1,0) = 0,6656', SC.checks.chiEN(1.0, 'a'), 0.6656, 0.002, '');
    // вітер — приклад ТЗ (п. 9)
    const F = [[12, 4], [2, 8], [20, 3]].map(([A, z]) => ({ F: 0.8 * 1.25 * A, z }));
    const Fs = F.reduce((a, b) => a + b.F, 0), Ms = F.reduce((a, b) => a + b.F * b.z, 0);
    ck('Вітер, приклад ТЗ: ΣF = 34 кН', Fs, 34, 1e-9, 'ТЗ, р. 9'); ck('Вітер, приклад ТЗ: M_y = 124 кН·м', Ms, 124, 1e-9, ''); ck('z_cp = 3,65 м', Ms / Fs, 3.647, 1e-3, '');
    ck('C_h(III, z = 7,5 м, табл. 9.01) = 0,50', norms.Ch(7.5, 'III', 0.1).value, 0.5, 1e-9, 'лінійна інтерполяція');
    ck('γfm вітру при T = 100 р. = 1,14', norms.windGamma(100), 1.14, 1e-9, 'табл. 9.1');
    ck('γfm снігу при T = 60 р. = 1,04', norms.snowGamma(60), 1.04, 1e-9, 'табл. 8.1');
    // температура: защемлений стрижень, N = −E·A·α·ΔT
    const Mt = fem.prepare({ nodes: [{ id: 'a', x: 0, y: 0, z: 0, sup: [1, 1, 1, 1, 1, 1] }, { id: 'm', x: 1, y: 0, z: 0 }, { id: 'b', x: 2, y: 0, z: 0, sup: [1, 1, 1, 1, 1, 1] }], elems: [{ id: 1, i: 'a', j: 'm', sec: s }, { id: 2, i: 'm', j: 'b', sec: s }] });
    const rt = fem.solve(Mt, { therm: [{ elem: 0, eps: 1.2e-5 * 40 }, { elem: 1, eps: 1.2e-5 * 40 }] });
    ck('Температура: N = −E·A·α·ΔT, Н', fem.sectionForces(rt.ef[0], null, 0).N, -E * s.A * 1.2e-5 * 40, 1e-9, 'защемлений стрижень');
    // осідання: коефіцієнт α для центру квадрата (ДБН В.2.1-10, табл.: ζ = 2z/b = 1 → 0,703; 2 → 0,336)
    ck('Осідання: α(ζ = 1), квадрат', SC.concrete.alphaCenter(2, 2, 1), 0.703, 0.005, 'ДБН В.2.1-10, табл. α');
    ck('Осідання: α(ζ = 2), квадрат', SC.concrete.alphaCenter(2, 2, 2), 0.336, 0.005, '');
    // шов: осьова сила по контуру
    const w = SC.welds.tubeContour(0.1, 0.005, { N: 100e3, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }, norms.steels[1], SC.welds.electrodes[0]);
    ck('Шов: σ⊥ = N/(4b·a·√2), МПа', w.sp / 1e6, 100e3 / (0.4 * 0.0035 * Math.SQRT2) / 1e6, 1e-9, 'EN 1993-1-8, 4.5.3.2');
    // пластина, защемлена по контуру (Roark): σ = 0,3078·p·b²/t²
    const pn = SC.shell.panel(0.5, 0.5, 0.002, 1000, 2.06e11, 235e6, 100);
    ck('Лист: σ = 0,3078·p·b²/t², МПа', pn.sig / 1e6, 0.3078 * 1000 * 0.25 / 4e-6 / 1e6, 1e-9, 'Roark, табл. 11.4');
    // проєкції 3D: куб 2×1×3
    const cube = new Float64Array([0,0,0,2,1,0,2,0,0, 0,0,0,0,1,0,2,1,0, 0,0,3,2,0,3,2,1,3, 0,0,3,2,1,3,0,1,3, 0,0,0,2,0,0,2,0,3, 0,0,0,2,0,3,0,0,3, 2,0,0,2,1,0,2,1,3, 2,0,0,2,1,3,2,0,3, 2,1,0,0,1,0,0,1,3, 2,1,0,0,1,3,2,1,3, 0,1,0,0,0,0,0,0,3, 0,1,0,0,0,3,0,1,3]);
    const anc = SC.mesh.analyze(cube, { step: 45, res: 400 });
    ck('3D: площа об\'єднання проєкцій A(45°), м²', anc.areaTable[1], 3 * 3 / Math.SQRT2, 0.01, 'растеризація');
    // Посібник з проєктування анкерних болтів (до СНиП 2.09.03), Додаток 2 — приклади 1, 2, 3, 5
    if (SC.posobie) SC.posobie.examples().forEach(([n, g, e]) => ck('Анкери. ' + n, g, e, 0.005, 'Посібник до СНиП 2.09.03, дод. 2'));
    // ДБН В.1.2-2:2006 (актуалізований текст зі Змінами № 1, 2)
    ck('ДБН: C_h(IV, 100 м, табл. 9.02) = 2,70', norms.Ch(100, 'IV', 0.5).value, 2.70, 1e-9, 'табл. 9.02');
    ck('ДБН: C_alt снігу при H = 0,8 км = 1,4H + 0,3', norms.snowCalt(0.8), 1.42, 1e-9, 'ф. (8.5)');
    ck('ДБН: k ожеледі при h = 30 м = 1,4', norms.interp(norms.iceK.z, norms.iceK.k, 30), 1.4, 1e-9, 'табл. 10.2');
    ck('ДБН: γ_fm ожеледі при T = 100 р. = 1,16', norms.interp(norms.iceGammaFm.T, norms.iceGammaFm.g, 100), 1.16, 1e-9, 'табл. 10.4');
    ck('ДБН: θ₄ = 0,05·ρ·S·k·k₁ (ρ = 0,7, гориз.), °C', norms.tempClimate({ rho: 0.7 }).th4, 0.05 * 0.7 * 890 * 0.7, 1e-9, 'ф. (11.3)');
    ck('ДБН: Δt_c = t_ec − 0,5θ₁ − t_0w = −39 °C', norms.tempClimate({}).dTc, -39, 1e-9, 'табл. 11.1, ф. (11.2)');
    ck('ДБН: Додаток Е, Львів W₀ = 520 Па', norms.cityByName('Львів').W0, 520, 1e-9, 'Додаток Е');
    return out;
  };
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
