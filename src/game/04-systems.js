
let pendingPurchase=null;
function purchaseOffer(type,id,slot){
 if(type==='part'){
  const p=PARTS[slot]?.find(p=>p.id===id);if(!p)return null;
  return {name:p.name,detail:p.desc,cost:ownsPart(slot,id)?0:p.cost,owned:ownsPart(slot,id)};
 }
 if(type==='upgrade'){
  const p=UPGRADES.find(p=>p.id===id),lv=garage.lv[id];if(!p||lv>=p.max)return null;
  return {name:p.name+' · LV '+(lv+1),detail:p.desc,cost:UP_COST[lv],owned:false};
 }
 const p=(type==='plane'?PLANES:type==='paint'?PAINTS:[]).find(p=>p.id===id);if(!p)return null;
 const owned=(type==='plane'?garage.planes:garage.paints).includes(id);
 if(!owned&&p.cost===null)return null;
 return {name:p.name,detail:type==='plane'?p.desc:'Aircraft paint',cost:owned?0:p.cost,owned};
}
function completePurchase(type,id,slot){
 const offer=purchaseOffer(type,id,slot);if(state!=='garage'||!offer||garage.coins<offer.cost)return;
 if(type==='part'){
  if(!offer.owned){
   garage.coins-=offer.cost;garage.ownedParts??={};garage.ownedParts[slot]??=[PARTS[slot][0].id];garage.ownedParts[slot].push(id);
  }
  garage.loadout[slot]=id;saveGarage();Sound.sfxAmmo();applyLook();renderGarage();
 }else if(type==='upgrade')buyUpgrade(id);else if(type==='plane')choosePlane(id);else choosePaint(id);
}
function requestPurchase(type,id,slot){
 const offer=purchaseOffer(type,id,slot);if(!offer||state!=='garage')return;
 if(offer.owned){completePurchase(type,id,slot);return;}
 pendingPurchase={type,id,slot,cost:offer.cost};
 $('purchaseTitle').textContent=offer.name;
 $('purchaseDetail').textContent=offer.detail;
 $('purchaseBalance').textContent=garage.coins<offer.cost?`${offer.cost} COINS · Balance ${garage.coins} / Need ${offer.cost-garage.coins} more`:`${offer.cost} COINS · Balance ${garage.coins} → After purchase ${garage.coins-offer.cost}`;
 $('confirmPurchase').innerHTML=garage.coins<offer.cost?'NOT ENOUGH COINS':`BUY · ${coinHtml(offer.cost)}`;
 $('confirmPurchase').disabled=garage.coins<offer.cost;
 $('purchaseDialog').showModal();
}
$('cancelPurchase').addEventListener('click',()=>{$('purchaseDialog').close();});
$('purchaseDialog').addEventListener('close',()=>{pendingPurchase=null;});
$('purchaseDialog').addEventListener('cancel',()=>{pendingPurchase=null;});
$('confirmPurchase').addEventListener('click',()=>{
 const p=pendingPurchase;pendingPurchase=null;if(!p)return;
 const offer=purchaseOffer(p.type,p.id,p.slot);
 if(offer&&offer.cost===p.cost)completePurchase(p.type,p.id,p.slot);
 $('purchaseDialog').close();
});

