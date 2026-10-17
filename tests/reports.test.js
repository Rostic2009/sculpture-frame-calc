/* Секції, марки, аналіз зображення і звіти 1–4: узгодженість чисел і відсутність NaN/undefined у тексті. */
for (const f of ['norms','sections','fem','model','loads','checks','welds','support','concrete','shell','analysis','report','reports','drawings','vision']) require('../js/'+f+'.js');
let bad = 0;
const ok = (name, cond, info) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (info ? ': ' + info : '')); if (!cond) bad++; };
for (const type of ['core4', 'core3', 'single']) {
  const pr = SC.model.defaultProject(); pr.frame.type = type; if (type === 'single') pr.frame.bracing = 'none';
  const R = SC.analysis.run(pr);
  ok(`${type}: розрахунок`, R.ok);
  const marks = R.mdl.elems.map(e => e.mark);
  ok(`${type}: кожен стрижень має марку`, marks.every(Boolean));
  ok(`${type}: марки унікальні`, new Set(marks).size === marks.length, marks.length + ' шт.');
  ok(`${type}: кожен стрижень в одній секції`, R.sectionRes.reduce((a, s) => a + s.members.length, 0) === R.memberRes.length);
  const mS = R.sectionRes.reduce((a, s) => a + s.mass, 0);
  ok(`${type}: Σ мас секцій = маса труб`, Math.abs(mS - R.spec.tubeMass) < 1e-6 * R.spec.tubeMass, `${mS.toFixed(2)} / ${R.spec.tubeMass.toFixed(2)}`);
  ok(`${type}: max U секцій = max U стрижнів`, Math.abs(Math.max(...R.sectionRes.map(s => s.uMax)) - Math.max(...R.memberRes.map(m => m.best.u))) < 1e-12);
  for (const [k, fn] of [['frame', SC.reports.frame], ['anchors', SC.reports.anchors], ['base', SC.reports.base], ['loads', SC.reports.loads], ['full', SC.reports.full]]) {
    const h = fn(R).replace(/<[^>]+>/g, ' ');
    const m = h.match(/.{0,40}(NaN|undefined|Infinity|\[object).{0,20}/);
    ok(`${type}: звіт ${k} без NaN/undefined`, !m, m ? m[0] : h.length + ' симв.');
  }
  for (const sc of R.sectionRes) { const svg = SC.drawings.section(R.mdl, sc, R); if (/NaN|undefined/.test(svg)) { ok(`${type}: креслення ${sc.code}`, false); } }
}
// аналіз зображення: ядро вписується в просвіт оболонки
const prof = []; for (let z = 0; z <= 4; z += 0.2) prof.push({ z, x0: -0.8, x1: 0.8, y0: -0.5, y1: 0.5, n: 1 });
const A = SC.vision.describe([{ name: 'Тулуб', kind: 'auto', c: [0, 0, 2], z1: 0, z2: 4, H: 4, area: 20, Ax: 6, prof }, { name: 'Рука', c: [1.4, 0, 3], z1: 2.8, z2: 3.2, H: 0.4, area: 1, Ax: 0.3, prof: [{ z: 3, x0: 0.8, x1: 2, y0: -0.1, y1: 0.1 }] }], { clear: 0.08 });
ok('аналіз: ядро в просвіті X', A.frame.a <= 1.6 - 0.16 + 1e-9, A.frame.a);
ok('аналіз: ядро в просвіті Y', A.frame.b <= 1.0 - 0.16 + 1e-9, A.frame.b);
ok('аналіз: рівень на висоті руки', A.frame.levels.some(z => Math.abs(z - 3) < 0.36), A.frame.levels.join('; '));
ok('аналіз: винос руки', Math.abs(A.cants[0].r - 1.4) < 1e-9);
const rg = SC.norms.checkRegion(Object.assign(SC.model.defaultProject(), {}));
ok('регіон Київ: W0, S0 відповідають Додатку Е', rg.rows.filter(r => /W₀$|S₀$/.test(r.param)).every(r => r.status === 'ok'));
const pr2 = SC.model.defaultProject(); pr2.site.W0 = 900;
ok('регіон: W0 = 900 Па поза діапазоном', SC.norms.checkRegion(pr2).rows.some(r => r.status === 'range'));
console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
