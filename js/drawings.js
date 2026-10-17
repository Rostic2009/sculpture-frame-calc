/* Креслення (SVG) і експорт DXF: фасади каркаса з марками елементів, опорний вузол (план плити, анкери, ребра),
 * фундамент (план і розріз з армуванням), анкерна група з координатами. Кольори — з токенів теми. */
(function (SC) {
  'use strict';
  const D = {};
  const f = (v, d) => SC.report.fmt.f(v, d == null ? 0 : d);

  function svg(w, h, body, label) {
    return `<div class="dwg"><svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" role="img" aria-label="${label}" font-family="var(--font-mono)" font-size="11">${body}</svg></div>`;
  }
  const line = (x1, y1, x2, y2, cls) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls || 'ln'}"/>`;
  const rect = (x, y, w, h, cls) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="${cls || 'ln'}"/>`;
  const text = (x, y, t, anchor, cls) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor || 'start'}" class="${cls || 'tx'}">${t}</text>`;
  function dim(x1, y1, x2, y2, label, off) {
    off = off || 14;
    const horiz = Math.abs(y2 - y1) < 1e-6;
    if (horiz) { const y = y1 + off; return line(x1, y1, x1, y + 3, 'dm') + line(x2, y2, x2, y + 3, 'dm') + line(x1, y, x2, y, 'dm') + text((x1 + x2) / 2, y - 3, label, 'middle', 'dt'); }
    const x = x1 + off; return line(x1, y1, x + 3, y1, 'dm') + line(x2, y2, x + 3, y2, 'dm') + line(x, y1, x, y2, 'dm') + `<text x="${(x + 4).toFixed(1)}" y="${((y1 + y2) / 2).toFixed(1)}" class="dt" transform="rotate(-90 ${(x + 4).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)})" text-anchor="middle">${label}</text>`;
  }

  /** Фасад каркаса в площині XZ або YZ з марками. */
  D.frame = function (R, plane) {
    const nodes = R.P.model.nodes, el = R.mdl.elems;
    const ax = plane === 'YZ' ? 'y' : 'x';
    const xs = nodes.map(n => n[ax]), zs = nodes.map(n => n.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z1 = Math.max(...zs);
    const W = 420, H = 520, pad = 50;
    const s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 0.5), (H - 2 * pad) / Math.max(z1, 0.5));
    const X = v => pad + (v - x0) * s + ((W - 2 * pad) - (x1 - x0) * s) / 2, Z = v => H - pad - v * s;
    const byId = new Map(nodes.map(n => [n.id, n]));
    let b = line(10, Z(0), W - 10, Z(0), 'gr');
    const U = R.memberRes.map(m => m.best.u);
    el.forEach((e, k) => {
      const a = byId.get(e.i), c = byId.get(e.j);
      const cls = U[k] > 1 ? 'mb bad' : U[k] > 0.9 ? 'mb warn' : e.type === 'truss' ? 'mb br' : 'mb';
      b += line(X(a[ax]), Z(a.z), X(c[ax]), Z(c.z), cls);
    });
    // марки груп (по одному підпису на групу)
    const done = new Set();
    el.forEach(e => { if (done.has(e.group)) return; done.add(e.group); const a = byId.get(e.i), c = byId.get(e.j); b += text((X(a[ax]) + X(c[ax])) / 2 + 4, (Z(a.z) + Z(c.z)) / 2, `${e.sec.name}`, 'start', 'tx sm'); });
    nodes.filter(n => n.sup || n.baseSpring).forEach(n => { const x = X(n[ax]), z = Z(n.z); b += `<path d="M${x},${z} l-7,10 h14 z" class="sup"/>`; });
    R.mdl.levels.forEach(z => { b += line(W - 40, Z(z), W - 30, Z(z), 'dm') + text(W - 28, Z(z) + 4, '+' + f(z, 2), 'start', 'dt'); });
    b += dim(X(x0), Z(0) + 18, X(x1), Z(0) + 18, f((x1 - x0) * 1000) + ' мм', 8);
    b += text(10, 18, `Фасад каркаса, площина ${plane}`, 'start', 'tt');
    return svg(W, H, b, 'Фасад каркаса ' + plane);
  };

  /** План опорної плити з анкерами й ребрами, розріз. */
  D.basePlate = function (R, gs) {
    const bp = R.pr.base, sec = SC.sections.byName(R.pr.frame.secPost) || { bmm: 100, tmm: 5 };
    const W = 560, H = 330, s = 200 / Math.max(bp.plateB, bp.plateL);
    const cx = 150, cy = 170;
    let b = text(10, 18, 'Опорний вузол: план і розріз', 'start', 'tt');
    b += rect(cx - bp.plateB * s / 2, cy - bp.plateL * s / 2, bp.plateB * s, bp.plateL * s, 'pl');
    b += rect(cx - sec.bmm * s / 2, cy - sec.bmm * s / 2, sec.bmm * s, sec.bmm * s, 'tube');
    const ribs = SC.base.ribLines(bp, sec.bmm / 1000);
    ribs.forEach(L => { b += line(cx + L[0][0] * 1000 * s, cy - L[0][1] * 1000 * s, cx + L[1][0] * 1000 * s, cy - L[1][1] * 1000 * s, 'rib'); });
    const lay = SC.base.anchorLayout(bp);
    const T = gs && gs.best.b ? gs.best.b.perAnchor : null;
    lay.forEach(([x, y], i) => {
      const px = cx + x * s, py = cy - y * s;
      b += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${Math.max(3, bp.d * s / 2).toFixed(1)}" class="anc ${T && T[i].N > 0 ? 'ten' : ''}"/>`;
      b += text(px + 8, py - 6, `${i + 1}${T ? ' · ' + (T[i].N / 1000).toFixed(1) + ' кН' : ''}`, 'start', 'tx sm');
    });
    b += dim(cx - bp.plateB * s / 2, cy + bp.plateL * s / 2 + 6, cx + bp.plateB * s / 2, cy + bp.plateL * s / 2 + 6, bp.plateB + ' мм', 10);
    b += dim(cx + bp.plateB * s / 2 + 6, cy - bp.plateL * s / 2, cx + bp.plateB * s / 2 + 6, cy + bp.plateL * s / 2, bp.plateL + ' мм', 10);
    const e = bp.edge;
    b += text(cx - bp.plateB * s / 2, cy - bp.plateL * s / 2 - 8, `${bp.nAnchor} ${bp.type === 'embed' ? 'шпильки Ø' : 'болти М'}${bp.d}, від краю ${e} мм`, 'start', 'tx sm');
    // розріз
    const ox = 330, oy = 230, s2 = 0.5;
    b += rect(ox, oy - bp.tp * s2 * 2, bp.plateB * s2, bp.tp * s2 * 2, 'pl');
    b += rect(ox + (bp.plateB - sec.bmm) * s2 / 2, oy - bp.tp * s2 * 2 - 140, sec.bmm * s2, 140, 'tube');
    if (bp.nRibs) { b += rect(ox + (bp.plateB + sec.bmm) * s2 / 2, oy - bp.tp * s2 * 2 - bp.hr * s2, (bp.plateB - sec.bmm) * s2 / 2, bp.hr * s2, 'ribs'); b += rect(ox, oy - bp.tp * s2 * 2 - bp.hr * s2, (bp.plateB - sec.bmm) * s2 / 2, bp.hr * s2, 'ribs'); }
    b += rect(ox - 20, oy, bp.plateB * s2 + 40, 60, 'conc');
    b += line(ox - 20, oy + 15, ox + bp.plateB * s2 + 20, oy + 15, 'gr');
    [e, bp.plateB - e].forEach(x => { b += line(ox + x * s2, oy - bp.tp * s2 * 2 - 12, ox + x * s2, oy + 58, 'bolt'); });
    b += text(ox, oy + 76, `t = ${bp.tp} мм; підливка 30 мм; h_ef = ${bp.hef} мм`, 'start', 'tx sm');
    b += text(ox, oy - bp.tp * s2 * 2 - 146, `${sec.name || ''}${bp.nRibs ? `; ребра ${bp.hr}×${bp.tr}` : ''}; шов k_f = ${bp.weldLeg} мм`, 'start', 'tx sm');
    return svg(W, H, b, 'Опорний вузол');
  };

  /** Фундамент: план із сітками й розріз. */
  D.foundation = function (R) {
    const fd = R.found.fd, sl = R.found.slab, ped = R.found.ped;
    const W = 600, H = 360, s = 240 / Math.max(fd.B, fd.L);
    const cx = 150, cy = 190;
    let b = text(10, 18, 'Фундамент: план (низ) і розріз', 'start', 'tt');
    b += rect(cx - fd.B * s / 2, cy - fd.L * s / 2, fd.B * s, fd.L * s, 'conc');
    const sx = sl.bx.pick.s / 1000, sy = sl.by.pick.s / 1000;
    for (let y = -fd.L / 2 + 0.05; y <= fd.L / 2 - 0.05; y += sx) b += line(cx - fd.B * s / 2 + 3, cy - y * s, cx + fd.B * s / 2 - 3, cy - y * s, 'reb');
    for (let x = -fd.B / 2 + 0.05; x <= fd.B / 2 - 0.05; x += sy) b += line(cx + x * s, cy - fd.L * s / 2 + 3, cx + x * s, cy + fd.L * s / 2 - 3, 'reb');
    b += rect(cx - fd.pedB * s / 2, cy - fd.pedL * s / 2, fd.pedB * s, fd.pedL * s, 'ped');
    R.P.model.nodes.filter(n => n.sup || n.baseSpring).forEach(n => { b += rect(cx + n.x * s - R.pr.base.plateB / 2000 * s, cy - n.y * s - R.pr.base.plateL / 2000 * s, R.pr.base.plateB / 1000 * s, R.pr.base.plateL / 1000 * s, 'pl'); });
    b += dim(cx - fd.B * s / 2, cy + fd.L * s / 2 + 6, cx + fd.B * s / 2, cy + fd.L * s / 2 + 6, f(fd.B * 1000) + ' мм', 10);
    b += dim(cx + fd.B * s / 2 + 6, cy - fd.L * s / 2, cx + fd.B * s / 2 + 6, cy + fd.L * s / 2, f(fd.L * 1000) + ' мм', 10);
    b += text(cx - fd.B * s / 2, cy - fd.L * s / 2 - 8, `Поз.1/2: Ø${sl.bx.pick.dia}/${sl.bx.pick.s}, Ø${sl.by.pick.dia}/${sl.by.pick.s} (низ)`, 'start', 'tx sm');
    // розріз
    const ox = 340, base = 300, s2 = 150 / Math.max(fd.h + fd.pedH + 0.3, 1);
    const wB = Math.min(240, fd.B * s2);
    const k = wB / fd.B;
    b += rect(ox, base - fd.h * s2, wB, fd.h * s2, 'conc');
    b += rect(ox + (fd.B - fd.pedB) * k / 2, base - (fd.h + fd.pedH) * s2, fd.pedB * k, fd.pedH * s2, 'conc');
    b += line(ox + 4, base - (R.pr.found.cover / 1000) * s2 - 2, ox + wB - 4, base - (R.pr.found.cover / 1000) * s2 - 2, 'rebb');
    b += line(ox + 4, base - fd.h * s2 + (R.pr.found.cover / 1000) * s2 + 2, ox + wB - 4, base - fd.h * s2 + (R.pr.found.cover / 1000) * s2 + 2, 'rebb');
    const gl = base - Math.max(fd.depth, fd.h) * s2;
    b += line(ox - 30, gl, ox + wB + 30, gl, 'gr') + text(ox + wB + 2, gl - 4, '±0,000 (земля)', 'start', 'dt');
    b += dim(ox + wB + 8, base, ox + wB + 8, base - fd.h * s2, f(fd.h * 1000) + '', 8);
    b += dim(ox + wB + 30, base, ox + wB + 30, gl, 'd = ' + f(fd.depth * 1000), 8);
    b += text(ox, base + 18, `Підколонник: ${ped.n} Ø${ped.dia}, хомути Ø${ped.hoop.dia}/${f(ped.hoop.s)}; бетон ${fd.concrete}`, 'start', 'tx sm');
    return svg(W, H, b, 'Фундамент');
  };

  /**
   * 2D-креслення розрахункової секції з марками стрижнів і номерами вузлів.
   *  Ярус ядра — розгортка граней між сусідніми стійками (кожен стрижень видно без накладання);
   *  консоль — вертикальна площина, що містить консоль; інші — фасад XZ.
   *  Колір лінії — коефіцієнт використання U (якщо є розрахунок), рамка заголовка — колір секції.
   */
  D.section = function (mdl, sc, R) {
    const nodes = R ? R.P.model.nodes : mdl.nodes;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const elems = mdl.elems.filter(e => e.sect === sc.code);
    const uOf = new Map(R ? R.memberRes.map(m => [m.e.id, m.best.u]) : []);
    const cls = e => { const u = uOf.get(e.id); return 'mb' + (e.type === 'truss' ? ' br' : '') + (u > 1 ? ' bad' : u > 0.9 ? ' warn' : ''); };
    const Lm = e => { const a = byId.get(e.i), b = byId.get(e.j); return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); };
    const head = (W) => `<rect x="0" y="0" width="${W}" height="26" fill="${sc.color}"/>` + `<text x="10" y="17" fill="#fff" font-weight="600" font-size="13">${sc.code} · ${sc.name}</text>`;
    const nodeMark = (x, y, n) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="sup"/>` + text(x - 5, y + 13, n.num, 'end', 'dt');
    const label = (x, y, t) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="tx sm" font-weight="600" text-anchor="middle" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${t}</text>`;
    let b = '', W, H;
    if (sc.kind === 'tier' && sc.faces && sc.faces.length) {
      const faces = sc.faces.map(fc => {
        const [A, B, C, Dn] = fc.nodes.map(id => byId.get(id));
        const ex = B.x - A.x, ey = B.y - A.y, l = Math.hypot(ex, ey) || 1;
        const uv = p => [((p.x - A.x) * ex + (p.y - A.y) * ey) / l, p.z - sc.z0];
        const set = new Set(fc.nodes);
        return { fc, A, B, C, Dn, uv, l, els: elems.filter(e => set.has(e.i) && set.has(e.j)), umin: Math.min(0, uv(Dn)[0], uv(C)[0]), umax: Math.max(l, uv(Dn)[0], uv(C)[0]) };
      });
      const fw = Math.max(...faces.map(f => f.umax - f.umin)), fh = sc.z1 - sc.z0;
      const s = Math.min(150 / Math.max(fw, 0.2), 230 / Math.max(fh, 0.2));
      const cellW = fw * s + 90; W = Math.max(520, 80 + cellW * faces.length); H = fh * s + 120;
      faces.forEach((F, k) => {
        const ox = 80 + k * cellW - F.umin * s, oy = H - 50;
        const X = p => ox + F.uv(p)[0] * s, Y = p => oy - F.uv(p)[1] * s;
        b += line(X(F.A), Y(F.A), X(F.B), Y(F.B), 'gr');
        let bi = 0;
        F.els.forEach(e => {
          const a = byId.get(e.i), c = byId.get(e.j);
          b += line(X(a), Y(a), X(c), Y(c), cls(e));
          const t = e.role === 'brace' ? (bi++ % 2 ? 0.7 : 0.3) : 0.5;
          let lx = X(a) + (X(c) - X(a)) * t, ly = Y(a) + (Y(c) - Y(a)) * t;
          if (e.role === 'post') lx += (F.uv(a)[0] < F.l / 2 ? -22 : 22); else if (e.role === 'ring') ly -= 7;
          b += label(lx, ly + 3, e.mark);
        });
        F.fc.nodes.forEach(id => { const n = byId.get(id); b += nodeMark(X(n), Y(n), n); });
        b += text(ox + F.umin * s + (fw * s) / 2, 44, F.fc.name, 'middle', 'tx sm');
        b += dim(X(F.A), oy + 10, X(F.B), oy + 10, f(F.l * 1000) + ' мм', 6);
        if (k === 0) b += dim(X(F.A) - 40, oy, X(F.A) - 40, oy - fh * s, f(fh * 1000) + ' мм', -12);
      });
    } else if (sc.kind === 'cant' && elems.length) {
      const e = elems[0], a = byId.get(e.i), c = byId.get(e.j);
      const r = Math.hypot(c.x - a.x, c.y - a.y), dz = c.z - a.z, L = Lm(e);
      const s = Math.min(330 / Math.max(r, 0.2), 200 / Math.max(Math.abs(dz), 0.2), 160);
      W = 520; H = Math.max(200, Math.abs(dz) * s + 130);
      const ox = 80, oy = dz >= 0 ? H - 50 : 70;
      const X = u => ox + u * s, Y = v => oy - v * s;
      b += line(X(0), Y(-0.6), X(0), Y(Math.max(dz, 0) + 0.6), 'gr') + text(X(0) - 6, Y(Math.max(dz, 0) + 0.6) + 12, 'вісь ядра', 'end', 'dt');
      b += line(X(0), Y(0), X(r), Y(dz), cls(e)) + label(X(r / 2), Y(dz / 2) - 6, e.mark);
      b += nodeMark(X(0), Y(0), a) + nodeMark(X(r), Y(dz), c);
      b += `<circle cx="${X(r).toFixed(1)}" cy="${Y(dz).toFixed(1)}" r="7" fill="none" stroke="${sc.color}" stroke-width="2"/>`;
      b += dim(X(0), Math.max(Y(0), Y(dz)) + 14, X(r), Math.max(Y(0), Y(dz)) + 14, 'винос ' + f(r * 1000) + ' мм', 8);
      if (Math.abs(dz) > 0.02) b += dim(X(r) + 16, Y(0), X(r) + 16, Y(dz), 'Δz ' + f(dz * 1000), 8);
      b += text(X(r) + 50, Y(dz) + 4, `L = ${f(L * 1000)} мм, кут ${f(Math.atan2(dz, r) * 180 / Math.PI, 0)}°`, 'start', 'tx sm');
    } else {
      const xs = [], zs = []; elems.forEach(e => [e.i, e.j].forEach(id => { const n = byId.get(id); xs.push(n.x); zs.push(n.z); }));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const s = Math.min(380 / Math.max(x1 - x0, 0.3), 260 / Math.max(z1 - z0, 0.3));
      W = 520; H = (z1 - z0) * s + 110;
      const X = v => 70 + (v - x0) * s, Y = v => H - 45 - (v - z0) * s;
      elems.forEach(e => { const a = byId.get(e.i), c = byId.get(e.j); b += line(X(a.x), Y(a.z), X(c.x), Y(c.z), cls(e)) + label((X(a.x) + X(c.x)) / 2 + 14, (Y(a.z) + Y(c.z)) / 2, e.mark); });
      const seen = new Set(); elems.forEach(e => [e.i, e.j].forEach(id => { if (seen.has(id)) return; seen.add(id); const n = byId.get(id); b += nodeMark(X(n.x), Y(n.z), n); }));
      if (z1 - z0 > 0.01) b += dim(40, Y(z0), 40, Y(z1), f((z1 - z0) * 1000) + ' мм', -8);
    }
    return svg(W, H, head(W) + b, 'Секція ' + sc.code);
  };

  /** DXF (R12, ASCII): лінії каркаса (3D), контури плит і фундаменту. */
  // DXF R12 — кодування ANSI: марки транслітеруються (Я2-Р3 → YA2-R3)
  const TR = { Я: 'YA', К: 'K', Д: 'D', С: 'S', Р: 'R', П: 'P' };
  const tr = t => String(t).replace(/[ЯКДСРП]/g, c => TR[c]);
  D.dxf = function (R) {
    const L = [];
    const ln = (layer, a, b) => L.push('0', 'LINE', '8', layer, '10', a[0], '20', a[1], '30', a[2], '11', b[0], '21', b[1], '31', b[2]);
    const byId = new Map(R.P.model.nodes.map(n => [n.id, n]));
    R.mdl.elems.forEach(e => {
      const a = byId.get(e.i), b = byId.get(e.j), lay = 'SECT_' + tr(e.sect || (e.type === 'truss' ? 'BRACES' : 'FRAME'));
      ln(lay, [a.x, a.y, a.z], [b.x, b.y, b.z]);
      if (e.mark) L.push('0', 'TEXT', '8', 'MARKS', '10', (a.x + b.x) / 2, '20', (a.y + b.y) / 2, '30', (a.z + b.z) / 2, '40', 0.04, '1', tr(e.mark));
    });
    const fd = R.found.fd, zb = -(fd.pedH + fd.h);
    const box = (layer, x0, y0, x1, y1, z) => { ln(layer, [x0, y0, z], [x1, y0, z]); ln(layer, [x1, y0, z], [x1, y1, z]); ln(layer, [x1, y1, z], [x0, y1, z]); ln(layer, [x0, y1, z], [x0, y0, z]); };
    box('FOUNDATION', -fd.B / 2, -fd.L / 2, fd.B / 2, fd.L / 2, zb);
    box('PEDESTAL', -fd.pedB / 2, -fd.pedL / 2, fd.pedB / 2, fd.pedL / 2, 0);
    const bp = R.pr.base;
    R.P.model.nodes.filter(n => n.sup || n.baseSpring).forEach(n => {
      box('BASEPLATE', n.x - bp.plateB / 2000, n.y - bp.plateL / 2000, n.x + bp.plateB / 2000, n.y + bp.plateL / 2000, 0);
      SC.base.anchorLayout(bp).forEach(([x, y]) => { const X = n.x + x / 1000, Y = n.y + y / 1000; L.push('0', 'CIRCLE', '8', 'ANCHORS', '10', X, '20', Y, '30', 0, '40', bp.d / 2000); });
    });
    return ['0', 'SECTION', '2', 'ENTITIES'].concat(L.map(String)).concat(['0', 'ENDSEC', '0', 'EOF']).join('\n');
  };

  SC.drawings = D;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