// ---------- unique special ability per aircraft (Q / SPECIAL) ----------
const ABILITIES={
 rear:{name:'REAR BURST',cooldown:5,time:0,description:'Fires a 5-round fan straight behind you. Free — no ammo used. Shreds anything on your tail.'},
 roll:{name:'BARREL ROLL',cooldown:8,time:1.1,description:'Snap-roll sideways. Untouchable for 1.1s and every missile chasing you loses track.'},
 shield:{name:'IRON SHIELD',cooldown:18,time:5,description:'A 5-second energy bubble that absorbs every bullet, missile and collision.'},
 storm:{name:'BULLET STORM',cooldown:15,time:4,description:'4 seconds of 2.5x fire rate. Ammo is not consumed while the storm lasts.'},
 sonic:{name:'SONIC BOOM',cooldown:12,time:0,description:'Break the sound barrier: a shockwave wipes out nearby bullets and missiles and damages close enemies.'},
 ram:{name:'RAM DASH',cooldown:12,time:2,description:'2 seconds of boosted flight. Destroy aircraft on contact without collision damage. Bullets still hurt.'},
 swarm:{name:'SWARM PODS',cooldown:14,time:0,description:'Launches 6 free micro-missiles that split across the nearest targets.'},
 cloak:{name:'PHANTOM CLOAK',cooldown:16,time:4,description:'Vanish for 4 seconds. Enemies and turrets cannot see you and incoming missiles go blind.'},
 nova:{name:'HALO NOVA',cooldown:18,time:0,description:'The flagship’s signature: a colossal ion ring that stuns every enemy within 90m for 3s, hits them hard and erases enemy fire.'}
};
const AIRFRAME_ABILITY={classic:'rear',swift:'roll',brick:'shield',twin:'storm',falcon:'sonic',lancer:'ram',seraph:'swarm',spectre:'cloak',halo:'nova'};
// enemies keep their own simpler move set
const ENEMY_ABILITY={classic:'rear',swift:'ram',brick:'ram',twin:'rear',falcon:'salvo',lancer:'ram',seraph:'salvo',spectre:'salvo',halo:'rear'};
const abilityOf=id=>ABILITIES[AIRFRAME_ABILITY[id]||'rear'];
let specialCooldown=0,ramTime=0,rollTime=0,rollDir=1,shieldTime=0,stormTime=0,cloakTime=0,lastThreatStage=0;
function resetSpecial(){specialCooldown=0;ramTime=rollTime=shieldTime=stormTime=cloakTime=0;player.rollFx=0;lastThreatStage=0;shieldMesh.visible=false;}
const abilityActive=()=>ramTime>0||rollTime>0||shieldTime>0||stormTime>0||cloakTime>0;
const playerHidden=()=>cloakTime>0;   // enemies cannot see the player
// shield bubble (follows the player)
const shieldMesh=new THREE.Mesh(G.sph,new THREE.MeshBasicMaterial({color:0x7ff3ff,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending}));
shieldMesh.scale.setScalar(5.2);shieldMesh.visible=false;scene.add(shieldMesh);
const novaFx={t:9,x:0,y:0,z:0};
const novaGeo=new THREE.TorusGeometry(1,.025,8,120);
const novaRing=new THREE.Mesh(novaGeo,new THREE.MeshBasicMaterial({color:0xc9a8ff,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
const novaRing2=new THREE.Mesh(novaGeo,new THREE.MeshBasicMaterial({color:0x69eaff,transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending}));
novaRing.rotation.x=novaRing2.rotation.x=Math.PI/2;novaRing.visible=novaRing2.visible=false;scene.add(novaRing,novaRing2);
function updateNova(dt){
 if(novaFx.t>=.9){if(novaRing.visible)novaRing.visible=novaRing2.visible=false;return;}
 novaFx.t+=dt;const k=Math.min(1,novaFx.t/.9),e=1-Math.pow(1-k,3);
 novaRing.position.set(novaFx.x,novaFx.y,novaFx.z);novaRing2.position.copy(novaRing.position);
 novaRing.scale.set(90*e,90*e,40);novaRing2.scale.set(72*e,72*e,30);
 novaRing.material.opacity=.85*(1-k);novaRing2.material.opacity=.6*(1-k);
}
function fireRear(from,enemy,count){
 for(let i=0;i<count&&bullets.length<MAXB;i++){
  const a=from.a+Math.PI+(i-(count-1)/2)*.11,p=-(from.p||0),v=enemy?botSpeed()+30:playerSpeed()+58;
  const dx=Math.cos(a)*Math.cos(p),dy=Math.sin(p),dz=Math.sin(a)*Math.cos(p);
  bullets.push({x:from.x+dx*4,y:from.y+dy*4,z:from.z+dz*4,vx:dx*v,vy:dy*v,vz:dz*v,life:1.5,enemy,profile:shotProfile(from,enemy)});
 }
 Sound.shot(shotProfile(from,enemy),enemy);
}
function launchSalvo(from,enemy,count){
 const targets=enemy?[player]:targetables().filter(t=>!t.dead&&dist3(t,from)<(t===boss?140:120)).sort((a,b)=>dist3(a,from)-dist3(b,from));
 for(let i=0;i<count;i++){
  const shot={...from,a:from.a+(i-(count-1)/2)*.24};
  const m=launchMissile(shot,enemy);m.target=targets.length?targets[i%targets.length]:null;
 }
}
function ring(x,y,z,r,col,n=36,spd=40){for(let i=0;i<n;i++){const a=i/n*Math.PI*2;addPart(x+Math.cos(a)*r*.1,y,z+Math.sin(a)*r*.1,Math.cos(a)*spd,rand(-1,1),Math.sin(a)*spd,.45,.42,col,.5);}}
function loseMissileLocks(){for(const m of missiles)if(m.enemy&&m.target===player){m.target=null;}}
function activateSpecial(){
 if(state!=='playing'||specialCooldown>0||!player.alive)return;
 const kind=AIRFRAME_ABILITY[garage.plane]||'rear',spec=abilityOf(garage.plane);
 shockwave(player.x,player.y,player.z,9,0x9fe7e2,.35);
 if(kind==='ram'){ramTime=spec.time;Sound.sfxBoost();toast('RAM DASH · HIT ENEMY AIRCRAFT');}
 else if(kind==='rear'){fireRear(player,false,5);toast('REAR BURST');}
 else if(kind==='roll'){rollTime=spec.time;rollDir=steerNow<-.1?-1:steerNow>.1?1:(Math.random()<.5?-1:1);loseMissileLocks();Sound.sfxBoost();toast('BARREL ROLL');}
 else if(kind==='shield'){shieldTime=spec.time;shieldMesh.visible=true;Sound.tone(300,.5,'sine',.15,900);Sound.tone(600,.4,'triangle',.06,1200,.05);toast('IRON SHIELD · 5s');}
 else if(kind==='storm'){stormTime=spec.time;Sound.tone(180,.35,'sawtooth',.08,520);toast('BULLET STORM · NO AMMO COST');}
 else if(kind==='sonic'){
  const R=30;ring(player.x,player.y,player.z,R,0xdff6ff,48,55);shockwave(player.x,player.y,player.z,R,0xdff6ff,.5);shake=Math.max(shake,.35);Sound.sfxBoom();Sound.tone(90,.6,'sine',.3,30);
  for(const b of bullets)if(b.enemy&&dist3(b,player)<R+6)b.life=0;
  for(const m of missiles)if(m.enemy&&!m.dead&&dist3(m,player)<R+14){explode(m.x,m.y,m.z,.5);removeMissile(m);}
  missiles=missiles.filter(m=>!m.dead);
  for(const b of [...bots])if(!b.dead&&dist3(b,player)<R){hitBot(b,4);}
  if(boss&&!boss.dead&&bossDist(player)<R)hitBoss(6,player);
  bots=bots.filter(b=>!b.dead);toast('SONIC BOOM');
 }
 else if(kind==='swarm'){
  const ts=targetables().filter(t=>!t.dead&&dist3(t,player)<150).sort((a,b)=>dist3(a,player)-dist3(b,player));
  for(let i=0;i<6;i++){const m=launchMissile({...player,a:player.a+(i-2.5)*.35,p:(player.p||0)+(i%2?.12:-.12)},false);m.dmg=2;m.target=ts.length?ts[i%Math.min(ts.length,3)]:null;m.mesh.scale.setScalar(1);}
  toast(ts.length?'SWARM PODS AWAY':'SWARM PODS · NO TARGETS');
 }
 else if(kind==='cloak'){cloakTime=spec.time;loseMissileLocks();Sound.tone(900,.5,'sine',.08,200);toast('PHANTOM CLOAK · 4s');}
 else if(kind==='nova'){
  const R=90;novaFx.t=0;novaFx.x=player.x;novaFx.y=player.y;novaFx.z=player.z;novaRing.visible=novaRing2.visible=true;
  ring(player.x,player.y,player.z,R,0xc9a8ff,28,105);ring(player.x,player.y,player.z,R,0x69eaff,20,80);
  const fl=$('novaFlash');fl.classList.remove('on');void fl.offsetWidth;fl.classList.add('on');
  shake=Math.max(shake,.45);Sound.tone(1400,.8,'sawtooth',.06,60);Sound.tone(70,.9,'sine',.3,25);Sound.noise(.7,.2,3200);Sound.sfxBoom();
  let n=0;
  for(const b of bullets)if(b.enemy&&dist3(b,player)<R)b.life=0;
  for(const m of missiles)if(m.enemy&&!m.dead&&dist3(m,player)<R){explode(m.x,m.y,m.z,.5);removeMissile(m);}
  missiles=missiles.filter(m=>!m.dead);
  for(const b of [...bots])if(!b.dead&&dist3(b,player)<R){b.stun=3;b.specialCharge=0;b.ramTime=0;hitBot(b,3);n++;}
  for(const t of turrets)if(!t.dead&&dist3(t,player)<R){t.stun=3;hitTurret(t,3);n++;}
  if(boss&&!boss.dead&&dist3(boss,player)<R+15){boss.stun=boss.titan?1:2.5;hitBoss(8,player);n++;}
  bots=bots.filter(b=>!b.dead);
  toast('HALO NOVA · '+n+' HIT');
 }
 specialCooldown=spec.cooldown;updateHud(true);updateSpecialHud();
}
function updateSpecial(dt){
 specialCooldown=Math.max(0,specialCooldown-dt);ramTime=Math.max(0,ramTime-dt);stormTime=Math.max(0,stormTime-dt);
 if(garage.plane==='halo'&&Math.random()<dt*30){const a=rand(0,6.3),f=fwdOf(player);addPart(player.x-f[0]*3+Math.cos(a)*-Math.sin(player.a)*3.6,player.y+Math.sin(a)*3.6,player.z-f[2]*3+Math.cos(a)*Math.cos(player.a)*3.6,-f[0]*4,0,-f[2]*4,.45,.35,Math.random()<.5?0xc9a8ff:0x69eaff,.5);}
 cloakTime=Math.max(0,cloakTime-dt);
 if(shieldTime>0){shieldTime-=dt;shieldMesh.visible=shieldTime>0&&(shieldTime>1||Math.floor(time*10)%2===0);}else shieldMesh.visible=false;
 if(rollTime>0){
  rollTime=Math.max(0,rollTime-dt);const k=1-rollTime/ABILITIES.roll.time;player.rollFx=rollDir*k*Math.PI*2;
  const side=rollTime>0?22*rollDir:0;player.x+=-Math.sin(player.a)*side*dt;player.z+=Math.cos(player.a)*side*dt;
  if(rollTime<=0)player.rollFx=0;
 }
 if(ramTime>0){const f=fwdOf(player);for(const s of [-1,1])addPart(player.x-f[0]*3-s*f[2]*2,player.y,player.z-f[2]*3+s*f[0]*2,0,0,0,.35,.55,0x62f5ec,.8);}
 if(stormTime>0&&Math.random()<dt*20){const f=fwdOf(player);addPart(player.x+f[0]*3,player.y,player.z+f[2]*3,rand(-3,3),rand(-3,3),rand(-3,3),.2,.35,0xffe46a,.5);}
 if(cloakTime>0&&Math.random()<dt*25)addPart(player.x+rand(-2,2),player.y+rand(-1,1),player.z+rand(-2,2),0,0,0,.4,.4,0xb69dff,.6);
 const stage=gameTime>=150?3:gameTime>=90?2:gameTime>=45?1:0;
 if(stage>lastThreatStage&&!titanLock()){lastThreatStage=stage;banner(['','INTERCEPTORS','SPECIALISTS','ELITE HUNT'][stage],'INBOUND','#ff8a9c');Sound.sfxEmpty();}
}
let specialHudKey='';
function updateSpecialHud(){
 const show=state==='playing'||state==='ready';
 if(!show){if(specialHudKey!=='off'){specialHudKey='off';$('btnSpecial').classList.add('hidden');}return;}
 const spec=abilityOf(garage.plane),act=abilityActive();
 const label=act?'ACTIVE':specialCooldown>0?Math.ceil(specialCooldown)+'s':'READY';
 const disabled=state!=='playing'||specialCooldown>0;
 const clock=Math.floor(gameTime/60)+':'+String(Math.floor(gameTime%60)).padStart(2,'0');
 const titanNear=titanPhase==='none'&&gameTime>=120;
 const threat=titanLock()?'FINAL BOSS':boss?'BOSS FIGHT':titanNear?'TITAN IN '+Math.max(0,Math.ceil(TITAN_AT-gameTime))+'s':['SURVIVE','INTERCEPTORS','SPECIALISTS','ELITE HUNT'][lastThreatStage];
 const key=[spec.name,label,disabled,act,clock,threat].join('|');
 if(key===specialHudKey)return;specialHudKey=key;
 $('btnSpecial').classList.remove('hidden');
 $('specialName').textContent=spec.name;$('specialState').textContent=label;
 $('btnSpecial').disabled=disabled;$('btnSpecial').classList.toggle('active',act);$('btnSpecial').classList.toggle('ready',!disabled);
 $('survivalClock').textContent=clock;
 $('threatLabel').textContent=threat;$('threatLabel').classList.toggle('boss',!!boss||titanLock()||titanNear);
}
// Strong enemies are introduced gradually and capped to keep attacks readable.
function enemyAirframeAt(seconds,roll,active){
 const cap=seconds>=150?3:seconds>=90?2:1;if(seconds<45||active>=cap||roll>.6)return null;
 const pool=seconds>=150?['lancer','brick','twin','seraph','spectre','halo']:seconds>=90?['lancer','brick','twin','seraph']:['lancer','brick'];
 return pool[Math.min(pool.length-1,Math.floor(roll/.6*pool.length))];
}
function configureEnemyAirframe(b){
 const id=enemyAirframeAt(gameTime,Math.random(),bots.filter(b=>!b.dead&&b.airframe).length);if(!id)return;
 const p=PLANES.find(p=>p.id===id);b.airframe=id;b.ability=ENEMY_ABILITY[id];b.specialCd=rand(5,8);b.specialCharge=0;b.ramTime=0;
 b.hp=Math.max(5,6+p.hp);b.heavy=p.hp>=2;b.scale=b.heavy?1.2:1;b.spd=p.speed*(b.heavy?.85:1);b.guns=p.guns;b.pts=350+(b.heavy?100:0);
 b.mesh=makePlane(0xd64c59,0xffaa54,p.shape);if(b.heavy)b.mesh.scale.multiplyScalar(1.2);
}
function updateEnemySpecial(b,dt,d,hostile){
 if(!hostile||!player.alive||!b.airframe)return;
 b.ramTime=Math.max(0,(b.ramTime||0)-dt);b.specialCd-=dt;
 if(b.specialCharge>0){
  b.specialCharge-=dt;addPart(b.x,b.y+2,b.z,0,1,0,.25,.65,0xffb64b,.4);
  if(b.specialCharge<=0){
   if(b.ability==='ram'){b.ramTime=1.65;b.ramHeading=Math.atan2(player.z-b.z,player.x-b.x);}
   else if(b.ability==='rear'){fireRear(b,true,3);}
   else if(missiles.filter(m=>m.enemy&&!m.dead).length<=4){launchSalvo(b,true,2);}
   b.specialCd=b.ability==='rear'?6:12;
   b.attackSpent=true;
  }
 }else if(b.specialCd<=0&&d>12&&d<85){
  const f=fwdOf(b),dot=((player.x-b.x)*f[0]+(player.y-b.y)*f[1]+(player.z-b.z)*f[2])/Math.max(d,.01);
  if((b.ability==='rear'&&dot<-.7&&d<48)||(b.ability==='ram'&&dot>.6)||b.ability==='salvo'){
   b.specialCharge=1.2;toast(b.ability==='ram'?'ENEMY RAM CHARGING':b.ability==='rear'?'ENEMY REAR GUN':'ENEMY MISSILE LOCK');Sound.sfxEmpty();
  }
 }
}
$('btnSpecial').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();Sound.init();activateSpecial();});
$('btnSpecial').addEventListener('click',e=>{if(e.detail===0){Sound.init();activateSpecial();}});
window.addEventListener('keydown',e=>{if(e.code==='KeyQ'&&!e.repeat&&!$('audioDialog').open&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();Sound.init();activateSpecial();}});

// Preview is isolated from the live flight scene; shared geometry/materials are reused.
let previewRenderer=null, previewScene=null, previewCamera=null, previewPlane=null, previewBoostUntil=0;
function refreshPreview(){
  if(!previewScene)return;
  if(previewPlane)previewScene.remove(previewPlane);
  const candidate=isFleetView()?PLANES.find(p=>p.id===inspectedPlane):null;
  const pt=paintNow();
  previewPlane=candidate?makePlane(pt.body,pt.wing,candidate.shape):player.mesh.clone(true);previewPlane.position.set(0,0,0);previewPlane.rotation.set(0,0,0);previewPlane.visible=true;
  if(candidate)decoratePlane(previewPlane);
  const shown=candidate||planeNow();
  previewCamera.position.set(7,4,7).multiplyScalar(['lancer','seraph','spectre','halo'].includes(shown.shape)?1.35:1);
  previewCamera.lookAt(0,0,0);
  previewScene.add(previewPlane);
}
function renderPreview(dt){
  if(state!=='garage')return;
  if(!previewRenderer){
    previewRenderer=new THREE.WebGLRenderer({canvas:$('planePreview'),alpha:true,antialias:true});
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    previewScene=new THREE.Scene();previewScene.add(new THREE.HemisphereLight(0xd9f6ff,0x455566,2.4));
    const light=new THREE.DirectionalLight(0xffd0a0,3);light.position.set(4,8,4);previewScene.add(light);
    previewCamera=new THREE.PerspectiveCamera(38,1,.1,100);previewCamera.position.set(7,4,7);previewCamera.lookAt(0,0,0);
    refreshPreview();
  }
  const w=$('planePreview').clientWidth,h=$('planePreview').clientHeight;
  if(w<1||h<1)return;
  const size=previewRenderer.getSize(new THREE.Vector2());
  if(size.x!==w||size.y!==h){previewRenderer.setSize(w,h,false);previewCamera.aspect=w/h;previewCamera.updateProjectionMatrix();}
  previewPlane.rotation.y+=dt*.27;
  for(const g of (previewPlane.__spin||(previewPlane.__spin=spinPartsOf(previewPlane))))g.rotation.z+=dt*3.2*(g.userData.dir||1);
  previewPlane.position.y=Math.sin(performance.now()*.001)*.13;
  const previewFov=performance.now()<previewBoostUntil?48:38;
  previewCamera.fov=lerp(previewCamera.fov,previewFov,Math.min(1,dt*7));previewCamera.updateProjectionMatrix();
  previewPlane.traverse(o=>{if(o.name==='boost-flame'){o.visible=performance.now()<previewBoostUntil;if(o.visible)o.scale.x=1+Math.sin(performance.now()*.06)*.12;}});
  previewRenderer.render(previewScene,previewCamera);
}
$('partList').addEventListener('click',e=>{
  const b=e.target.closest('[data-part]');if(!b||state!=='garage')return;
  Sound.init();Sound.sfxClick();requestPurchase('part',b.dataset.part,b.dataset.slot);
  $('partList').querySelector(`[data-slot="${b.dataset.slot}"][data-part="${b.dataset.part}"]`).focus({preventScroll:true});
});
$('btnPreviewBoost').addEventListener('click',()=>{Sound.init();Sound.sfxBoost();previewBoostUntil=performance.now()+4000;});
document.querySelector('.garageTabs').addEventListener('click',e=>{
  const b=e.target.closest('[data-section]');if(!b)return;
  for(const el of document.querySelectorAll('[data-page]'))el.classList.toggle('hidden',el.dataset.page!==b.dataset.section);
  for(const el of document.querySelectorAll('[data-section]')){const on=el===b;el.classList.toggle('active',on);el.setAttribute('aria-pressed',on);}
  Sound.init();Sound.sfxClick();
  if(b.dataset.section==='fleet'){inspectedPlane=inspectedPlane||garage.plane;renderFleet();}else{renderParts();$('aircraftOffer').classList.add('hidden');$('btnGaragePlay').textContent='TAKE OFF ↗';document.querySelector('.previewNote').textContent='Live build · parts change your aircraft';}
  refreshPreview();
});
const audioMix={music:.35,sfx:.8,engine:.45};
let engineGain=null,engineOsc=null,engineHarmonic=null;
function createEngineAudio(){
  const ctx=Sound.ctx;engineGain=ctx.createGain();engineGain.gain.value=0;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=420;
  engineOsc=ctx.createOscillator();engineOsc.type='sawtooth';engineOsc.frequency.value=55;
  engineHarmonic=ctx.createOscillator();engineHarmonic.type='triangle';engineHarmonic.frequency.value=110;
  engineOsc.connect(filter);engineHarmonic.connect(filter);filter.connect(engineGain);engineGain.connect(Sound.master);engineOsc.start();engineHarmonic.start();
}
function applyAudio(){
  if(Sound.musicG)Sound.musicG.gain.setTargetAtTime(audioMix.music*.6,Sound.ctx.currentTime,.05);
  if(Sound.sfxG)Sound.sfxG.gain.setTargetAtTime(audioMix.sfx,Sound.ctx.currentTime,.05);
  for(const key of Object.keys(audioMix)){$(key+'Volume').value=Math.round(audioMix[key]*100);$(key+'Value').textContent=Math.round(audioMix[key]*100)+'%';}
}
function loadAudio(raw){try{const a=JSON.parse(raw||'{}');for(const k of Object.keys(audioMix))if(Number.isFinite(a[k]))audioMix[k]=clamp(a[k],0,1);}catch{}applyAudio();}
function updateEngineAudio(){
  if(!engineGain||Sound.ctx.state!=='running')return;
  const active=state==='playing'||state==='ready',t=Sound.ctx.currentTime;
  engineGain.gain.setTargetAtTime(active?audioMix.engine*(ramTime>0?.1:.065):0,t,.12);
  const rpm=48+playerSpeed()*1.7+Math.abs(climbNow)*9+(garage.loadout.engine==='turbo'?18:0);
  engineOsc.frequency.setTargetAtTime(rpm,t,.16);engineHarmonic.frequency.setTargetAtTime(rpm*2.01,t,.16);
}
for(const key of Object.keys(audioMix))$(key+'Volume').addEventListener('input',e=>{audioMix[key]=Number(e.target.value)/100;applyAudio();Store.set('audio',JSON.stringify(audioMix));});
$('btnAudio').addEventListener('click',()=>{if(busy)return;Sound.init();if(state==='playing'||state==='ready')pauseGame();$('audioDialog').showModal();});
// Layered weapon transients and low-end explosions; generated locally, no downloaded audio.
Sound.sfxShoot=function(){this.noise(.075,.10,1900);this.tone(150,.065,'triangle',.12,55);};
Sound.sfxBoom=function(){this.noise(.65,.4,680);this.noise(.13,.2,2100);this.tone(85,.65,'sine',.3,27);};
const portraitPhone=matchMedia('(pointer:coarse) and (orientation:portrait)');
portraitPhone.addEventListener('change',()=>{if(portraitPhone.matches&&(state==='playing'||state==='ready'))pauseGame();});

let inspectedPlane=null;
const thumbnailCache=new Map();
const AIRFRAME_STORIES={
 lancer:{role:'THE INTERCEPTOR',headline:'A blade through the sky.',detail:'Needle nose, swept wings and blue twin thrusters. High speed with a lighter hull.',accent:'#68e7f2'},
 seraph:{role:'THE STARFIGHTER',headline:'Four wings. Pure presence.',detail:'Split-level swept wings with four glowing engines. Twin guns and balanced flight.',accent:'#ffbb75'},
 spectre:{role:'THE SHADOW BOMBER',headline:'A shadow with a payload.',detail:'A wide, angular flying wing. Reinforced hull and six missiles, with slower handling.',accent:'#93b9ff'},
 halo:{role:'THE FLAGSHIP',headline:'The crown of the fleet.',detail:'Twin counter-rotating ring drives and triple ion cannons. The fastest, most agile airframe in the hangar — and still armored.',accent:'#d0b1ff'},
 classic:{role:'THE ALL-ROUNDER',headline:'Your first taste of freedom.',detail:'A dependable single-prop aircraft. Balanced handling for every sortie.',accent:'#f3b864'},
 swift:{role:'THE DOGFIGHTER',headline:'Own every turn.',detail:'Slim fuselage. Swept wings. Fast handling for pilots who stay on the move.',accent:'#72d8cc'},
 brick:{role:'THE FLYING FORTRESS',headline:'Built to take the hit.',detail:'Stacked biplane wings and a reinforced airframe. Two extra hearts, with slower turns.',accent:'#e9b577'},
 twin:{role:'THE DOUBLE THREAT',headline:'Two guns. One target.',detail:'Distinctive twin wing engines. Fires two bullets at once for concentrated firepower.',accent:'#90bdfa'},
 falcon:{role:'THE DAY 7 REWARD',headline:'Earn your jet age.',detail:'Swept jet silhouette, twin fins and a glowing exhaust. Twin guns, four missiles and an extra heart.',accent:'#c7adff'}
};
function isFleetView(){return !document.querySelector('[data-page="fleet"]').classList.contains('hidden');}
function makeFleetThumbnails(){
  const pt=paintNow(),key=pt.body+':'+pt.wing;
  if(thumbnailCache.has(key))return thumbnailCache.get(key);
  const r=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});r.setSize(440,230,false);r.setPixelRatio(1);
  const s=new THREE.Scene();s.add(new THREE.HemisphereLight(0xf0fcff,0x3d5361,2.2));const light=new THREE.DirectionalLight(0xffe1c0,3);light.position.set(5,8,6);s.add(light);
  const cam=new THREE.PerspectiveCamera(34,440/230,.1,100);cam.position.set(9,5,10);cam.lookAt(0,0,0);
  const images={};
  for(const p of PLANES){const model=makePlane(pt.body,pt.wing,p.shape);s.add(model);r.render(s,cam);images[p.id]=r.domElement.toDataURL('image/png');s.remove(model);}
  r.dispose();r.forceContextLoss();thumbnailCache.set(key,images);return images;
}
function renderFleet(){
  if(!isFleetView())return;
  inspectedPlane=inspectedPlane||garage.plane;
  const thumbs=makeFleetThumbnails();
  $('planeList').innerHTML=PLANES.map(p=>{
    const own=garage.planes.includes(p.id),equipped=garage.plane===p.id,story=AIRFRAME_STORIES[p.id];
    const status=equipped?'IN YOUR HANGAR':own?'OWNED':p.cost===null?'DAY 7 REWARD':'LOCKED';
    return `<button class="aircraftCard ${inspectedPlane===p.id?'inspected':''}" style="--air-accent:${story.accent}" data-inspect="${p.id}" aria-pressed="${inspectedPlane===p.id}" aria-label="Inspect ${p.name}"><div class="aircraftVisual"><span class="aircraftStatus">${status}</span><img src="${thumbs[p.id]}" alt="${p.name} aircraft design" width="440" height="230"></div><div class="aircraftInfo"><small>${story.role}</small><b>${p.name}</b><p>${story.headline}</p><em class="abilTag">&#9733; ${abilityOf(p.id).name}</em><div class="aircraftPrice"><span>${own?'INSPECT AIRCRAFT':p.cost===null?'7 DAILY CLAIMS':coinHtml(p.cost)}</span><span aria-hidden="true">↗</span></div></div></button>`;
  }).join('');
  renderAircraftOffer();
}
function renderAircraftOffer(){
  const p=PLANES.find(p=>p.id===inspectedPlane)||planeNow(),story=AIRFRAME_STORIES[p.id],own=garage.planes.includes(p.id),equipped=garage.plane===p.id;
  $('previewName').textContent=p.name;
  $('btnGaragePlay').textContent=`FLY ${planeNow().name} ↗`;
  const disabled=equipped||(!own&&(p.cost===null||garage.coins<p.cost));
  const label=equipped?'EQUIPPED':own?'EQUIP AIRCRAFT':p.cost===null?'DAY 7 REWARD':`UNLOCK · ${p.cost} COINS`;
  const note=own?'':p.cost===null?`Claim your daily bonus ${7-garage.daily.day} more time${7-garage.daily.day===1?'':'s'} to unlock.`:garage.coins<p.cost?`${p.cost-garage.coins} more coins needed`:'Ready to join your hangar';
  $('aircraftOffer').classList.remove('hidden');
  const special=abilityOf(p.id);
  $('aircraftOffer').innerHTML=`<span class="offerRole">${story.role}</span><p>${story.detail}</p><div class="abilityInfo"><b>${special.name} · Q</b><p>${special.description}</p><small>${special.cooldown}s cooldown</small></div><button class="btn offerBuy" data-plane="${p.id}" ${disabled?'disabled':''}>${label}</button><small>${note}</small>`;
  const mod=partStats();
  const values=[['CRUISE',Math.round(180*p.speed*mod.speed)+' km/h'],['HANDLING',Math.round((2.7*(1+.1*garage.lv.engine)*p.turn*mod.turn)/2.7*100)+'%'],['HULL',Math.max(1,3+p.hp+garage.lv.armor+mod.hp)+' HP'],['GUNS',p.guns],['MISSILES',p.missiles+Math.floor(garage.lv.ammo/2)]];
  $('buildStats').innerHTML=values.map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('');
  document.querySelector('.previewNote').textContent='Preview with your current paint & components';
}
$('planeList').addEventListener('click',e=>{const b=e.target.closest('[data-inspect]');if(!b||state!=='garage')return;inspectedPlane=b.dataset.inspect;Sound.init();Sound.sfxClick();renderFleet();refreshPreview();$('planeList').querySelector(`[data-inspect="${inspectedPlane}"]`).focus({preventScroll:true});});

