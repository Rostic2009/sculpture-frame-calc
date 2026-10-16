for (const f of ['norms','sections','fem','model','loads','checks','support','analysis']) require('../js/'+f+'.js');
const pr = SC.model.defaultProject(); pr.design.dirStep=30;
const t=Date.now(); const o=SC.analysis.optimize(pr,(i,h)=>console.log(i, h.sections.join(' '), h.U.map(u=>u.toFixed(2)).join(' '), h.mass.toFixed(0)));
console.log(o.keys, Date.now()-t,'ms');
