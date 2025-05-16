const TILE = 32;                       // Base tile size in pixels

/* Level geometry and physics parameters */
const level = {
  /* Physics */
  gravity      : 0.6,
  accel        : 0.6,
  maxSpeed     : 4.2,
  friction     : 0.15,
  jumpStrength : 12,
  edgeSlack    : 4,                    // Allowed landing overshoot (pixels)

  /* Layout: [x, y, w, h] in tile units */
  platforms : [
    [0, 15, 60, 2],                    // Ground strip (2 tiles high)
    [12, 12, 4, 1], [20, 10, 4, 1],
    [32,  8, 4, 1], [40,  6, 4, 1],
    [48,  4, 4, 1]
  ],
  cactus : [
    [18, 13, 1, 2],
    [44,  5, 1, 2]
  ],
  /* Water pools are aligned with the ground (y = 15) */
  water : [
    [ 8, 15, 4, 2],
    [24, 15, 6, 2]
  ],
  goal : [54, 3, 3, 3]                 // Reach the house to win
};

/* -------------------------------------------------------------------------- */
/*  CANVAS & SCALING                                                          */
/* -------------------------------------------------------------------------- */
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let   scale  = 1;                      // World-to-screen scale factor

function fitCanvas(){
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  /* 17 vertical tiles visible at all times (15 ground + sky) */
  scale = canvas.height / (TILE * 17);
}
addEventListener('resize', fitCanvas);
fitCanvas();

