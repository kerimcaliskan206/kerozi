/* Hizmetler: scroll-driven 3D scene. Falls back silently to the static chapters. */
(function(){
'use strict';
var S={on:false,built:false,visible:true,raf:0,last:0};
try{
var root=document.getElementById('hizmetler'),uni=document.getElementById('uni');
if(!root||!uni||typeof THREE==='undefined')return;
var track=uni.querySelector('.uni-track'),stage=uni.querySelector('.uni-stage'),canvas=uni.querySelector('.uni-canvas'),
  panelsEl=uni.querySelector('.uni-panels'),steps=[].slice.call(uni.querySelectorAll('.uni-step')),
  countEl=uni.querySelector('.uni-count b'),barEl=uni.querySelector('.uni-bar i'),
  sections=[].slice.call(root.querySelectorAll('.service-chapter'));
if(!track||!stage||!canvas||sections.length!==4||steps.length!==4)return;
var ids=sections.map(function(s){return s.id});
var reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
var fine=window.matchMedia('(pointer: fine)');
var small=window.innerWidth<=800;

var renderer,scene,camera,curve,planets=[],starMat,nebulae=[],panels=[],io=null,ro=null;
var cp=0,activeIdx=-1,mx=0,my=0,smx=0,smy=0,aspect=1;
var UP=new THREE.Vector3(0,1,0),TMP=new THREE.Vector3(),TMP2=new THREE.Vector3();
var clamp=function(v,a,b){return Math.min(b,Math.max(a,v))};
var rnd=function(a,b){return a+Math.random()*(b-a)};

function glowTexture(r,g,b,falloff){
  var c=document.createElement('canvas');c.width=c.height=128;
  var x=c.getContext('2d'),gr=x.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba('+r+','+g+','+b+',1)');
  gr.addColorStop(falloff||.35,'rgba('+r+','+g+','+b+',.35)');
  gr.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
  x.fillStyle=gr;x.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function bandTexture(colors){
  var c=document.createElement('canvas');c.width=256;c.height=128;
  var x=c.getContext('2d'),y=0;
  while(y<128){var h=rnd(5,16);x.fillStyle=colors[Math.floor(Math.random()*colors.length)];x.fillRect(0,y,256,h+1);y+=h}
  x.globalAlpha=.12;x.fillStyle='#fff';
  for(var i=0;i<40;i++)x.fillRect(rnd(0,256),rnd(0,128),rnd(10,60),1);
  var t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;return t;
}
function glowSprite(tex,color,scale,opacity){
  var s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:color,transparent:true,opacity:opacity,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  s.scale.set(scale,scale,1);return s;
}

/* ---- planets ---- */
function planetCrm(glowTex){
  var g=new THREE.Group(),tilt=new THREE.Group();
  var body=new THREE.Mesh(new THREE.SphereGeometry(1.5,48,32),new THREE.MeshStandardMaterial({
    map:bandTexture(['#4a2fb8','#6a45e0','#3a2490','#8a6bff','#2c1a78']),roughness:.8,metalness:.05,emissive:0x2a1580,emissiveIntensity:.7}));
  var ringGeo=new THREE.RingGeometry(2.1,3.1,96);ringGeo.rotateX(-Math.PI/2);
  var ring=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x9a7bff,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}));
  var ring2Geo=new THREE.RingGeometry(3.3,3.55,96);ring2Geo.rotateX(-Math.PI/2);
  var ring2=new THREE.Mesh(ring2Geo,new THREE.MeshBasicMaterial({color:0x6f9bff,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));
  var moonPivot=new THREE.Group(),moon=new THREE.Mesh(new THREE.SphereGeometry(.22,16,12),new THREE.MeshBasicMaterial({color:0xc9bbff}));
  moon.position.set(3.9,0,0);moonPivot.add(moon);
  tilt.add(body,ring,ring2,moonPivot);tilt.rotation.set(.35,0,-.38);g.add(tilt);
  g.add(glowSprite(glowTex,0x7a5cff,10,.85));
  return{group:g,update:function(t,dt){body.rotation.y+=dt*.16;moonPivot.rotation.y+=dt*.5;}};
}
function planetAi(glowTex){
  var g=new THREE.Group();
  var core=new THREE.Mesh(new THREE.IcosahedronGeometry(.95,2),new THREE.MeshBasicMaterial({color:0x8a6bff,transparent:true,opacity:.8}));
  var shellGeo=new THREE.IcosahedronGeometry(1.8,1);
  var shell=new THREE.LineSegments(new THREE.WireframeGeometry(shellGeo),new THREE.LineBasicMaterial({color:0xb69cff,transparent:true,opacity:.7}));
  var nodes=new THREE.Points(shellGeo,new THREE.PointsMaterial({color:0xe6deff,size:.16,sizeAttenuation:true,transparent:true,opacity:.95,depthWrite:false}));
  var inner=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.25,0)),new THREE.LineBasicMaterial({color:0x5b8cf0,transparent:true,opacity:.65}));
  g.add(core,shell,nodes,inner,glowSprite(glowTex,0x9a6bff,9,.8));
  return{group:g,update:function(t,dt){
    var p=1+.14*Math.sin(t*2.2);core.scale.setScalar(p);core.material.opacity=.65+.2*Math.sin(t*2.2);
    shell.rotation.y+=dt*.2;shell.rotation.x+=dt*.07;nodes.rotation.copy(shell.rotation);
    inner.rotation.y-=dt*.35;inner.rotation.z+=dt*.15;nodes.material.size=.15+.04*Math.sin(t*2.2);
  }};
}
function planetWeb(glowTex){
  var g=new THREE.Group(),globe=new THREE.Group();
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.6,32,24),new THREE.MeshBasicMaterial({color:0x0a0a16})));
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.63,28,18),new THREE.MeshBasicMaterial({color:0x5b8cf0,wireframe:true,transparent:true,opacity:.5})));
  var pts=[],i,la,lo;
  for(i=0;i<90;i++){la=Math.asin(rnd(-1,1));lo=rnd(0,Math.PI*2);
    pts.push(1.66*Math.cos(la)*Math.cos(lo),1.66*Math.sin(la),1.66*Math.cos(la)*Math.sin(lo));}
  var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  globe.add(new THREE.Points(pg,new THREE.PointsMaterial({color:0xd7e4ff,size:.1,transparent:true,opacity:.95,depthWrite:false})));
  var orbit=new THREE.Mesh(new THREE.TorusGeometry(2.3,.014,8,120),new THREE.MeshBasicMaterial({color:0x8aa8ff,transparent:true,opacity:.6}));
  orbit.rotation.set(1.2,.3,0);
  g.add(globe,orbit,glowSprite(glowTex,0x4f8cff,9.5,.8));
  g.rotation.z=.25;
  return{group:g,update:function(t,dt){globe.rotation.y+=dt*.22;orbit.rotation.z+=dt*.12;}};
}
function planetMobile(glowTex){
  var g=new THREE.Group(),w=1.7,h=3.2,r=.34,s=new THREE.Shape();
  s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
  s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);
  s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  var geo=new THREE.ExtrudeGeometry(s,{depth:.2,bevelEnabled:true,bevelThickness:.05,bevelSize:.05,bevelSegments:3,curveSegments:12});
  geo.center();
  var slab=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x151a33,roughness:.35,metalness:.6,emissive:0x0a1740,emissiveIntensity:.8}));
  var edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,35),new THREE.LineBasicMaterial({color:0x6fa0ff,transparent:true,opacity:.9}));
  var screen=new THREE.Mesh(new THREE.PlaneGeometry(1.4,2.75),new THREE.MeshBasicMaterial({color:0x2a3f9c,transparent:true,opacity:.55}));
  screen.position.z=.17;
  var ui=new THREE.Group();ui.position.z=.18;
  var bar=function(x,y,bw,bh,c,o){var m=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o}));m.position.set(x,y,0);ui.add(m)};
  bar(0,.95,1.15,.5,0x7a5cff,.8);bar(0,.28,1.15,.16,0xbfd0ff,.55);bar(0,-.05,1.15,.16,0xbfd0ff,.4);
  bar(0,-.38,1.15,.16,0xbfd0ff,.3);bar(0,-1.1,.8,.2,0x5b8cf0,.8);
  var body=new THREE.Group();body.add(slab,edges,screen,ui);
  g.add(body,glowSprite(glowTex,0x4f7cff,8.5,.75));
  g.rotation.x=.12;
  return{group:g,update:function(t,dt){body.rotation.y=Math.sin(t*.5)*.7+.35;body.position.y=Math.sin(t*.9)*.12;}};
}

