/* ───────────────────────── CONSTANTS ───────────────────────── */
const TILE = 32;

const level = {
  /* physics */
  gravity:0.6, accel:0.6, maxSpeed:4.2, friction:0.15,
  jumpStrength:13,                 // ← bumped from 12 → you can reach 3rd platform
  edgeSlack:4,

  /* layout [x,y,w,h] in tiles */
  platforms : [
    [0, 15, 60, 2],
    [12, 12, 4, 1],
    [18, 11, 3, 1],
    [20, 10, 4, 1],
    [36,  7, 4, 1],
    [40,  6, 4, 1],
    [48,  4, 4, 1]
  ],

  cactus:[[18,13,1,2],[44,5,1,2]],
  water :[[ 8,15,4,2],[24,15,6,2]],
  goal  :[54,3,3,3]
};

/* ────────────────────── CANVAS + SCALING ───────────────────── */
const canvas=document.getElementById('gameCanvas'), ctx=canvas.getContext('2d');
let scale=1;
const fit=()=>{ canvas.width=innerWidth; canvas.height=innerHeight;
                scale=canvas.height/(TILE*17); };
addEventListener('resize',fit); fit();

/* ─────────────────────────── HUD ──────────────────────────── */
const hud=document.createElement('div');
hud.id='hud';
hud.innerHTML=`<span id="hudName"></span><span id="hudCoins">x00</span><span id="hudTime">400</span>`;
document.body.appendChild(hud);
let coins=0,timeLeft=400;
setInterval(()=>{ if(!gamePaused && timeLeft>0) timeLeft--; },1000);

/* ───────────────────── UTILITIES ───────────────────── */
const make=(w,h,paint)=>{ const c=Object.assign(document.createElement('canvas'),{width:w,height:h}).getContext('2d'); paint(c); return c.canvas; };
const shade=(hex,p)=>{ let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  return'#'+((1<<24)+((r*(1-p))<<16)+((g*(1-p))<<8)+(b*(1-p))).toString(16).slice(1); };
const Rect=(x,y,w,h)=>({x,y,w,h});
const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

/* ───────────────────── SPRITES ───────────────────── */
const Spr={tiles:{},cat:{}};

/* tiles */
Spr.tiles.brick = make(TILE,TILE,c=>{
  c.fillStyle='#b05018';c.fillRect(0,0,TILE,TILE);
  c.fillStyle='#d26b25';c.fillRect(0,0,TILE,TILE*0.5);
  c.fillStyle='#0002';  c.fillRect(0,TILE*0.5,TILE,TILE*0.5);
  c.strokeStyle='#0003';c.lineWidth=1;[8,16,24].forEach(x=>{c.beginPath();c.moveTo(x,0);c.lineTo(x,TILE);c.stroke();});
  c.beginPath();c.moveTo(0,16);c.lineTo(32,16);c.stroke();
});
Spr.tiles.ground = make(TILE,TILE,c=>{
  c.fillStyle='#874114';c.fillRect(0,0,TILE,TILE);
  c.fillStyle='#a95a24';c.fillRect(0,0,TILE,TILE*.4);
  c.fillStyle='#652d0d';c.fillRect(0,TILE*.4,TILE,TILE*.6);
});
Spr.tiles.waterTop  = make(TILE,8,c=>{c.fillStyle='#2fa4ff';c.fillRect(0,0,TILE,8);
  c.fillStyle='#ffffff44';for(let i=0;i<4;i++)c.fillRect(i*8,0,8,2);});
Spr.tiles.waterBody = make(TILE,TILE,c=>{c.fillStyle='#2fa4ff';c.fillRect(0,0,TILE,TILE);
  c.fillStyle='#2284e8';c.fillRect(0,TILE*0.5,TILE,TILE*0.5);});
Spr.tiles.cactus = make(TILE,TILE*2,c=>{
  c.fillStyle='#2cb84c';c.fillRect(8,8,16,48);
  c.fillRect(0,24,8,16);c.fillRect(24,24,8,16);
});

