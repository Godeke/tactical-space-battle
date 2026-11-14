export type Vec3 = [number,number,number];
export type Quat = [number,number,number,number];
export const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
export const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=(a:Vec3)=>Math.hypot(...a);
export const unit=(a:Vec3):Vec3=>length(a)>1e-12?mul(a,1/length(a)):[0,0,0];
export const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const limit=(v:Vec3,max:number):Vec3=>length(v)>max?mul(unit(v),max):v;
export const qmul=(a:Quat,b:Quat):Quat=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const normalizeQ=(q:Quat):Quat=>{const n=Math.hypot(...q);return n>1e-12?q.map(v=>v/n) as Quat:[0,0,0,1];};
export const rotate=(q:Quat,v:Vec3):Vec3=>{const r=qmul(qmul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return [r[0],r[1],r[2]];};
export const forward=(q:Quat)=>rotate(q,[0,0,1]);
export function turn(q:Quat,w:Vec3,dt:number):Quat{const speed=length(w),half=speed*dt/2;if(speed<1e-12)return q;return normalizeQ(qmul([...mul(w,Math.sin(half)/speed),Math.cos(half)],q));}
/** Fraction of a moving segment at first sphere contact; includes initial overlap. */
export function swept(a:Vec3,b:Vec3,r:number):number|null{
  const d=sub(b,a),c=dot(a,a)-r*r;if(c<=0)return 0;
  const aa=dot(d,d),bb=2*dot(a,d),disc=bb*bb-4*aa*c;if(aa<1e-18||disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;
}
