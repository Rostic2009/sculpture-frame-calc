for (const f of ['norms','sections','fem','model','loads','checks','support','analysis']) require('../js/'+f+'.js');
const pr = SC.model.defaultProject();
const t=Date.now(); const R = SC.analysis.run(pr);
if(!R.ok){console.log(R);process.exit(1);}
console.log('time', Date.now()-t, 'ms; nodes', R.P.nn, 'elems', R.P.els.length, 'combos', R.solved.length);
console.log('T1', R.T1.toFixed(3), 'table', R.clim.ChTable, 'q0', R.clim.q0.toFixed(1), 'gfmW', R.clim.gfmW, 'gfmS', R.clim.gfmS);
console.log('modes', R.modalG.modes.map(m=>m.T.toFixed(3)).join(' '));
console.log('alphaCr', R.alphaCr && R.alphaCr.toFixed(2), 'uMax mm', (R.uMax*1000).toFixed(1), 'lim', (R.uLim*1000).toFixed(1));
console.log('eqMax', R.eqMax);
const top = R.memberRes.slice().sort((a,b)=>b.best.u-a.best.u).slice(0,8);
for (const m of top) console.log(m.e.id, m.e.group, m.e.sec.name, 'U', m.best.u.toFixed(3), 'dbn', m.best.chk.dbn.max.toFixed(3), 'en', m.best.chk.en.max.toFixed(3), m.best.combo, 'N', (m.best.f.N/1e3).toFixed(2), 'My', (m.best.f.My/1e3).toFixed(2),'Mz', (m.best.f.Mz/1e3).toFixed(2));
for (const s of R.supportRes) { const b=s.best.b; console.log('sup', s.node.id, 'U', s.best.u.toFixed(3), s.best.combo, 'Tmax kN', (b.Tmax/1e3).toFixed(1), 'bearing', b.bearing.toFixed(2), 'anchorSteel', b.anchorSteel.toFixed(2), 'plateT', b.plateT.toFixed(2), 'weld', b.weld.toFixed(2), 'cone', b.concrete.cone.toFixed(2), 'pull', b.concrete.pullout.toFixed(2), 'edge', (b.concrete.edge||0).toFixed(2)); }
const F=R.found; console.log('R', F.Rsoil, 'sls', F.govSls.cb.name, F.govSls.chk.max.toFixed(3), 'pmax', (F.govSls.chk.p.pmax/1e3).toFixed(1), 'pmean', (F.govSls.chk.p.pmean/1e3).toFixed(1), 'contact', F.govSls.chk.p.contactFrac.toFixed(2));
console.log('uls', F.govUls.cb.name, F.govUls.chk.max.toFixed(3), 'overt', F.govUls.chk.overturn.toFixed(3), 'slide', F.govUls.chk.slide.toFixed(3));
console.log('reinf', JSON.stringify(F.reinf.pick), 'punch', F.reinf.punching.toFixed(3), 'Mx', (F.reinf.Mx/1e3).toFixed(1));
if (R.seis) { console.log('seis mass', R.seis.totalMass.toFixed(0), 'meff', R.seis.sumMeff.map(v=>v.toFixed(2)).join(' ')); for (const r of R.seis.res) console.log(r.dir, r.modes.slice(0,3).map(m=>`T${m.mode}=${m.T.toFixed(3)} β=${m.beta.toFixed(2)} V=${(m.base/1e3).toFixed(2)}kN meff=${m.meff.toFixed(2)}`).join(' | ')); }
console.log('spec tube', R.spec.tubeMass.toFixed(0), 'sheet', R.spec.sheetMass.toFixed(0), 'total cost', R.spec.total.toFixed(0));
const W0 = R.cases.W[0]; console.log('W0 parts', W0.info.parts.map(p=>`${p.name}: A=${p.A.toFixed(2)} F=${(p.F/1e3).toFixed(2)}kN z=${p.zcp.toFixed(2)}`).join('; '));
console.log('G frame mass', R.cases.G.info.frameMass.toFixed(0), 'shell', R.cases.G.info.shellMass.toFixed(0));
for (const w of R.warn) console.log(w.level, w.msg);
console.log('status', R.status);
