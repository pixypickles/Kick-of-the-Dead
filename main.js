
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hpEl = document.getElementById("hp");
  const scoreEl = document.getElementById("score");
  const specialText = document.getElementById("specialText");
  const specialFill = document.getElementById("specialFill");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const restartBtn = document.getElementById("restart");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 612;

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
  let loaded = 0;
  const total = Object.keys(imageFiles).length;

  for (const [key, file] of Object.entries(imageFiles)) {
    const img = new Image();
    img.src = `assets/player/concept/${file}`;
    img.onload = () => loaded++;
    img.onerror = () => loaded++;
    images[key] = img;
  }

  const input = {
    up: false, down: false, left: false, right: false,
    jump: false, attack: false, special: false
  };

  let state;

  function resetGame() {
    state = {
      running: true,
      time: 0,
      score: 0,
      hp: 5,
      special: 0,
      spawnTimer: 700,
      facing: 1,
      enemies: [],
      particles: [],
      player: {
        x: W / 2,
        y: GROUND_Y,
        vy: 0,
        grounded: true,
        action: "neutral",
        actionTimer: 0,
        hitDone: false,
        invuln: 0,
        specialTimer: 0
      }
    };
    overlay.classList.add("hidden");
    updateHUD();
  }

  function updateHUD() {
    hpEl.textContent = state.hp;
    scoreEl.textContent = state.score;
    const pct = Math.floor(state.special);
    specialText.textContent = `${pct}%`;
    specialFill.style.width = `${pct}%`;
  }

  const keys = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    z: "jump", Z: "jump", x: "attack", X: "attack", " ": "special"
  };

  window.addEventListener("keydown", (e) => {
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    if (!input[k]) onPress(k);
    input[k] = true;
  });

  window.addEventListener("keyup", (e) => {
    const k = keys[e.key];
    if (!k) return;
    input[k] = false;
  });

  document.querySelectorAll("[data-input]").forEach(btn => {
    const key = btn.dataset.input;
    const down = (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      if (!input[key]) onPress(key);
      input[key] = true;
      btn.classList.add("active");
    };
    const up = (e) => {
      e.preventDefault();
      input[key] = false;
      btn.classList.remove("active");
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
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
    }

    if (key === "special" && state.special >= 100 && p.specialTimer <= 0) {
      p.action = "special";
      p.actionTimer = 0;
      p.specialTimer = 5200;
      state.special = 0;
      burst(W / 2, H / 2, 24);
      updateHUD();
    }
  }

  function spawnEnemy() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const roll = Math.random();
    let type, height, speed, y, hp, score;
    if (roll < 0.34) {
      type = "zombie"; height = 2; speed = 90; y = GROUND_Y; hp = 1; score = 100;
    } else if (roll < 0.62) {
      type = "skeleton"; height = Math.random() < 0.5 ? 1 : 3; speed = 105; y = GROUND_Y; hp = 1; score = 150;
    } else if (roll < 0.84) {
      type = "crawler"; height = 1; speed = 125; y = GROUND_Y + 22; hp = 1; score = 175;
    } else {
      type = "demon"; height = Math.random() < 0.35 ? 5 : 4; speed = 110; y = height === 5 ? 238 : 330; hp = 1; score = 220;
    }
    state.enemies.push({
      side, x: side < 0 ? -80 : W + 80, y, type, height, speed, hp, score,
      flash: 0, dead: false
    });
  }

  function attackHeight() {
    const a = state.player.action;
    if (a === "low") return 1;
    if (a === "mid") return 2;
    if (a === "high") return 3;
    if (a === "jumpAttack") return state.player.y < 360 ? 5 : 4;
    return 0;
  }

  function attackActive() {
    const p = state.player;
    if (["low","mid","high"].includes(p.action)) return p.actionTimer > 115 && p.actionTimer < 250;
    if (p.action === "jumpAttack") return p.actionTimer > 90 && p.actionTimer < 310;
    return false;
  }

  function checkKickHit() {
    const p = state.player;
    if (!attackActive() || p.hitDone) return;
    p.hitDone = true;
    const height = attackHeight();
    const range = p.action === "jumpAttack" ? 260 : 225;

    for (const e of state.enemies) {
      if (e.dead || e.side !== state.facing) continue;
      const dx = Math.abs(e.x - p.x);
      const valid = e.height === height || (e.type === "zombie" && [2,3].includes(height));
      if (dx <= range && valid) {
        killEnemy(e);
        break;
      }
    }
  }

  function killEnemy(e) {
    e.dead = true;
    state.score += e.score;
    state.special = Math.min(100, state.special + 14);
    burst(e.x, e.y - 60, 10);
    updateHUD();
  }

  function burst(x, y, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x, y, vx: (Math.random() - .5) * 420, vy: -Math.random() * 360,
        life: 500 + Math.random() * 500, size: 2 + Math.random() * 5
      });
    }
  }

  function update(dt) {
    if (!state.running) return;
    state.time += dt;
    const p = state.player;
    p.actionTimer += dt;
    p.invuln = Math.max(0, p.invuln - dt);

    if (!p.grounded) {
      p.vy += 2150 * dt / 1000;
      p.y += p.vy * dt / 1000;
      if (p.y >= GROUND_Y) {
        p.y = GROUND_Y;
        p.vy = 0;
        p.grounded = true;
        p.action = p.action === "special" ? "special" : "landing";
        p.actionTimer = 0;
      }
    }

    if (["low","mid","high"].includes(p.action) && p.actionTimer > 390) {
      p.action = "neutral"; p.actionTimer = 0;
    }
    if (p.action === "jumpAttack" && p.grounded) {
      p.action = "landing"; p.actionTimer = 0;
    }
    if (p.action === "landing" && p.actionTimer > 170) {
      p.action = "neutral"; p.actionTimer = 0;
    }

    if (p.specialTimer > 0) {
      p.specialTimer -= dt;
      p.action = "special";
      if (p.actionTimer > 450) {
        for (const e of state.enemies) {
          if (!e.dead) killEnemy(e);
        }
        if (Math.random() < .35) burst(W/2 + state.facing*260, 360, 2);
      }
      if (p.specialTimer <= 0) {
        p.action = "neutral";
        p.actionTimer = 0;
      }
    }

    checkKickHit();

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(320, 1150 - state.time * .015) + Math.random() * 420;
    }

    for (const e of state.enemies) {
      if (e.dead) continue;
      e.x += -e.side * e.speed * dt / 1000;
      e.flash = Math.max(0, e.flash - dt);
      if (Math.abs(e.x - p.x) < 74) {
        if (p.specialTimer > 0) {
          killEnemy(e);
        } else if (p.invuln <= 0) {
          p.invuln = 900;
          state.hp -= 1;
          e.dead = true;
          burst(p.x, p.y - 120, 14);
          updateHUD();
          if (state.hp <= 0) endGame();
        }
      }
    }

    state.enemies = state.enemies.filter(e => !e.dead && e.x > -160 && e.x < W + 160);

    for (const q of state.particles) {
      q.life -= dt;
      q.vy += 700 * dt / 1000;
      q.x += q.vx * dt / 1000;
      q.y += q.vy * dt / 1000;
    }
    state.particles = state.particles.filter(q => q.life > 0);
  }

  function endGame() {
    state.running = false;
    overlayText.textContent = `SCORE ${state.score}`;
    overlay.classList.remove("hidden");
  }

  function currentPlayerImage() {
    const p = state.player;
    if (p.action === "special") return p.actionTimer < 450 ? images.specialPickup : images.specialFire;
    if (p.action === "jump") return images.jump;
    if (p.action === "jumpAttack") return p.actionTimer < 120 ? images.jumpAttackStart : images.jumpAttackHit;
    if (p.action === "landing") return images.landing;
    if (p.action === "low") return p.actionTimer < 120 || p.actionTimer > 260 ? images.lowStart : images.lowHit;
    if (p.action === "mid") return p.actionTimer < 110 || p.actionTimer > 255 ? images.midStart : images.midHit;
    if (p.action === "high") return p.actionTimer < 135 || p.actionTimer > 285 ? images.highStart : images.highHit;
    return images.neutral;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#c8c0b2");
    g.addColorStop(.62, "#ddd4c5");
    g.addColorStop(.63, "#554c43");
    g.addColorStop(1, "#2d2926");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    ctx.fillStyle = "rgba(30,30,30,.22)";
    for (let i=0;i<9;i++) {
      const x = i*170 - (state.time*.02 % 170);
      ctx.fillRect(x, 120 + (i%2)*35, 110, 250);
    }
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(0, GROUND_Y+12, W, H-GROUND_Y);
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.side, 1);

    if (e.type === "zombie") {
      ctx.fillStyle = "#547a54";
      ctx.fillRect(-32,-115,64,92);
      ctx.beginPath(); ctx.arc(0,-145,34,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#294429"; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(-22,-80); ctx.lineTo(-58,-35); ctx.moveTo(22,-80); ctx.lineTo(58,-22); ctx.stroke();
    } else if (e.type === "skeleton") {
      ctx.strokeStyle = "#e7e2cf"; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.arc(0,-142,27,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-112); ctx.lineTo(0,-42); ctx.moveTo(-35,-90); ctx.lineTo(35,-90); ctx.moveTo(0,-42); ctx.lineTo(-28,0); ctx.moveTo(0,-42); ctx.lineTo(28,0); ctx.stroke();
      ctx.fillStyle = "#5f6672";
      ctx.beginPath(); ctx.arc(30,-83,34,0,Math.PI*2); ctx.fill();
    } else if (e.type === "crawler") {
      ctx.fillStyle = "#6d5a82";
      ctx.fillRect(-48,-45,96,42);
      ctx.beginPath(); ctx.arc(38,-66,27,0,Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = "#7b2c2c";
      ctx.beginPath(); ctx.arc(0,-42,32,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-25,-50); ctx.lineTo(-75,-92); ctx.lineTo(-55,-25); ctx.fill();
      ctx.beginPath(); ctx.moveTo(25,-50); ctx.lineTo(75,-92); ctx.lineTo(55,-25); ctx.fill();
      ctx.fillStyle = "#ffda55";
      ctx.fillRect(-16,-48,8,8); ctx.fillRect(8,-48,8,8);
    }

    ctx.fillStyle = "#fff";
    ctx.font = "700 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(e.height), 0, 28);
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const img = currentPlayerImage();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(state.facing, 1);

    const blink = p.invuln > 0 && Math.floor(p.invuln / 80) % 2 === 0;
    ctx.globalAlpha = blink ? .35 : 1;

    const h = p.action === "special" ? 430 : 390;
    const w = h;
    if (img && img.complete) {
      ctx.drawImage(img, -w/2, -h + 40, w, h);
    } else {
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(-45,-180,90,160);
    }
    ctx.restore();
  }

  function draw() {
    drawBackground();

    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();

    ctx.fillStyle = "rgba(255,190,50,.9)";
    for (const q of state.particles) {
      ctx.fillRect(q.x, q.y, q.size, q.size);
    }

    if (state.player.specialTimer > 0 && state.player.actionTimer > 450) {
      ctx.save();
      ctx.globalAlpha = .45 + Math.random()*.25;
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.fillStyle = "#2a0000";
      ctx.font = "900 54px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MACHINE GUN MASTER!", W/2, 90);
    }

    if (loaded < total) {
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "#fff";
      ctx.font = "700 36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`LOADING ${loaded}/${total}`, W/2, H/2);
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(34, now - last);
    last = now;
    if (loaded >= total) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resetGame();
  requestAnimationFrame(loop);
})();