function weaponProfile(id,weapon='balanced'){
 if(weapon==='heavy')return 'cannon';if(weapon==='rapid')return 'rotary';
 if(id==='spectre')return 'cannon';if(id==='halo')return 'ion';
 if(['lancer','seraph','falcon'].includes(id))return 'laser';if(id==='twin')return 'rotary';return 'ballistic';
}
function shotProfile(from,enemy){return weaponProfile(enemy?(from.airframe||'classic'):garage.plane,enemy?'balanced':garage.loadout.weapon);}
const SHOT_COLORS={ballistic:0xffe46a,cannon:0xffad52,rotary:0xffeeb0,laser:0x63f2ff,ion:0xc69aff};
function addExhaust(root,shape){
 const body=root.userData.body;const jet=['lancer','seraph','spectre','halo','falcon'].includes(shape);
 const material=addExhaust.materials||(addExhaust.materials=[new THREE.MeshBasicMaterial({color:0xff6725,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}),new THREE.MeshBasicMaterial({color:0xffeb93,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}),new THREE.MeshBasicMaterial({color:0x42cfff,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending})]);
 for(const side of [-1,1]){
  const flame=new THREE.Group();flame.name='boost-flame';flame.position.set(jet?-2.4:-1.9,-.12,side*(jet?.66:.42));flame.visible=false;body.add(flame);
  const outer=new THREE.Mesh(G.cone,material[jet?2:0]);outer.rotation.z=Math.PI/2;outer.position.x=-.9;outer.scale.set(.32,2.1,.32);flame.add(outer);
  const core=new THREE.Mesh(G.cone,material[1]);core.rotation.z=Math.PI/2;core.position.x=-.45;core.scale.set(.18,1.3,.18);flame.add(core);
 }
}
function flamesOf(mesh){
 if(!mesh.userData.flames){const f=[];mesh.traverse(o=>{if(o.name==='boost-flame')f.push(o);});mesh.userData.flames=f;}
 return mesh.userData.flames;
}
function animateExhaust(entity,boost,dt){
 if(!entity?.mesh)return;
 const pulse=1+Math.sin(time*65)*.13;
 for(const o of flamesOf(entity.mesh)){if(!boost&&!o.visible)continue;o.visible=boost;if(boost)o.scale.set(pulse,1+Math.sin(time*41)*.1,1);}
 if(boost&&Math.random()<Math.min(1,dt*40)){
  const f=fwdOf(entity),jet=['lancer','seraph','spectre','halo','falcon'].includes(entity.airframe||garage.plane);
  addPart(entity.x-f[0]*5,entity.y-f[1]*5,entity.z-f[2]*5,-f[0]*8,-f[1]*8,-f[2]*8,.3,.6,jet?0x71dfff:0xffaa46,1.4);
 }
}
let speedLineCache=-1;
function updateCombatFx(dt,raw){
 animateExhaust(player,state==='playing'&&ramTime>0,dt);
 for(const b of bots)animateExhaust(b,state==='playing'&&b.ramTime>0,dt);
 updateShockwaves(raw);
 // speed lines: boosting, rolling, and once the run gets fast
 const sl=state==='playing'?clamp((ramTime>0?.85:0)+(rollTime>0?.4:0)+(speedMul()-1.5)*.3+(slowT>0&&slowScale<.5?.35:0),0,.9):0;
 if(Math.abs(sl-speedLineCache)>.02){speedLineCache=sl;$('speedLines').style.opacity=sl.toFixed(2);}
 // music follows the fight
 Sound.mode=titanLock()?'titan':boss&&!boss.dead?'boss':'normal';
 Sound.drums=state==='playing'||state==='ready';
}
Sound.shot=function(profile,enemy=false){
 const v=enemy?.45:1;
 if(profile==='cannon'){this.noise(.17,.2*v,800);this.tone(100,.24,'sine',.32*v,28);this.tone(220,.045,'triangle',.12*v,60);}
 else if(profile==='laser'){this.tone(1450,.19,'sawtooth',.045*v,130);this.tone(2100,.1,'sine',.07*v,360);}
 else if(profile==='ion'){this.tone(620,.3,'sine',.13*v,95);this.tone(940,.24,'triangle',.07*v,140,.025);}
 else if(profile==='rotary'){this.noise(.045,.09*v,2600);this.tone(190,.045,'square',.04*v,75);}
 else {this.noise(.075,.1*v,1900);this.tone(150,.065,'triangle',.12*v,55);}
};
Sound.sfxShoot=function(){this.shot(weaponProfile(garage.plane,garage.loadout.weapon));};
Sound.sfxEnemyShoot=function(from){this.shot(weaponProfile(from?.airframe||'classic'),true);};
Sound.sfxBoost=function(){this.noise(.85,.15,650);this.tone(65,.6,'sine',.2,190);this.tone(180,.4,'sawtooth',.035,650);};
Sound.sfxMissile=function(enemy){this.noise(.28,enemy?.05:.13,1300);this.tone(190,.27,'triangle',enemy?.035:.07,950);};
Sound.sfxLock=function(){this.tone(740,.07,'sine',.07);this.tone(1110,.09,'sine',.07,null,.075);};
$('btnTestWeapon').addEventListener('click',()=>{Sound.init();const id=isFleetView()&&state==='garage'?inspectedPlane:garage.plane;Sound.shot(weaponProfile(id,garage.loadout.weapon));});

