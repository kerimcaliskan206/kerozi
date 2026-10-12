const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=x=>x*x*(3-2*x);
const chapters=[...document.querySelectorAll('.service-chapter')].map(el=>{
  const pin=el.querySelector('.chapter-pin'),card=el.querySelector('.visual'),glow=document.createElement('div');
  glow.className='chapter-glow';glow.setAttribute('aria-hidden','true');pin.insertBefore(glow,pin.firstChild);
  return{el,pin,card,glow,layers:[...card.children],copy:[...el.querySelector('.chapter-copy').children],
    bottom:el.querySelector('.chapter-bottom'),bar:el.querySelector('.chapter-progress i')};
});
let scheduled=false;
function reset(c){
  c.card.style.transform='';c.card.style.opacity='';c.glow.style.opacity='';c.glow.style.transform='';
  c.bottom.style.opacity='';c.bar.style.transform='';
  c.copy.forEach(n=>{n.style.opacity='';n.style.transform=''});
  c.layers.forEach(n=>{n.style.transform=''});
}
function render(){
  scheduled=false;
  if(document.getElementById('hizmetler').classList.contains('uni-on'))return;
  const H=innerHeight,mobile=innerWidth<=800,still=reduced.matches;
  for(const c of chapters){
    if(still){reset(c);continue;}
    const r=c.el.getBoundingClientRect();
    if(r.top>H||r.bottom<0)continue;
    const pinH=c.pin.offsetHeight,range=Math.max(1,c.el.offsetHeight-pinH);
    const enter=clamp(1-r.top/H),p=clamp(-r.top/range),leave=clamp((-r.top-range)/pinH);
    const se=smooth(enter);
    const cardVis=smooth(clamp((enter-.05)/.55))*(1-smooth(clamp(leave/.75)));
    // text: staggered fade/slide in, then out during hand-off
    c.copy.forEach((n,i)=>{
      if(mobile){
        n.style.opacity=cardVis.toFixed(3);
        n.style.transform=`translate3d(0,${((1-enter)*24-leave*24).toFixed(1)}px,0)`;
        return;
      }
      const a=smooth(clamp((enter-.2-i*.09)/.4)),out=1-smooth(clamp((leave-i*.04)/.6));
      n.style.opacity=(a*out).toFixed(3);
      n.style.transform=`translate3d(0,${((1-a)*34-leave*50-p*14*(1+i*.2)).toFixed(1)}px,0)`;
    });
    c.bottom.style.opacity=cardVis.toFixed(3);
    c.bar.style.transform=`scaleX(${p.toFixed(4)})`;
    // card: 3D depth + tilt
    if(mobile){
      c.card.style.opacity=cardVis.toFixed(3);
      c.card.style.transform=`translate(-50%,-50%) translate3d(0,${((1-enter)*40-leave*40).toFixed(1)}px,0)`;
      c.glow.style.opacity=(cardVis*.8).toFixed(3);
      c.glow.style.transform='translate3d(0,-50%,0)';
      continue;
    }
    const ep=p*p*(3-2*p);
    const rotY=-16+26*ep-14*(1-enter)-10*leave,rotX=5-8*p+6*(1-enter);
    const z=-240*(1-se)+70*p-200*leave,y=40*(1-enter)-18*p-70*leave;
    c.card.style.opacity=cardVis.toFixed(3);
    c.card.style.transform=`translate(-50%,-50%) translate3d(0,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg)`;
    // inner layers drift at different speeds for parallax
    const t=(p-.5)+(enter-1)*.6-leave*.8,n=c.layers.length;
    c.layers.forEach((l,i)=>{l.style.transform=`translate3d(0,${(t*36*(n>1?i/(n-1)-.5:0)).toFixed(1)}px,0)`});
    // glow follows the chapter
    c.glow.style.opacity=((.25+.75*se)*(1-smooth(leave))).toFixed(3);
    c.glow.style.transform=`translate3d(0,-50%,0) scale(${(.7+.35*enter+.2*p).toFixed(3)})`;
  }
}
function queue(){if(!scheduled){scheduled=true;requestAnimationFrame(render)}}
addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue);reduced.addEventListener('change',queue);
document.getElementById('year').textContent=new Date().getFullYear();render();
