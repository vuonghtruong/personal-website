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

// Two SCN population phases with asymmetric repulsive/attractive coupling.
// delta = thetaV - thetaD; mu = (thetaD + thetaV)/2; time is in hours.
const CoupledClockModel=(()=>{
  const TAU=2*Math.PI;
  function info(tauV,k1,k2){
    const wD=TAU/24,wV=TAU/tauV,dw=wV-wD,keff=k2-k1,sumk=k1+k2;
    const margin=Math.abs(keff)-Math.abs(dw);
    const neutral=Math.abs(keff)<1e-12&&Math.abs(dw)<1e-12;
    const regime=neutral?'neutral':Math.abs(margin)<1e-9?'boundary':margin>0?'locked':'drifting';
    const beatHours=regime==='drifting'?TAU/Math.sqrt(dw*dw-keff*keff):null;
    const m={tauD:24,tauV,k1,k2,keff,sumk,wD,wV,dw,mean:(wD+wV)/2,regime,beatHours,criticalK:Math.abs(dw),uncoupled:k1===0&&k2===0};
    const state=initial(m);
    m.commonOmega=m.mean-sumk*Math.sin(state.delta)/2;
    m.commonPeriod=TAU/m.commonOmega;
    return m;
  }
  function initial(m){
    if(m.regime!=='locked'&&m.regime!=='boundary')return {delta:0,mu:0};
    const principal=Math.asin(Math.max(-1,Math.min(1,m.dw/m.keff)));
    return {delta:m.keff>0?principal:Math.PI-principal,mu:0};
  }
  function advance(state,h,m){
    let {delta,mu}=state;
    const n=Math.max(1,Math.ceil(Math.abs(h)/.25)),dt=h/n;
    const f=d=>m.dw-m.keff*Math.sin(d),g=d=>m.mean-m.sumk*Math.sin(d)/2;
    for(let i=0;i<n;i++){
      const a=f(delta),b=f(delta+dt*a/2),c=f(delta+dt*b/2),d=f(delta+dt*c);
      mu+=dt*(g(delta)+2*g(delta+dt*a/2)+2*g(delta+dt*b/2)+g(delta+dt*c))/6;
      delta+=dt*(a+2*b+2*c+d)/6;
    }
    return {delta,mu};
  }
  function sample(t,state){
    const {delta,mu}=state,theta1=mu-delta/2,theta2=mu+delta/2;
    const x1=Math.cos(theta1),x2=Math.cos(theta2);
    return {t,delta,mu,theta1,theta2,x1,x2,signal:(x1+x2)/2,envelope:Math.abs(Math.cos(delta/2))};
  }
  function series(m){
    const duration=m.regime==='drifting'?Math.min(2*m.beatHours,120*24):5*m.commonPeriod;
    const step=.25,count=Math.ceil((duration+96)/step),points=[];
    let state=initial(m);
    for(let i=0;i<=count;i++){
      if(i)state=advance(state,step,m);
      points.push(sample(i*step,state));
    }
    return {duration,step,points,capped:m.regime==='drifting'&&2*m.beatHours>120*24};
  }
  function at(t,data){
    const i=Math.max(0,Math.min(data.points.length-2,Math.floor(t/data.step))),a=data.points[i],b=data.points[i+1],s=(t-a.t)/data.step;
    return sample(t,{delta:a.delta+(b.delta-a.delta)*s,mu:a.mu+(b.mu-a.mu)*s});
  }
  function project(u,v){
    const radius=110+43*Math.cos(v),x=radius*Math.cos(u),y=radius*Math.sin(u),z=43*Math.sin(v);
    return {x:250+x*1.3,y:132+(y*Math.cos(1.05)-z*Math.sin(1.05))*1.3};
  }
  return {info,initial,advance,sample,series,at,project};
})();