// ================= v2/v3: combo scoring, streaks, popups, hit markers, tips, bosses =================
function targetables(){ return boss && !boss.dead ? [...bots, ...turrets, boss] : [...bots, ...turrets]; }

// --- big center banner (kill streaks, phase changes, speed-ups) ---
function banner(title, sub = '', col = '#ffbb58') {
  const s = $('streak');
  s.style.setProperty('--sc', col);
  s.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
  s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
}
function killFlash() { const k = $('killFlash'); k.classList.remove('on'); void k.offsetWidth; k.classList.add('on'); }
function pulseScore() { const s = $('score'); s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); }
const STREAKS = { 2: ['DOUBLE KILL', '#62f5ec'], 3: ['TRIPLE KILL', '#ffbb58'], 4: ['MULTI KILL', '#ff9b4a'], 5: ['RAMPAGE', '#ff5c7a'], 7: ['UNSTOPPABLE', '#c9a8ff'], 10: ['GODLIKE', '#ffd24a'] };

// --- kill scoring with combo multiplier (x1 → x1.5 → x2 → x2.5 → x3) ---
function awardKill(x, y, z, pts, big = false) {
  combo = comboT > 0 ? combo + 1 : 1; comboT = COMBO_WINDOW;
  const mul = big ? 1 : Math.min(3, 1 + (combo - 1) * 0.5), got = Math.round(pts * mul / 10) * 10;   // boss bounty is fixed
  killPts += got; bestCombo = Math.max(bestCombo, combo);
  popup(x, y, z, '+' + got, big || combo >= 3, big && pts >= 5000);
  flashReticle('kill'); killFlash(); pulseScore();
  if (!big) hitStop(0.05, 0.2);
  const st = STREAKS[combo] || (combo > 10 && combo % 5 === 0 ? ['GODLIKE x' + combo, '#ffd24a'] : null);
  if (!big && st) { banner(st[0], 'x' + (mul % 1 ? mul.toFixed(1) : mul) + ' SCORE', st[1]); hitStop(0.14, 0.18); Sound.sfxFanfare(combo >= 5); }
  if (combo >= 2) {
    const shown = Math.min(3, 1 + (combo - 1) * 0.5);
    $('comboN').textContent = 'x' + (shown % 1 ? shown.toFixed(1) : shown);
    $('combo').querySelector('small').textContent = combo + ' KILL COMBO';
    const c = $('combo'); c.classList.remove('hidden', 'bump'); void c.offsetWidth; c.classList.add('bump');
    Sound.tone(520 + Math.min(combo, 8) * 90, 0.12, 'triangle', 0.08); Sound.tone(780 + Math.min(combo, 8) * 90, 0.14, 'triangle', 0.06, null, 0.06);
  }
}
function updateCombo(dt) {
  if (comboT <= 0) return;
  comboT -= dt;
  if (comboT <= 0) { combo = 0; $('combo').classList.add('hidden'); return; }
  if (combo >= 2) $('comboBar').style.width = (comboT / COMBO_WINDOW * 100).toFixed(1) + '%';
}

// --- crosshair hit marker ---
let hitMarkT = 0;
function flashReticle(kind) {
  if (kind === 'hit' && (hitMarkT > performance.now() || reticle.classList.contains('kill'))) return;
  hitMarkT = performance.now() + 90;
  reticle.classList.remove('hit', 'kill'); void reticle.offsetWidth; reticle.classList.add(kind);
  clearTimeout(flashReticle.t); flashReticle.t = setTimeout(() => reticle.classList.remove('hit', 'kill'), kind === 'kill' ? 360 : 170);
}

