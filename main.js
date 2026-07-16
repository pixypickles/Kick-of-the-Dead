
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

  // Four attack lanes calibrated to the actual kick artwork.
  // The previous numeric levels were visually too low:
  // middle kick matched the old lane 3, and high kick matched the old lane 4.
  const heightLanes = {
    1: { label:"LOW",  hitY:555, baseY:625 }, // low kick
    2: { label:"MID",  hitY:365, baseY:455 }, // middle kick
    3: { label:"HIGH", hitY:265, baseY:350 }, // high kick
    4: { label:"TOP",  hitY:170, baseY:255 }  // jump attack / highest lane
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
    downKickStart: "down_kick_start.webp",
    downKickHit: "down_kick_hit.webp",
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
    downLeft:false,downRight:false,
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
    q:"downLeft",Q:"downLeft",e:"downRight",E:"downRight",
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

    if (key === "left" || key === "downLeft") state.facing = -1;
    if (key === "right" || key === "downRight") state.facing = 1;

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
        const downwardKickRequested =
          input.down || input.downLeft || input.downRight;

        p.action = downwardKickRequested ? "downKick" : "jumpAttack";
        p.actionTimer = 0;
        p.hitDone = false;
        p.attackSerial++;

        if (p.action === "downKick") {
          // A short tuck before dropping straight down.
          p.vy = Math.max(90, p.vy);
          p.invuln = Math.max(p.invuln, 260);
        }
      } else if (p.action === "neutral") {
        const lowRequested = input.down || input.downLeft || input.downRight;
        p.action = input.up ? "high" : lowRequested ? "low" : "mid";
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
    const difficultyName = state.difficultyName;
    const r = Math.random();

    // EASY has fewer moving-height enemies.
    const yellowChance =
      difficultyName === "easy" ? 0.08 :
      difficultyName === "normal" ? 0.16 : 0.22;

    const redChance =
      difficultyName === "easy" ? 0.025 :
      difficultyName === "normal" ? 0.08 : 0.14;

    let enemy;

    if (r < yellowChance) {
      enemy = {
        type:"skullYellowBounce",
        height:1,
        minHeight:1,
        maxHeight:2,
        speed:96,
        score:210,
        bounceSpeed:0.0042,
        phase:Math.random()*Math.PI*2
      };
    } else if (r < yellowChance + redChance) {
      enemy = {
        type:"skullRedBounce",
        height:1,
        minHeight:1,
        maxHeight:3,
        speed:88,
        score:280,
        bounceSpeed:0.0034,
        phase:Math.random()*Math.PI*2
      };
    } else if (r < 0.39) {
      enemy = {
        type:"skullLow",
        height:1,
        speed:118,
        score:130
      };
    } else if (r < 0.70) {
      enemy = {
        type:"skullMid",
        height:2,
        speed:102,
        score:155
      };
    } else if (r < 0.90) {
      enemy = {
        type:"batHigh",
        height:3,
        speed:112,
        score:185
      };
    } else {
      enemy = {
        type:"batTop",
        height:4,
        speed:108,
        score:230
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
    if (a === "jumpAttack") return 4;
    if (a === "downKick") return 1;
    return 0;
  }

  function currentAttackY() {
    const p = state.player;

    if (p.action === "downKick") {
      // Feet point straight down. The strike point follows the falling character.
      return p.y + 18;
    }

    if (p.action === "jumpAttack") {
      // Map the actual jump height to all four attack lanes.
      // Near the ground the kick can hit LOW; at the high-jump apex it reaches TOP.
      const highestExpectedY = 335;
      const progress = Math.max(
        0,
        Math.min(1, (GROUND - p.y) / (GROUND - highestExpectedY))
      );

      return heightLanes[1].hitY +
        (heightLanes[4].hitY - heightLanes[1].hitY) * progress;
    }

    const height = currentAttackHeight();
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
    if (p.action === "downKick") {
      return p.actionTimer >= 115 && p.actionTimer <= 520;
    }
    return false;
  }

  function tryKickHit() {
    const p = state.player;
    if (!isAttackActive()) return;

    const height = currentAttackHeight();
    const attackY = currentAttackY();
    const horizontalRange =
      p.action === "downKick" ? 105 :
      p.action === "jumpAttack" ? 335 : 285;

    const verticalTolerance =
      p.action === "downKick" ? 125 :
      p.action === "jumpAttack" ? 105 : 72;
    let hitsThisFrame = 0;

    for (const e of state.enemies) {
      const enemyDirection = e.x < p.x ? -1 : 1;
      if (
        e.dead ||
        (p.action !== "downKick" && enemyDirection !== state.facing) ||
        e.lastHitSerial === p.attackSerial
      ) continue;

      const horizontalMatch = Math.abs(e.x - p.x) <= horizontalRange;
      const verticalMatch = Math.abs(e.hitY - attackY) <= verticalTolerance;

      if (horizontalMatch && verticalMatch) {
        e.lastHitSerial = p.attackSerial;
        defeatEnemy(e);
        hitsThisFrame++;

        const maxHits = p.action === "downKick" ? 5 : p.action === "jumpAttack" ? 4 : 2;
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

  function updateEnemyBounce(enemy, dt) {
    if (enemy.type !== "skullYellowBounce" && enemy.type !== "skullRedBounce") return;

    enemy.phase += enemy.bounceSpeed * dt;

    // Smoothly move between the target attack lanes.
    const wave = (Math.sin(enemy.phase) + 1) / 2;
    const minLane = heightLanes[enemy.minHeight];
    const maxLane = heightLanes[enemy.maxHeight];

    enemy.hitY = minLane.hitY + (maxLane.hitY - minLane.hitY) * wave;
    enemy.y = minLane.baseY + (maxLane.baseY - minLane.baseY) * wave;

    // The current vulnerable lane changes at clear thresholds.
    if (enemy.type === "skullYellowBounce") {
      enemy.height = wave < 0.5 ? 1 : 2;
    } else {
      if (wave < 0.34) enemy.height = 1;
      else if (wave < 0.67) enemy.height = 2;
      else enemy.height = 3;
    }
  }

  function update(dt) {
    if (!state.running) return;

    state.elapsed += dt;
    const p = state.player;
    p.actionTimer += dt;
    p.invuln = Math.max(0,p.invuln-dt);

    // Holding left/right (including diagonals) moves the master a short distance.
    // The center zone is intentionally limited so the game remains a two-sided defense game.
    if (p.specialTimer <= 0) {
      const moveLeft = input.left || input.downLeft;
      const moveRight = input.right || input.downRight;
      const moveDirection = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);

      if (moveDirection !== 0) {
        state.facing = moveDirection;
        const moveSpeed = p.grounded ? 115 : 72;
        p.x += moveDirection * moveSpeed * dt / 1000;
        p.x = Math.max(W * 0.32, Math.min(W * 0.68, p.x));
      }
    }

    if (!p.grounded) {
      const gravity = p.action === "downKick" ? 3350 : 2150;

      if (p.action === "downKick" && p.actionTimer < 110) {
        // Brief compact preparation pose.
        p.vy = Math.max(80, p.vy);
      } else if (p.action === "downKick") {
        p.vy = Math.max(760, p.vy);
      }

      p.vy += gravity * dt / 1000;
      p.y += p.vy * dt / 1000;

      if (p.y >= GROUND) {
        p.y = GROUND;
        p.vy = 0;
        p.grounded = true;
        const landedFromDownKick = p.action === "downKick";
        p.action = p.action === "special" ? "special" : "landing";
        p.actionTimer = 0;

        if (landedFromDownKick) {
          burst(p.x, GROUND - 18, 28);

          for (const e of state.enemies) {
            if (!e.dead && Math.abs(e.x - p.x) <= 135) {
              defeatEnemy(e);
            }
          }
        }
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

      updateEnemyBounce(e, dt);
      e.x += -e.side * e.speed * dt / 1000;

      if (Math.abs(e.x-p.x) < 54) {
        if (p.specialTimer > 0) {
          defeatEnemy(e, false);
        } else if (p.action === "downKick" && isAttackActive()) {
          defeatEnemy(e);
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

    const isSkull =
      e.type === "skullLow" ||
      e.type === "skullMid" ||
      e.type === "skullYellowBounce" ||
      e.type === "skullRedBounce";

    const isBat = e.type === "batHigh" || e.type === "batTop";

    if (isSkull) {
      const size =
        e.type === "skullLow" ? 35 :
        e.type === "skullMid" ? 40 : 39;

      const isYellow = e.type === "skullYellowBounce";
      const isRed = e.type === "skullRedBounce";

      ctx.fillStyle =
        isYellow ? "#f1cb42" :
        isRed ? "#bd3a3a" :
        "#e9e3d2";

      ctx.strokeStyle =
        isYellow ? "#7c651e" :
        isRed ? "#641f1f" :
        "#716c63";

      ctx.lineWidth = 6;

      ctx.beginPath();
      ctx.arc(0,-size,size,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#292525";
      ctx.beginPath();
      ctx.arc(-size*.35,-size*1.12,size*.24,0,Math.PI*2);
      ctx.arc(size*.35,-size*1.12,size*.24,0,Math.PI*2);
      ctx.fill();

      ctx.fillRect(-size*.42,-size*.58,size*.84,size*.42);

      ctx.fillStyle =
        isYellow ? "#f1cb42" :
        isRed ? "#bd3a3a" :
        "#e9e3d2";

      for (let i=-2;i<=2;i++) {
        ctx.fillRect(i*size*.16-size*.045,-size*.58,size*.09,size*.42);
      }

      if (e.type === "skullMid") {
        ctx.strokeStyle = "rgba(160,220,255,.45)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0,-size,size+9,0,Math.PI*2);
        ctx.stroke();
      }

      if (isYellow || isRed) {
        ctx.strokeStyle = isYellow
          ? "rgba(255,225,80,.58)"
          : "rgba(255,80,80,.58)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0,-size,size+10,0,Math.PI*2);
        ctx.stroke();
      }

    } else if (isBat) {
      const scale = e.type === "batTop" ? 1.08 : 1;

      ctx.scale(scale,scale);
      ctx.fillStyle = e.type === "batTop" ? "#5b2030" : "#24242b";

      ctx.beginPath();
      ctx.ellipse(0,-45,32,22,0,0,Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-12,-48);
      ctx.lineTo(-68,-88);
      ctx.lineTo(-48,-32);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(12,-48);
      ctx.lineTo(68,-88);
      ctx.lineTo(48,-32);
      ctx.fill();

      ctx.fillStyle = e.type === "batTop" ? "#ffd45c" : "#9cff59";
      ctx.fillRect(-13,-51,7,7);
      ctx.fillRect(6,-51,7,7);
    }

    ctx.fillStyle="#fff";
    ctx.font="700 18px sans-serif";
    ctx.textAlign="center";
    ctx.fillText(String(e.height),0,22);
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
    if (p.action==="downKick") {
      return p.actionTimer<115 ? images.downKickStart : images.downKickHit;
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

    const h =
      p.action === "special" ? 430 :
      p.action === "downKick" ? 360 :
      390;
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