/* -------------------------------------------------------------------------- */
/*  HUD (coins / timer)                                                       */
/* -------------------------------------------------------------------------- */
const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <span id="hudName"></span>
  <span id="hudCoins">x00</span>
  <span id="hudTime">400</span>`;
document.body.appendChild(hud);

let coins    = 0;
let timeLeft = 400;                    // Seconds
setInterval(()=>{ if(!gamePaused && timeLeft>0) timeLeft--; }, 1000);

/* -------------------------------------------------------------------------- */
/*  UTILITIES                                                                 */
/* -------------------------------------------------------------------------- */
/* Build an off-screen canvas and paint on it */
const makeSprite = (w, h, paintFn) => {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
  paintFn(c);
  return c.canvas;                     // Immediately usable, no async loading
};

/* Shade a hex colour:  p > 0 → darker | p < 0 → lighter */
const shade = (hex, p) => {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const nr = Math.max(0, Math.min(255, r * (1 - p)));
  const ng = Math.max(0, Math.min(255, g * (1 - p)));
  const nb = Math.max(0, Math.min(255, b * (1 - p)));
  return '#' + ((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1);
};

/* Rect helper + AABB test */
const Rect   = (x,y,w,h)=>({x,y,w,h});
const hitBox = (a,b)=> a.x<b.x+b.w && a.x+a.w>b.x &&
                       a.y<b.y+b.h && a.y+a.h>b.y;

/* -------------------------------------------------------------------------- */
/*  SPRITES (all generated at runtime)                                        */
/* -------------------------------------------------------------------------- */
const Sprites = { tiles:{}, cat:{} };

/* --- Tiles ---------------------------------------------------------------- */
Sprites.tiles.brick = makeSprite(TILE, TILE, c=>{
  c.fillStyle = '#b05018'; c.fillRect(0, 0, TILE, TILE);
  c.fillStyle = '#d26b25'; c.fillRect(0, 0, TILE, TILE*0.5);
  c.fillStyle = '#0002'   ; c.fillRect(0, TILE*0.5, TILE, TILE*0.5);
  c.strokeStyle = '#0003'; c.lineWidth = 1;
  [8,16,24].forEach(x=>{ c.beginPath(); c.moveTo(x,0); c.lineTo(x,TILE); c.stroke(); });
  c.beginPath(); c.moveTo(0,16); c.lineTo(32,16); c.stroke();
});

Sprites.tiles.ground = makeSprite(TILE, TILE, c=>{
  c.fillStyle = '#874114'; c.fillRect(0,0,TILE,TILE);
  c.fillStyle = '#a95a24'; c.fillRect(0,0,TILE,TILE*0.4);
  c.fillStyle = '#652d0d'; c.fillRect(0,TILE*0.4,TILE,TILE*0.6);
});

Sprites.tiles.waterTop = makeSprite(TILE, 8, c=>{
  c.fillStyle = '#2fa4ff'; c.fillRect(0,0,TILE,8);
  c.fillStyle = '#ffffff44'; for(let i=0;i<4;i++) c.fillRect(i*8,0,8,2);
});

Sprites.tiles.waterBody = makeSprite(TILE, TILE, c=>{
  c.fillStyle = '#2fa4ff'; c.fillRect(0,0,TILE,TILE);
  c.fillStyle = '#2284e8'; c.fillRect(0,TILE*0.5,TILE,TILE*0.5);
});

Sprites.tiles.cactus = makeSprite(TILE, TILE*2, c=>{
  c.fillStyle = '#2cb84c';
  c.fillRect( 8, 8,16,48);
  c.fillRect( 0,24, 8,16);
  c.fillRect(24,24, 8,16);
});

/* --- Cat (runtime recolourable) ------------------------------------------ */
function buildCat(col='#ff9c55'){
  const dark  = shade(col, 0.25);
  const light = shade(col,-0.15);

  /* Four running frames */
  const run = Array.from({length:4}, (_,k)=> makeSprite(TILE,TILE,c=>{
    /* body */
    c.fillStyle = dark;  c.fillRect(3, 6, 26,20);
    c.fillStyle = light; c.fillRect(6,14, 20, 8);
    c.fillStyle = col ;  c.fillRect(3, 6, 26,10);

    /* ears */
    [[8,6,12,0,16,6],[24,6,20,0,16,6]].forEach(p=>{
      c.beginPath(); c.moveTo(...p); c.closePath(); c.fill();
    });

    /* eyes */
    c.fillStyle='#000';
    c.fillRect(12,12,4,4);
    c.fillRect(20,12,4,4);

    /* legs (simple two-phase swing) */
    const s = k%2===0 ? 5 : -5;
    c.fillStyle = dark;
    c.fillRect(10+s,22,6,10);
    c.fillRect(22-s,22,6,10);
  }));

  const idle = run[0];

  const jump = makeSprite(TILE, TILE, c=>{
    c.drawImage(idle,0,0);
    c.fillStyle = dark;
    c.fillRect(14,18,6,14);
    c.fillRect(24,18,6,14);
  });

  Sprites.cat = { idle, run, jump };
}
buildCat();                               // default orange cat

/* -------------------------------------------------------------------------- */
/*  PLAYER & CAMERA                                                           */
/* -------------------------------------------------------------------------- */
const player = {
  x:TILE*2, y:TILE*10,
  w:TILE,  h:TILE,
  vx:0, vy:0,
  onGround:false,
  frame:0, frameTick:0
};

function resetPlayer(){
  Object.assign(player,{
    x:TILE*2, y:TILE*10,
    vx:0, vy:0, onGround:false,
    frame:0, frameTick:0
  });
}

let cameraX = 0;                          // Horizontal scroll only

/* -------------------------------------------------------------------------- */
/*  INPUT                                                                     */
/* -------------------------------------------------------------------------- */
const keys  = {};
const touch = { l:0, r:0 };

addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
});
addEventListener('keyup',e=>{ keys[e.code] = false; });

/* Basic mobile controls */
['touchstart','touchend','touchcancel'].forEach(ev=>
  canvas.addEventListener(ev,e=>{
    const leftSide = e.changedTouches[0].clientX < innerWidth/2;
    if(ev==='touchstart'){
      (leftSide ? touch.l=1 : touch.r=1);
      jump();                               // tap = jump
    }else{
      if(leftSide) touch.l=0; else touch.r=0;
    }
    e.preventDefault();
  })
);

function jump(){
  if(player.onGround){
    player.vy = -level.jumpStrength;
    player.onGround = false;
  }
}

/* -------------------------------------------------------------------------- */
/*  COLLISION & HAZARD CHECKS                                                 */
/* -------------------------------------------------------------------------- */
function collide(axis){
  player.onGround = false;

  for(const p of level.platforms){
    const r = Rect(p[0]*TILE, p[1]*TILE, p[2]*TILE, p[3]*TILE);

    /* Direct overlap */
    if(hitBox(Rect(player.x,player.y,player.w,player.h), r)){
      if(axis==='y'){
        if(player.vy > 0){                 // falling
          player.y  = r.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }else{                             // head bump
          player.y  = r.y + r.h;
          player.vy = 0;
        }
      }else{                               // x-axis
        player.x  = player.vx > 0 ? r.x - player.w : r.x + r.w;
        player.vx = 0;
      }
    }
    /* Edge forgiveness (vertical only) */
    else if(axis==='y' && !player.onGround && player.vy>=0){
      const feet = player.y + player.h;
      if(Math.abs(feet - r.y) < level.edgeSlack &&
         player.x + player.w > r.x &&
         player.x < r.x + r.w){
        player.y  = r.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }
}

/* True if player hits cactus, water, or falls off the screen */
function hitHazard(){
  if(player.y > canvas.height) return true;

  for(const list of [level.cactus, level.water]){
    for(const h of list){
      if(hitBox(Rect(player.x,player.y,player.w,player.h),
                Rect(h[0]*TILE,h[1]*TILE,h[2]*TILE,h[3]*TILE)))
        return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*  GAME LOOP                                                                 */
/* -------------------------------------------------------------------------- */
let gamePaused = true;

function gameLoop(){
  if(!gamePaused){
    handleInput();
    updatePhysics();
  }
  render();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

/* Handle input → velocity */
function handleInput(){
  const dir = (keys.ArrowLeft||touch.l ? -1 : 0) +
              (keys.ArrowRight||touch.r ?  1 : 0);

  /* Horizontal acceleration / friction */
  if(dir){
    player.vx += dir * level.accel;
    player.vx  = Math.max(-level.maxSpeed, Math.min(level.maxSpeed, player.vx));
  }else{
    player.vx *= (1 - level.friction);
    if(Math.abs(player.vx) < 0.05) player.vx = 0;
  }

  if(keys.Space) jump();
}

/* Physics, animation, camera, HUD */
function updatePhysics(){
  /* Gravity */
  player.vy += level.gravity;

  /* Horizontal move + X-collisions */
  player.x += player.vx;
  collide('x');

  /* Vertical move + Y-collisions */
  player.y += player.vy;
  collide('y');

  /* Hazards / win condition */
  if(hitHazard()) resetPlayer();

  const g = level.goal;
  if(hitBox(Rect(player.x,player.y,player.w,player.h),
            Rect(g[0]*TILE,g[1]*TILE,g[2]*TILE,g[3]*TILE))){
    alert('Level cleared!');
    resetPlayer();
  }

  /* Animation frame */
  if(!player.onGround){                       // airborne
    player.frameTick = 0;
  }else if(Math.abs(player.vx) > 0.2){        // running
    if(++player.frameTick > 6){
      player.frame = (player.frame + 1) % Sprites.cat.run.length;
      player.frameTick = 0;
    }
  }else{                                      // idle
    player.frame = 0;
  }

  /* Simple camera: keep player ~150px from left edge */
  cameraX = Math.max(0, player.x - 150);

  /* HUD text */
  document.getElementById('hudName').textContent  = playerName.toUpperCase();
  document.getElementById('hudCoins').textContent = 'x' + String(coins).padStart(2,'0');
  document.getElementById('hudTime').textContent  = timeLeft;
}

/* -------------------------------------------------------------------------- */
/*  RENDERING                                                                 */
/* -------------------------------------------------------------------------- */
function render(){
  ctx.save();
  ctx.setTransform(scale,0,0,scale, -cameraX*scale, 0);
  ctx.clearRect(cameraX, 0, canvas.width/scale, canvas.height/scale);

  /* Sky */
  ctx.fillStyle = '#88cbff';
  ctx.fillRect(cameraX, 0, canvas.width/scale, canvas.height/scale);

  /* Ground / bricks (skip tiles covered by water) */
  level.platforms.forEach(p=>{
    const sprite = p[1] >= 15 ? Sprites.tiles.ground : Sprites.tiles.brick;
    for(let i=0;i<p[2];i++){
      const gx = p[0] + i;
      const gy = p[1];

      /* Is this tile occupied by water? */
      const underwater = level.water.some(w =>
        gx >= w[0] && gx < w[0] + w[2] &&
        gy >= w[1] && gy < w[1] + w[3]);

      if(!underwater) ctx.drawImage(sprite, gx*TILE, gy*TILE);
    }
  });

  /* Water (top ripple + body) */
  level.water.forEach(w=>{
    for(let i=0;i<w[2];i++){
      ctx.drawImage(Sprites.tiles.waterTop, (w[0]+i)*TILE, w[1]*TILE);
      for(let j=1;j<w[3];j++)
        ctx.drawImage(Sprites.tiles.waterBody, (w[0]+i)*TILE, (w[1]+j)*TILE);
    }
  });

  /* Cacti */
  level.cactus.forEach(c=>{
    ctx.drawImage(Sprites.tiles.cactus, c[0]*TILE, (c[1]-1)*TILE);
  });

  /* Goal (little house) */
  const [gx,gy,gwT,ghT] = level.goal;
  const gxPx = gx*TILE, gyPx = gy*TILE, gw = gwT*TILE, gh = ghT*TILE;
  ctx.fillStyle = '#d2691e';
  ctx.fillRect(gxPx, gyPx, gw, gh);
  ctx.fillStyle = '#b22222';
  ctx.beginPath();
  ctx.moveTo(gxPx - 0.1*gw, gyPx);
  ctx.lineTo(gxPx + 0.5*gw, gyPx - 0.6*gh);
  ctx.lineTo(gxPx + 1.1*gw, gyPx);
  ctx.closePath();
  ctx.fill();

  /* Player sprite */
  const sprite = !player.onGround
      ? Sprites.cat.jump
      : Math.abs(player.vx) > 0.2
        ? Sprites.cat.run[player.frame]
        : Sprites.cat.idle;

  ctx.drawImage(sprite, player.x, player.y, player.w, player.h);

  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/*  START BUTTON                                                              */
/* -------------------------------------------------------------------------- */
let playerName = 'Kitty';

document.getElementById('startBtn').onclick = () =>{
  playerName = document.getElementById('playerName').value.trim() || 'Kitty';
  buildCat(document.getElementById('catColor').value);   // recolour cat
  document.getElementById('overlay').classList.add('hidden');
  gamePaused = false;

  resetPlayer();
  coins = 0;
  timeLeft = 400;
};