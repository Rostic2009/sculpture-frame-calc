require('../js/norms.js'); require('../js/sections.js'); require('../js/fem.js');
const {fem, sections, norms} = SC;
let fails = 0;
function check(name, got, exp, tol) { const ok = Math.abs(got-exp) <= tol*Math.abs(exp); if(!ok) fails++; console.log((ok?'OK  ':'FAIL')+' '+name+': '+got.toPrecision(6)+' / '+exp.toPrecision(6)); }
function cantilever(nseg, H, sec, extra) {
  const nodes=[], elems=[];
  for (let i=0;i<=nseg;i++) nodes.push({id:'n'+i,x:0,y:0,z:H*i/nseg, sup: i===0?[1,1,1,1,1,1]:null});
  for (let i=0;i<nseg;i++) elems.push({id:'e'+i,i:'n'+i,j:'n'+(i+1),sec,type:'beam'});
  return {nodes, elems};
}
const s = sections.shs(100,5), E=norms.E, H=5, P=10e3;
let P0 = fem.prepare(cantilever(4,H,s));
let r = fem.solve(P0, {nodal:[{node:'n4', f:[P,0,0,0,0,0]}]});
check('прогин консолі PL³/3EI', r.u[4*6+0], P*H**3/(3*E*s.Iy), 1e-9);
check('реакція Mx бази = P·H', -r.reactions[0].r[4], P*H, 1e-9);
check('рівновага', r.eq.rel+1, 1, 1e-9);
r = fem.solve(P0, {nodal:[{node:'n4', f:[0,P,0,0,0,0]}]});
check('прогин по Y', r.u[4*6+1], P*H**3/(3*E*s.Iy), 1e-9);
// розподілене навантаження
r = fem.solve(P0, {dist:[0,1,2,3].map(k=>({elem:k,w:[1000,0,0]}))});
check('прогин від q: qL⁴/8EI', r.u[4*6], 1000*H**4/(8*E*s.Iy), 1e-6);
const f0 = r.ef[0]; const sf = fem.sectionForces(f0, r.wl.get(0), 0);
check('момент у защемленні qL²/2', Math.abs(sf.My)+Math.abs(sf.Mz), 1000*H*H/2, 1e-6);
// Ейлер для консолі
P0 = fem.prepare(cantilever(10,H,s));
const Ncr = Math.PI**2*E*s.Iy/(4*H*H);
const a = fem.alphaCr(P0, new Array(10).fill(-1));
check('αcr консолі = π²EI/4L²', a, Ncr, 1e-3);
// P-Δ: підсилення ≈ 1/(1-N/Ncr) (наближено, для N=0.3Ncr похибка < 2%)
const N = 0.3*Ncr;
const lin = fem.solve(P0, {nodal:[{node:'n10', f:[P,0,-N,0,0,0]}]});
const sec = fem.solve(P0, {nodal:[{node:'n10', f:[P,0,-N,0,0,0]}]}, {second:true});
check('P-Δ підсилення', sec.u[10*6]/lin.u[10*6], 1/(1-0.3)*(1+0.0), 0.03);
// модальний: консоль з масою на кінці
const m = 2000; const masses = new Float64Array(11); masses[10]=m;
const md = fem.modal(P0, masses, 2);
check('період T=2π√(mL³/3EI)', md.modes[0].T, 2*Math.PI*Math.sqrt(m*H**3/(3*E*s.Iy)), 1e-6);
// рамка з фермою
const fr = {nodes:[{id:'a',x:0,y:0,z:0,sup:[1,1,1,0,0,0]},{id:'b',x:4,y:0,z:0,sup:[0,1,1,0,0,0]},{id:'c',x:2,y:0,z:2,sup:[0,1,0,0,0,0]}],
  elems:[{id:1,i:'a',j:'c',sec:s,type:'truss'},{id:2,i:'b',j:'c',sec:s,type:'truss'},{id:3,i:'a',j:'b',sec:s,type:'truss'}]};
const Pf = fem.prepare(fr); const rf = fem.solve(Pf,{nodal:[{node:'c',f:[0,0,-10000,0,0,0]}]});
check('ферма: стиск у похилих = P/(2 sin45)', -fem.sectionForces(rf.ef[0],null,0).N, 10000/(2*Math.SQRT1_2), 1e-6);
check('ферма: розтяг затяжки = P/2', fem.sectionForces(rf.ef[2],null,0).N, 5000, 1e-6);
console.log(fails? fails+' FAIL':'ALL OK'); process.exit(fails?1:0);