/* ---- stars ---- */
var STAR_VS='attribute vec3 aColor;attribute float aSize;attribute float aPhase;uniform float uTime;uniform float uPR;varying vec3 vColor;varying float vA;'
 +'void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);float d=max(-mv.z,0.5);'
 +'gl_PointSize=clamp(aSize*uPR*(60.0/d),1.0,5.0*uPR);'
 +'vA=(0.72+0.28*sin(uTime*1.3+aPhase))*smoothstep(1.0,6.0,d);vColor=aColor;gl_Position=projectionMatrix*mv;}';
var STAR_FS='varying vec3 vColor;varying float vA;void main(){float r=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,r);gl_FragColor=vec4(vColor,a*a*vA);}';
function buildStars(){
  var total=small?1400:4000,pos=new Float32Array(total*3),col=new Float32Array(total*3),size=new Float32Array(total),ph=new Float32Array(total);
  var pal=[[1,1,1],[.82,.77,1],[.66,.77,1],[.78,.68,1]];
  var layers=[{n:.5,spread:95,s0:.7,s1:1.3,b:.55},{n:.33,spread:58,s0:1.1,s1:2,b:.8},{n:.17,spread:30,s0:1.7,s1:3,b:1}];
  var i=0,li,L,k,c,x,y;
  for(li=0;li<3;li++){
    L=layers[li];k=Math.floor(total*L.n);if(li===2)k=total-i;
    for(var j=0;j<k&&i<total;j++,i++){
      do{x=rnd(-L.spread,L.spread);y=rnd(-L.spread*.7,L.spread*.7)}while(li===2&&Math.abs(x)<5&&Math.abs(y)<4);
      pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=rnd(-135,25);
      c=pal[Math.floor(Math.random()*pal.length)];
      col[i*3]=c[0]*L.b;col[i*3+1]=c[1]*L.b;col[i*3+2]=c[2]*L.b;
      size[i]=rnd(L.s0,L.s1);ph[i]=rnd(0,6.28);
    }
  }
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aColor',new THREE.BufferAttribute(col,3));
  geo.setAttribute('aSize',new THREE.BufferAttribute(size,1));geo.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  starMat=new THREE.ShaderMaterial({vertexShader:STAR_VS,fragmentShader:STAR_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uPR:{value:1}}});
  var pts=new THREE.Points(geo,starMat);pts.frustumCulled=false;scene.add(pts);
}

