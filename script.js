/* cat-platformer v2 – prettier tiles, clouds, HUD, auto-camera */

const TILE = 32;

/* …неизменный объект level… */

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let scale=1;
function resize(){
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  scale = canvas.height/(TILE*17); // сохраняем «горизонтальную» систему координат
}
addEventListener('resize',resize);resize();

/* ---------- HUD ---------- */
const hud = document.createElement('div');
hud.id='hud';
hud.innerHTML=`<span id="hudName"></span><span id="hudCoins">x00</span><span id="hudTime">400</span>`;
document.body.appendChild(hud);
let coins=0,timeLeft=400;
setInterval(()=>{ if(!gamePaused && timeLeft>0) timeLeft--; },1000);

/* ---------- BACKGROUND ASSETS ---------- */
const bg = {
  clouds: Array.from({length:4},(_,i)=>({x:120*i,y:60+40*(i%2)})),
  hills : [ {x:100,y:330},{x:420,y:340},{x:760,y:320} ]
};

/* ---------- TILE & CAT SPRITES ---------- */
const sprites={cat:{},tiles:{}};

const make=(w,h,draw)=>{const o=Object.assign(document.createElement('canvas'),{width:w,height:h}).getContext('2d');draw(o);const img=new Image();img.src=o.canvas.toDataURL();return img;};

function darker(hex,p){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;return'#'+((1<<24)+(Math.max(0,r*(1-p))<<16)+(Math.max(0,g*(1-p))<<8)+Math.max(0,b*(1-p))).toString(16).slice(1)}

/* nicer brick, soil, water */
(()=>{
  sprites.tiles.brick = make(TILE,TILE,c=>{
    c.fillStyle='#b05018';c.fillRect(0,0,TILE,TILE);
    c.fillStyle='#d26b25';c.fillRect(0,0,TILE,TILE*0.5);
    c.fillStyle='#0002';c.fillRect(0,TILE*0.5,TILE,TILE*0.5);
    c.strokeStyle='#0003';c.lineWidth=1;[8,16,24].forEach(x=>{c.beginPath();c.moveTo(x,0);c.lineTo(x,TILE);c.stroke()});
    c.beginPath();c.moveTo(0,16);c.lineTo(32,16);c.stroke();
  });
  sprites.tiles.ground = make(TILE,TILE,c=>{
    c.fillStyle='#874114';c.fillRect(0,0,TILE,TILE);
    c.fillStyle='#a95a24';c.fillRect(0,0,TILE,TILE*0.4);
    c.fillStyle='#652d0d';c.fillRect(0,TILE*0.4,TILE,TILE*0.6);
  });
  sprites.tiles.waterTop = make(TILE,8,c=>{
    c.fillStyle='#2fa4ff';c.fillRect(0,0,TILE,8);
    c.fillStyle='#fff4';for(let i=0;i<4;i++)c.fillRect(i*8,0,8,2);
  });
  sprites.tiles.waterBody = make(TILE,TILE,c=>{
    c.fillStyle='#2fa4ff';c.fillRect(0,0,TILE,TILE);
    c.fillStyle='#2284e8';c.fillRect(0,TILE*0.5,TILE,TILE*0.5);
  });
  sprites.tiles.cactus = make(TILE,TILE*2,c=>{
    c.fillStyle='#2cb84c';c.fillRect(8,8,16,48);
    c.fillRect(0,24,8,16);c.fillRect(24,24,8,16);
    c.fillStyle='#0003';c.fillRect(8,8,16,2); // тень
  });
})();