// --- floating score text in world space ---
const pops = [];
function popup(x, y, z, text, big, mega) {
  if (pops.length >= 12) { const o = pops.shift(); o.el.remove(); }
  const el = document.createElement('div'); el.className = 'pop' + (mega ? ' mega' : big ? ' big' : ''); el.textContent = text;
  $('popups').appendChild(el);
  pops.push({ x, y: y + 2, z, el, until: performance.now() + 1000 });
}
function updatePopups() {
  const now = performance.now();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    if (now > p.until) { p.el.remove(); pops.splice(i, 1); continue; }
    const sp = toScreen(p.x, p.y, p.z);
    if (!sp) { p.el.style.visibility = 'hidden'; continue; }
    p.el.style.visibility = '';
    p.el.style.transform = `translate(${sp.x.toFixed(0)}px,${sp.y.toFixed(0)}px) translate(-50%,-50%)`;
  }
}
function clearPopups() { for (const p of pops) p.el.remove(); pops.length = 0; }

// --- muzzle flash ---
function muzzleFlash() {
  const f = fwdOf(player), guns = planeNow().guns;
  for (let g = 0; g < guns; g++) {
    const side = gunSide(guns, g), ox = -Math.sin(player.a) * side, oz = Math.cos(player.a) * side;
    addPart(player.x + f[0] * 3.4 + ox, player.y + f[1] * 3.4 - 0.3, player.z + f[2] * 3.4 + oz, f[0] * 20, f[1] * 20, f[2] * 20, 0.06, 0.55, 0xfff0a0, 0.8);
  }
}

// --- first-run tips (shown once, until the first sortie gets through them) ---
function startTips() {
  tipT = 0;
  tipList = tutorialDone ? [] : [
    [0.6, IS_TOUCH ? 'Drag anywhere to steer · hold <b>FIRE</b> to shoot' : 'Move the mouse to steer · hold <b>CLICK</b> to shoot'],
    [7, 'Fly through <b>yellow boxes</b> to reload ammo'],
    [14, IS_TOUCH ? 'Tap <b>AIM</b> and keep an enemy in the ring to <b>LOCK ON</b>' : 'Hold <b>RIGHT-CLICK</b> and keep an enemy in the ring to <b>LOCK ON</b>'],
    [20, IS_TOUCH ? 'At <b>LOCK</b>, <b>MSL</b> fires a missile that never misses' : 'At <b>LOCK</b>, <b>E</b> fires a missile that never misses'],
    [27, IS_TOUCH ? '<b>FLARE</b> fools enemy missiles · <b>SPECIAL</b> = your aircraft’s own ability' : '<b>F</b> drops flares · <b>Q</b> = your aircraft’s own ability'],
    [34, 'Chain kills quickly for a <b>COMBO</b> bonus'],
    [42, 'Survive to <b>3:00</b> — the <b>OMEGA TITAN</b> is waiting'],
  ];
}
function hideTip() { $('tip').classList.remove('show'); tipT = 0; }
function updateTips(dt) {
  if (tipT > 0) { tipT -= dt; if (tipT <= 0) $('tip').classList.remove('show'); }
  if (!tipList.length || gameTime < tipList[0][0]) return;
  const [, html] = tipList.shift();
  $('tip').innerHTML = html; $('tip').classList.add('show'); tipT = 5;
  if (!tipList.length) { tutorialDone = true; Store.set('tut', '1'); }
}

// --- BOSS: the Sky Fortress airship ---
function makeBoss() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.rotation.order = 'ZXY';
  const hull = M(0x46536b, { roughness: 0.5 }), dark = M(0x1d2738), red = M(0xd64c59), gold = M(0xffbb58, { metalness: 0.3 });
  const env = part(G.capsule, hull, 3.4, 4.2, 3.4, 0, 0, 0, body); env.rotation.z = Math.PI / 2;
  for (const x of [-3.6, 3.2]) { const r = part(G.torus, red, 3.45, 3.45, 3.45, x, 0, 0, body); r.rotation.y = Math.PI / 2; }
  part(G.sph, red, 1.6, 1.6, 1.6, 8.9, 0, 0, body);
  for (const [y, z, sx, sy, sz] of [[2.6, 0, 3.2, 3.2, 0.35], [-2.6, 0, 3.2, 3.2, 0.35], [0, 2.6, 3.2, 0.35, 3.2], [0, -2.6, 3.2, 0.35, 3.2]]) part(G.box, red, sx, sy, sz, -8, y, z, body);
  part(G.box, dark, 6, 1.5, 2, 0.5, -3.9, 0, body);
  const win = M(0xfff1a8, { emissive: 0xffc54a, emissiveIntensity: 1.2 });
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) part(G.box, win, 0.55, 0.45, 0.1, -1.4 + i * 0.95, -3.7, sd * 1.02, body);
  const props = [];
  for (const sd of [-1, 1]) {
    const pod = part(G.capsule, dark, 0.55, 0.9, 0.55, -1, -3.2, sd * 3.2, body); pod.rotation.z = Math.PI / 2;
    part(G.box, dark, 0.4, 0.3, 2, -1, -3.3, sd * 2.2, body);
    const pr = new THREE.Group(); pr.position.set(-2.4, -3.2, sd * 3.2); body.add(pr);
    part(G.box, gold, 0.1, 2.8, 0.35, 0, 0, 0, pr); part(G.box, gold, 0.1, 0.35, 2.8, 0, 0, 0, pr); props.push(pr);
  }
  const guns = [];
  for (const [x, y] of [[3, 3.3], [1.5, -4.8]]) {
    const head = new THREE.Group(); head.position.set(x, y, 0); body.add(head);
    part(G.sph, dark, 0.9, 0.7, 0.9, 0, 0, 0, head);
    const bar = new THREE.Group(); head.add(bar);
    for (const sd of [-1, 1]) { const b = part(G.cyl, M(0x2b2d42), 0.16, 2, 0.16, 1, 0, sd * 0.3, bar); b.rotation.z = Math.PI / 2; }
    guns.push({ head, bar, lx: x, ly: y });
  }
  const glow = part(G.sph, M(0xff5c5c, { emissive: 0xff2030, emissiveIntensity: 1.5 }), 0.5, 0.5, 0.5, 9.9, 0.4, 0, body);
  g.userData = { body, props, guns, glow };
  return g;
}
// signed distance from a point to the airship's hull (negative = inside); k scales it for the titan
function bossDist(o) {
  const k = boss.k || 1, ca = Math.cos(boss.a), sa = Math.sin(boss.a), dx = o.x - boss.x, dy = o.y - boss.y, dz = o.z - boss.z;
  const t = clamp(dx * ca + dz * sa, -8 * k, 9 * k);
  const d = Math.hypot(dx - ca * t, dy, dz - sa * t);
  return d - (boss.titan ? 5.4 : dy < -2 ? 4.8 : 3.9) * k;
}
function announceBoss() {
  bossWarnT = 3;
  $('bossWarn').innerHTML = '<small>WARNING</small>BOSS INBOUND';
  $('bossWarn').classList.remove('hidden');
  for (let i = 0; i < 6; i++) Sound.tone(i % 2 ? 440 : 660, 0.22, 'square', 0.06, null, i * 0.25);
}
function spawnBoss() {
  $('bossWarn').classList.add('hidden');
  const n = bossCount, side = Math.random() < 0.5 ? -1 : 1, ang = player.a + side * rand(0.5, 1.1), d = 115;
  const x = clamp(player.x + Math.cos(ang) * d, -MAP + 40, MAP - 40), z = clamp(player.z + Math.sin(ang) * d, -MAP + 40, MAP - 40);
  const max = 45 + 25 * n;
  boss = { x, y: clamp(player.y + 8, 22, 50), z, a: Math.atan2(player.z - z, player.x - x), p: 0, roll: 0, hp: max, max, scale: 3.5, boss: true,
    pts: 1500 + 500 * n, gunCd: [2, 3], burst: [0, 0], burstT: [0, 0], mslCd: 6, orbit: side, dying: 0, dead: false, drops: 3, enraged: false, mesh: makeBoss() };
  scene.add(boss.mesh);
  $('bossName').textContent = 'SKY FORTRESS' + (n ? ' MK ' + (n + 1) : '');
  $('bossFill').style.width = '100%';
  $('bossBar').classList.remove('titan');
  $('bossBar').classList.remove('hidden');
  // resupply so the fight is winnable at any upgrade level
  for (let i = 0; i < 3; i++) spawnPickup('ammo');
  spawnPickup('missile');
  banner('SKY FORTRESS', 'SHOOT IT DOWN', '#ffbb58');
}
function hitBoss(dmg, at) {
  if (!boss || boss.dead) return;
  if (boss.intro > 0) {   // shields up while it makes its entrance
    for (let i = 0; i < 4; i++) addPart(at.x, at.y, at.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), 0.3, 0.4, 0x7ff3ff);
    return;
  }
  boss.hp -= dmg;
  for (let i = 0; i < 5; i++) addPart(at.x, at.y, at.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), 0.35, 0.45, i % 2 ? 0xffe24a : 0xffffff);
  Sound.tone(300, 0.05, 'square', 0.05);
  $('bossFill').style.width = Math.max(0, boss.hp / boss.max * 100).toFixed(1) + '%';
  if (boss.titan) { if (boss.hp <= 0) killTitan(); return; }
  // it sheds a supply crate at 75 / 50 / 25 %
  while (boss.drops > 0 && boss.hp <= boss.max * boss.drops / 4) {
    boss.drops--;
    spawnPickup('ammo', boss.x + rand(-6, 6), boss.z + rand(-6, 6), clampAlt(boss.y - 6));
    explode(boss.x + rand(-5, 5), boss.y + rand(-2, 2), boss.z + rand(-5, 5), 0.8);
  }
  if (!boss.enraged && boss.hp <= boss.max / 2) { boss.enraged = true; banner('ENRAGED', 'SKY FORTRESS', '#ff5c7a'); }
  if (boss.hp <= 0) killBoss();
}
function killBoss() {
  boss.dead = true; boss.dying = 1.6; bossCount++; kills++;
  awardKill(boss.x, boss.y + 4, boss.z, boss.pts, true);
  $('bossBar').classList.add('hidden');
  shake = 0.5; Sound.sfxBoom(); hitStop(0.7, 0.25);
  banner('BOSS DOWN', '+' + boss.pts, '#ffd24a'); Sound.sfxFanfare(true);
  for (const m of missiles) if (m.enemy) { explode(m.x, m.y, m.z, 0.5); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead);
  nextBossAt = gameTime + 100;
  CG.happytime();
}
function updateBoss(dt, hostile) {
  if (boss && boss.titan) { updateTitan(dt, hostile); return; }
  if (!boss) {
    const titanSoon = titanPhase === 'none' && gameTime > TITAN_AT - 25;
    if (hostile && !titanLock() && !titanSoon && gameTime >= nextBossAt && bossWarnT <= 0) announceBoss();
    if (bossWarnT > 0) { $('bossWarn').classList.toggle('hidden', state !== 'playing'); bossWarnT -= dt; if (bossWarnT <= 0) { if (hostile && !titanLock()) spawnBoss(); else $('bossWarn').classList.add('hidden'); } }
    return;
  }
  const B = boss, ud = B.mesh.userData;
  for (const pr of ud.props) pr.rotation.x += dt * 18;
  ud.glow.material.emissiveIntensity = 1 + Math.sin(time * (B.enraged ? 14 : 6));
  if (B.dead) {   // crash sequence
    B.dying -= dt; B.y -= dt * 7; B.roll += dt * 0.5; B.p = lerp(B.p, -0.35, dt);
    if (Math.random() < dt * 9) { explode(B.x + rand(-8, 8) * Math.cos(B.a), B.y + rand(-3, 3), B.z + rand(-8, 8) * Math.sin(B.a), 0.9); Sound.sfxBoom(); }
    if (B.dying <= 0) {
      explode(B.x, B.y, B.z, 2.6); shockwave(B.x, B.y, B.z, 40, 0xffffff, 0.7); shake = Math.max(shake, 0.45); Sound.sfxBoom();
      if (state === 'playing') {
        spawnPickup('heart', B.x + 5, B.z, clampAlt(B.y)); spawnPickup('missile', B.x - 5, B.z, clampAlt(B.y)); spawnPickup('ammo', B.x, B.z + 5, clampAlt(B.y));
      }
      scene.remove(B.mesh); boss = null;
    }
  } else if (B.stun > 0) {
    B.stun -= dt;
    if (Math.random() < dt * 14) addPart(B.x + rand(-8, 8) * Math.cos(B.a), B.y + rand(-3, 3), B.z + rand(-8, 8) * Math.sin(B.a), 0, rand(1, 3), 0, 0.35, 0.6, 0xb69dff, 0.5);
  } else {
    const dx = player.x - B.x, dz = player.z - B.z, dh = Math.hypot(dx, dz), d = Math.hypot(dh, player.y - B.y);
    // circle the player at a stand-off distance; hurry back when left far behind
    const around = Math.atan2(B.z - player.z, B.x - player.x) + B.orbit * 0.55;
    let tx = player.x + Math.cos(around) * 55, tz = player.z + Math.sin(around) * 55;
    if (!hostile || !player.alive) { tx = B.x + Math.cos(B.a) * 40; tz = B.z + Math.sin(B.a) * 40; }
    tx = clamp(tx, -MAP + 30, MAP - 30); tz = clamp(tz, -MAP + 30, MAP - 30);
    turnToward(B, Math.atan2(tz - B.z, tx - B.x), 0.55, dt); B.roll *= 0.4;
    const spd = d > 90 ? Math.max(14, playerSpeed() * 0.85) : 9 + bossCount * 1.5;
    B.x += Math.cos(B.a) * spd * dt; B.z += Math.sin(B.a) * spd * dt;
    B.y += clamp(clamp(player.y + 7, 20, 52) - B.y, -4, 4) * dt;
    // flak turrets
    const ca = Math.cos(B.a), sa = Math.sin(B.a), rate = (B.enraged ? 1.5 : 1) * (1 + bossCount * 0.15);
    ud.guns.forEach((gn, i) => {
      const wx = B.x + gn.lx * ca, wy = B.y + gn.ly, wz = B.z + gn.lx * sa;
      const gx = player.x - wx, gy = player.y - wy, gz = player.z - wz, gh = Math.hypot(gx, gz);
      gn.head.rotation.y = -(Math.atan2(gz, gx) - B.a);
      gn.bar.rotation.z = Math.atan2(gy, Math.max(gh, 1));
      if (!hostile || !player.alive || state !== 'playing' || playerHidden()) return;
      B.gunCd[i] -= dt * rate;
      if (B.gunCd[i] <= 0 && d < 85) { B.burst[i] = 3; B.gunCd[i] = rand(2.2, 3); }
      if (B.burst[i] > 0 && (B.burstT[i] -= dt) <= 0) {
        B.burst[i]--; B.burstT[i] = 0.14;
        const f = fwdOf(player), ps = playerSpeed(), lead = Math.hypot(gh, gy) / (botSpeed() + 30);
        fire({ x: wx, y: wy, z: wz, a: 0, p: 0 }, true, { x: player.x + f[0] * ps * lead + rand(-1.8, 1.8), y: player.y + f[1] * ps * lead + rand(-1.2, 1.2), z: player.z + f[2] * ps * lead + rand(-1.8, 1.8) });
        Sound.sfxEnemyShoot();
      }
    });
    // homing missile from the gondola
    if (hostile && player.alive && state === 'playing' && !playerHidden()) {
      B.mslCd -= dt * rate;
      if (B.mslCd <= 0 && d > 25 && d < 110 && missiles.filter(m => m.enemy && !m.dead).length <= 3) {
        launchMissile({ x: B.x, y: B.y - 4, z: B.z, a: Math.atan2(dz, dx), p: Math.atan2(player.y - B.y + 4, Math.max(dh, 1)) }, true);
        B.mslCd = rand(7, 9);
      }
    }
  }
  B.mesh.position.set(B.x, B.y, B.z);
  B.mesh.rotation.y = -B.a;
  ud.body.rotation.set(B.roll, 0, B.p);
}

