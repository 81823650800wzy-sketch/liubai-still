import * as THREE from './vendor/three.module.js';

const host=document.querySelector('#scene');
const stage=document.querySelector('#shelf-stage');
const api=window.capsuleShelf;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const colors=[['#536a4c','#f0eedc'],['#c4af8d','#404d3c'],['#718e8b','#f1f1df'],['#d2c6ad','#4f5d47'],['#94a47c','#344c34'],['#4e5d56','#eeebd8']];
const categories={reading:'READING',skill:'PRACTICE',inspiration:'THOUGHTS',life:'LIVING'};
const books=[];
let renderer,scene,camera,root,shadowTexture,clothTexture,orbit,spot,glow;
let width=1,height=1,viewWidth=8,scroll=0,targetScroll=0,selectedId,hoverId;
let internalSelection=false,previousIds='',lastTime=0,needsDraw=true,visible=true;
let pointer=null,velocity=0,clickBlockedUntil=0;
let openingId=null,openTimer,baseDistance=8.6,enteredAt=0;
const mouse=new THREE.Vector2(),cameraMouse=new THREE.Vector2();
const rawOpen=api.open.bind(api);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const damp=(a,b,s,dt)=>THREE.MathUtils.damp(a,b,s,dt);
const rand=(seed)=>{let a=seed;return()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296}};

