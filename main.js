
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hpEl = document.getElementById("hp");
  const scoreEl = document.getElementById("score");
  const specialTextEl = document.getElementById("specialText");
  const specialFillEl = document.getElementById("specialFill");
  const overlay = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("finalScore");
  const restartBtn = document.getElementById("restart");
  const statusMessage = document.getElementById("statusMessage");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND = 610;

  const imageFiles = {
    neutral: "neutral.png",
    midStart: "mid_kick_start.png",
    midHit: "mid_kick_hit.png",
    lowStart: "low_kick_start.png",
    lowHit: "low_kick_hit.png",
    highStart: "high_kick_start.png",
    highHit: "high_kick_hit.png",
    jump: "jump.png",
    jumpAttackStart: "jump_attack_start.png",
    jumpAttackHit: "jump_attack_hit.png",
    landing: "landing.png",
    specialPickup: "special_pickup.png",
    specialFire: "special_fire.png"
  };

  const images = {};
  let imageReadyCount = 0;
  let imageFailedCount = 0;
  const imageTotal = Object.keys(imageFiles).length;

  for (const [key, file] of Object.entries(imageFiles)) {
    const img = new Image();
    img.onload = () => imageReadyCount++;
    img.onerror = () => {
      imageReadyCount++;
      imageFailedCount++;
      console.warn("Image load failed:", file);
    };
    img.src = new URL(file, document.baseURI).href;
    images[key] = img;
  }

  const input = {
    up:false,down:false,left:false,right:false,
    jump:false,attack:false,special:false
  };

  let state;

  function resetGame() {
    state = {
      running:true,
      score:0,
      hp:5,
      special:0,
      elapsed:0,
      spawnTimer:800,
      facing:1,
      enemies:[],
      particles:[],
      player:{
        x:W/2,y:GROUND,vy:0,grounded:true,
        action:"neutral",actionTimer:0,hitDone:false,
        invuln:0,specialTimer:0
      }
    };
    overlay.classList.add("hidden");
    updateHud();
  }

  function updateHud() {
    hpEl.textContent = state.hp;
    scoreEl.textContent = state.score;
    specialTextEl.textContent = `${Math.floor(state.special)}%`;
    specialFillEl.style.width = `${state.special}%`;
  }

  function setStatus(text) {
    statusMessage.textContent = text;
  }

  const keyMap = {
    ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",
    z:"jump",Z:"jump",x:"attack",X:"attack"," ":"special"
  };

  window.addEventListener("keydown", e => {
    const key = keyMap[e.key];
    if (!key) return;
    e.preventDefault();
    if (!input[key]) onPress(key);
    input[key] = true;
  });

  window.addEventListener("keyup", e => {
    const key = keyMap[e.key];
    if (!key) return;
    input[key] = false;
  });

  document.querySelectorAll("[data-input]").forEach(button => {
    const key = button.dataset.input;

    const press = e => {
      e.preventDefault();
      if (!input[key]) onPress(key);
      input[key] = true;
      button.classList.add("active");
    };

    const release = e => {
      e.preventDefault();
      input[key] = false;
      button.classList.remove("active");
    };

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  });

  restartBtn.addEventListener("click", resetGame);

  function onPress(key) {
    if (!state?.running) return;
    const p = state.player;

    if (key === "left") state.facing = -1;
    if (key === "right") state.facing = 1;

    if (key === "jump" && p.grounded && p.action !== "special") {
      p.grounded = false;
      p.vy = input.up ? -1080 : -860;
      p.action = "jump";
      p.actionTimer = 0;
      p.hitDone = false;
      return;
    }

    if (key === "attack" && p.action !== "special") {
      if (!p.grounded) {
        p.action = "jumpAttack";
        p.actionTimer = 0;
        p.hitDone = false;
      } else if (p.action === "neutral") {
        p.action = input.up ? "high" : input.down ? "low" : "mid";
        p.actionTimer = 0;
        p.hitDone = false;
      }
      return;
    }

    if (key === "special" && state.special >= 100 && p.specialTimer <= 0) {
      state.special = 0;
      p.specialTimer = 5000;
      p.action = "special";
      p.actionTimer = 0;
      burst(p.x, p.y - 150, 24);
      updateHud();
    }
  }

  function spawnEnemy() {
    const side = Math.random() < .5 ? -1 : 1;
    const r = Math.random();

    let enemy;
    if (r < .34) {
      enemy = {type:"zombie",height:2,speed:90,score:100,y:GROUND};
    } else if (r < .62) {
      enemy = {type:"skeleton",height:Math.random()<.5?1:3,speed:103,score:150,y:GROUND};
    } else if (r < .84) {
      enemy = {type:"crawler",height:1,speed:120,score:175,y:GROUND+18};
    } else {
      const height = Math.random() < .35 ? 5 : 4;
      enemy = {type:"demon",height,speed:108,score:220,y:height===5?235:330};
    }

    state.enemies.push({
      ...enemy,
      side,
      x:side<0?-90:W+90,
      dead:false
    });
  }

  function currentAttackHeight() {
    const a = state.player.action;
    if (a === "low") return 1;
    if (a === "mid") return 2;
    if (a === "high") return 3;
    if (a === "jumpAttack") return state.player.y < 360 ? 5 : 4;
    return 0;
  }

  function isAttackActive() {
    const p = state.player;
    if (["low","mid","high"].includes(p.action)) {
      return p.actionTimer >= 110 && p.actionTimer <= 250;
    }
    if (p.action === "jumpAttack") {
      return p.actionTimer >= 80 && p.actionTimer <= 320;
    }
    return false;
  }

  function tryKickHit() {
    const p = state.player;
    if (!isAttackActive() || p.hitDone) return;
    p.hitDone = true;

    const height = currentAttackHeight();
    const range = p.action === "jumpAttack" ? 270 : 225;

    for (const e of state.enemies) {
      if (e.dead || e.side !== state.facing) continue;
      const closeEnough = Math.abs(e.x - p.x) <= range;
      const validHeight = e.height === height || (e.type === "zombie" && [2,3].includes(height));
      if (closeEnough && validHeight) {
        defeatEnemy(e);
        break;
      }
    }
  }

  function defeatEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    state.score += enemy.score;
    state.special = Math.min(100, state.special + 14);
    burst(enemy.x, enemy.y - 70, 12);
    updateHud();
  }

  function burst(x,y,count) {
    for (let i=0;i<count;i++) {
      state.particles.push({
        x,y,
        vx:(Math.random()-.5)*420,
        vy:-Math.random()*330,
        life:450+Math.random()*550,
        size:2+Math.random()*5
      });
    }
  }

  function update(dt) {
    if (!state.running) return;

    state.elapsed += dt;
    const p = state.player;
    p.actionTimer += dt;
    p.invuln = Math.max(0,p.invuln-dt);

    if (!p.grounded) {
      p.vy += 2150 * dt / 1000;
      p.y += p.vy * dt / 1000;

      if (p.y >= GROUND) {
        p.y = GROUND;
        p.vy = 0;
        p.grounded = true;
        p.action = p.action === "special" ? "special" : "landing";
        p.actionTimer = 0;
      }
    }

    if (["low","mid","high"].includes(p.action) && p.actionTimer > 390) {
      p.action = "neutral";
      p.actionTimer = 0;
    }

    if (p.action === "landing" && p.actionTimer > 170) {
      p.action = "neutral";
      p.actionTimer = 0;
    }

    if (p.specialTimer > 0) {
      p.specialTimer -= dt;
      p.action = "special";
      if (p.actionTimer > 430) {
        for (const e of state.enemies) {
          if (!e.dead) defeatEnemy(e);
        }
        if (Math.random() < .25) burst(p.x + state.facing*260, p.y - 170, 2);
      }
      if (p.specialTimer <= 0) {
        p.action = "neutral";
        p.actionTimer = 0;
      }
    }

    tryKickHit();

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(360,1100-state.elapsed*.014) + Math.random()*360;
    }

    for (const e of state.enemies) {
      if (e.dead) continue;
      e.x += -e.side * e.speed * dt / 1000;

      if (Math.abs(e.x-p.x) < 72) {
        if (p.specialTimer > 0) {
          defeatEnemy(e);
        } else if (p.invuln <= 0) {
          p.invuln = 850;
          state.hp -= 1;
          e.dead = true;
          burst(p.x,p.y-120,15);
          updateHud();
          if (state.hp <= 0) endGame();
        }
      }
    }

    state.enemies = state.enemies.filter(e => !e.dead && e.x>-180 && e.x<W+180);

    for (const q of state.particles) {
      q.life -= dt;
      q.vy += 700*dt/1000;
      q.x += q.vx*dt/1000;
      q.y += q.vy*dt/1000;
    }
    state.particles = state.particles.filter(q=>q.life>0);
  }

  function endGame() {
    state.running = false;
    finalScoreEl.textContent = `SCORE ${state.score}`;
    overlay.classList.remove("hidden");
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0,"#cec6b7");
    gradient.addColorStop(.62,"#ddd5c8");
    gradient.addColorStop(.63,"#595047");
    gradient.addColorStop(1,"#2d2926");
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);

    ctx.fillStyle = "rgba(35,35,35,.2)";
    for (let i=0;i<9;i++) {
      const x = i*170 - ((state.elapsed*.02)%170);
      ctx.fillRect(x,130+(i%2)*35,110,245);
    }
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(0,GROUND+12,W,H-GROUND);
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x,e.y);
    ctx.scale(e.side,1);

    if (e.type==="zombie") {
      ctx.fillStyle="#4e7c54";
      ctx.fillRect(-32,-115,64,92);
      ctx.beginPath();ctx.arc(0,-145,34,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#28452d";ctx.lineWidth=14;
      ctx.beginPath();
      ctx.moveTo(-22,-80);ctx.lineTo(-58,-35);
      ctx.moveTo(22,-80);ctx.lineTo(58,-20);
      ctx.stroke();
    } else if (e.type==="skeleton") {
      ctx.strokeStyle="#eee8d5";ctx.lineWidth=11;
      ctx.beginPath();ctx.arc(0,-142,27,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0,-112);ctx.lineTo(0,-42);
      ctx.moveTo(-35,-90);ctx.lineTo(35,-90);
      ctx.moveTo(0,-42);ctx.lineTo(-28,0);
      ctx.moveTo(0,-42);ctx.lineTo(28,0);
      ctx.stroke();
      ctx.fillStyle="#606876";
      ctx.beginPath();ctx.arc(30,-83,34,0,Math.PI*2);ctx.fill();
    } else if (e.type==="crawler") {
      ctx.fillStyle="#68597c";
      ctx.fillRect(-48,-45,96,42);
      ctx.beginPath();ctx.arc(38,-66,27,0,Math.PI*2);ctx.fill();
    } else {
      ctx.fillStyle="#7e2c2c";
      ctx.beginPath();ctx.arc(0,-42,32,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-25,-50);ctx.lineTo(-76,-92);ctx.lineTo(-55,-25);ctx.fill();
      ctx.beginPath();ctx.moveTo(25,-50);ctx.lineTo(76,-92);ctx.lineTo(55,-25);ctx.fill();
      ctx.fillStyle="#ffdc5c";
      ctx.fillRect(-16,-48,8,8);ctx.fillRect(8,-48,8,8);
    }

    ctx.fillStyle="#fff";
    ctx.font="700 20px sans-serif";
    ctx.textAlign="center";
    ctx.fillText(String(e.height),0,28);
    ctx.restore();
  }

  function getPlayerImage() {
    const p = state.player;

    if (p.action==="special") {
      return p.actionTimer<430 ? images.specialPickup : images.specialFire;
    }
    if (p.action==="jump") return images.jump;
    if (p.action==="jumpAttack") {
      return p.actionTimer<120 ? images.jumpAttackStart : images.jumpAttackHit;
    }
    if (p.action==="landing") return images.landing;
    if (p.action==="low") {
      return p.actionTimer<120 || p.actionTimer>260 ? images.lowStart : images.lowHit;
    }
    if (p.action==="mid") {
      return p.actionTimer<110 || p.actionTimer>255 ? images.midStart : images.midHit;
    }
    if (p.action==="high") {
      return p.actionTimer<135 || p.actionTimer>285 ? images.highStart : images.highHit;
    }
    return images.neutral;
  }

  function drawFallbackPlayer() {
    ctx.fillStyle="#fafafa";
    ctx.strokeStyle="#111";
    ctx.lineWidth=7;
    ctx.beginPath();ctx.arc(0,-210,48,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#111";ctx.fillRect(-44,-160,88,112);
    ctx.fillStyle="#fafafa";ctx.fillRect(-34,-151,68,94);ctx.strokeRect(-34,-151,68,94);
    ctx.strokeStyle="#111";ctx.lineWidth=12;
    ctx.beginPath();ctx.moveTo(-18,-55);ctx.lineTo(-34,0);ctx.moveTo(18,-55);ctx.lineTo(34,0);ctx.stroke();
  }

  function drawPlayer() {
    const p = state.player;
    const img = getPlayerImage();
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.scale(state.facing,1);

    if (p.invuln>0 && Math.floor(p.invuln/80)%2===0) ctx.globalAlpha=.35;

    const h = p.action==="special" ? 430 : 390;
    const w = h;

    if (img && img.complete && img.naturalWidth>0) {
      try {
        ctx.drawImage(img,-w/2,-h+40,w,h);
      } catch {
        drawFallbackPlayer();
      }
    } else {
      drawFallbackPlayer();
    }
    ctx.restore();
  }

  function draw() {
    drawBackground();

    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();

    ctx.fillStyle="rgba(255,190,50,.95)";
    for (const q of state.particles) {
      ctx.fillRect(q.x,q.y,q.size,q.size);
    }

    if (state.player.specialTimer>0 && state.player.actionTimer>430) {
      ctx.save();
      ctx.globalAlpha=.16+Math.random()*.14;
      ctx.fillStyle="#fff7b0";
      ctx.fillRect(0,0,W,H);
      ctx.restore();
      ctx.fillStyle="#320000";
      ctx.font="900 50px sans-serif";
      ctx.textAlign="center";
      ctx.fillText("MACHINE GUN MASTER!",W/2,88);
    }

    if (imageReadyCount < imageTotal) {
      setStatus(`画像読み込み中 ${imageReadyCount}/${imageTotal}`);
    } else if (imageFailedCount > 0) {
      setStatus(`画像${imageFailedCount}件を読めません。代替表示で動作中。`);
    } else {
      setStatus("");
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(34,now-last);
    last = now;

    try {
      if (imageReadyCount >= imageTotal) update(dt);
      draw();
    } catch (error) {
      console.error(error);
      setStatus("実行エラー。ページを再読み込みしてください。");
    }

    requestAnimationFrame(loop);
  }

  resetGame();
  requestAnimationFrame(loop);
})();
