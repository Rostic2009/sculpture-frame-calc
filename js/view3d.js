/* Простий 3D-перегляд розрахункової схеми на Canvas: обертання мишею/пальцем, масштаб колесом,
 * колір елементів — коефіцієнт використання U, деформована схема, частини скульптури, напрямок вітру. */
(function (SC) {
  'use strict';

  const V = {};

  V.create = function (canvas, getData) {
    const st = { yaw: -0.7, pitch: 0.35, zoom: 1, panX: 0, panY: 0, defScale: 0, showParts: true, mesh: null };
    let drag = null;
    const css = n => getComputedStyle(canvas).getPropertyValue(n).trim();
    function proj(p, W, H, s, c) {
      const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const X = x * cy - y * sy, Y = x * sy + y * cy;
      const Zs = z * cp - Y * sp, D = Y * cp + z * sp;
      return [W / 2 + st.panX + X * s, H / 2 + st.panY - Zs * s, D];
    }
    function uColor(u) {
      if (u == null || u < 0) return css('--line-strong');
      if (u > 1) return css('--bad');
      if (u > 0.9) return css('--warn');
      const t = Math.min(1, u / 0.9);
      return `color-mix(in oklab, ${css('--ok')} ${Math.round((1 - t) * 100)}%, ${css('--warn')})`;
    }
    function draw() {
      const d = getData(); if (!d) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const nodes = d.nodes;
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      const pts = nodes.map(n => [n.x, n.y, n.z]).concat((d.parts || []).map(p => [p.x, p.y, p.z]));
      pts.forEach(p => { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); } });
      const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1);
      const s = Math.min(W, H) / size * 0.78 * st.zoom;
      const P = p => proj(p, W, H, s, c);
      // земля / сітка
      g.strokeStyle = css('--line'); g.lineWidth = 1;
      const gr = Math.ceil(size / 2);
      for (let i = -gr; i <= gr; i++) {
        const a = P([i, -gr, 0]), b = P([i, gr, 0]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        const e = P([-gr, i, 0]), f = P([gr, i, 0]); g.beginPath(); g.moveTo(e[0], e[1]); g.lineTo(f[0], f[1]); g.stroke();
      }
      // осі
      const o = P([0, 0, 0]);
      [['X', [1, 0, 0], '--axis-x'], ['Y', [0, 1, 0], '--axis-y'], ['Z', [0, 0, 1], '--axis-z']].forEach(([l, v, col]) => {
        const q = P(v.map(x => x * size * 0.15)); g.strokeStyle = css(col); g.lineWidth = 2; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(q[0], q[1]); g.stroke();
        g.fillStyle = css(col); g.font = '12px ' + css('--font-mono'); g.fillText(l, q[0] + 3, q[1] - 3);
      });
      // сітка 3D-моделі (тонко)
      if (st.mesh && st.mesh.length) {
        g.strokeStyle = css('--mesh'); g.lineWidth = 0.5;
        const T = st.mesh; const stepT = Math.max(1, Math.floor(T.length / 9 / 4000));
        for (let i = 0; i < T.length / 9; i += stepT) {
          const a = P([T[i * 9], T[i * 9 + 1], T[i * 9 + 2]]), b = P([T[i * 9 + 3], T[i * 9 + 4], T[i * 9 + 5]]), cc = P([T[i * 9 + 6], T[i * 9 + 7], T[i * 9 + 8]]);
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.closePath(); g.stroke();
        }
      }
      const pos = new Map(nodes.map((n, k) => [n.id, k]));
      const disp = (k) => {
        const n = nodes[k]; if (!st.defScale || !d.u) return [n.x, n.y, n.z];
        return [n.x + d.u[k * 6] * st.defScale, n.y + d.u[k * 6 + 1] * st.defScale, n.z + d.u[k * 6 + 2] * st.defScale];
      };
      const segs = d.elems.map((e, i) => { const a = P(disp(pos.get(e.i))), b = P(disp(pos.get(e.j))); return { e, i, a, b, z: (a[2] + b[2]) / 2 }; }).sort((p, q) => p.z - q.z);
      for (const sg of segs) {
        const u = d.U ? d.U[sg.i] : null;
        g.strokeStyle = uColor(u);
        g.lineWidth = sg.e.type === 'truss' ? 1.5 : sg.e.cantilever ? 3 : 3.5;
        if (sg.e.type === 'truss') g.setLineDash([5, 3]); else g.setLineDash([]);
        g.beginPath(); g.moveTo(sg.a[0], sg.a[1]); g.lineTo(sg.b[0], sg.b[1]); g.stroke();
      }
      g.setLineDash([]);
      // підписи вузлів
      if (d.labels) { g.fillStyle = css('--muted'); g.font = '10px ' + css('--font-mono'); nodes.forEach((n, k) => { const q = P(disp(k)); g.fillText(n.id, q[0] + 4, q[1] - 4); }); }
      // опори
      nodes.forEach((n, k) => {
        if (!n.sup && !n.baseSpring) return; const p = P([n.x, n.y, n.z]);
        g.fillStyle = css('--fg'); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] - 7, p[1] + 10); g.lineTo(p[0] + 7, p[1] + 10); g.closePath(); g.fill();
      });
      // частини
      if (st.showParts) (d.parts || []).forEach(p => {
        const q = P([p.x, p.y, p.z]);
        g.fillStyle = css('--accent'); g.globalAlpha = 0.85; g.beginPath(); g.arc(q[0], q[1], 5, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
        g.fillStyle = css('--fg'); g.font = '12px ' + css('--font-body'); g.fillText(p.name, q[0] + 8, q[1] + 4);
      });
      // вітер
      if (d.windTheta != null) {
        const th = d.windTheta * Math.PI / 180, L = size * 0.35;
        const a = P([c[0] - Math.cos(th) * L * 1.6, c[1] - Math.sin(th) * L * 1.6, mx[2]]), b = P([c[0] - Math.cos(th) * L * 0.6, c[1] - Math.sin(th) * L * 0.6, mx[2]]);
        g.strokeStyle = css('--accent'); g.lineWidth = 2.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - 10 * Math.cos(ang - 0.4), b[1] - 10 * Math.sin(ang - 0.4)); g.lineTo(b[0] - 10 * Math.cos(ang + 0.4), b[1] - 10 * Math.sin(ang + 0.4)); g.closePath(); g.fillStyle = css('--accent'); g.fill();
        g.font = '12px ' + css('--font-mono'); g.fillText(`вітер ${d.windTheta}°`, a[0] - 20, a[1] - 8);
      }
    }
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, px: st.panX, py: st.panY, pan: e.button === 2 || e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.pan) { st.panX = drag.px + dx; st.panY = drag.py + dy; }
      else { st.yaw = drag.yaw + dx * 0.01; st.pitch = Math.max(-1.5, Math.min(1.5, drag.pitch + dy * 0.01)); }
      draw();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); st.zoom *= e.deltaY < 0 ? 1.1 : 1 / 1.1; draw(); }, { passive: false });
    return { draw, st };
  };

  SC.view3d = V;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
