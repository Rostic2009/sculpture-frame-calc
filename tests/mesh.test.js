require('../js/mesh.js'); let fails=0;
function check(n,g,e,t){const ok=Math.abs(g-e)<=t*Math.abs(e);if(!ok)fails++;console.log((ok?'OK  ':'FAIL')+' '+n+': '+g.toPrecision(5)+' / '+e.toPrecision(5));}
// куб 2×1×3 (x,y,z) як OBJ
const obj=`v 0 0 0\nv 2 0 0\nv 2 1 0\nv 0 1 0\nv 0 0 3\nv 2 0 3\nv 2 1 3\nv 0 1 3\nf 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n`;
const T=SC.mesh.parse(new TextEncoder().encode(obj).buffer,'a.obj');
const r=SC.mesh.analyze(T,{step:15,res:400});
check('площа поверхні',r.area,2*(2+6+3),1e-9);
check('A(0°) = 1×3',r.areaTable[0],3,0.01);
check('A(90°) = 2×3',r.areaTable[6],6,0.01);
check('A(45°) = (1+2)/√2·3',r.areaTable[3],3*3/Math.SQRT2,0.01);
check('Ah = 2×1',r.Ah,2,0.01);
check('ц.м. поверхні z',r.centroid[2],1.5,1e-9);
console.log(fails?fails+' FAIL':'ALL OK');process.exit(fails?1:0);