(()=>{
  const panel=document.querySelector('.coupled-model');if(!panel)return;
  const q=id=>panel.querySelector(id),tau=q('#clock-period'),k1=q('#clock-k1'),k2=q('#clock-k2');
  const toggle=q('.model-play'),preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const presets=[...panel.querySelectorAll('[data-model-preset]')];
  const presetValues={slow:[24.8,.005,.012],attractive:[24.8,.005,.020],repulsive:[24.8,.020,.005],balanced:[24.8,.010,.010]};
  const path=pts=>pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join('');
  let model,data,elapsed=0,playing=!preference.matches,inView=true,last=null;
  function mark(){
    const p=CoupledClockModel.at(elapsed,data),pos=CoupledClockModel.project(p.theta1,p.theta2);
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
      const s=CoupledClockModel.at(elapsed+96*i/480,data),sx=28+544*i/480;
      curves.x1.push({x:sx,y:87-56*s.x1});curves.x2.push({x:sx,y:87-56*s.x2});curves.signal.push({x:sx,y:87-56*s.signal});
      curves.upper.push({x:sx,y:87-56*s.envelope});curves.lower.push({x:sx,y:87+56*s.envelope});
    }
    ['x1','x2','signal','upper','lower'].forEach(key=>q('#signal-'+key).setAttribute('d',path(curves[key])));
    q('#signal-envelope-fill').setAttribute('d',path(curves.upper)+path([...curves.lower].reverse()).replace(/^M/,'L')+'Z');
    q('#signal-start').textContent=(elapsed/24).toFixed(1)+' d';q('#signal-end').textContent=((elapsed+96)/24).toFixed(1)+' d';
    q('#signal-window').textContent='4-day detail from day '+(elapsed/24).toFixed(1);
  }
  function rebuild(){
    model=CoupledClockModel.info(Number(tau.value),Number(k1.value),Number(k2.value));data=CoupledClockModel.series(model);elapsed=0;last=null;
    const display=data.points.filter(p=>p.t<=data.duration),stride=Math.max(1,Math.ceil(display.length/4000));
    q('#torus-trace').setAttribute('d',path(display.filter((_,i)=>i%stride===0).map(p=>CoupledClockModel.project(p.theta1,p.theta2))));
    const ep=display.filter((_,i)=>i%4===0).map(p=>({x:28+544*p.t/data.duration,y:76-56*p.envelope}));
    q('#envelope-trace').setAttribute('d',path(ep));q('#envelope-fill').setAttribute('d',path(ep)+`L${ep[ep.length-1].x.toFixed(2)} 76L28 76Z`);
    q('#period-value').textContent=model.tauV.toFixed(1)+' h';q('#dial-period-2').textContent=model.tauV.toFixed(1)+' h';
    q('#k1-value').textContent=model.k1.toFixed(4)+' rad/h';q('#k2-value').textContent=model.k2.toFixed(4)+' rad/h';
    q('#effective-value').textContent=(model.keff>0?'+':'')+model.keff.toFixed(4)+' rad/h';
    q('#detuning-value').textContent=Math.abs(model.dw).toFixed(4)+' rad/h';
    tau.setAttribute('aria-valuetext',model.tauV.toFixed(1)+' hours');
    k1.setAttribute('aria-valuetext',model.k1.toFixed(4)+' radians per hour, repulsive, ventral to dorsal');
    k2.setAttribute('aria-valuetext',model.k2.toFixed(4)+' radians per hour, attractive, dorsal to ventral');
    q('#window-label').textContent=(data.duration/24).toFixed(1)+' days shown';q('#envelope-end').textContent=(data.duration/24).toFixed(1)+' d';
    const balance=Math.abs(model.keff)<1e-12;
    const kind=model.uncoupled?'Uncoupled':balance?'Balanced opposing coupling':model.keff>0?'Attraction dominates':'Repulsion dominates';
    if(model.regime==='locked'){
      const gap=Math.acos(Math.cos(CoupledClockModel.initial(model).delta))*180/Math.PI;
      q('#model-status').textContent=kind+' · phase locked';
      q('#model-description').textContent=`The two populations share a ${model.commonPeriod.toFixed(2)} h period, ${gap.toFixed(1)}° apart. Asymmetric coupling changes their shared frequency as well as their phase relationship.`;
    }else if(model.regime==='neutral'){
      q('#model-status').textContent=kind+' · neutral phase difference';
      q('#model-description').textContent=model.uncoupled?'Equal uncoupled clocks keep their initial phase difference. The aligned start shown here is neutral, not attracting.':'Equal intrinsic periods and k₁ = k₂ preserve the relative phase. Opposing interactions remain present; they can still change the shared frequency at other initial phases.';
    }else if(model.regime==='boundary'){
      q('#model-status').textContent=kind+' · locking boundary';
      q('#model-description').textContent='The phase-slip period diverges at |K_eff| = |Δω|. The equilibrium shown here is marginal.';
    }else{
      q('#model-status').textContent=kind+' · '+(model.beatHours/24).toFixed(1)+'-day beats';
      q('#model-description').textContent=model.uncoupled?'With both interactions set to zero, the intrinsic period mismatch produces a slow envelope as the phases drift.':balance?'k₁ and k₂ cancel in the relative-phase equation, but still modulate each population’s clock. Their combined signal has a slow envelope.':data.capped?'Relative phases keep slipping. The envelope plot shows 120 days of the longer beat cycle.':'Repulsive and attractive influences act in opposite directions. The daily signals form a slow envelope as their relative phase slips.';
    }
    presets.forEach(button=>{const v=presetValues[button.dataset.modelPreset];button.setAttribute('aria-pressed',String(Math.abs(model.tauV-v[0])<.001&&Math.abs(model.k1-v[1])<.00001&&Math.abs(model.k2-v[2])<.00001));});mark();
  }
  function setPlaying(){toggle.querySelector('span').textContent=playing?'Pause':'Play';toggle.setAttribute('aria-label',playing?'Pause model animation':'Play model animation');last=null;}
  q('.model-controls').hidden=false;q('.model-presets').hidden=false;toggle.hidden=false;
  [tau,k1,k2].forEach(input=>input.addEventListener('input',rebuild));
  presets.forEach(button=>button.addEventListener('click',()=>{[tau.value,k1.value,k2.value]=presetValues[button.dataset.modelPreset];rebuild();}));
  toggle.addEventListener('click',()=>{playing=!playing;setPlaying();});
  preference.addEventListener('change',()=>{if(preference.matches){playing=false;setPlaying();}});
  document.addEventListener('visibilitychange',()=>{last=null;});
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;last=null;}).observe(panel);
  rebuild();setPlaying();
  function frame(now){if(last!==null&&playing&&inView&&!document.hidden){elapsed=(elapsed+Math.min((now-last)/1000,.1)*data.duration/60)%data.duration;mark();}last=now;requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
