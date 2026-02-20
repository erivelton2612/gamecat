(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    start: document.getElementById("startScreen"),
    gameOver: document.getElementById("gameOverScreen"),
    win: document.getElementById("winScreen"),
    playBtn: document.getElementById("playBtn"),
    retryBtn: document.getElementById("retryBtn"),
    restartBtn: document.getElementById("restartBtn"),
    hearts: document.getElementById("hearts"),
    phaseLabel: document.getElementById("phaseLabel"),
    bossBarWrap: document.getElementById("bossBarWrap"),
    bossBarFill: document.getElementById("bossBarFill"),
  };

  // Sistema simples de input (WASD)
  const input = {
    left: false,
    right: false,
    jump: false,
    crouch: false,
    jumpPressed: false,
  };

  const WORLD_FLOOR = 460;
  const PLAYER_STAND_H = 56;
  const PLAYER_CROUCH_H = 36;

  class Platform {
    constructor(x, y, w, h, style = "grass") {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.style = style;
    }

    draw(ctx, camX) {
      const sx = this.x - camX;
      const gradient = ctx.createLinearGradient(sx, this.y, sx, this.y + this.h);
      if (this.style === "water") {
        gradient.addColorStop(0, "#8ee8ff");
        gradient.addColorStop(1, "#3cbdd8");
      } else if (this.style === "space") {
        gradient.addColorStop(0, "#cbcbff");
        gradient.addColorStop(1, "#9ca3d6");
      } else {
        gradient.addColorStop(0, "#a8ec9f");
        gradient.addColorStop(1, "#72cb72");
      }
      roundRect(ctx, sx, this.y, this.w, this.h, 12, gradient);
      ctx.strokeStyle = "#ffffffcc";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  class Hazard {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }

    draw(ctx, camX, theme) {
      const sx = this.x - camX;
      const color = theme === "space" ? "#f7b8ff" : theme === "water" ? "#8be8ff" : "#ffd07a";
      roundRect(ctx, sx, this.y, this.w, this.h, 10, color);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
  }

  class Particle {
    constructor(x, y, vx, vy, life, color, radius = 4) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.color = color;
      this.radius = radius;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 250 * dt;
      this.life -= dt;
    }

    draw(ctx, camX) {
      if (this.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x - camX, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Player {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 44;
      this.h = PLAYER_STAND_H;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.lives = 3;
      this.invTimer = 0;
      this.facing = 1;
      this.poseTick = 0;
      this.state = "idle";
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.h = PLAYER_STAND_H;
      this.onGround = false;
      this.invTimer = 0;
      this.state = "idle";
    }

    update(dt, level) {
      this.poseTick += dt;
      this.invTimer = Math.max(0, this.invTimer - dt);

      const accel = 980;
      const maxSpeed = 240;
      const friction = this.onGround ? 1300 : 460;

      if (input.left) {
        this.vx -= accel * dt;
        this.facing = -1;
      }
      if (input.right) {
        this.vx += accel * dt;
        this.facing = 1;
      }
      if (!input.left && !input.right) {
        const drag = Math.min(Math.abs(this.vx), friction * dt);
        this.vx -= Math.sign(this.vx) * drag;
      }

      this.vx = clamp(this.vx, -maxSpeed, maxSpeed);

      const targetH = input.crouch && this.onGround ? PLAYER_CROUCH_H : PLAYER_STAND_H;
      if (targetH !== this.h) {
        const oldBottom = this.y + this.h;
        this.h = targetH;
        this.y = oldBottom - this.h;
      }

      if (input.jumpPressed && this.onGround) {
        this.vy = -level.physics.jump;
        this.onGround = false;
      }

      this.vy += level.physics.gravity * dt;
      this.x += this.vx * dt;
      this.resolveHorizontal(level);
      this.y += this.vy * dt;
      this.resolveVertical(level);

      if (this.y > canvas.height + 260) {
        this.takeHit();
        this.reset(level.spawn.x, level.spawn.y);
      }

      if (!this.onGround) this.state = "jump";
      else if (input.crouch) this.state = "crouch";
      else if (Math.abs(this.vx) > 24) this.state = "walk";
      else this.state = "idle";
    }

    resolveHorizontal(level) {
      if (this.x < 0) this.x = 0;
      const maxX = level.length - this.w;
      if (this.x > maxX) this.x = maxX;

      for (const p of level.platforms) {
        if (!aabb(this, p)) continue;
        if (this.vx > 0) this.x = p.x - this.w;
        else if (this.vx < 0) this.x = p.x + p.w;
        this.vx = 0;
      }
    }

    resolveVertical(level) {
      this.onGround = false;
      if (this.y + this.h >= WORLD_FLOOR) {
        this.y = WORLD_FLOOR - this.h;
        this.vy = 0;
        this.onGround = true;
      }

      for (const p of level.platforms) {
        if (!aabb(this, p)) continue;
        const prevBottom = this.y + this.h - this.vy * game.dt;
        const prevTop = this.y - this.vy * game.dt;
        if (this.vy >= 0 && prevBottom <= p.y + 6) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
        } else if (this.vy < 0 && prevTop >= p.y + p.h - 6) {
          this.y = p.y + p.h;
          this.vy = 0;
        }
      }
    }

    takeHit() {
      if (this.invTimer > 0) return;
      this.lives -= 1;
      this.invTimer = 1.2;
    }

    draw(ctx, camX) {
      const x = this.x - camX;
      const y = this.y;
      const bob = this.state === "walk" ? Math.sin(this.poseTick * 20) * 1.5 : 0;

      if (this.invTimer > 0 && Math.floor(this.invTimer * 10) % 2 === 0) return;

      ctx.save();
      ctx.translate(x + this.w / 2, y + this.h / 2 + bob);
      ctx.scale(this.facing, 1);

      // Corpo fofinho
      roundRect(ctx, -16, -12, 32, this.state === "crouch" ? 20 : 26, 12, "#ffd8a8");
      ctx.fillStyle = "#ffefc9";
      ctx.beginPath();
      ctx.ellipse(0, 2, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cabeça
      ctx.fillStyle = "#ffe5bf";
      ctx.beginPath();
      ctx.arc(0, -22, 14, 0, Math.PI * 2);
      ctx.fill();

      // Orelhas
      ctx.fillStyle = "#ffd1b8";
      triangle(ctx, -10, -30, -3, -41, -1, -28);
      triangle(ctx, 10, -30, 3, -41, 1, -28);

      // Rosto
      ctx.fillStyle = "#3b304f";
      ctx.beginPath();
      ctx.arc(-5, -23, 1.8, 0, Math.PI * 2);
      ctx.arc(5, -23, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b2678a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -18, 3.5, 0.1, Math.PI - 0.1);
      ctx.stroke();

      // Patinhas (animação simples)
      const step = this.state === "walk" ? Math.sin(this.poseTick * 16) * 3 : 0;
      ctx.fillStyle = "#ffc58d";
      ctx.fillRect(-12, 9 + step, 7, 8);
      ctx.fillRect(5, 9 - step, 7, 8);
      if (this.state === "crouch") {
        ctx.fillRect(-12, 5, 24, 6);
      }

      ctx.restore();
    }
  }

  class Boss {
    constructor(type, x, y) {
      this.type = type;
      this.x = x;
      this.y = y;
      this.w = 86;
      this.h = 72;
      this.vx = 0;
      this.vy = 0;
      this.health = 6;
      this.maxHealth = 6;
      this.timer = 0;
      this.cooldown = 0;
      this.dir = 1;
      this.active = false;
      this.inv = 0;
      this.patternTick = 0;
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    update(dt, level, player, particles, hazards) {
      if (!this.active) return;
      this.timer += dt;
      this.cooldown -= dt;
      this.inv = Math.max(0, this.inv - dt);
      this.patternTick += dt;

      if (this.type === "butterfly") {
        this.y = 190 + Math.sin(this.timer * 2.4) * 60;
        this.x += this.dir * 120 * dt;
        if (this.x > level.length - 90 || this.x < level.length - 330) this.dir *= -1;
        if (this.cooldown <= 0) {
          this.cooldown = 1;
          for (let i = 0; i < 5; i++) {
            particles.push(new Particle(this.x + 30, this.y + 40, -90 - i * 20, 15 + i * 12, 2.6, "#fff29d", 5));
          }
        }
      }

      if (this.type === "seahorse") {
        if (this.cooldown <= 0) {
          this.cooldown = 1.7;
          this.vx = -this.dir * 280;
          this.dir *= -1;
          for (let i = 0; i < 4; i++) {
            particles.push(new Particle(this.x + 20, WORLD_FLOOR - 15, -40 + i * 35, -220 - i * 30, 2, "#b7f1ff", 7));
          }
        }
        this.x += this.vx * dt;
        this.vx *= 0.96;
        this.y = 250 + Math.sin(this.timer * 3) * 18;
      }

      if (this.type === "moon") {
        this.x = level.length - 220 + Math.sin(this.timer * 1.2) * 60;
        this.y = 130 + Math.sin(this.timer * 1.8) * 35;
        if (this.cooldown <= 0) {
          this.cooldown = 1.35;
          const beamX = player.x + (Math.random() * 180 - 90);
          hazards.push(new Hazard(beamX, WORLD_FLOOR - 70, 26, 70));
          particles.push(new Particle(this.x + 35, this.y + 55, -180, 120, 1.6, "#ffd1ff", 8));
          particles.push(new Particle(this.x + 45, this.y + 52, -140, 160, 1.6, "#ffe69c", 7));
        }
      }

      // Colisão com jogador: pulo por cima derrota chefe
      if (aabb(player, this.rect)) {
        const playerBottom = player.y + player.h;
        if (player.vy > 0 && playerBottom - this.y < 24 && this.inv <= 0) {
          this.health -= 1;
          this.inv = 0.35;
          player.vy = -320;
        } else {
          player.takeHit();
          player.vx = -player.facing * 180;
        }
      }
    }

    draw(ctx, camX) {
      if (!this.active) return;
      const x = this.x - camX;
      const y = this.y;
      if (this.inv > 0 && Math.floor(this.inv * 20) % 2 === 0) return;

      if (this.type === "butterfly") {
        ctx.fillStyle = "#ff9ac8";
        ellipse(ctx, x + 20, y + 35, 24, 18);
        ellipse(ctx, x + 64, y + 35, 24, 18);
        ctx.fillStyle = "#b978ff";
        ellipse(ctx, x + 20, y + 55, 20, 16);
        ellipse(ctx, x + 64, y + 55, 20, 16);
        roundRect(ctx, x + 35, y + 28, 14, 36, 8, "#ffe1a5");
      } else if (this.type === "seahorse") {
        roundRect(ctx, x + 18, y + 14, 42, 54, 20, "#ffa6d2");
        ellipse(ctx, x + 38, y + 16, 24, 18, "#ffcde8");
        ctx.fillStyle = "#ff7fb9";
        ctx.beginPath();
        ctx.arc(x + 64, y + 54, 14, -1.2, 1.6);
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#ff7fb9";
        ctx.stroke();
      } else {
        ellipse(ctx, x + 45, y + 40, 42, 36, "#f9f2b8");
        ctx.fillStyle = "#5d5674";
        ctx.beginPath();
        ctx.arc(x + 34, y + 32, 3, 0, Math.PI * 2);
        ctx.arc(x + 56, y + 32, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8b7e96";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 45, y + 42, 9, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }

      // brilho no chefe
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x + 34, y + 20, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function makeLevel(index) {
    const phases = [
      {
        name: "1 - Jardim",
        theme: "garden",
        length: 3000,
        spawn: { x: 80, y: WORLD_FLOOR - PLAYER_STAND_H },
        physics: { gravity: 1050, jump: 460 },
        bossType: "butterfly",
      },
      {
        name: "2 - Água",
        theme: "water",
        length: 3200,
        spawn: { x: 80, y: WORLD_FLOOR - PLAYER_STAND_H },
        physics: { gravity: 760, jump: 390 },
        bossType: "seahorse",
      },
      {
        name: "3 - Espaço",
        theme: "space",
        length: 3400,
        spawn: { x: 80, y: WORLD_FLOOR - PLAYER_STAND_H },
        physics: { gravity: 560, jump: 450 },
        bossType: "moon",
      },
    ];

    const base = phases[index];
    const platforms = [
      new Platform(300, 390, 200, 26, base.theme),
      new Platform(620, 340, 190, 26, base.theme),
      new Platform(980, 300, 180, 26, base.theme),
      new Platform(1280, 360, 210, 26, base.theme),
      new Platform(1610, 320, 170, 26, base.theme),
      new Platform(1920, 270, 180, 26, base.theme),
      new Platform(2250, 350, 210, 26, base.theme),
      new Platform(2600, 300, 150, 26, base.theme),
    ];

    const hazards = [
      new Hazard(520, WORLD_FLOOR - 20, 70, 20),
      new Hazard(1450, WORLD_FLOOR - 20, 80, 20),
      new Hazard(2090, WORLD_FLOOR - 20, 80, 20),
    ];

    const boss = new Boss(base.bossType, base.length - 170, 200);
    return { ...base, platforms, hazards, boss };
  }

  const game = {
    state: "start",
    levels: [0, 1, 2].map((i) => makeLevel(i)),
    levelIndex: 0,
    player: null,
    camX: 0,
    particles: [],
    dt: 1 / 60,
    transitionTimer: 0,

    get level() {
      return this.levels[this.levelIndex];
    },

    startNew() {
      this.levelIndex = 0;
      this.levels = [0, 1, 2].map((i) => makeLevel(i));
      this.player = new Player(this.level.spawn.x, this.level.spawn.y);
      this.camX = 0;
      this.state = "playing";
      this.particles = [];
      this.transitionTimer = 0;
      hideAllOverlays();
      updateHud();
    },

    nextLevel() {
      this.levelIndex += 1;
      if (this.levelIndex >= this.levels.length) {
        this.state = "win";
        ui.win.classList.add("active");
        return;
      }
      this.player.reset(this.level.spawn.x, this.level.spawn.y);
      this.camX = 0;
      this.particles = [];
      this.transitionTimer = 0.8;
      updateHud();
    },

    update(dt) {
      this.dt = dt;
      if (this.state !== "playing") return;

      const level = this.level;
      this.player.update(dt, level);

      for (const hz of level.hazards) {
        if (aabb(this.player, hz)) this.player.takeHit();
      }

      const nearBoss = this.player.x > level.length - 650;
      if (nearBoss) level.boss.active = true;

      level.boss.update(dt, level, this.player, this.particles, level.hazards);

      for (const p of this.particles) p.update(dt);
      this.particles = this.particles.filter((p) => p.life > 0);

      // partículas ofensivas do chefe também causam dano
      for (const p of this.particles) {
        if (Math.abs(this.player.x - p.x) < this.player.w * 0.6 && Math.abs(this.player.y + this.player.h * 0.5 - p.y) < this.player.h * 0.6) {
          this.player.takeHit();
          p.life = 0;
        }
      }

      if (this.player.lives <= 0) {
        this.state = "gameover";
        ui.gameOver.classList.add("active");
      }

      if (level.boss.active && level.boss.health <= 0) {
        this.nextLevel();
      }

      this.camX = clamp(this.player.x - canvas.width * 0.4, 0, level.length - canvas.width);
      updateHud();

      input.jumpPressed = false;
    },

    draw() {
      const level = this.level;
      drawBackground(ctx, level, this.camX);

      // chão
      const floorColor = level.theme === "space" ? "#7278b5" : level.theme === "water" ? "#56b8d2" : "#7edc7c";
      roundRect(ctx, -this.camX, WORLD_FLOOR, level.length, canvas.height - WORLD_FLOOR + 100, 16, floorColor);

      for (const p of level.platforms) p.draw(ctx, this.camX);
      for (const hz of level.hazards) hz.draw(ctx, this.camX, level.theme);
      for (const p of this.particles) p.draw(ctx, this.camX);
      level.boss.draw(ctx, this.camX);
      this.player?.draw(ctx, this.camX);

      if (this.transitionTimer > 0) {
        this.transitionTimer -= this.dt;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, this.transitionTimer)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
  };

  function updateHud() {
    if (!game.player) return;
    ui.phaseLabel.textContent = game.level.name;
    ui.hearts.textContent = "❤️".repeat(Math.max(0, game.player.lives)) + "🤍".repeat(3 - Math.max(0, game.player.lives));
    const showBoss = game.level.boss.active && game.level.boss.health > 0 && game.state === "playing";
    ui.bossBarWrap.classList.toggle("hidden", !showBoss);
    ui.bossBarFill.style.width = `${(Math.max(0, game.level.boss.health) / game.level.boss.maxHealth) * 100}%`;
  }

  function hideAllOverlays() {
    ui.start.classList.remove("active");
    ui.gameOver.classList.remove("active");
    ui.win.classList.remove("active");
  }

  function drawBackground(ctx, level, camX) {
    if (level.theme === "garden") {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#b7efff");
      g.addColorStop(1, "#ecfbff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 16; i++) {
        const x = (i * 220 - camX * 0.45) % (canvas.width + 220);
        drawTree(ctx, x - 80, 300 + (i % 2) * 20);
      }

      for (let i = 0; i < 24; i++) {
        const x = (i * 140 - camX * 0.8) % (canvas.width + 60);
        drawFlower(ctx, x, 440 + (i % 3) * 4);
      }
    }

    if (level.theme === "water") {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#96dfff");
      g.addColorStop(1, "#0f6f99");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 35; i++) {
        const x = (i * 120 - camX * 0.55) % (canvas.width + 80);
        const y = 80 + ((i * 70 + performance.now() * 0.02) % 420);
        ctx.strokeStyle = "#e0fbff77";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 8 + (i % 5), 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = 0; i < 12; i++) {
        const x = (i * 240 - camX * 0.35) % (canvas.width + 100);
        drawSeaweed(ctx, x - 40, 420);
      }
    }

    if (level.theme === "space") {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#1f2148");
      g.addColorStop(1, "#44346e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 100; i++) {
        const x = (i * 91 - camX * (0.15 + (i % 3) * 0.07)) % (canvas.width + 20);
        const y = (i * 47) % 350;
        ctx.fillStyle = i % 8 === 0 ? "#ffd8fa" : "#fff";
        ctx.fillRect(x, y, 2, 2);
      }

      ellipse(ctx, 740 - camX * 0.12, 130, 70, 50, "#8fd0ff44");
      ellipse(ctx, 260 - camX * 0.09, 95, 50, 34, "#ffc9f444");
    }
  }

  function drawTree(ctx, x, y) {
    roundRect(ctx, x + 25, y + 80, 22, 80, 10, "#a77d63");
    ellipse(ctx, x + 38, y + 58, 44, 36, "#91dd95");
    ellipse(ctx, x + 8, y + 74, 32, 26, "#7fd684");
    ellipse(ctx, x + 66, y + 78, 30, 24, "#7fd684");
  }

  function drawFlower(ctx, x, y) {
    ctx.strokeStyle = "#66b86a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 20);
    ctx.stroke();
    ctx.fillStyle = "#ffd0e8";
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 6, y - 24 + Math.sin(a) * 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffe377";
    ctx.beginPath();
    ctx.arc(x, y - 24, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSeaweed(ctx, x, y) {
    ctx.strokeStyle = "#7fe08c";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 12, y + 70);
      ctx.quadraticCurveTo(x + i * 12 + Math.sin(performance.now() * 0.002 + i) * 20, y + 30, x + i * 12 + 6, y - 20);
      ctx.stroke();
    }
  }

  function gameLoop(last = performance.now()) {
    const now = performance.now();
    const dt = Math.min(0.032, (now - last) / 1000);
    game.update(dt);
    game.draw();
    requestAnimationFrame(() => gameLoop(now));
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  function ellipse(ctx, x, y, rx, ry, fill = null) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  function triangle(ctx, x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) e.preventDefault();
    if (key === "a") input.left = true;
    if (key === "d") input.right = true;
    if (key === "s") input.crouch = true;
    if (key === "w") {
      if (!input.jump) input.jumpPressed = true;
      input.jump = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key === "a") input.left = false;
    if (key === "d") input.right = false;
    if (key === "s") input.crouch = false;
    if (key === "w") input.jump = false;
  });

  ui.playBtn.addEventListener("click", () => game.startNew());
  ui.retryBtn.addEventListener("click", () => game.startNew());
  ui.restartBtn.addEventListener("click", () => game.startNew());

  gameLoop();
})();
