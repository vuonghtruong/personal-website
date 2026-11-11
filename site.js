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

// Symmetric phase oscillators; time is in hours and K may have either sign.
const CoupledClockModel=(()=>{
  const TAU=2*Math.PI;
  function info(tau2,K){
    const w1=TAU/24,w2=TAU/tau2,dw=w2-w1,margin=2*Math.abs(K)-Math.abs(dw);
    const neutral=K===0&&Math.abs(dw)<1e-12;
    const regime=neutral?'neutral':Math.abs(margin)<1e-9?'boundary':margin>0?'locked':'drifting';
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
    if(m.regime!=='locked'&&m.regime!=='boundary')return 0;
    const principal=Math.asin(Math.max(-1,Math.min(1,m.dw/(2*m.K))));
    return m.K>0?principal:Math.PI-principal;
  }
  function sample(t,delta,m){
    const theta1=m.mean*t-delta/2,theta2=m.mean*t+delta/2;
    const x1=Math.cos(theta1),x2=Math.cos(theta2);
    return {t,delta,theta1,theta2,x1,x2,signal:(x1+x2)/2,envelope:Math.abs(Math.cos(delta/2))};
  }
  function series(m){
    const duration=m.regime==='drifting'?Math.min(2*m.beatHours,120*24):5*m.commonPeriod;
    const step=.25,count=Math.ceil((duration+96)/step),points=[];
    let delta=initial(m);
    for(let i=0;i<=count;i++){
      if(i)delta=advance(delta,step,m);
      points.push(sample(i*step,delta,m));
    }
    return {duration,step,points,capped:m.regime==='drifting'&&2*m.beatHours>120*24};
  }
  function at(t,data,m){
    const i=Math.min(data.points.length-2,Math.floor(t/data.step)),a=data.points[i],b=data.points[i+1];
    return sample(t,a.delta+(b.delta-a.delta)*(t-a.t)/data.step,m);
  }
  function project(u,v){
    const radius=110+43*Math.cos(v),x=radius*Math.cos(u),y=radius*Math.sin(u),z=43*Math.sin(v);
    const tilt=1.05,screenY=y*Math.cos(tilt)-z*Math.sin(tilt);
    return {x:250+x*1.3,y:132+screenY*1.3};
  }
  return {info,advance,initial,sample,series,at,project};
})();

