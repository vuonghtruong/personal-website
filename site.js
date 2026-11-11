(() => {
  const field=document.querySelector('#publication-search');
  const controls=document.querySelector('.pub-controls');
  if(!field||!controls)return;
  const rows=[...document.querySelectorAll('.publication')];
  const groups=[...document.querySelectorAll('.pub-group')];
  const status=document.querySelector('#search-status');
  const empty=document.querySelector('#no-results');
  controls.hidden=false;
  field.addEventListener('input',()=>{
    const query=field.value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    let count=0;
    for(const row of rows){
      const text=row.textContent.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const match=query.split(/\s+/).every(word=>text.includes(word));
      row.hidden=!match;if(match)count++;
    }
    for(const group of groups)group.hidden=![...group.querySelectorAll('.publication')].some(row=>!row.hidden);
    empty.hidden=count!==0;
    status.textContent=`${count} publication${count===1?'':'s'} found.`;
  });
})();


// Two symmetric phase oscillators. Hours are the model's time unit.
const CoupledClockModel = (()=>{
  const TAU=2*Math.PI;
  function info(tau2,K){
    const w1=TAU/24,w2=TAU/tau2,dw=w2-w1,margin=2*K-Math.abs(dw);
    const boundary=Math.abs(margin)<1e-9;
    const regime=boundary?'boundary':margin>0?'locked':'drifting';
    const beatHours=regime==='drifting'?TAU/Math.sqrt(dw*dw-4*K*K):null;
    return {tau1:24,tau2,K,w1,w2,dw,mean:(w1+w2)/2,regime,beatHours,commonPeriod:TAU/((w1+w2)/2),criticalK:Math.abs(dw)/2};
  }
  function advance(delta,h,m){
    if(m.K===0)return delta+m.dw*h;
    const n=Math.max(1,Math.ceil(Math.abs(h)/.25)),dt=h/n;
    const f=d=>m.dw-2*m.K*Math.sin(d);
    for(let i=0;i<n;i++){
      const a=f(delta),b=f(delta+dt*a/2),c=f(delta+dt*b/2),d=f(delta+dt*c);
      delta+=dt*(a+2*b+2*c+d)/6;
    }
    return delta;
  }
  function initial(m){
    if(m.regime==='boundary')return Math.sign(m.dw)*Math.PI/2;
    if(m.regime!=='locked')return 0;
    // Start near the stable branch, then remove the transient numerically.
    const stable=Math.asin(m.dw/(2*m.K));
    const relaxation=Math.sqrt(4*m.K*m.K-m.dw*m.dw);
    return advance(stable+.2,Math.min(20000,16/relaxation),m);
  }
  function series(m){
    const duration=m.regime==='drifting'?Math.min(2*m.beatHours,120*24):5*m.commonPeriod;
    const count=Math.min(4000,Math.max(600,Math.ceil(duration/.75)));
    const step=duration/count,startDelta=initial(m),points=[];
    let delta=startDelta;
    for(let i=0;i<=count;i++){
      const t=i*step;if(i)delta=advance(delta,step,m);
      points.push({t,delta,theta1:m.mean*t-delta/2,theta2:m.mean*t+delta/2,alignment:(1+Math.cos(delta))/2});
    }
    return {duration,startDelta,points,capped:m.regime==='drifting'&&2*m.beatHours>120*24};
  }
  function project(u,v){
    const radius=110+43*Math.cos(v),x=radius*Math.cos(u),y=radius*Math.sin(u),z=43*Math.sin(v);
    const tilt=1.05,screenY=y*Math.cos(tilt)-z*Math.sin(tilt);
    return {x:250+x*1.3,y:132+screenY*1.3,depth:y*Math.sin(tilt)+z*Math.cos(tilt)};
  }
  return {info,advance,initial,series,project};
})();