// =================== FINAL BOSS: OMEGA TITAN (3:00) ===================
function makeTitan() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.rotation.order = 'ZXY';
  const hull = M(0x1b1f2e, { metalness: 0.6, roughness: 0.35 }), plate = M(0x2e3650, { metalness: 0.5, roughness: 0.4 });
  const red = M(0xff2d55, { emissive: 0xc0002e, emissiveIntensity: 1.4 }), gold = M(0xffc34d, { metalness: 0.7, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.5 });
  const dark = M(0x0b0e16), fire = M(0xff6a2a, { emissive: 0xff3a00, emissiveIntensity: 2.6 });
  const env = part(G.capsule, hull, 3.6, 5, 3.6, 0, 0, 0, body); env.rotation.z = Math.PI / 2;
  for (const x of [-5, -1.5, 2]) { const r = part(G.torus, plate, 3.8, 3.8, 3.8, x, 0, 0, body); r.rotation.y = Math.PI / 2; }
  for (const x of [-3.3, 0.3, 3.8]) { const r = part(G.torus, red, 3.66, 3.66, 3.66, x, 0, 0, body); r.rotation.y = Math.PI / 2; }
  // armored ram prow + glowing core eye
  const prow = part(G.cone, gold, 2.4, 5, 2.4, 10.8, 0, 0, body); prow.rotation.z = -Math.PI / 2;
  const core = part(G.sph, red, 1.5, 1.5, 1.5, 7.4, 2.2, 0, body);
  part(G.box, dark, 2.4, 0.5, 3.4, 7.4, 1.4, 0, body);
  // spine blades
  for (let i = 0; i < 5; i++) { const b = part(G.box, gold, 1.2, 1.6 - i * 0.18, 0.18, 4 - i * 2.3, 4, 0, body); b.rotation.z = 0.5; }
  // swept battle wings with engine pods
  for (const sd of [-1, 1]) {
    const w = part(G.box, plate, 7.5, 0.55, 9.5, -1.2, -0.6, sd * 7.2, body); w.rotation.y = sd * 0.38;
    const edge = part(G.box, red, 7, 0.6, 0.35, -2.6, -0.5, sd * 11.2, body); edge.rotation.y = sd * 0.38;
    for (const zz of [5.2, 8.8]) {
      const pod = part(G.capsule, hull, 0.95, 2.2, 0.95, -2, -1.2, sd * zz, body); pod.rotation.z = Math.PI / 2;
      part(G.sph, fire, 0.85, 0.85, 0.85, -4.4, -1.2, sd * zz, body);
    }
  }
  // tail fins
  for (const [y, z, sx, sy, sz] of [[3, 0, 3.6, 3.8, 0.4], [-3, 0, 3.6, 3.8, 0.4], [0, 3, 3.6, 0.4, 3.8], [0, -3, 3.6, 0.4, 3.8]]) part(G.box, red, sx, sy, sz, -9.4, y, z, body);
  // spinning halo drive behind the hull
  const haloHolder = new THREE.Group(); haloHolder.position.set(-11.5, 0, 0); haloHolder.rotation.y = Math.PI / 2; body.add(haloHolder);
  const halo = new THREE.Group(); haloHolder.add(halo);
  part(G.torus, red, 5.2, 5.2, 5.2, 0, 0, 0, halo);
  part(G.torus, gold, 6, 6, 6, 0, 0, 0, halo);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(G.sph, fire, 0.45, 0.45, 0.45, Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0, halo); }
  // four gun turrets
  const guns = [];
  for (const [x, y] of [[5, 3.9], [-1.5, 3.9], [3, -4.3], [-3.5, -4.3]]) {
    const head = new THREE.Group(); head.position.set(x, y, 0); body.add(head);
    part(G.sph, dark, 1.1, 0.8, 1.1, 0, 0, 0, head);
    const bar = new THREE.Group(); head.add(bar);
    for (const sd of [-1, 1]) { const b = part(G.cyl, M(0x2b2d42), 0.2, 2.6, 0.2, 1.3, 0, sd * 0.36, bar); b.rotation.z = Math.PI / 2; }
    guns.push({ head, bar, lx: x, ly: y });
  }
  g.userData = { body, props: [], guns, glow: core, halo };
  g.scale.setScalar(1.9);
  return g;
}
function hideCine() {
  const c = $('cine'); c.classList.remove('on');
  setTimeout(() => { if (!c.classList.contains('on')) c.classList.add('hidden'); }, 550);
}
function showCine() { const c = $('cine'); c.classList.remove('hidden'); void c.offsetWidth; c.classList.add('on'); }
function updateTitanFlow(dt) {
  if (titanPhase === 'none') {
    if (!titanWarned && gameTime >= TITAN_AT - 5) {
      titanWarned = true;
      $('bossWarn').innerHTML = '<small>WARNING &middot; 3:00</small>FINAL BOSS INBOUND';
      $('bossWarn').classList.remove('hidden'); bossWarnT = 0;
      Sound.sfxSiren();
    }
    if (gameTime >= TITAN_AT) startTitanIntro();
  } else if (titanPhase === 'intro') {
    titanT -= dt;
    if (Math.random() < dt * 6) shockwave(player.x + rand(-60, 60), player.y + rand(-10, 30), player.z + rand(-60, 60), rand(10, 25), 0xff2d55, 0.6);
    if (titanT <= 0) { titanPhase = 'fight'; hideCine(); spawnTitan(); }
  } else if (titanPhase === 'fight' && boss && boss.titan && !boss.dead) {
    supplyT -= dt;
    if (supplyT <= 0) { supplyT = 14; spawnPickup('ammo'); spawnPickup('ammo'); if (Math.random() < 0.5) spawnPickup('missile'); toast('SUPPLY DROP INBOUND'); }
  }
}
// 3:00 — the sky is wiped clean, then the titan arrives
function startTitanIntro() {
  titanPhase = 'intro'; titanT = 3.4;
  $('bossWarn').classList.add('hidden'); bossWarnT = 0;
  let n = 0;
  for (const b of bots) { if (b.dead) continue; b.dead = true; explode(b.x, b.y, b.z, 1.1); removeBot(b); n++; }
  bots = [];
  for (const t of turrets) if (!t.dead) { t.dead = true; explode(t.x, t.y, t.z, 1.1); wreckTurret(t); n++; }
  if (boss) { explode(boss.x, boss.y, boss.z, 2.2); scene.remove(boss.mesh); boss = null; n += 5; }
  $('bossBar').classList.add('hidden');
  for (const m of missiles) if (m.enemy) removeMissile(m);
  missiles = missiles.filter(m => !m.dead);
  bullets = bullets.filter(b => !b.enemy);
  if (n) { killPts += n * 100; popup(player.x, player.y + 4, player.z, 'SKY CLEARED +' + n * 100, true); }
  // full refit for the final fight
  Object.assign(player, { hp: maxHp(), ammo: maxAmmo(), missiles: Math.min(9, Math.max(player.missiles, 6)), flares: Math.min(9, player.flares + 3), invul: 4.5 });
  shockwave(player.x, player.y, player.z, 120, 0xffffff, 1.1);
  shockwave(player.x, player.y, player.z, 80, 0xff2d55, 0.9);
  shake = 0.6; hitStop(1.1, 0.2); killFlash();
  Sound.sfxBoom(); Sound.tone(55, 1.6, 'sawtooth', 0.22, 30); Sound.sfxSiren();
  showCine(); updateHud(true);
}
function spawnTitan() {
  const ang = player.a + rand(-0.35, 0.35), d = 150;
  const x = clamp(player.x + Math.cos(ang) * d, -MAP + 40, MAP - 40), z = clamp(player.z + Math.sin(ang) * d, -MAP + 40, MAP - 40);
  const hp = Math.round(160 + 110 * gunDmg() * planeNow().guns);
  boss = { x, y: clamp(player.y + 12, 26, 55), z, a: Math.atan2(player.z - z, player.x - x), p: 0, roll: 0, hp, max: hp, scale: 6, k: 1.9, titan: true, boss: true,
    pts: 10000, phase: 1, gunCd: [1, 1.6, 2.2, 2.8], burst: [0, 0, 0, 0], burstT: [0, 0, 0, 0], mslCd: 6, novaCd: 4, novaCharge: 0,
    spiralT: 0, spiralA: 0, orbit: 1, orbitT: 12, dying: 0, dead: false, intro: 2.2, mesh: makeTitan() };
  scene.add(boss.mesh);
  $('bossName').textContent = 'OMEGA TITAN · PHASE 1';
  $('bossFill').style.width = '100%';
  $('bossBar').classList.add('titan'); $('bossBar').classList.remove('hidden');
  banner('OMEGA TITAN', 'DESTROY IT', '#ff2d55');
  shockwave(boss.x, boss.y, boss.z, 60, 0xff2d55, 0.9);
  Sound.tone(40, 2, 'sawtooth', 0.25, 90); Sound.sfxBoom();
  for (let i = 0; i < 3; i++) spawnPickup('ammo');
  spawnPickup('missile');
}
function titanShift(ph) {
  const B = boss;
  $('bossName').textContent = 'OMEGA TITAN · ' + (ph === 2 ? 'PHASE 2' : 'OVERDRIVE');
  banner(ph === 2 ? 'PHASE 2' : 'OVERDRIVE', ph === 2 ? 'SPIRAL STORM' : 'THE TITAN IS ENRAGED', ph === 2 ? '#ff7a2d' : '#ff2d55');
  shockwave(B.x, B.y, B.z, 70, ph === 2 ? 0xff7a2d : 0xff2d55, 0.8);
  explode(B.x, B.y, B.z, 2); shake = Math.max(shake, 0.5); hitStop(0.35, 0.2);
  Sound.sfxSiren(); Sound.sfxBoom();
  B.intro = 1.2;   // brief armor-up while it transforms
  for (let i = 0; i < 2; i++) spawnPickup('ammo');
  spawnPickup('missile');
  if (ph === 3) for (let i = 0; i < 2; i++) { const e = spawnBot('ace', B); if (e) { e.hp = 6; e.pts = 500; } }
}
function titanNova(B) {
  const n = B.phase >= 3 ? 40 : 30, ty = clamp((player.y - B.y) / 70, -0.35, 0.35);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + B.spiralA; orb(B.x, B.y, B.z, Math.cos(a), ty, Math.sin(a), 30, 5); }
  if (B.phase >= 3) {   // second ring stood upright, sweeping through the player's line
    const toP = Math.atan2(player.z - B.z, player.x - B.x);
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; orb(B.x, B.y, B.z, Math.cos(a) * Math.cos(toP + Math.PI / 2), Math.sin(a), Math.cos(a) * Math.sin(toP + Math.PI / 2), 26, 5); }
  }
  shockwave(B.x, B.y, B.z, 32, 0xff3bd4, 0.6);
  Sound.tone(900, 0.5, 'sawtooth', 0.08, 120); Sound.noise(0.4, 0.2, 2400);
}
function updateTitan(dt, hostile) {
  const B = boss, ud = B.mesh.userData, k = B.k;
  ud.halo.rotation.z += dt * (B.phase >= 3 ? 4.5 : 1.6);
  ud.glow.material.emissiveIntensity = 1.6 + Math.sin(time * (B.phase >= 3 ? 18 : 7)) + (B.novaCharge > 0 ? 2 : 0);
  if (B.dead) {   // long, loud death
    B.dying -= dt; B.y -= dt * 5; B.roll += dt * 0.35; B.p = lerp(B.p, -0.3, dt);
    if (Math.random() < dt * 16) {
      const o = rand(-10, 10) * k;
      explode(B.x + o * Math.cos(B.a), B.y + rand(-4, 4), B.z + o * Math.sin(B.a), 1.3);
      Sound.sfxBoom(); shake = Math.max(shake, 0.25);
    }
    if (B.dying <= 0) {
      explode(B.x, B.y, B.z, 4); explode(B.x + 8, B.y, B.z, 2.5); explode(B.x - 8, B.y, B.z - 6, 2.5);
      shockwave(B.x, B.y, B.z, 90, 0xffffff, 1.1); shockwave(B.x, B.y, B.z, 60, 0xffd24a, 0.9); shockwave(B.x, B.y, B.z, 35, 0xff2d55, 0.7);
      shake = 0.9; hitStop(0.8, 0.2); killFlash(); Sound.sfxBoom(); Sound.tone(45, 1.5, 'sine', 0.35, 20);
      if (state === 'playing') {
        spawnPickup('heart', B.x + 6, B.z, clampAlt(B.y)); spawnPickup('heart', B.x - 6, B.z, clampAlt(B.y));
        spawnPickup('missile', B.x, B.z + 6, clampAlt(B.y)); spawnPickup('ammo', B.x, B.z - 6, clampAlt(B.y));
      }
      scene.remove(B.mesh); boss = null; titanPhase = 'done';
      banner('SKY CONQUERED', 'THE HUNT RESUMES', '#62f5ec');
    }
  } else {
    if (B.intro > 0) B.intro -= dt;
    const dx = player.x - B.x, dz = player.z - B.z, dh = Math.hypot(dx, dz), d = Math.hypot(dh, player.y - B.y);
    // phase changes at 2/3 and 1/3 health
    const hpf = B.hp / B.max, ph = hpf > 2 / 3 ? 1 : hpf > 1 / 3 ? 2 : 3;
    if (ph > B.phase) { B.phase = ph; titanShift(ph); }
    // circle the player at a wide stand-off, switching direction now and then
    B.orbitT -= dt; if (B.orbitT <= 0) { B.orbitT = rand(9, 14); B.orbit = -B.orbit; }
    const around = Math.atan2(B.z - player.z, B.x - player.x) + B.orbit * 0.5;
    let tx = player.x + Math.cos(around) * 75, tz = player.z + Math.sin(around) * 75;
    if (!hostile || !player.alive) { tx = B.x + Math.cos(B.a) * 40; tz = B.z + Math.sin(B.a) * 40; }
    tx = clamp(tx, -MAP + 30, MAP - 30); tz = clamp(tz, -MAP + 30, MAP - 30);
    const stunned = B.stun > 0;
    if (stunned) { B.stun -= dt; if (Math.random() < dt * 14) addPart(B.x + rand(-12, 12), B.y + rand(-4, 4), B.z + rand(-12, 12), 0, rand(1, 3), 0, 0.35, 0.8, 0xb69dff, 0.5); }
    turnToward(B, Math.atan2(tz - B.z, tx - B.x), 0.7, dt); B.roll *= 0.4;
    const spd = (d > 110 ? Math.max(18, playerSpeed() * 0.95) : 12 + B.phase * 2.5) * (stunned ? 0.4 : 1);
    B.x += Math.cos(B.a) * spd * dt; B.z += Math.sin(B.a) * spd * dt;
    B.y += clamp(clamp(player.y + 10, 24, 56) - B.y, -5, 5) * dt;
    const attack = hostile && player.alive && state === 'playing' && !playerHidden() && B.intro <= 0 && !stunned;
    const rate = [1, 1, 1.3, 1.75][B.phase];
    // aimed laser bursts from four turrets
    const ca = Math.cos(B.a), sa = Math.sin(B.a);
    ud.guns.forEach((gn, i) => {
      const wx = B.x + gn.lx * k * ca, wy = B.y + gn.ly * k, wz = B.z + gn.lx * k * sa;
      const gx = player.x - wx, gy = player.y - wy, gz = player.z - wz, gh = Math.hypot(gx, gz);
      gn.head.rotation.y = -(Math.atan2(gz, gx) - B.a);
      gn.bar.rotation.z = Math.atan2(gy, Math.max(gh, 1));
      if (!attack) return;
      B.gunCd[i] -= dt * rate;
      if (B.gunCd[i] <= 0 && d < 125) { B.burst[i] = 4; B.gunCd[i] = rand(1.8, 2.6); }
      if (B.burst[i] > 0 && (B.burstT[i] -= dt) <= 0) {
        B.burst[i]--; B.burstT[i] = 0.1;
        const f = fwdOf(player), ps = playerSpeed(), lead = Math.hypot(gh, gy) / (botSpeed() + 30);
        fire({ x: wx, y: wy, z: wz, a: 0, p: 0, airframe: 'lancer' }, true, { x: player.x + f[0] * ps * lead + rand(-2, 2), y: player.y + f[1] * ps * lead + rand(-1.4, 1.4), z: player.z + f[2] * ps * lead + rand(-2, 2) });
        if (i === 0) Sound.sfxEnemyShoot({ airframe: 'lancer' });
      }
    });
    if (attack) {
      // spiral storm (phase 2+)
      if (B.phase >= 2) {
        B.spiralT -= dt;
        const arms = B.phase >= 3 ? 4 : 3, ty = clamp((player.y - B.y) / 90, -0.3, 0.3);
        while (B.spiralT <= 0) {
          B.spiralT += B.phase >= 3 ? 0.07 : 0.1; B.spiralA += 0.21 * B.orbit;
          for (let a = 0; a < arms; a++) { const ang = B.spiralA + a * Math.PI * 2 / arms; orb(B.x, B.y, B.z, Math.cos(ang), ty, Math.sin(ang), 24, 4.5); }
        }
      }
      // telegraphed nova ring: glow + rising whine, then a wall of orbs
      if (B.novaCharge > 0) {
        B.novaCharge -= dt;
        for (let i = 0; i < 3; i++) { const a = rand(0, 6.3), r = rand(14, 22); addPart(B.x + Math.cos(a) * r, B.y + rand(-6, 6), B.z + Math.sin(a) * r, -Math.cos(a) * r * 1.6, 0, -Math.sin(a) * r * 1.6, 0.5, 0.7, 0xff3bd4, 0.3); }
        if (B.novaCharge <= 0) titanNova(B);
      } else {
        B.novaCd -= dt * rate;
        if (B.novaCd <= 0) { B.novaCharge = 1.1; B.novaCd = rand(6.5, 8.5); Sound.tone(200, 1.1, 'sawtooth', 0.07, 1400); }
      }
      // homing missile volleys
      B.mslCd -= dt * rate;
      if (B.mslCd <= 0 && d > 25 && d < 130 && missiles.filter(m => m.enemy && !m.dead).length <= 4) {
        const count = B.phase >= 3 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const sd = (i - (count - 1) / 2) * 9 * k;
          launchMissile({ x: B.x - sa * sd, y: B.y - 2, z: B.z + ca * sd, a: Math.atan2(dz, dx) + (i - (count - 1) / 2) * 0.3, p: Math.atan2(player.y - B.y, Math.max(dh, 1)) }, true);
        }
        B.mslCd = rand(8, 10);
      }
    }
    // engine embers
    if (Math.random() < dt * 30) addPart(B.x - ca * 11 * k + rand(-3, 3), B.y + rand(-3, 3), B.z - sa * 11 * k + rand(-3, 3), -ca * 12, rand(-1, 1), -sa * 12, 0.5, 1.1, B.phase >= 3 ? 0xff2d55 : 0xff7a2d, 0.6);
  }
  B.mesh.position.set(B.x, B.y, B.z);
  B.mesh.rotation.y = -B.a;
  ud.body.rotation.set(B.roll, 0, B.p);
}
function killTitan() {
  const B = boss;
  B.dead = true; B.dying = 3.4; bossCount++; kills++; titanSlain = true;
  awardKill(B.x, B.y + 8, B.z, B.pts, true);
  $('bossBar').classList.add('hidden');
  shake = 0.8; hitStop(1.6, 0.18); killFlash();
  banner('TITAN DOWN', '+10000 PTS · +300 COINS', '#ffd24a');
  Sound.sfxFanfare(true); Sound.sfxBoom();
  for (const m of missiles) if (m.enemy) { explode(m.x, m.y, m.z, 0.5); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead);
  bullets = bullets.filter(b => !b.enemy);
  for (const b of bots) { explode(b.x, b.y, b.z, 1); removeBot(b); b.dead = true; }
  bots = [];
  garage.coins += 300; saveGarage();
  nextBossAt = gameTime + 90;
  CG.happytime();
}

