import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DESIGNS} from '../core/content.ts';
import type {Frame,CombatEvent} from '../core/types.ts';
import type {Vec3} from '../core/math.ts';

export function sampleFrames(frames:Frame[],time:number):Frame{
  const a=frames.findLast(f=>f.time<=time)??frames[0],b=frames.find(f=>f.time>a.time)??a;
  const t=a===b?0:Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
  return {time,ships:a.ships.map(s=>{const next=b.ships.find(n=>n.id===s.id)??s,q=new THREE.Quaternion(...s.orientation).slerp(new THREE.Quaternion(...next.orientation),t);return {...s,position:s.position.map((v,i)=>v+(next.position[i]-v)*t) as Vec3,orientation:q.toArray() as [number,number,number,number]};}),projectiles:a.projectiles.map(p=>{const n=b.projectiles.find(n=>n.id===p.id);return {...p,position:n?p.position.map((v,i)=>v+(n.position[i]-v)*t) as Vec3:p.position};})};
}
type Props={frames:Frame[];time:number;events:CombatEvent[];selected:string;onSelect:(id:string)=>void;onPlace:(point:Vec3)=>void;placing:boolean;height:number;fit:number;follow:boolean;showArcs:boolean;destination:Vec3|null};
export function Battlefield(props:Props){
  const container=useRef<HTMLDivElement>(null),current=useRef(props);current.current=props;
  const [error,setError]=useState('');
  useEffect(()=>{
    const element=container.current!;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setError('3D rendering is unavailable. Enable WebGL2 or use a browser with hardware acceleration. Fleet orders and status remain available.');return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#09121c');element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,1,200000);camera.position.set(6200,6500,7800);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=150;controls.maxDistance=60000;
    scene.add(new THREE.AmbientLight('#bed8f1',2));const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(1,2,1);scene.add(sun);
    const grid=new THREE.GridHelper(16000,32,'#30465a','#172b3b');scene.add(grid);
    const planeGrid=new THREE.GridHelper(16000,32,'#c2a76b','#665a3d');planeGrid.visible=false;scene.add(planeGrid);
    const origin=new THREE.AxesHelper(350);scene.add(origin);
    const meshes=new Map<string,THREE.Group>(),labels=new Map<string,HTMLButtonElement>();
    const dynamic=new THREE.Group();scene.add(dynamic);const trails=new THREE.Group();scene.add(trails);
    function clear(group:THREE.Object3D){for(const child of [...group.children]){group.remove(child);child.traverse(o=>{const m=o as THREE.Mesh;m.geometry?.dispose();if(m.material){for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.dispose();}});}}
    const line=(points:Vec3[],color:string,opacity=1)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity}));
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let start:[number,number]=[0,0];
    const down=(event:PointerEvent)=>{start=[event.clientX,event.clientY];};
    const up=(event:PointerEvent)=>{
      if(event.button!==0||Math.hypot(event.clientX-start[0],event.clientY-start[1])>5)return;
      const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
      if(current.current.placing){const point=new THREE.Vector3();if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-current.current.height),point))current.current.onPlace(point.toArray() as Vec3);return;}
      const hit=ray.intersectObjects([...meshes.values()],true)[0];if(hit){let o=hit.object;while(o.parent&&!o.userData.shipId)o=o.parent;if(o.userData.shipId)current.current.onSelect(o.userData.shipId);}
    };
    renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
    const observer=new ResizeObserver(()=>{const {width,height}=element.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();});observer.observe(element);
    let animation=0,lastFrames:Frame[]|null=null,lastFit=-1,lastFollow:string|null=null;
    function draw(){
      const p=current.current;if(!p.frames.length){animation=requestAnimationFrame(draw);return;}
      const f=sampleFrames(p.frames,p.time);
      if(lastFrames!==p.frames){clear(trails);for(const ship of f.ships){const path=p.frames.map(frame=>frame.ships.find(s=>s.id===ship.id)!.position);trails.add(line(path,ship.side==='blue'?'#64d4d8':'#f2a18b',0.42));}lastFrames=p.frames;}
      if(lastFit!==p.fit){const box=new THREE.Box3().setFromPoints(f.ships.map(s=>new THREE.Vector3(...s.position))),center=box.getCenter(new THREE.Vector3()),size=Math.max(2500,box.getSize(new THREE.Vector3()).length());controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0.8,0.9,1).multiplyScalar(size));lastFit=p.fit;}
      clear(dynamic);
      for(const s of f.ships){
        let group=meshes.get(s.id);
        if(!group){
          group=new THREE.Group();group.userData.shipId=s.id;const color=s.side==='blue'?'#81e3df':'#ee9e88',radius=DESIGNS[s.design].radius;
          const hull=new THREE.Mesh(new THREE.ConeGeometry(radius*1.9,radius*6,5),new THREE.MeshStandardMaterial({color,metalness:0.5,roughness:0.4}));hull.rotation.x=Math.PI/2;group.add(hull);
          const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*3.5,2,6,48),new THREE.MeshBasicMaterial({color}));ring.name='selection';group.add(ring);scene.add(group);meshes.set(s.id,group);
          const label=document.createElement('button');label.className=`ship-label ${s.side}`;label.textContent=s.name;label.addEventListener('click',()=>current.current.onSelect(s.id));element.appendChild(label);labels.set(s.id,label);
        }
        group.position.set(...s.position);group.quaternion.set(...s.orientation);group.getObjectByName('selection')!.visible=s.id===p.selected;
        group.scale.setScalar(s.destroyed?0.5:1);
        const projected=new THREE.Vector3(...s.position).project(camera),label=labels.get(s.id)!;label.hidden=projected.z>1||projected.z< -1;label.style.left=`${(projected.x+1)*element.clientWidth/2}px`;label.style.top=`${(-projected.y+1)*element.clientHeight/2+25}px`;label.classList.toggle('selected',s.id===p.selected);label.textContent=`${s.name}${s.destroyed?' · wreck':''}`;
        if(s.id===p.selected){
          dynamic.add(line([s.position,s.position.map((v,i)=>v+s.velocity[i]*10) as Vec3],'#e9ce87'));
          if(p.follow){if(lastFollow===s.id){const delta=new THREE.Vector3(...s.position).sub(controls.target);camera.position.add(delta);}controls.target.set(...s.position);lastFollow=s.id;}else lastFollow=null;
          if(p.showArcs){const cone=new THREE.Mesh(new THREE.ConeGeometry(1800,1040,48,1,true),new THREE.MeshBasicMaterial({color:'#86d4ce',wireframe:true,transparent:true,opacity:0.08,depthWrite:false}));cone.rotation.x=-Math.PI/2;cone.position.z=520;const g=new THREE.Group();g.position.set(...s.position);g.quaternion.set(...s.orientation);g.add(cone);dynamic.add(g);}
        }
      }
      for(const projectile of f.projectiles){const m=new THREE.Mesh(new THREE.SphereGeometry(10,6,4),new THREE.MeshBasicMaterial({color:'#ffdf8f'}));m.position.set(...projectile.position);dynamic.add(m);}
      for(const event of p.events.filter(e=>e.time<=p.time&&p.time-e.time<0.3&&['beam','defense','impact'].includes(e.kind)))dynamic.add(line([event.from,event.to],event.kind==='beam'?'#ffe5af':event.kind==='defense'?'#b7e8ff':'#ff7755',1-(p.time-event.time)/0.3));
      if(p.destination){const marker=new THREE.Mesh(new THREE.OctahedronGeometry(50),new THREE.MeshBasicMaterial({color:'#e4c887',wireframe:true}));marker.position.set(...p.destination);dynamic.add(marker);dynamic.add(line([p.destination,[p.destination[0],0,p.destination[2]]],'#bca76c',0.4));}
      planeGrid.visible=p.placing;planeGrid.position.y=p.height;renderer.domElement.style.cursor=p.placing?'crosshair':'grab';controls.update();renderer.render(scene,camera);animation=requestAnimationFrame(draw);
    }
    animation=requestAnimationFrame(draw);
    return ()=>{cancelAnimationFrame(animation);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);for(const l of labels.values())l.remove();clear(scene);renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="battlefield" ref={container} aria-label="3D battlefield. Drag to orbit, right drag to pan, scroll to zoom.">{error&&<p role="alert" className="render-error">{error}</p>}</div>;
}