(()=>{
  const panel=document.querySelector('.coupled-model');if(!panel)return;
  const tau=panel.querySelector('#clock-period'),coupling=panel.querySelector('#clock-coupling');
  const toggle=panel.querySelector('.model-play'),preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const trace=panel.querySelector('#torus-trace'),alignment=panel.querySelector('#alignment-trace');
  const point=panel.querySelector('#torus-point'),cursor=panel.querySelector('#alignment-cursor'),alignPoint=panel.querySelector('#alignment-point');
  const status=panel.querySelector('#model-status'),detail=panel.querySelector('#model-description');
  const periodValue=panel.querySelector('#period-value'),couplingValue=panel.querySelector('#coupling-value');
  const presets=[...panel.querySelectorAll('[data-model-preset]')];
  const presetValues={independent:[24.8,0],slow:[24.8,.0035],locked:[24.8,.012]};
  let model,data,elapsed=0,playing=!preference.matches,inView=true,last=null;
  const path=pts=>pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join('');
  function mark(){
    const position=elapsed/data.duration*(data.points.length-1),index=Math.min(data.points.length-2,Math.floor(position));
    const a=data.points[index],b=data.points[index+1],fraction=position-index;
    const theta1=a.theta1+(b.theta1-a.theta1)*fraction,theta2=a.theta2+(b.theta2-a.theta2)*fraction;
    const p=CoupledClockModel.project(theta1,theta2);
    point.setAttribute('transform',`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    const x=24+452*elapsed/data.duration,y=66-44*(a.alignment+(b.alignment-a.alignment)*fraction);
    cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);alignPoint.setAttribute('cx',x);alignPoint.setAttribute('cy',y);
  }
  function rebuild(){
    model=CoupledClockModel.info(Number(tau.value),Number(coupling.value));data=CoupledClockModel.series(model);
    elapsed=0;last=null;
    trace.setAttribute('d',path(data.points.map(p=>CoupledClockModel.project(p.theta1,p.theta2))));
    alignment.setAttribute('d',path(data.points.map(p=>({x:24+452*p.t/data.duration,y:66-44*p.alignment}))));
    periodValue.textContent=model.tau2.toFixed(1)+' h';couplingValue.textContent=model.K.toFixed(4)+' rad/h';
    tau.setAttribute('aria-valuetext',model.tau2.toFixed(1)+' hours');coupling.setAttribute('aria-valuetext',model.K.toFixed(4)+' radians per hour');
    panel.querySelector('#window-label').textContent=(data.duration/24).toFixed(1)+' days shown';
    panel.querySelector('#alignment-end').textContent=(data.duration/24).toFixed(1)+' d';
    if(model.regime==='locked'){
      status.textContent='Phase locked';detail.textContent=`A fixed phase difference. Both clocks run with a shared ${model.commonPeriod.toFixed(2)} h period.`;
    }else if(model.regime==='boundary'){
      status.textContent='Locking boundary';detail.textContent='The phase-slip period diverges at 2K = |ω₂ − ω₁|. The equilibrium here is marginal.';
    }else{
      status.textContent='Phase drift · '+(model.beatHours/24).toFixed(1)+'-day beats';
      detail.textContent=data.capped?'Relative timing keeps slipping. The plot shows 120 days of the longer beat cycle.':'Fast intrinsic clocks produce a slow cycle of alignment. The trace shows two beat cycles.';
    }
    presets.forEach(button=>{
      const values=presetValues[button.dataset.modelPreset];
      button.setAttribute('aria-pressed',String(Math.abs(model.tau2-values[0])<.001&&Math.abs(model.K-values[1])<.00001));
    });mark();
  }
  function setPlaying(){
    toggle.querySelector('span').textContent=playing?'Pause':'Play';
    toggle.setAttribute('aria-label',playing?'Pause model animation':'Play model animation');
    panel.classList.toggle('model-playing',playing);last=null;
  }
  panel.querySelector('.model-controls').hidden=false;panel.querySelector('.model-presets').hidden=false;toggle.hidden=false;
  tau.addEventListener('input',rebuild);coupling.addEventListener('input',rebuild);
  presets.forEach(button=>button.addEventListener('click',()=>{
    [tau.value,coupling.value]=presetValues[button.dataset.modelPreset];rebuild();
  }));
  toggle.addEventListener('click',()=>{playing=!playing;setPlaying();});
  preference.addEventListener('change',()=>{if(preference.matches){playing=false;setPlaying();}});
  document.addEventListener('visibilitychange',()=>{last=null;});
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;last=null;}).observe(panel);
  rebuild();setPlaying();
  function frame(now){
    if(last!==null&&playing&&inView&&!document.hidden){
      const h=Math.min((now-last)/1000,.1)*data.duration/40;
      elapsed=(elapsed+h)%data.duration;mark();
    }
    last=now;requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