/* cat */
function buildCat(col = '#ff9c55') {
  const dark  = shade(col,  0.25);      // paws / outline
  const light = shade(col, -0.15);      // belly highlight

  /* helper: draw one animation phase (0-3) */
  const paintFrame = phase => make(TILE, TILE, c => {
    /* body */
    c.fillStyle = dark;  c.fillRect(3,  8, 26, 18);
    c.fillStyle = light; c.fillRect(6, 16, 20,  8);
    c.fillStyle = col;   c.fillRect(3,  8, 26, 10);

    /* ears (black outline + inner colour) */
    c.fillStyle = '#000';
    c.beginPath(); c.moveTo( 7, 8); c.lineTo(12, 2); c.lineTo(17, 8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(25, 8); c.lineTo(20, 2); c.lineTo(15, 8); c.closePath(); c.fill();
    c.fillStyle = col;
    c.beginPath(); c.moveTo( 8, 8); c.lineTo(12, 3); c.lineTo(16, 8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(24, 8); c.lineTo(20, 3); c.lineTo(16, 8); c.closePath(); c.fill();

    /* eyes */
    c.fillStyle = '#000';
    c.fillRect(12, 13, 4, 4);
    c.fillRect(20, 13, 4, 4);

    /* four legs: front pair swings opposite to back pair */
    const legX  = [8, 16, 20, 28];          // x-positions
    const shift = (phase % 2 ? 4 : -4);     // swing amount
    const legY  = 26;                       // y-position
    c.fillStyle = dark;
    for (let i = 0; i < 4; i++) {
      const dx = (i < 2 ? shift : -shift) * (phase % 2);
      c.fillRect(legX[i] + dx, legY, 5, 10);
    }
  });

  /* build run cycle */
  const run  = [0, 1, 2, 3].map(paintFrame);
  const idle = paintFrame(0);               // centred legs
  const jump = make(TILE, TILE, c => {      // legs straight down
    c.drawImage(idle, 0, 0);
    c.fillStyle = dark;
    [8, 16, 20, 28].forEach(x => c.fillRect(x, 22, 5, 14));
  });

  Spr.cat = { idle, run, jump };
}
buildCat();  

/* ───────────────────── PLAYER & CAMERA ───────────────────── */
const player={x:TILE*2,y:TILE*10,w:TILE,h:TILE,vx:0,vy:0,on:false,fr:0,ft:0};
let camX=0;
const reset=()=>Object.assign(player,{x:TILE*2,y:TILE*10,vx:0,vy:0,on:false,fr:0,ft:0});

/* ───────────────────── INPUT ───────────────────── */
const keys={},touch={l:0,r:0};
onkeydown=e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys[e.code]=1};
onkeyup  =e=>keys[e.code]=0;
['touchstart','touchend','touchcancel'].forEach(ev=>canvas.addEventListener(ev,e=>{
  const left=e.changedTouches[0].clientX<innerWidth/2;
  if(ev==='touchstart'){ left?touch.l=1:touch.r=1; jump(); }
  else{ left?touch.l=0:touch.r=0; }
  e.preventDefault();
}));
const jump=()=>{ if(player.on){player.vy=-level.jumpStrength;player.on=false;} };

/* ───────────────────── COLLISIONS ───────────────────── */
function collide(axis){
  player.on=false;
  for(const p of level.platforms){
    const r=Rect(p[0]*TILE,p[1]*TILE,p[2]*TILE,p[3]*TILE);
    if(hit(Rect(player.x,player.y,player.w,player.h),r)){
      if(axis==='y'){
        if(player.vy>0){player.y=r.y-player.h;player.vy=0;player.on=true;}
        else{player.y=r.y+r.h;player.vy=0;}
      }else{
        player.x=player.vx>0?r.x-player.w:r.x+r.w;player.vx=0;
      }
    }else if(axis==='y'&&!player.on&&player.vy>=0){
      const feet=player.y+player.h;
      if(Math.abs(feet-r.y)<level.edgeSlack && player.x+player.w>r.x && player.x<r.x+r.w){
        player.y=r.y-player.h;player.vy=0;player.on=true;
      }
    }
  }
}
const hazard=()=>player.y>canvas.height||[level.cactus,level.water].some(arr=>arr.some(h=>hit(Rect(player.x,player.y,player.w,player.h),Rect(h[0]*TILE,h[1]*TILE,h[2]*TILE,h[3]*TILE))));

/* ───────────────────── GAME LOOP ───────────────────── */
let gamePaused=true;
requestAnimationFrame(function loop(){
  if(!gamePaused){update();draw();}
  requestAnimationFrame(loop);
});

function update(){
  /* movement input */
  const dir=(keys.ArrowLeft||touch.l?-1:0)+(keys.ArrowRight||touch.r?1:0);
  if(dir){player.vx=Math.max(-level.maxSpeed,Math.min(level.maxSpeed,player.vx+dir*level.accel));}
  else {player.vx*=1-level.friction; if(Math.abs(player.vx)<.05)player.vx=0;}
  if(keys.Space) jump();

  /* physics */
  player.vy+=level.gravity;
  player.x+=player.vx; collide('x');
  player.y+=player.vy; collide('y');

  if(hazard()) reset();
  const g=level.goal;
  if(hit(Rect(player.x,player.y,player.w,player.h),Rect(g[0]*TILE,g[1]*TILE,g[2]*TILE,g[3]*TILE))){alert('Level cleared!');reset();}

  /* animation */
  if(!player.on){player.ft=0;}
  else if(Math.abs(player.vx)>0.2 && ++player.ft>6){player.fr=(player.fr+1)%Spr.cat.run.length;player.ft=0;}
  else if(Math.abs(player.vx)<=0.2){player.fr=0;}

  /* camera */
  camX=Math.max(0,player.x-150);

  /* HUD */
  document.getElementById('hudName').textContent=playerName.toUpperCase();
  document.getElementById('hudCoins').textContent='x'+String(coins).padStart(2,'0');
  document.getElementById('hudTime').textContent=timeLeft;
}

/* ───────────────────── RENDER ───────────────────── */
const tile=(img,x,y,w,h)=>{for(let i=0;i<w;i++)for(let j=0;j<h;j++)ctx.drawImage(img,(x+i)*TILE,(y+j)*TILE);};
function draw(){
  ctx.save(); ctx.setTransform(scale,0,0,scale,-camX*scale,0);
  ctx.clearRect(camX,0,canvas.width/scale,canvas.height/scale);

  ctx.fillStyle='#88cbff';ctx.fillRect(camX,0,canvas.width/scale,canvas.height/scale);

  /* ground / bricks (skip if underwater) */
  level.platforms.forEach(p=>{
    const spr=p[1]>=15?Spr.tiles.ground:Spr.tiles.brick;
    for(let i=0;i<p[2];i++){
      const gx=p[0]+i,gy=p[1];
      const under=level.water.some(w=>gx>=w[0]&&gx<w[0]+w[2]&&gy>=w[1]&&gy<w[1]+w[3]);
      if(!under) ctx.drawImage(spr,gx*TILE,gy*TILE);
    }
  });

  /* water */
  level.water.forEach(w=>{
    for(let i=0;i<w[2];i++){
      ctx.drawImage(Spr.tiles.waterTop,(w[0]+i)*TILE,w[1]*TILE);
      for(let j=1;j<w[3];j++)ctx.drawImage(Spr.tiles.waterBody,(w[0]+i)*TILE,(w[1]+j)*TILE);
    }
  });

  /* cacti */
  level.cactus.forEach(c=>ctx.drawImage(Spr.tiles.cactus,c[0]*TILE,(c[1]-1)*TILE));

  /* goal house */
  const [gx,gy,gwT,ghT]=level.goal, gxP=gx*TILE, gyP=gy*TILE, gw=gwT*TILE, gh=ghT*TILE;
  ctx.fillStyle='#d2691e';ctx.fillRect(gxP,gyP,gw,gh);
  ctx.fillStyle='#b22222';ctx.beginPath();
  ctx.moveTo(gxP-gw*.1,gyP);ctx.lineTo(gxP+gw*.5,gyP-gh*.6);ctx.lineTo(gxP+gw*1.1,gyP);ctx.closePath();ctx.fill();

  /* cat */
  const sp=!player.on?Spr.cat.jump:Math.abs(player.vx)>0.2?Spr.cat.run[player.fr]:Spr.cat.idle;
  ctx.drawImage(sp,player.x,player.y,player.w,player.h);

  ctx.restore();
}

/* ───────────────────── START BUTTON ───────────────────── */
let playerName='Kitty';
document.getElementById('startBtn').onclick=()=>{
  playerName=document.getElementById('playerName').value.trim()||'Kitty';
  buildCat(document.getElementById('catColor').value);
  document.getElementById('overlay').classList.add('hidden');
  gamePaused=false; reset(); coins=0; timeLeft=400;
};