(()=>{
  const panel=document.querySelector('.coupled-model');if(!panel)return;
  const q=id=>panel.querySelector(id),tau=q('#clock-period'),coupling=q('#clock-coupling');
  const toggle=q('.model-play'),preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const presets=[...panel.querySelectorAll('[data-model-preset]')];
  const presetValues={independent:[24.8,0],attractive:[24.8,.012],repulsive:[24.8,-.012],slow:[24.8,.0035]};
  const path=pts=>pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join('');
  let model,data,elapsed=0,playing=!preference.matches,inView=true,last=null;
  function mark(){
    const p=CoupledClockModel.at(elapsed,data,model),pos=CoupledClockModel.project(p.theta1,p.theta2);
    q('#torus-point').setAttribute('transform',`translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`);
    [p.theta1,p.theta2].forEach((phase,i)=>{
      const x=18*Math.cos(phase-Math.PI/2),y=18*Math.sin(phase-Math.PI/2);
      q('#clock-hand-'+(i+1)).setAttribute('x2',x);q('#clock-hand-'+(i+1)).setAttribute('y2',y);
      q('#clock-dot-'+(i+1)).setAttribute('cx',x);q('#clock-dot-'+(i+1)).setAttribute('cy',y);
    });
    const phase=Math.acos(Math.max(-1,Math.min(1,Math.cos(p.delta))))*180/Math.PI;
    q('#phase-value').textContent=phase.toFixed(0)+'° apart';
    const x=28+544*elapsed/data.duration,y=76-56*p.envelope;
    q('#envelope-cursor').setAttribute('x1',x);q('#envelope-cursor').setAttribute('x2',x);
    q('#envelope-point').setAttribute('cx',x);q('#envelope-point').setAttribute('cy',y);
    q('#envelope-now').textContent='Day '+(elapsed/24).toFixed(1)+' · E = '+p.envelope.toFixed(2);
    const curves={x1:[],x2:[],signal:[],upper:[],lower:[]};
    for(let i=0;i<=480;i++){
      const s=CoupledClockModel.at(elapsed+96*i/480,data,model),sx=28+544*i/480;
      curves.x1.push({x:sx,y:87-56*s.x1});curves.x2.push({x:sx,y:87-56*s.x2});
      curves.signal.push({x:sx,y:87-56*s.signal});
      curves.upper.push({x:sx,y:87-56*s.envelope});curves.lower.push({x:sx,y:87+56*s.envelope});
    }
    ['x1','x2','signal','upper','lower'].forEach(key=>q('#signal-'+key).setAttribute('d',path(curves[key])));
    q('#signal-envelope-fill').setAttribute('d',path(curves.upper)+path([...curves.lower].reverse()).replace(/^M/,'L')+'Z');
    q('#signal-start').textContent=(elapsed/24).toFixed(1)+' d';q('#signal-end').textContent=((elapsed+96)/24).toFixed(1)+' d';
    q('#signal-window').textContent='4-day detail from day '+(elapsed/24).toFixed(1);
  }
  function rebuild(){
    model=CoupledClockModel.info(Number(tau.value),Number(coupling.value));data=CoupledClockModel.series(model);
    elapsed=0;last=null;
    const display=data.points.filter(p=>p.t<=data.duration),stride=Math.max(1,Math.floor(display.length/4000));
    q('#torus-trace').setAttribute('d',path(display.filter((_,i)=>i%stride===0).map(p=>CoupledClockModel.project(p.theta1,p.theta2))));
    const ep=display.filter((_,i)=>i%4===0).map(p=>({x:28+544*p.t/data.duration,y:76-56*p.envelope}));
    q('#envelope-trace').setAttribute('d',path(ep));
    q('#envelope-fill').setAttribute('d',path(ep)+`L${ep[ep.length-1].x.toFixed(2)} 76L28 76Z`);
    q('#period-value').textContent=model.tau2.toFixed(1)+' h';q('#dial-period-2').textContent=model.tau2.toFixed(1)+' h';
    const kind=model.K>0?'Attractive':model.K<0?'Repulsive':'Uncoupled';
    const k=(model.K>0?'+':'')+model.K.toFixed(4);
    q('#coupling-value').textContent=k+' rad/h';q('#coupling-kind').textContent=kind;
    tau.setAttribute('aria-valuetext',model.tau2.toFixed(1)+' hours');coupling.setAttribute('aria-valuetext',kind+', '+k+' radians per hour');
    q('#window-label').textContent=(data.duration/24).toFixed(1)+' days shown';q('#envelope-end').textContent=(data.duration/24).toFixed(1)+' d';
    if(model.regime==='locked'){
      const gap=Math.acos(Math.cos(CoupledClockModel.initial(model)))*180/Math.PI;
      q('#model-status').textContent=kind+' coupling · phase locked';
      q('#model-description').textContent=`Both clocks share a ${model.commonPeriod.toFixed(2)} h period, ${gap.toFixed(1)}° apart. `+(model.K<0?'Opposing phases suppress their combined signal.':'Similar phases reinforce their combined signal.');
    }else if(model.regime==='neutral'){
      q('#model-status').textContent='Uncoupled · equal intrinsic periods';
      q('#model-description').textContent='With no coupling, equal clocks preserve their initial phase difference. The aligned starting phases shown here are neutral, not attracting.';
    }else if(model.regime==='boundary'){
      q('#model-status').textContent=kind+' coupling · locking boundary';
      q('#model-description').textContent='The phase-slip period diverges at 2|K| = |ω₂ − ω₁|. The equilibrium shown here is marginal.';
    }else{
      q('#model-status').textContent=kind+' · '+(model.beatHours/24).toFixed(1)+'-day beats';
      q('#model-description').textContent=data.capped?'Relative phases keep slipping. The envelope plot shows 120 days of the longer beat cycle.':'The daily signals move in and out of phase, creating a slow envelope. The overview shows two beat cycles.';
    }
    presets.forEach(button=>{const values=presetValues[button.dataset.modelPreset];button.setAttribute('aria-pressed',String(Math.abs(model.tau2-values[0])<.001&&Math.abs(model.K-values[1])<.00001));});
    mark();
  }
  function setPlaying(){
    toggle.querySelector('span').textContent=playing?'Pause':'Play';
    toggle.setAttribute('aria-label',playing?'Pause model animation':'Play model animation');last=null;
  }
  q('.model-controls').hidden=false;q('.model-presets').hidden=false;toggle.hidden=false;
  tau.addEventListener('input',rebuild);coupling.addEventListener('input',rebuild);
  presets.forEach(button=>button.addEventListener('click',()=>{[tau.value,coupling.value]=presetValues[button.dataset.modelPreset];rebuild();}));
  toggle.addEventListener('click',()=>{playing=!playing;setPlaying();});
  preference.addEventListener('change',()=>{if(preference.matches){playing=false;setPlaying();}});
  document.addEventListener('visibilitychange',()=>{last=null;});
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;last=null;}).observe(panel);
  rebuild();setPlaying();
  function frame(now){
    if(last!==null&&playing&&inView&&!document.hidden){elapsed=(elapsed+Math.min((now-last)/1000,.1)*data.duration/60)%data.duration;mark();}
    last=now;requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