// ---------- AIM lock-on: hit chance climbs while a target stays in the lock circle; 100% = guaranteed missile ----------
const LOCK_RANGE = 170, MAX_LOCKS = 1;   // one lock at a time; multi-missile is left to aircraft abilities
const lockUI = $('lockUI'), lockRing = $('lockRing'), LKS = [];
for (let i = 0; i < 8; i++) {
  const el = document.createElement('div'); el.className = 'lk'; el.hidden = true;
  el.innerHTML = '<svg viewBox="-50 -50 100 100"><path class="br" d="M-46-24V-46H-24M24-46H46V-24M46 24V46H24M-24 46H-46V24"/><circle class="trk" r="34"/><circle class="prog" r="34" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90)"/><path class="dia" d="M0-17L17 0L0 17L-17 0Z"/></svg><b></b><i></i>';
  lockUI.appendChild(el); LKS.push(el);
}
let reticleAt = { x: innerWidth / 2, y: innerHeight / 2 }, lockHudKey = '';
const lockRadius = () => Math.min(innerWidth, innerHeight) * 0.3;
function updateLocks(dt) {
  const on = aiming() && state === 'playing' && player.alive, R = lockRadius();
  let locking = 0;
  const cand = [];
  if (on) for (const t of targetables()) {
    if (t.dead) continue;
    const d = dist3(t, player); if (d > LOCK_RANGE) continue;
    const sp = toScreen(t.x, t.y, t.z); if (!sp) continue;
    const dc = Math.hypot(sp.x - reticleAt.x, sp.y - reticleAt.y); if (dc > R) continue;
    cand.push({ t, d, cen: dc / R });
  }
  cand.sort((a, b) => ((b.t.lock || 0) - (a.t.lock || 0)) || (a.cen - b.cen));   // stick with the target already being locked
  const active = new Set();
  for (const c of cand) {
    if (locking >= MAX_LOCKS) break;
    locking++; active.add(c.t);
    const t = c.t, before = t.lock || 0;
    const rate = 0.5 * (1.7 - c.cen) * (c.d < 70 ? 1.25 : 1) * (t === boss ? 0.75 : 1);
    t.lock = Math.min(1, before + rate * dt);
    if (before < 1 && t.lock >= 1) { Sound.tone(1560, 0.06, 'square', 0.06); Sound.tone(2080, 0.1, 'square', 0.06, null, 0.07); }
    else if (Math.floor(before * 5) < Math.floor(t.lock * 5)) Sound.tone(620 + t.lock * 900, 0.045, 'sine', 0.05);
  }
  for (const t of targetables()) if (t.lock && !active.has(t)) t.lock = Math.max(0, t.lock - dt * (on ? 0.7 : 2));
  drawLocks(on, R);
}
function drawLocks(on, R) {
  lockUI.hidden = !on;
  let n = 0, full = 0;
  if (on) {
    lockRing.style.width = lockRing.style.height = (R * 2).toFixed(0) + 'px';
    lockRing.style.transform = `translate(${(reticleAt.x - R).toFixed(1)}px,${(reticleAt.y - R).toFixed(1)}px)`;
    for (const t of targetables()) {
      if (t.dead || !t.lock || n >= LKS.length) continue;
      const sp = toScreen(t.x, t.y + 0.4 * (t.scale || 1), t.z); if (!sp) continue;
      const el = LKS[n++], d = dist3(t, player), sz = clamp(1100 * (t.scale || 1) / Math.max(d, 1), 44, t === boss ? 150 : 104);
      const done = t.lock >= 1; if (done) full++;
      el.hidden = false; el.className = 'lk' + (done ? ' full' : '');
      el.style.width = el.style.height = sz.toFixed(0) + 'px';
      el.style.transform = `translate(${(sp.x - sz / 2).toFixed(1)}px,${(sp.y - sz / 2).toFixed(1)}px)`;
      el.querySelector('.prog').setAttribute('stroke-dasharray', (t.lock * 100).toFixed(1) + ' 100');
      el.querySelector('b').textContent = done ? 'LOCK' : 'HIT ' + Math.round(35 + 65 * t.lock) + '%';
      el.querySelector('i').textContent = (t === boss ? (t.titan ? 'TITAN ' : 'BOSS ') : '') + Math.round(d) + 'm';
    }
  }
  for (let i = n; i < LKS.length; i++) LKS[i].hidden = true;
  const key = on + '|' + full + '|' + player.missiles;
  if (key !== lockHudKey) {
    lockHudKey = key;
    const k = IS_TOUCH ? 'MSL' : 'E';
    $('lockCount').textContent = full ? (player.missiles ? `TARGET LOCKED · [${k}] FIRE` : 'TARGET LOCKED · NO MISSILES') : 'HOLD A TARGET IN THE RING';
    $('lockCount').classList.toggle('hot', full > 0);
    $('btnMsl').classList.toggle('locked', on && full > 0 && player.missiles > 0);
    $('lockN').textContent = on && full > 0 && player.missiles > 0 ? 'LOCK' : '';
  }
}