/* prettier cat – три цвета + белый живот */
function createCat(color='#ff9c55'){
  const under=darker(color,.25);
  const belly=darker(color,-.15);
  const frames=[0,1,2,3].map(step=> make(TILE,TILE,c=>{
    c.fillStyle=under;c.fillRect(3,6,26,20);
    c.fillStyle=belly;c.fillRect(6,14,20,8);
    c.fillStyle=color;c.fillRect(3,6,26,10);
    // уши
    [[8,6,12,0,16,6],[24,6,20,0,16,6]].forEach(t=>{c.beginPath();c.moveTo(...t);c.closePath();c.fill()});
    // глаза
    c.fillStyle='#000';c.fillRect(12,12,4,4);c.fillRect(20,12,4,4);
    // лапы (анимация)
    const shift= step%2===0?5:-5;
    c.fillStyle=under;c.fillRect(10+shift,22,6,10);
    c.fillRect(22-shift,22,6,10);
  }));
  const idle = frames[0];
  const jump = make(TILE,TILE,c=>{
    c.drawImage(frames[0],0,0);
    c.fillStyle=under;c.fillRect(14,18,6,14);c.fillRect(24,18,6,14);
  });
  sprites.cat={idle,run:frames,jump};
}
createCat();

/* ---------- player, camera ---------- */
const player={x:TILE*2,y:TILE*10,w:TILE,h:TILE,vx:0,vy:0,onGround:false,frame:0,ft:0};
let cameraX=0;

function resetPlayer(){Object.assign(player,{x:TILE*2,y:TILE*10,vx:0,vy:0,onGround:false})}

/* ---------- input ---------- */
const keys={},touch={l:false,r:false};
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys[e.code]=true});
addEventListener('keyup',e=>keys[e.code]=false);
['touchstart','touchend','touchcancel'].forEach(ev=>canvas.addEventListener(ev,e=>{
  const left=e.changedTouches[0].clientX<innerWidth/2;
  if(ev==='touchstart'){ (left?touch.l=1:touch.r=1); jump(); }
  else { if(left)touch.l=0;else touch.r=0; }
  e.preventDefault();
}));
function jump(){ if(player.onGround){player.vy=-level.jumpStrength;player.onGround=false;} }

/* ---------- collisions ---------- */
const rect=(x,y,w,h)=>({x,y,w,h});
const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function collide(axis){
  player.onGround=false;
  for(const p of level.platforms){
    const r=rect(p[0]*TILE,p[1]*TILE,p[2]*TILE,p[3]*TILE);
    if(hit(rect(player.x,player.y,player.w,player.h),r)){
      if(axis==='y'){
        if(player.vy>0){player.y=r.y-player.h;player.vy=0;player.onGround=true;}
        else{player.y=r.y+r.h;player.vy=0;}
      }else{
        player.x = player.vx>0 ? r.x-player.w : r.x+r.w;
        player.vx=0;
      }
    }else if(axis==='y' && !player.onGround && player.vy>=0){
      const feet=player.y+player.h;
      if(Math.abs(feet-r.y)<level.edgeSlack && player.x+player.w>r.x && player.x<r.x+r.w){
        player.y=r.y-player.h;player.vy=0;player.onGround=true;
      }
    }
  }
}

/* ---------- hazards / goal ---------- */
function danger(){ if(player.y>canvas.height) return true;
  for(const arr of [level.cactus,level.water])
    for(const h of arr)
      if(hit(rect(player.x,player.y,player.w,player.h),rect(h[0]*TILE,h[1]*TILE,h[2]*TILE,h[3]*TILE))) return true;
  return false;
}

