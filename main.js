
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
  const difficultyOverlay = document.getElementById("difficultyOverlay");
  const loadingHint = document.getElementById("loadingHint");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND = 610;

  const difficultyConfigs = {
    easy: {
      label:"EASY",
      hp:8,
      enemySpeed:0.82,
      spawnScale:1.25,
      specialGain:20,
      invuln:1550
    },
    normal: {
      label:"NORMAL",
      hp:5,
      enemySpeed:1.0,
      spawnScale:1.0,
      specialGain:14,
      invuln:1250
    },
    hard: {
      label:"HARD",
      hp:3,
      enemySpeed:1.22,
      spawnScale:0.78,
      specialGain:10,
      invuln:900
    }
  };

  // Hit lanes are actual vertical positions on the canvas.
  // Enemies are drawn around these lanes so their visible position matches
  // the kick that can hit them.
  const heightLanes = {
    1: { hitY: 555, baseY: 625 }, // low kick
    2: { hitY: 470, baseY: 610 }, // middle kick
    3: { hitY: 365, baseY: 520 }, // high kick
    4: { hitY: 265, baseY: 350 }, // normal jump attack
    5: { hitY: 170, baseY: 255 }  // high jump attack
  };


  const imageFiles = {
    neutral: "neutral.webp",
    midStart: "mid_kick_start.webp",
    midHit: "mid_kick_hit.webp",
    lowStart: "low_kick_start.webp",
    lowHit: "low_kick_hit.webp",
    highStart: "high_kick_start.webp",
    highHit: "high_kick_hit.webp",
    jump: "jump.webp",
    jumpAttackStart: "jump_attack_start.webp",
    jumpAttackHit: "jump_attack_hit.webp",
    landing: "landing.webp",
    specialPickup: "special_pickup.webp",
    specialFire: "special_fire.webp"
  };

  const images = {};
  let imageReadyCount = 0;
  let imageFailedCount = 0;
  const imageTotal = Object.keys(imageFiles).length;

  function loadImage(key, file) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        imageReadyCount++;
        resolve();
      };
      img.onerror = () => {
        imageReadyCount++;
        imageFailedCount++;
        console.warn("Image load failed:", file);
        resolve();
      };
      img.decoding = "async";
      img.src = new URL(file, document.baseURI).href;
      images[key] = img;
    });
  }

  async function loadImagesInPriorityOrder() {
    // The standing sprite is loaded first so the title screen becomes useful quickly.
    await loadImage("neutral", imageFiles.neutral);

    const remaining = Object.entries(imageFiles).filter(([key]) => key !== "neutral");

    // Load two at a time to avoid overwhelming slower GitHub Pages/mobile connections.
    for (let i = 0; i < remaining.length; i += 2) {
      await Promise.all(
        remaining.slice(i, i + 2).map(([key, file]) => loadImage(key, file))
      );
    }
  }

  loadImagesInPriorityOrder();

  const input = {
    up:false,down:false,left:false,right:false,
    jump:false,attack:false,special:false
  };

  let state;

  function resetGame(difficultyName = state?.difficultyName || "normal") {
    const config = difficultyConfigs[difficultyName];

    state = {
      running:true,
      started:true,
      difficultyName,
      difficulty:config,
      score:0,
      hp:config.hp,
      special:0,
      elapsed:0,
      spawnTimer:900,
      facing:1,
      enemies:[],
      particles:[],
      player:{
        x:W/2,y:GROUND,vy:0,grounded:true,
        action:"neutral",actionTimer:0,hitDone:false,attackSerial:0,
        invuln:0,specialTimer:0
      }
    };

    overlay.classList.add("hidden");
    difficultyOverlay.classList.add("hidden");
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

  document.querySelectorAll("[data-difficulty]").forEach(button => {
    button.addEventListener("click", () => {
      resetGame(button.dataset.difficulty);
    });
  });

  restartBtn.addEventListener("click", () => resetGame(state?.difficultyName || "normal"));

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
        p.attackSerial++;
      } else if (p.action === "neutral") {
        p.action = input.up ? "high" : input.down ? "low" : "mid";
        p.actionTimer = 0;
        p.hitDone = false;
        p.attackSerial++;
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
    if (r < .31) {
      enemy = {
        type:"zombieDog",
        height:1,
        speed:125,
        score:130
      };
    } else if (r < .62) {
      enemy = {
        type:"floatingSkull",
        height:2,
        speed:100,
        score:150
      };
    } else if (r < .85) {
      enemy = {
        type:"zombieCrow",
        height:3,
        speed:112,
        score:180
      };
    } else {
      const height = Math.random() < .35 ? 5 : 4;
      enemy = {
        type:"demon",
        height,
        speed:108,
        score:220
      };
    }

    enemy.speed *= state.difficulty.enemySpeed;
    const lane = heightLanes[enemy.height];

    state.enemies.push({
      ...enemy,
      side,
      x:side<0?-90:W+90,
      y:lane.baseY,
      hitY:lane.hitY,
      dead:false,
      lastHitSerial:-1
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

  function currentAttackY() {
    const p = state.player;
    const height = currentAttackHeight();

    if (height === 4 || height === 5) {
      // Air attack height follows the player, but snaps near the intended lane.
      const laneY = heightLanes[height].hitY;
      const playerKickY = p.y - 185;
      return (laneY + playerKickY) / 2;
    }

    return heightLanes[height]?.hitY ?? GROUND;
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
    if (!isAttackActive()) return;

    const height = currentAttackHeight();
    const attackY = currentAttackY();
    const horizontalRange = p.action === "jumpAttack" ? 335 : 285;
    const verticalTolerance = p.action === "jumpAttack" ? 85 : 70;
    let hitsThisFrame = 0;

    for (const e of state.enemies) {
      if (e.dead || e.side !== state.facing || e.lastHitSerial === p.attackSerial) continue;

      const horizontalMatch = Math.abs(e.x - p.x) <= horizontalRange;
      const verticalMatch = Math.abs(e.hitY - attackY) <= verticalTolerance;

      if (horizontalMatch && verticalMatch) {
        e.lastHitSerial = p.attackSerial;
        defeatEnemy(e);
        hitsThisFrame++;

        const maxHits = p.action === "jumpAttack" ? 4 : 2;
        if (hitsThisFrame >= maxHits) break;
      }
    }
  }

  function defeatEnemy(enemy, grantSpecial = true) {
    if (enemy.dead) return;
    enemy.dead = true;
    state.score += enemy.score;

    if (grantSpecial) {
      state.special = Math.min(
        100,
        state.special + state.difficulty.specialGain
      );
    }

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
          if (!e.dead) defeatEnemy(e, false);
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
      const sameSideNearEdge = state.enemies.some(e =>
        !e.dead && e.side === state.enemies[state.enemies.length-1]?.side &&
        (e.side < 0 ? e.x < 170 : e.x > W-170)
      );
      state.spawnTimer = (
        (sameSideNearEdge ? 850 : Math.max(560,1250-state.elapsed*.012))
        + Math.random()*420
      ) * state.difficulty.spawnScale;
    }

    for (const e of state.enemies) {
      if (e.dead) continue;
      e.x += -e.side * e.speed * dt / 1000;

      if (Math.abs(e.x-p.x) < 54) {
        if (p.specialTimer > 0) {
          defeatEnemy(e, false);
        } else if (p.invuln <= 0) {
          p.invuln = state.difficulty.invuln;
          state.hp -= 1;
          e.dead = true;
          for (const other of state.enemies) {
            if (!other.dead && Math.abs(other.x - p.x) < 120) {
              other.x += other.side * 85;
            }
          }
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

    // Very subtle height guides help verify that attacks and enemies align.
    ctx.save();
    ctx.setLineDash([8,14]);
    ctx.lineWidth = 1;
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "left";
    for (const [height, lane] of Object.entries(heightLanes)) {
      ctx.strokeStyle = "rgba(255,255,255,.055)";
      ctx.beginPath();
      ctx.moveTo(0,lane.hitY);
      ctx.lineTo(W,lane.hitY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x,e.y);
    ctx.scale(e.side,1);

    if (e.type === "zombieDog") {
      // Low target: compact dog body at ankle height.
      ctx.fillStyle = "#4f774f";
      ctx.beginPath();
      ctx.ellipse(0,-28,52,24,0,0,Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(42,-38,24,0,Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "#263c28";
      ctx.beginPath();
      ctx.moveTo(35,-56);
      ctx.lineTo(48,-78);
      ctx.lineTo(55,-50);
      ctx.fill();

      ctx.strokeStyle = "#263c28";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(-28,-12); ctx.lineTo(-34,8);
      ctx.moveTo(15,-10); ctx.lineTo(20,8);
      ctx.stroke();

      ctx.fillStyle = "#d7ff62";
      ctx.fillRect(48,-43,7,7);

    } else if (e.type === "floatingSkull") {
      // Mid target: only the skull itself floats at the hit lane.
      ctx.fillStyle = "#e8e2d0";
      ctx.strokeStyle = "#736f66";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0,-92,42,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#2a2525";
      ctx.beginPath();
      ctx.arc(-15,-100,10,0,Math.PI*2);
      ctx.arc(15,-100,10,0,Math.PI*2);
      ctx.fill();

      ctx.fillRect(-15,-70,30,18);
      ctx.fillStyle = "#e8e2d0";
      for(let i=-10;i<=10;i+=10){
        ctx.fillRect(i,-70,5,18);
      }

    } else if (e.type === "zombieCrow") {
      // High target: flying crow, centered on the upper kick lane.
      ctx.fillStyle = "#25252b";
      ctx.beginPath();
      ctx.ellipse(0,-68,38,24,0,0,Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-15,-72);
      ctx.lineTo(-72,-112);
      ctx.lineTo(-48,-54);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(15,-72);
      ctx.lineTo(72,-112);
      ctx.lineTo(48,-54);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(30,-72);
      ctx.lineTo(70,-60);
      ctx.lineTo(32,-52);
      ctx.fill();

      ctx.fillStyle = "#a8ff54";
      ctx.fillRect(18,-77,7,7);

    } else {
      // Highest lanes unchanged: flying demon.
      ctx.fillStyle="#7e2c2c";
      ctx.beginPath();
      ctx.arc(0,-42,32,0,Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-25,-50);
      ctx.lineTo(-76,-92);
      ctx.lineTo(-55,-25);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(25,-50);
      ctx.lineTo(76,-92);
      ctx.lineTo(55,-25);
      ctx.fill();

      ctx.fillStyle="#ffdc5c";
      ctx.fillRect(-16,-48,8,8);
      ctx.fillRect(8,-48,8,8);
    }

    ctx.fillStyle="#fff";
    ctx.font="700 18px sans-serif";
    ctx.textAlign="center";
    ctx.fillText(String(e.height),0,e.type==="demon"?12:24);
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

    if (loadingHint) {
      if (imageReadyCount < imageTotal) {
        loadingHint.textContent = `画像をバックグラウンドで読み込み中 ${imageReadyCount}/${imageTotal}`;
      } else if (imageFailedCount > 0) {
        loadingHint.textContent = `一部画像を読み込めませんが、そのまま遊べます`;
      } else {
        loadingHint.textContent = "準備完了";
      }
    }

    if (state?.started && imageFailedCount > 0) {
      setStatus(`画像${imageFailedCount}件は代替表示になります`);
    } else {
      setStatus("");
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(34,now-last);
    last = now;

    try {
      if (state?.started) update(dt);
      draw();
    } catch (error) {
      console.error(error);
      setStatus("実行エラー。ページを再読み込みしてください。");
    }

    requestAnimationFrame(loop);
  }

  state = {
    running:false,
    started:false,
    difficultyName:"normal",
    difficulty:difficultyConfigs.normal,
    score:0,
    hp:5,
    special:0,
    elapsed:0,
    enemies:[],
    particles:[],
    facing:1,
    player:{
      x:W/2,y:GROUND,vy:0,grounded:true,
      action:"neutral",actionTimer:0,hitDone:false,attackSerial:0,
      invuln:0,specialTimer:0
    }
  };
  updateHud();
  requestAnimationFrame(loop);
})();