// ---------- boot ----------
$('titleKeys').innerHTML = IS_TOUCH
  ? ['Drag anywhere to steer &amp; climb', 'FIRE to shoot', 'MSL / FLARE / SPECIAL buttons', 'AIM to lock on'].map(t => `<span style="white-space:nowrap">${t}</span>`).join(' &middot; ')
  : ['Mouse or WASD: steer &amp; climb', 'Click / Space: fire', 'Right-click / Shift: aim &amp; lock-on', 'E: missile', 'F: flare', 'Q: special'].map(t => `<span style="white-space:nowrap">${t}</span>`).join(' &middot; ');
if (IS_TOUCH) document.body.classList.add('touch');
resize();
requestAnimationFrame(frame);
await CG.init();
CG.loadingStart();
const b0 = parseInt(await Store.get('best'), 10);
best = isFinite(b0) && b0 > 0 ? b0 : 0;
Sound.muted = (await Store.get('muted')) === '1';
loadGarage(await Store.get('garage'));
// ===== TEST BUILD: everything unlocked (separate save, never ship this file) =====
garage.coins = Math.max(garage.coins, 99999);
garage.planes = PLANES.map(p => p.id); garage.paints = PAINTS.map(p => p.id);
for (const [slot, items] of Object.entries(PARTS)) garage.ownedParts[slot] = items.map(p => p.id);
saveGarage();
loadAudio(await Store.get('audio'));
tutorialDone = (await Store.get('tut')) === '1';
// test hook: open the page with #titan to jump straight to 2:55
if (location.hash === '#titan') {
  window.__skipToTitan = true;
  window.__dbg = { hit: d => boss && hitBoss(d, boss), face: () => { if (boss) { player.a = Math.atan2(boss.z - player.z, boss.x - player.x); player.invul = 99; } }, info: () => ({ state, titanPhase, boss: boss && { hp: boss.hp, max: boss.max, phase: boss.phase, dead: boss.dead }, bullets: bullets.length }) };
}
applyLook();
updateMuteBtn();
lastAdTime = Date.now();
CG.loadingStop();
$('loading').classList.add('hidden');
toTitle();
// Daily rewards remain available from the menu without blocking first play.