/* ---------- loop ---------- */
let gamePaused=true;
function frame(){
  if(!gamePaused){
    update(); draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- update ---------- */
function update(){
  /* input */
  let dir = (keys.ArrowLeft||touch.l?-1:0)+(keys.ArrowRight||touch.r?1:0);
  if(dir){player.vx=Math.max(-level.maxSpeed,Math.min(level.maxSpeed,player.vx+dir*level.accel))}
  else{player.vx*=1-level.friction; if(Math.abs(player.vx)<.05)player.vx=0;}
  if(keys.Space) jump();

  /* physics */
  player.vy+=level.gravity;
  player.x+=player.vx; collide('x');
  player.y+=player.vy; collide('y');

  if(danger()) resetPlayer();
  if(hit(rect(player.x,player.y,player.w,player.h),rect(...level.goal.map((v,i)=>i<2?v*TILE:v*TILE)))){ alert('Level cleared!'); resetPlayer(); }

  /* animation */
  if(!player.onGround){player.ft=0;}
  else if(Math.abs(player.vx)>0.2 && ++player.ft>6){player.frame=(player.frame+1)%sprites.cat.run.length;player.ft=0;}
  else if(Math.abs(player.vx)<=0.2){player.frame=0;}

  /* camera follows */
  cameraX = Math.max(0, player.x - innerWidth / (2*scale) + player.w/2);

  /* HUD */
  document.getElementById('hudName').textContent=playerName.toUpperCase();
  document.getElementById('hudCoins').textContent='x'+String(coins).padStart(2,'0');
  document.getElementById('hudTime').textContent=timeLeft;
}

/* ---------- render ---------- */
function draw(){
  ctx.save(); ctx.setTransform(scale,0,0,scale,-cameraX*scale,0);
  ctx.clearRect(cameraX,0,canvas.width/scale,canvas.height/scale);

  /* sky */
  ctx.fillStyle='#88cbff'; ctx.fillRect(cameraX,0,canvas.width/scale,canvas.height/scale);

  /* clouds */
  ctx.fillStyle='#fff';
  bg.clouds.forEach(cl=>{ ctx.beginPath(); ctx.arc(cl.x-cameraX,cl.y,20,0,Math.PI*2); ctx.fill(); cl.x = (cl.x+0.1)%2000; });

  /* hills */
  ctx.fillStyle='#3caf34';
  bg.hills.forEach(h=>{ ctx.beginPath(); ctx.arc(h.x,h.y,60,0,Math.PI,true); ctx.closePath(); ctx.fill(); });

  /* platforms */
  level.platforms.forEach(p=>{
    const spr = p[1]>=15 ? sprites.tiles.ground : sprites.tiles.brick;
    for(let i=0;i<p[2];i++) ctx.drawImage(spr,(p[0]+i)*TILE,p[1]*TILE);
  });

  /* water */
  level.water.forEach(w=>{
    for(let i=0;i<w[2];i++){
      ctx.drawImage(sprites.tiles.waterTop,(w[0]+i)*TILE,(w[1])*TILE);
      for(let j=1;j<w[3];j++) ctx.drawImage(sprites.tiles.waterBody,(w[0]+i)*TILE,(w[1]+j)*TILE);
    }
  });

  /* cactus */
  level.cactus.forEach(c=>ctx.drawImage(sprites.tiles.cactus,c[0]*TILE,(c[1]-1)*TILE));

  /* goal - house */
  const [gx,gy,gw,gh]=level.goal.map((v,i)=>i<2?v*TILE:v*TILE);
  ctx.fillStyle='#d2691e';ctx.fillRect(gx,gy,gw,gh);
  ctx.fillStyle='#b22222';ctx.beginPath();
  ctx.moveTo(gx-0.1*gw,gy);ctx.lineTo(gx+0.5*gw,gy-0.6*gh);ctx.lineTo(gx+1.1*gw,gy);ctx.closePath();ctx.fill();

  /* cat */
  const img = !player.onGround ? sprites.cat.jump : Math.abs(player.vx)>0.2 ? sprites.cat.run[player.frame] : sprites.cat.idle;
  ctx.drawImage(img,player.x,player.y,player.w,player.h);

  ctx.restore();
}

/* ---------- overlay (start screen) ---------- */
document.getElementById('startBtn').onclick=()=>{
  playerName=document.getElementById('playerName').value.trim()||'Kitty';
  createCat(document.getElementById('catColor').value);
  document.getElementById('overlay').classList.add('hidden');
  gamePaused=false; resetPlayer(); timeLeft=400; coins=0;
};