function canvasTexture(w,h,paint){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  paint(canvas.getContext('2d'),w,h);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;
}
function coverTexture(data,index,back=false){
  const [base,ink]=colors[(data.art??index)%6];
  return canvasTexture(768,1152,(ctx,w,h)=>{
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
    const random=rand(index+87);for(let i=0;i<32000;i++){const x=random()*w,y=random()*h;ctx.fillStyle=random()>.48?'rgba(255,255,245,.035)':'rgba(25,42,25,.025)';ctx.fillRect(x,y,random()*2+.4,random()*4+.4)}
    const shade=ctx.createLinearGradient(0,0,w,0);shade.addColorStop(0,'#00000025');shade.addColorStop(.05,'#0000000a');shade.addColorStop(.09,'#ffffff10');shade.addColorStop(.13,'#00000000');shade.addColorStop(.96,'#ffffff05');shade.addColorStop(1,'#00000013');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.globalAlpha=.24;ctx.lineWidth=1.3;
    ctx.beginPath();ctx.moveTo(44,0);ctx.lineTo(44,h);ctx.stroke();ctx.globalAlpha=1;
    if(back){ctx.globalAlpha=.45;ctx.font='15px Georgia,serif';ctx.textAlign='center';ctx.fillText('S T I L L',w/2,h-135);ctx.beginPath();ctx.moveTo(w/2-18,h-185);ctx.lineTo(w/2+18,h-185);ctx.stroke();return}
    ctx.globalAlpha=.7;ctx.font='17px Georgia,serif';ctx.textAlign='left';ctx.fillText(String(index+1).padStart(2,'0')+' / '+categories[data.category],88,103);
    ctx.textAlign='right';ctx.font='14px Georgia,serif';ctx.fillText('STILL ARCHIVE',w-70,103);
    ctx.save();ctx.translate(w/2+10,400);ctx.lineWidth=1.5;ctx.globalAlpha=.7;
    const art=(data.art??index)%6;
    if(art===0){for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(0,0,104,56,k*Math.PI/3,0,Math.PI*2);ctx.stroke()}ctx.beginPath();ctx.moveTo(-155,117);ctx.lineTo(155,117);ctx.stroke();}
    if(art===1){for(let k=0;k<5;k++){const r=130-k*22;ctx.beginPath();ctx.arc(0,0,r,Math.PI,0);ctx.lineTo(r,115);ctx.moveTo(-r,0);ctx.lineTo(-r,115);ctx.stroke()}ctx.beginPath();ctx.moveTo(-157,115);ctx.lineTo(157,115);ctx.stroke()}
    if(art===2){ctx.strokeRect(-125,-110,180,180);ctx.strokeRect(-55,-40,180,180);ctx.beginPath();ctx.arc(0,13,80,0,Math.PI*2);ctx.stroke()}
    if(art===3){ctx.beginPath();ctx.arc(0,0,95,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(0,0,160,42,-Math.PI/6,0,Math.PI*2);ctx.stroke();for(let k=0;k<4;k++){ctx.save();ctx.rotate(k*Math.PI/2);ctx.beginPath();ctx.moveTo(0,-127);ctx.lineTo(0,-147);ctx.stroke();ctx.restore()}}
    if(art===4){ctx.beginPath();ctx.moveTo(0,135);ctx.lineTo(0,-125);ctx.moveTo(0,40);ctx.bezierCurveTo(-135,33,-125,-95,-125,-95);ctx.bezierCurveTo(-23,-95,0,-35,0,40);ctx.moveTo(0,-20);ctx.bezierCurveTo(114,-16,114,-132,114,-132);ctx.bezierCurveTo(10,-129,0,-65,0,-20);ctx.moveTo(0,105);ctx.bezierCurveTo(114,100,112,-5,112,-5);ctx.bezierCurveTo(10,-5,0,45,0,105);ctx.moveTo(-140,136);ctx.lineTo(140,136);ctx.stroke()}
    if(art===5){ctx.strokeRect(-143,-65,286,180);ctx.beginPath();ctx.moveTo(-143,-65);ctx.lineTo(0,45);ctx.lineTo(143,-65);ctx.moveTo(-143,115);ctx.lineTo(-44,11);ctx.moveTo(143,115);ctx.lineTo(44,11);ctx.stroke();ctx.beginPath();ctx.arc(0,-89,43,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-113);ctx.lineTo(0,-88);ctx.lineTo(19,-77);ctx.stroke()}
    ctx.restore();ctx.fillStyle=ink;ctx.globalAlpha=.94;ctx.textAlign='left';
    const chars=[...data.title],lines=[];let charsPerLine=6;
    if(chars.length>12)charsPerLine=8;
    for(let i=0;i<chars.length;i+=charsPerLine)lines.push(chars.slice(i,i+charsPerLine).join(''));
    const fontSize=charsPerLine===8?57:73;ctx.font=`400 ${fontSize}px "Noto Serif SC","Songti SC",SimSun,serif`;
    lines.slice(0,3).forEach((line,i)=>ctx.fillText(line,86,713+i*(fontSize+24),w-153));
    ctx.globalAlpha=.65;ctx.font='13px Georgia,serif';ctx.fillText(data.en||'A LITTLE LIGHT, SAVED FOR LATER',88,995,w-160);
    ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(88,1033);ctx.lineTo(w-70,1033);ctx.stroke();
    ctx.globalAlpha=.65;ctx.font='16px Georgia,serif';ctx.fillText(data.date.replaceAll('-','.'),88,1083);ctx.textAlign='right';ctx.font='14px Georgia,serif';ctx.fillText(data.id.startsWith('sample-')?'SAMPLE / '+String(index+1).padStart(2,'0'):'TIME CAPSULE',w-70,1083);
  });
}
function spineTexture(data,index){
 const [base,ink]=colors[(data.art??index)%6];
 return canvasTexture(256,1536,(ctx,w,h)=>{
  ctx.fillStyle=base;ctx.fillRect(0,0,w,h);const grad=ctx.createLinearGradient(0,0,w,0);grad.addColorStop(0,'#00000025');grad.addColorStop(.3,'#ffffff0a');grad.addColorStop(.7,'#ffffff08');grad.addColorStop(1,'#00000025');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  ctx.fillStyle=ink;ctx.strokeStyle=ink;ctx.textAlign='center';ctx.globalAlpha=.7;ctx.font='24px Georgia,serif';ctx.fillText(String(index+1).padStart(2,'0'),w/2,145);ctx.font='19px Georgia,serif';ctx.fillText('STILL',w/2,205);
  const title=[...data.title];const fontSize=Math.min(72,780/title.length);ctx.font=`${fontSize}px "Noto Serif SC","Songti SC",SimSun,serif`;title.forEach((ch,i)=>ctx.fillText(ch,w/2,365+i*(fontSize+20)));
  ctx.globalAlpha=.45;ctx.lineWidth=1.7;for(const y of[93,1215,1240]){ctx.beginPath();ctx.moveTo(46,y);ctx.lineTo(w-46,y);ctx.stroke()}ctx.font='22px Georgia,serif';ctx.fillText(data.date.slice(0,4),w/2,1330);ctx.font='18px Georgia,serif';ctx.fillText(categories[data.category],w/2,1390);
 });
}
function roundedCover(w,h){
  const s=new THREE.Shape(),r=.025,x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:.025,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.009,bevelThickness:.009,curveSegments:5});
  // ExtrudeGeometry UVs use world units; a separate print surface has exact UVs.
  return g;
}
function buildBook(data,index){
  const [base]=colors[(data.art??index)%6],w=1.64,h=[2.65,2.5,2.75,2.58,2.69,2.56][index%6],t=[.34,.31,.4,.29,.37,.33][index%6];
  const group=new THREE.Group();group.userData.id=data.id;
  const coverMaterial=new THREE.MeshPhysicalMaterial({color:base,roughness:.78,bumpMap:clothTexture,bumpScale:.009,clearcoat:.15,clearcoatRoughness:.55});
  const coverGeometry=roundedCover(w,h);
  const hinge=new THREE.Group();hinge.position.set(-w/2,0,t/2);group.add(hinge);
  const frontCover=new THREE.Mesh(coverGeometry,coverMaterial);frontCover.position.x=w/2;frontCover.castShadow=true;hinge.add(frontCover);
  const backCover=new THREE.Mesh(coverGeometry,coverMaterial);backCover.position.z=-t/2-.025;backCover.castShadow=true;group.add(backCover);
  const printMap=coverTexture(data,index),backMap=coverTexture(data,index,true),spineMap=spineTexture(data,index);
  const printMaterial=new THREE.MeshPhysicalMaterial({map:printMap,roughness:.7,bumpMap:clothTexture,bumpScale:.006,metalness:.07,clearcoat:.2,clearcoatRoughness:.42});
  // A restrained, view-dependent sweep catches the printed cover as it turns.
  printMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
    float foil = pow(max(0.0, dot(normalize(vNormal), normalize(vec3(-.45, .65, 1.0)))), 24.0);
    gl_FragColor.rgb += vec3(.10, .09, .065) * foil;
  `)};
  const print=new THREE.Mesh(new THREE.PlaneGeometry(w-.018,h-.018),printMaterial);print.position.set(w/2,0,.035);hinge.add(print);
  const inside=new THREE.Mesh(new THREE.PlaneGeometry(w-.04,h-.04),new THREE.MeshStandardMaterial({color:'#dfdac8',roughness:1,side:THREE.BackSide}));inside.position.set(w/2,0,-.011);hinge.add(inside);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(w-.018,h-.018),new THREE.MeshStandardMaterial({map:backMap,roughness:.95}));back.position.z=-t/2-.036;back.rotation.y=Math.PI;group.add(back);
  const pageMap=canvasTexture(256,512,(ctx,cw,ch)=>{ctx.fillStyle='#e7e3d6';ctx.fillRect(0,0,cw,ch);const random=rand(index+5);for(let y=0;y<ch;y+=3){ctx.fillStyle=`rgba(90,80,60,${.03+random()*.1})`;ctx.fillRect(0,y,cw,1)}for(let x=0;x<cw;x+=8){ctx.fillStyle='#ffffff0b';ctx.fillRect(x,0,1,ch)}});
  const edgeMaterial=new THREE.MeshStandardMaterial({map:pageMap,color:'#f1eee2',roughness:1});
  const topMaterial=new THREE.MeshStandardMaterial({color:'#e9e5d7',roughness:1});
  const pageBlock=new THREE.Mesh(new THREE.BoxGeometry(w-.09,h-.08,t-.075),[edgeMaterial,edgeMaterial,topMaterial,topMaterial,topMaterial,topMaterial]);pageBlock.position.x=.017;pageBlock.castShadow=true;pageBlock.receiveShadow=true;group.add(pageBlock);
  const innerMap=canvasTexture(512,768,(ctx,cw,ch)=>{ctx.fillStyle='#eeeadd';ctx.fillRect(0,0,cw,ch);ctx.fillStyle='#758069';ctx.textAlign='center';ctx.font='15px Georgia,serif';ctx.fillText('S T I L L   /   A R C H I V E',cw/2,110);ctx.font='30px SimSun,serif';ctx.fillText(data.title,cw/2,295,cw-90);ctx.strokeStyle='#c9cdbd';ctx.beginPath();ctx.moveTo(80,350);ctx.lineTo(cw-80,350);ctx.stroke();ctx.font='18px Georgia,serif';ctx.fillText(data.date.replaceAll('-','.'),cw/2,405);for(let y=475;y<640;y+=22){ctx.fillStyle='#c4c9b8';ctx.fillRect(90,y,cw-180-(y%3)*35,1)}});
  const leaves=[];
  for(let k=0;k<4;k++){
    const pivot=new THREE.Group();pivot.position.set(-w/2+.05,0,t/2-.027-k*.008);
    const geometry=new THREE.PlaneGeometry(w-.12,h-.1,18,1);
    const paper=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#f1eddf',map:k===0?innerMap:null,roughness:.98,side:THREE.DoubleSide}));paper.position.x=(w-.12)/2;paper.castShadow=true;pivot.add(paper);group.add(pivot);leaves.push({pivot,paper});
  }
  const pageLineMaterial=new THREE.MeshStandardMaterial({color:'#cdc9b9',roughness:1,transparent:true,opacity:.35});
  for(let k=1;k<10;k++){const z=-t/2+.045+k*(t-.09)/10;const line=new THREE.Mesh(new THREE.BoxGeometry(w-.1,.0015,.0016),pageLineMaterial);line.position.set(.02,h/2-.039,z);group.add(line)}
  const spine=new THREE.Mesh(new THREE.CylinderGeometry(t/2+.012,t/2+.012,h,24,1,true,Math.PI,Math.PI),coverMaterial);spine.position.x=-w/2+.018;spine.castShadow=true;group.add(spine);
  const spinePrint=new THREE.Mesh(new THREE.PlaneGeometry(t*.83,h*.97),new THREE.MeshStandardMaterial({map:spineMap,roughness:.96,bumpMap:clothTexture,bumpScale:.005}));spinePrint.rotation.y=-Math.PI/2;spinePrint.position.x=-w/2-t/2-.001;group.add(spinePrint);
  // Headbands and sewn signatures show at the top and bottom of the binding.
  const headMaterial=new THREE.MeshStandardMaterial({color:'#c3bda7',roughness:1});
  for(const y of[-h/2+.045,h/2-.045]){const headband=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,t-.06,10),headMaterial);headband.rotation.x=Math.PI/2;headband.position.set(-w/2+.045,y,0);group.add(headband)}
  const bookmark=new THREE.Mesh(new THREE.BoxGeometry(.07,.18,.006),new THREE.MeshStandardMaterial({color:index%2?'#7a826e':'#b4a78e',roughness:.95}));bookmark.position.set(.46,-h/2-.055,.045);group.add(bookmark);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.7,1.7),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,opacity:.25,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.465;scene.add(shadow);
  group.traverse(obj=>{if(obj.isMesh)obj.userData.bookId=data.id});
  group.rotation.y=1.28;group.position.y=-1.44+h/2;root.add(group);
  return {id:data.id,group,shadow,hinge,leaves,w,h,t,lift:0,opening:0,x:0,depth:0,entry:index*.065,ownedTextures:[printMap,backMap,spineMap,pageMap,innerMap]};
}
function disposeBook(book){
 const geometries=new Set(),materials=new Set();book.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());book.ownedTextures.forEach(t=>t.dispose());root.remove(book.group);scene.remove(book.shadow);book.shadow.geometry.dispose();book.shadow.material.dispose();
}
function sync(){
 const data=api.getData();const ids=data.map(c=>c.id).join('|');
 if(ids!==previousIds){books.splice(0).forEach(disposeBook);data.forEach((c,i)=>books.push(buildBook(c,i)));previousIds=ids;scroll=targetScroll=clamp(data.findIndex(c=>c.id===api.getSelected()),0,Math.max(data.length-1,0));}
 selectedId=api.getSelected();if(!internalSelection)targetScroll=Math.max(0,books.findIndex(b=>b.id===selectedId));needsDraw=true;
 if(openingId&&openingId!==selectedId){clearTimeout(openTimer);openingId=null;document.body.classList.remove('book-opening')}
}
function updateSelection(){const b=books[Math.round(targetScroll)];if(b&&b.id!==api.getSelected()){internalSelection=true;api.select(b.id);internalSelection=false}}
function resize(){
 width=Math.max(host.clientWidth,1);height=Math.max(host.clientHeight,1);
 renderer.setSize(width,height,false);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));camera.aspect=width/height;
 const distance=height<260?9.9:8.6;baseDistance=distance;camera.position.set(0,.95,distance);camera.lookAt(0,-.06,0);camera.fov=32;
 const naturalWidth=2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*distance*camera.aspect;
 if(naturalWidth<3.25)camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(3.25/(2*distance*camera.aspect)));
 viewWidth=2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*distance*camera.aspect;
 camera.updateProjectionMatrix();needsDraw=true;
}
const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
function pick(event){const bounds=host.getBoundingClientRect();pointerNdc.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointerNdc,camera);return raycaster.intersectObjects(root.children,true).find(hit=>hit.object.userData.bookId)?.object.userData.bookId}
function activate(id){if(!id)return;if(id===api.getSelected())api.open(id);else api.select(id)}
function beginOpen(id){
 if(!books.some(b=>b.id===id))return;
 if(reduceMotion.matches){rawOpen(id);return}
 if(openingId)return;openingId=id;document.body.classList.add('book-opening');needsDraw=true;
 openTimer=setTimeout(()=>{if(openingId!==id)return;if(document.querySelector('dialog[open]')){openingId=null;document.body.classList.remove('book-opening');needsDraw=true;return}rawOpen(id)},850);
}
function bindInput(){
 api.open=beginOpen;
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openingId&&!document.querySelector('dialog[open]')){clearTimeout(openTimer);openingId=null;document.body.classList.remove('book-opening');needsDraw=true}});
 document.querySelector('#detail-dialog').addEventListener('close',()=>{openingId=null;document.body.classList.remove('book-opening');needsDraw=true});
 stage.addEventListener('wheel',event=>{if(!books.length||openingId||document.querySelector('dialog[open]'))return;event.preventDefault();const d=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;targetScroll=clamp(targetScroll+d*unit*.0026,0,books.length-1);updateSelection();needsDraw=true},{passive:false});
 stage.addEventListener('pointerdown',event=>{if(event.button!==0||!books.length)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,time:performance.now(),start:targetScroll,moved:false};velocity=0;stage.setPointerCapture(event.pointerId)});
 stage.addEventListener('pointermove',event=>{const r=stage.getBoundingClientRect();if(event.pointerType!=='touch')mouse.set((event.clientX-r.left)/r.width*2-1,(event.clientY-r.top)/r.height*2-1);if(openingId)return;if(pointer){const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;const now=performance.now();const unit=Math.max(115,width/5);const delta=(pointer.lastX-event.clientX)/unit;velocity=delta/Math.max((now-pointer.time)/1000,.008);pointer.lastX=event.clientX;pointer.time=now;if(Math.abs(dx)+Math.abs(dy)>6){pointer.moved=true;stage.classList.add('is-dragging');targetScroll=clamp(pointer.start-dx/unit,0,books.length-1);updateSelection();needsDraw=true}}else{const id=pick(event);if(id!==hoverId){hoverId=id;needsDraw=true;renderer.domElement.style.cursor=id?'pointer':'grab'}}});
 function finish(event,cancelled=false){if(!pointer||pointer.id!==event.pointerId)return;const wasDragging=pointer.moved;pointer=null;stage.classList.remove('is-dragging');if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);if(wasDragging){targetScroll=clamp(targetScroll+clamp(velocity,-7,7)*.14,0,books.length-1);updateSelection();clickBlockedUntil=performance.now()+200}else if(!cancelled&&performance.now()>clickBlockedUntil)activate(pick(event));needsDraw=true}
 stage.addEventListener('pointerup',event=>finish(event));stage.addEventListener('pointercancel',event=>finish(event,true));stage.addEventListener('pointerleave',()=>{hoverId=null;mouse.set(0,0);needsDraw=true});
 document.addEventListener('shelf:update',sync);document.addEventListener('visibilitychange',()=>{visible=!document.hidden;lastTime=0;needsDraw=true});
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();document.body.classList.remove('three-ready');host.hidden=true});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{host.hidden=false;document.body.classList.add('three-ready');needsDraw=true});
 new ResizeObserver(resize).observe(host);
}
function animate(time){
 requestAnimationFrame(animate);if(!visible)return;
 const dt=Math.min((time-(lastTime||time-16))/1000,.045);lastTime=time;
 let moving=false;const instant=reduceMotion.matches;const next=instant?targetScroll:damp(scroll,targetScroll,9,dt);if(Math.abs(next-scroll)>.00001)moving=true;scroll=next;
 if(!enteredAt)enteredAt=time;const elapsed=(time-enteredAt)/1000;
 const mx=instant?0:damp(cameraMouse.x,mouse.x,3.7,dt),my=instant?0:damp(cameraMouse.y,mouse.y,3.7,dt);
 if(Math.abs(mx-cameraMouse.x)+Math.abs(my-cameraMouse.y)>.00005)moving=true;cameraMouse.set(mx,my);
 const zoomTarget=openingId?.65:0;const cameraZ=damp(camera.position.z,baseDistance-zoomTarget,5,dt);if(Math.abs(cameraZ-camera.position.z)>.00001)moving=true;
 camera.position.set(mx*.38,.95-my*.16,cameraZ);camera.lookAt(mx*.08,-.03-my*.035,0);spot.position.x=-3+mx*2;
 let cursor=0;const centers=[];
 books.forEach(book=>{
  const active=book.id===selectedId,hover=book.id===hoverId;
  const opening=instant?0:damp(book.opening,book.id===openingId?1:0,5.7,dt);if(Math.abs(opening-book.opening)>.00001)moving=true;book.opening=opening;
  book.hinge.rotation.y=-opening*2.35;
  book.leaves.forEach(({pivot,paper},i)=>{pivot.rotation.y=-opening*(.32+(3-i)*.13);const positions=paper.geometry.attributes.position;for(let p=0;p<positions.count;p++){const u=(positions.getX(p)+(book.w-.12)/2)/(book.w-.12);positions.setZ(p,Math.sin(u*Math.PI)*opening*.08*(4-i))}positions.needsUpdate=true;paper.visible=opening>.001;});
  const targetRotation=active?-.22+mx*.095+opening*.22:1.29+(hover?-.19:0);
  const rotation=instant?targetRotation:damp(book.group.rotation.y,targetRotation,9,dt);
  if(Math.abs(rotation-book.group.rotation.y)>.00001)moving=true;book.group.rotation.y=rotation;
  const targetLift=active?.19+opening*.16:hover?.2:0;const lift=instant?targetLift:damp(book.lift,targetLift,8,dt);if(Math.abs(lift-book.lift)>.00001)moving=true;book.lift=lift;
  const targetZ=active?.72+opening*.23:hover?.3:0;const z=instant?targetZ:damp(book.depth,targetZ,8,dt);if(Math.abs(z-book.depth)>.00001)moving=true;book.depth=z;
  const tiltTarget=active?-.035+mx*.024:hover?.035:0;const tilt=damp(book.group.rotation.z,instant?0:tiltTarget,8,dt);if(Math.abs(tilt-book.group.rotation.z)>.00001)moving=true;book.group.rotation.z=tilt;
  const entry=instant?1:clamp((elapsed-book.entry)/1.15,0,1),entryEase=1-Math.pow(1-entry,4);if(entry<1)moving=true;
  const footprint=Math.abs(Math.cos(rotation))*book.w+Math.abs(Math.sin(rotation))*(book.t+.17);
  centers.push(cursor+footprint/2);book.group.position.x=cursor+footprint/2;cursor+=footprint+.2+opening*.65;
  book.group.position.y=-1.44+book.h/2+lift-(1-entryEase)*2.8;
  book.group.rotation.x=(1-entryEase)*.28+(active?my*.025:0);
 });
 const left=Math.floor(scroll),right=Math.min(left+1,books.length-1),blend=scroll-left;
 const center=books.length?THREE.MathUtils.lerp(centers[left]??0,centers[right]??0,blend):0;
 const anchor=width>700?THREE.MathUtils.lerp(-viewWidth*.19,viewWidth*.19,books.length>1?scroll/(books.length-1):.5):0;
 root.position.x=-center+anchor;
 books.forEach(book=>{const relative=book.group.position.x-center;book.group.position.z=book.depth-relative*relative*.055;book.shadow.position.x=book.group.position.x+root.position.x;book.shadow.position.z=book.group.position.z;book.shadow.scale.x=.55+Math.abs(Math.cos(book.group.rotation.y))*.35+book.lift*.4;book.shadow.material.opacity=.25-book.lift*.27});
 const activeBook=books.find(b=>b.id===selectedId);if(activeBook){const ox=activeBook.group.position.x+root.position.x;orbit.position.set(ox,-1.472,activeBook.group.position.z);glow.position.set(ox,-1.47,activeBook.group.position.z);orbit.visible=glow.visible=true}else{orbit.visible=glow.visible=false}
 if(needsDraw||moving){renderer.render(scene,camera);needsDraw=false;host.dataset.rendered='true'}
}
async function start(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setClearColor('#eeeee8');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#eeeee8');scene.fog=new THREE.Fog('#eeeee8',19,32);root=new THREE.Group();scene.add(root);camera=new THREE.PerspectiveCamera(32,1,.1,60);
  const ambient=new THREE.HemisphereLight('#ffffff','#929580',1.4);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff9ec',2.65);sun.position.set(-4,7,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=6;sun.shadow.camera.bottom=-6;sun.shadow.camera.near=.5;sun.shadow.camera.far=25;sun.shadow.normalBias=.025;sun.shadow.bias=-.0003;sun.shadow.radius=4;sun.shadow.intensity=.23;scene.add(sun);spot=sun;
  const fill=new THREE.DirectionalLight('#f4f7ef',.9);fill.position.set(5,3,-3);scene.add(fill);
  clothTexture=canvasTexture(128,128,(ctx,w,h)=>{ctx.fillStyle='#808080';ctx.fillRect(0,0,w,h);const random=rand(23);for(let i=0;i<w;i++){ctx.fillStyle=i%2?'#757575':'#909090';ctx.fillRect(i,0,1,h)}for(let i=0;i<h;i++){ctx.fillStyle=i%2?'#ffffff12':'#00000014';ctx.fillRect(0,i,w,1)}for(let i=0;i<3000;i++){ctx.fillStyle=random()>.5?'#ffffff22':'#00000022';ctx.fillRect(random()*w,random()*h,1,1)}});clothTexture.colorSpace=THREE.NoColorSpace;clothTexture.wrapS=clothTexture.wrapT=THREE.RepeatWrapping;clothTexture.repeat.set(9,15);
  shadowTexture=canvasTexture(128,128,(ctx,w,h)=>{const gradient=ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);gradient.addColorStop(0,'rgba(52,57,40,.7)');gradient.addColorStop(.35,'rgba(52,57,40,.3)');gradient.addColorStop(1,'rgba(52,57,40,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h)});
  const orbitPoints=[];for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;orbitPoints.push(new THREE.Vector3(Math.cos(a)*1.5,0,Math.sin(a)*.98))}orbit=new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints),new THREE.LineDashedMaterial({color:'#9ca78c',transparent:true,opacity:.38,dashSize:.035,gapSize:.055}));orbit.computeLineDistances();scene.add(orbit);
  const glowMap=canvasTexture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'#dce7bd99');g.addColorStop(.45,'#dce7bd45');g.addColorStop(1,'#dce7bd00');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)});glow=new THREE.Mesh(new THREE.PlaneGeometry(4.5,3.4),new THREE.MeshBasicMaterial({map:glowMap,transparent:true,opacity:.42,depthWrite:false}));glow.rotation.x=-Math.PI/2;scene.add(glow);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.075}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.545;floor.receiveShadow=true;scene.add(floor);
  resize();sync();bindInput();document.body.classList.add('three-ready');host.dataset.engine='three.js r180';requestAnimationFrame(animate);
  document.fonts.ready.then(()=>{if(books.length){previousIds='';sync()}});
 }catch(error){console.warn('3D shelf unavailable; accessible shelf remains active.',error);renderer?.dispose();host.replaceChildren();document.body.classList.remove('three-ready');host.dataset.engine='fallback';}
}
start();
