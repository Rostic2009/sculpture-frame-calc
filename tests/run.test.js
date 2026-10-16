for (const f of ['norms','sections','fem','model','loads','checks','welds','support','concrete','shell','analysis']) require('../js/'+f+'.js');
const pr = SC.model.defaultProject();
const t=Date.now(); const R = SC.analysis.run(pr);
if(!R.ok){console.log(R);process.exit(1);}
console.log('time', Date.now()-t, 'combos', R.solved.length, 'T1', R.T1.toFixed(3));
console.log('flex', JSON.stringify(R.flexLog.map(f=>({it:f.it,ch:f.change.toFixed(3),k:f.k[0]&&(f.k[0].kx/1e3).toFixed(0)}))));
for (const w of R.warn) console.log(w.level, w.msg);
console.log('welds', R.welds.length, 'max', Math.max(...R.welds.map(w=>w.u)).toFixed(3));
const s=R.supportRes[0].best; console.log('base U', s.u.toFixed(3), s.combo, 'cls', s.cls, s.ratio.toFixed(1), 'washer', s.b.washer.max.toFixed(3), 'conc', JSON.stringify({cone:s.b.concrete.cone.toFixed(3), split:(s.b.concrete.split||0).toFixed(3), edge:s.b.concrete.edge.toFixed(3)}));
const F=R.found; console.log('slab', F.slab.bx.pick, F.slab.by.pick, 'punch', F.slab.punching.toFixed(3), 'shear', F.slab.shearX.toFixed(3), 'crack', F.slab.crack.toFixed(2), 'sigS', F.slab.sigS.toFixed(1));
console.log('settle mm', (F.settle.s*1000).toFixed(1), 'Hc', F.settle.Hc.toFixed(2), 'tilt', F.settle.tilt.toExponential(2), 'p0', F.settle.p0.toFixed(1));
console.log('ped', F.ped.n, F.ped.dia, JSON.stringify(F.ped.hoop));
console.log('rebar total', F.rebar.total.toFixed(1)); console.log('shell', R.shellRes.map(x=>`${x.part}: s=${x.s.toFixed(3)} rib ${x.rib.h}x${x.rib.t} m=${x.ribMass.toFixed(1)} u=${x.u.toFixed(2)}`).join(' | '));
console.log('spec rows', R.spec.rows.length, 'cost', R.spec.total.toFixed(0));
if (!(R.welds.length && R.found.slab && R.found.settle && R.spec.rows.length > 10)) process.exit(1);
console.log('combos ids', R.combos.slice(0,8).map(c=>c.id).join(','));
