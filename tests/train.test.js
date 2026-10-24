// Шлейф (лежача частина): ферма з опорами, секції Ш, фундаменти-подушки, звіти
for (const f of ['norms','sections','fem','model','loads','checks','welds','support','concrete','shell','analysis','report','reports','posobie','drawings']) require('../js/'+f+'.js');
const pr = SC.model.defaultProject();
pr.design.dirStep = 45; pr.site.seismic.nModes = 6;
pr.parts.push({ name: 'Шлейф мантії', kind: 'train', path: [[-0.2, 0, 4.5], [-3, 0, 2.8], [-6, 0, 1.3], [-9, 0, 0.5]], w: 0.8, wEnd: 1.4, h: 0.6, hEnd: 0.3, panel: 1.0, supports: [0.5, 1.0], supType: 'auto', secChord: '□80×4', secWeb: '□50×3', secPost: '□80×4', shellArea: 30, tShell: 2, rhoShell: 7850, extraMass: 0, Ax: 3, Ay: 12, Cf: 1.2, Ah: 8, mu: 1, sec: '' });
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok', m); };
const m = SC.model.build(JSON.parse(JSON.stringify(pr)));
ok(m.sections.filter(s => s.kind === 'train').map(s => s.code).join() === 'Ш1,Ш2', 'секції Ш1, Ш2');
const sup = m.nodes.filter(n => n.train != null && n.sup);
ok(sup.length === 4, '4 опорні вузли шлейфу');
ok(sup.filter(n => n.supType === 'slide').length === 2 && sup.filter(n => n.supType === 'pinned').length === 2, 'крайня опора рухома, проміжна шарнірна');
const pa = m.partAttach.find(a => a.train);
ok(Math.abs(pa.targets.reduce((a, t) => a + t.share, 0) - 1) < 1e-9, 'частки навантаження шлейфу = 1');
const R = SC.analysis.run(pr);
ok(R.ok, 'розрахунок виконано');
// рівновага: сума вертикальних реакцій = вага (G-сполучення не окреме — перевірка через нев'язку)
ok(R.eqMax < 1e-6, 'рівновага моделі');
ok(R.found.pads.length === 2 && R.found.pads.every(p => p.govUls && p.govSls), 'дві подушки з перевірками');
ok(R.supportRes.filter(s => s.node.train != null).every(s => s.best.u > 0 && s.best.u < 1), 'анкерні вузли опор шлейфу пораховано і проходять');
ok(R.spec.rows.some(r => /Ф2/.test(r.item)), 'бетон подушок у відомості');
const html = SC.reports.full(R);
ok(/3\.3а\. Фундаменти опор шлейфу/.test(html) && /Ш1/.test(html) && /шлейф «Шлейф мантії»/.test(html), 'звіт містить шлейф і подушки');
const svg = SC.drawings.section(R.mdl, R.mdl.sections.find(s => s.code === 'Ш1'), R);
ok(/<svg/.test(svg) && /Ш1-Х/.test(svg), '2D-креслення секції Ш1');
// режим «з'єднані рандбалками»
pr.found.trainMode = 'tie';
const R2 = SC.analysis.run(pr);
ok(R2.found.pads.every(p => p.tieBeam && p.tieBeam.u < 1), 'рандбалки пораховано');
pr.found.trainMode = 'shared'; pr.found.B = 11; pr.found.L = 3; pr.found.cx = -4.4;
const R3 = SC.analysis.run(pr);
ok(R3.ok && R3.found.pads.length === 0 && R3.found.mode === 'shared', 'спільна плита');
process.exit(fail ? 1 : 0);
