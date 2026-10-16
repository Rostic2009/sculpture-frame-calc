require('../js/norms.js'); require('../js/sections.js'); require('../js/fem.js'); require('../js/support.js');
const B=SC.base, F=SC.found; let fails=0;
function check(n,g,e,t){const ok=Math.abs(g-e)<=t*Math.abs(e||1);if(!ok)fails++;console.log((ok?'OK  ':'FAIL')+' '+n+': '+(+g).toPrecision(6)+' / '+(+e).toPrecision(6));}
// плита 1×1 м на ґрунті, центральний стиск 100 кН → p = 100 кПа
const fd={B:2,L:2,h:0.5,pedB:1,pedL:1,pedH:0.5,depth:1,rhoC:2500,rhoSoil:1800,frictionMu:0.3};
let p=F.pressure(fd,{Fz:-400e3,Mx:0,My:0});
check('центральний тиск N/(BL)',p.pmax,100e3,0.01);
// ексцентриситет e=B/6 → qmax = 2N/BL, qmin = 0
p=F.pressure(fd,{Fz:-400e3,Mx:0,My:400e3*2/6});
check('e=B/6: qmax=2N/A',p.pmax,200e3,0.03); check('qmax лінійна', p.qmaxLin,200e3,1e-9);
// e = B/3 (частковий контакт) → qmax = 2N/(3·c·L), c = B/2 − e
const e=2/3*0.9; p=F.pressure(fd,{Fz:-400e3,Mx:0,My:400e3*e});
const cc=1-e; check('частковий контакт qmax = 2N/(3cL)',p.pmax,2*400e3/(3*cc*2),0.04);
check('частка контакту 3c/B', p.contactFrac, 3*cc/2, 0.04);
// анкери: момент на пластині, чистий згин без N: T·z = M
const cells=[],anch=[];for(let i=0;i<40;i++)for(let j=0;j<40;j++){const x=-0.25+(i+.5)*0.5/40,y=-0.25+(j+.5)*0.5/40,A=(0.5/40)**2;cells.push({x,y,A,k:1e10*A});}
for(const [x,y] of [[-.2,-.2],[.2,-.2],[.2,.2],[-.2,.2]]) anch.push({x,y,k:5e8});
const r=B.rigidPlate(cells,anch,0,0,20e3);
const T=r.T; console.log('анкери T:',T.map(t=>(t/1e3).toFixed(1)).join(', '));
// рівновага моментів: Σ T·x (анкери) + Σ p·A·(-x)... перевіримо суму сил = 0
const C=r.p.reduce((s,q,i)=>s+q*cells[i].A,0), Ts=T.reduce((a,b)=>a+b,0);
check('ΣN: стиск = розтяг анкерів',C,Ts,1e-6);
const Mres = T.reduce((s,t,i)=>s+ t*(-anch[i].x)*-1,0) + r.p.reduce((s,q,i)=>s+q*cells[i].A*(-cells[i].x),0);
check('ΣM = My', Math.abs(Mres), 20e3, 1e-6);
console.log(fails?fails+' FAIL':'ALL OK');process.exit(fails?1:0);