/* ---- scene ---- */
function build(){
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:!small,alpha:false,powerPreference:'high-performance'});
  renderer.setClearColor(0x07070c,1);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(55,1,.1,400);
  curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,10),new THREE.Vector3(-3,1.2,-18),new THREE.Vector3(3.5,-1,-46),
    new THREE.Vector3(-2.5,1,-74),new THREE.Vector3(1,0,-102)],false,'catmullrom',.5);
  scene.add(new THREE.AmbientLight(0x5a4fb0,.9));
  var dl=new THREE.DirectionalLight(0xc4b4ff,1.4);dl.position.set(-4,5,6);scene.add(dl);
  var gl=new THREE.DirectionalLight(0x5b8cf0,.6);gl.position.set(5,-3,-4);scene.add(gl);
  buildStars();
  var neb=[[0x4a2bd0,-16,6,8],[0x2a4fd8,18,-5,-18],[0x7a3bd6,-20,-6,-40],[0x2f5fe0,16,8,-58],[0x5a35d0,-14,5,-78],[0x3a55d8,12,-7,-96],[0x7a3bd6,0,12,-30]];
  neb.forEach(function(n,i){
    var t=glowTexture(255,255,255,.2),s=glowSprite(t,n[0],rnd(46,70),rnd(.14,.22));
    s.position.set(n[1],n[2],n[3]);s.userData={bx:n[1],by:n[2],ph:i*1.7};scene.add(s);nebulae.push(s);
  });
  var gt=glowTexture(255,255,255,.3);
  [planetCrm,planetAi,planetWeb,planetMobile].forEach(function(f){
    var p=f(gt);scene.add(p.group);planets.push(p);
  });
  // text panels (cloned from the static chapters so copy stays identical)
  sections.forEach(function(sec,i){
    var panel=document.createElement('div');panel.className='uni-panel';
    var copy=document.createElement('div');copy.className='chapter-copy uni-copy';
    [].slice.call(sec.querySelector('.chapter-copy').children).forEach(function(n,k){
      var c=n.cloneNode(true);c.removeAttribute('id');c.style.setProperty('--k',k);copy.appendChild(c);
    });
    panel.appendChild(copy);
    var vis=sec.querySelector('.visual');
    if(vis){
      var card=document.createElement('div');card.className='uni-card';card.setAttribute('aria-hidden','true');
      var v=vis.cloneNode(true);v.removeAttribute('style');v.removeAttribute('data-scene');card.appendChild(v);panel.appendChild(card);
    }
    panelsEl.appendChild(panel);panels.push(panel);
  });
  canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();disable(true)});
  S.built=true;
}
function layout(){
  var w=stage.clientWidth||1,h=stage.clientHeight||1;
  aspect=w/h;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(w,h,false);
  camera.aspect=aspect;camera.fov=aspect<.8?66:55;camera.updateProjectionMatrix();
  starMat.uniforms.uPR.value=renderer.getPixelRatio();
  var portrait=aspect<.9,sc=clamp(aspect/1.15,.45,1),offX=portrait?0:3.7,offY=portrait?2.7*sc+.6:.5;
  planets.forEach(function(p,i){
    var u=i/3;
    curve.getPointAt(u,TMP);curve.getTangentAt(u,TMP2);
    var right=new THREE.Vector3().crossVectors(TMP2,UP).normalize();
    p.group.position.copy(TMP).addScaledVector(TMP2,9).addScaledVector(right,offX).addScaledVector(UP,offY);
    p.group.scale.setScalar(sc*1.15);
  });
}
function progress(){
  var r=track.getBoundingClientRect(),range=track.offsetHeight-stage.offsetHeight;
  return range>0?clamp(-r.top/range,0,1):0;
}
function setActive(i){
  if(i===activeIdx)return;
  activeIdx=i;
  panels.forEach(function(p,k){p.classList.toggle('is-active',k===i);p.classList.toggle('is-past',k<i);p.setAttribute('aria-hidden',k===i?'false':'true')});
  countEl.textContent='0'+(i+1);
}
var clock=0;
function frame(now){
  S.raf=0;
  if(!S.on||!S.visible||document.hidden)return;
  var dt=Math.min(.05,(now-S.last)/1000||.016);S.last=now;clock+=dt;
  var target=progress();
  cp+=(target-cp)*(1-Math.exp(-dt*4.2));
  if(Math.abs(target-cp)<.0002)cp=target;
  var pm=fine.matches&&!small;
  smx+=((pm?mx:0)-smx)*(1-Math.exp(-dt*3));smy+=((pm?my:0)-smy)*(1-Math.exp(-dt*3));
  var u=clamp(cp,0,1);
  curve.getPointAt(u,TMP);curve.getTangentAt(u,TMP2);
  camera.position.copy(TMP);
  camera.lookAt(TMP.x+TMP2.x*8+smx*1.2,TMP.y+TMP2.y*8+smy*.8,TMP.z+TMP2.z*8);
  camera.position.x+=smx*.7;camera.position.y+=smy*.45;
  starMat.uniforms.uTime.value=clock;
  for(var i=0;i<planets.length;i++)planets[i].update(clock,dt);
  for(i=0;i<nebulae.length;i++){var n=nebulae[i],d=n.userData;
    n.position.x=d.bx+Math.sin(clock*.05+d.ph)*2;n.position.y=d.by+Math.cos(clock*.04+d.ph)*1.5;}
  renderer.render(scene,camera);
  setActive(clamp(Math.round(cp*3),0,3));
  barEl.style.transform='scaleX('+cp.toFixed(4)+')';
  S.raf=requestAnimationFrame(frame);
}
function start(){
  if(S.raf||!S.on||!S.visible||document.hidden)return;
  S.last=performance.now();S.raf=requestAnimationFrame(frame);
}
function swapIds(on){
  sections.forEach(function(sec,i){
    if(on){sec.removeAttribute('id');steps[i].id=ids[i]}
    else{steps[i].removeAttribute('id');sec.id=ids[i]}
  });
}
function goHash(){
  var i=ids.indexOf(decodeURIComponent(location.hash.slice(1)));
  if(i<0||!S.on)return;
  window.scrollTo({top:steps[i].getBoundingClientRect().top+window.pageYOffset,behavior:'instant'});
}
function enable(){
  if(S.on)return;
  if(!S.built)build();
  S.on=true;
  root.classList.add('uni-on');uni.hidden=false;
  swapIds(true);
  layout();
  cp=progress();activeIdx=-1;
  if(window.IntersectionObserver&&!io){
    io=new IntersectionObserver(function(e){S.visible=e[e.length-1].isIntersecting;if(S.visible)start()},{rootMargin:'80px 0px'});
    io.observe(track);
  }
  if('ResizeObserver' in window&&!ro){ro=new ResizeObserver(function(){if(S.on)layout()});ro.observe(stage)}
  goHash();
  setActive(clamp(Math.round(cp*3),0,3));
  start();
}
function disable(){
  if(!S.on)return;
  S.on=false;
  if(S.raf){cancelAnimationFrame(S.raf);S.raf=0}
  swapIds(false);
  root.classList.remove('uni-on');uni.hidden=true;
}

window.addEventListener('pointermove',function(e){mx=e.clientX/window.innerWidth*2-1;my=-(e.clientY/window.innerHeight*2-1)},{passive:true});
window.addEventListener('resize',function(){small=window.innerWidth<=800;if(S.on)layout()});
document.addEventListener('visibilitychange',start);
window.addEventListener('load',goHash);
window.addEventListener('hashchange',function(){if(S.on)goHash()});
reduce.addEventListener('change',function(){
  try{if(reduce.matches)disable();else enable()}catch(e){disable()}
});
if(!reduce.matches)enable();
}catch(err){
  try{
    // keep the static chapters visible if anything above failed
    if(S.on||S.built){var r=document.getElementById('hizmetler'),u=document.getElementById('uni');
      if(r)r.classList.remove('uni-on');if(u)u.hidden=true;
      var secs=r?r.querySelectorAll('.service-chapter'):[];
      var st=u?u.querySelectorAll('.uni-step'):[];
      for(var i=0;i<secs.length&&i<st.length;i++){if(st[i].id){secs[i].id=st[i].id;st[i].removeAttribute('id')}}
      S.on=false;if(S.raf)cancelAnimationFrame(S.raf);}
  }catch(e2){}
}
})();
