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

  /** DXF (R12, ASCII): лінії каркаса (3D), контури плит і фундаменту. */
  D.dxf = function (R) {
    const L = [];
    const ln = (layer, a, b) => L.push('0', 'LINE', '8', layer, '10', a[0], '20', a[1], '30', a[2], '11', b[0], '21', b[1], '31', b[2]);
    const byId = new Map(R.P.model.nodes.map(n => [n.id, n]));
    R.mdl.elems.forEach(e => { const a = byId.get(e.i), b = byId.get(e.j); ln(e.type === 'truss' ? 'BRACES' : 'FRAME', [a.x, a.y, a.z], [b.x, b.y, b.z]); });
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
