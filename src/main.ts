const canvasElement = document.querySelector<HTMLCanvasElement>("#game");

if (canvasElement === null) {
  throw new Error("Canvas element not found");
}

const canvas: HTMLCanvasElement = canvasElement;
const context = canvas.getContext("2d");

if (context === null) {
  throw new Error("2D context is unavailable");
}

const ctx: CanvasRenderingContext2D = context;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 196;
const RHINO_X = 110;
const START_SPEED = 420;
const MAX_SPEED = 980;
const GRAVITY = 2200;
const JUMP_VELOCITY = -780;
const CLOUD_SPEED = 24;
const STAR_SPEED = 12;

type InputState = {
  jumpPressed: boolean;
  downHeld: boolean;
};

type RhinoState = {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  onGround: boolean;
  ducking: boolean;
  runFrame: number;
  blinkTimer: number;
};

type ObstacleType = "cactus" | "rock" | "ptero";

type Obstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
  speedScale: number;
  type: ObstacleType;
  flapTimer: number;
};

type Cloud = {
  x: number;
  y: number;
  size: number;
};

type Spark = {
  x: number;
  y: number;
  size: number;
  alpha: number;
};

type Hill = {
  x: number;
  baseY: number;
  width: number;
  height: number;
  color: string;
};

type Like = {
  x: number;
  y: number;
  size: number;
  bob: number;
};

type GameState = {
  rhino: RhinoState;
  obstacles: Obstacle[];
  likes: Like[];
  clouds: Cloud[];
  stars: Spark[];
  hillsFar: Hill[];
  hillsNear: Hill[];
  distance: number;
  likesCollected: number;
  highScore: number;
  speed: number;
  spawnTimer: number;
  likeSpawnTimer: number;
  gameOver: boolean;
  started: boolean;
  flashTimer: number;
  nextMilestone: number;
  footstepTimer: number;
};

type AudioEngine = {
  context: AudioContext | null;
  unlocked: boolean;
};

const input: InputState = {
  jumpPressed: false,
  downHeld: false,
};

const audio: AudioEngine = {
  context: null,
  unlocked: false,
};

const game = createInitialState();

window.addEventListener("keydown", (event) => {
  unlockAudio();

  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    input.jumpPressed = true;
  }

  if (event.code === "ArrowDown") {
    event.preventDefault();
    input.downHeld = true;
  }

});

window.addEventListener("pointerdown", () => {
  unlockAudio();
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowDown") {
    input.downHeld = false;
  }
});

setupTouchControls();

requestAnimationFrame(loop);

function createInitialState(): GameState {
  return {
    rhino: {
      x: RHINO_X,
      y: GROUND_Y - 58,
      width: 54,
      height: 58,
      velocityY: 0,
      onGround: true,
      ducking: false,
      runFrame: 0,
      blinkTimer: 0,
    },
    obstacles: [],
    likes: [],
    clouds: createClouds(),
    stars: createStars(),
    hillsFar: createHills("#d9e4a6", 3, 170, 62, 210),
    hillsNear: createHills("#b2ca62", 4, 182, 82, 170),
    distance: 0,
    likesCollected: 0,
    highScore: Number(window.localStorage.getItem("rhino-runner-hi") ?? "0"),
    speed: START_SPEED,
    spawnTimer: 0.9,
    likeSpawnTimer: 0.95,
    gameOver: false,
    started: false,
    flashTimer: 0,
    nextMilestone: 2000,
    footstepTimer: 0.1,
  };
}

function createClouds(): Cloud[] {
  return [
    { x: 210, y: 42, size: 1.1 },
    { x: 510, y: 60, size: 0.9 },
    { x: 800, y: 36, size: 1.2 },
  ];
}

function createStars(): Spark[] {
  return Array.from({ length: 18 }, (_, index) => ({
    x: 20 + index * 52,
    y: 18 + ((index * 37) % 70),
    size: index % 4 === 0 ? 3 : 2,
    alpha: 0.14 + (index % 3) * 0.06,
  }));
}

function createHills(color: string, count: number, baseY: number, height: number, width: number): Hill[] {
  return Array.from({ length: count }, (_, index) => ({
    x: index * (width - 20),
    baseY,
    width: width + (index % 2) * 26,
    height: height + (index % 3) * 18,
    color,
  }));
}

function resetGame(): void {
  const highScore = Math.max(game.highScore, Math.floor(game.distance));
  Object.assign(game, createInitialState());
  game.highScore = highScore;
}

function loop(time: number): void {
  const delta = Math.min(0.032, (time - previousTime) / 1000 || 0.016);
  previousTime = time;

  update(delta);
  render(time / 1000);

  requestAnimationFrame(loop);
}

let previousTime = 0;

function update(delta: number): void {
  if (shouldRestartGame()) {
    resetGame();
  }

  if (!game.gameOver) {
    game.started = game.started || input.jumpPressed || input.downHeld;
    updateRhino(delta);
    updateWorld(delta);
    updateObstacles(delta);
    spawnObstacles(delta);
    updateLikes(delta);
    spawnLikes(delta);
    updateAudio(delta);
    detectCollision();
    collectLikes();
  }

  if (game.flashTimer > 0) {
    game.flashTimer -= delta;
  }

  input.jumpPressed = false;
}

function updateRhino(delta: number): void {
  const rhino = game.rhino;
  const standingHeight = 58;
  const duckingHeight = 42;

  if (input.jumpPressed && rhino.onGround) {
    rhino.velocityY = JUMP_VELOCITY;
    rhino.onGround = false;
    rhino.ducking = false;
    playJumpSound();
  }

  if (!rhino.onGround) {
    rhino.velocityY += GRAVITY * delta;
    rhino.y += rhino.velocityY * delta;
  }

  if (rhino.y >= GROUND_Y - rhino.height) {
    rhino.y = GROUND_Y - rhino.height;
    rhino.velocityY = 0;
    rhino.onGround = true;
  }

  const shouldDuck = input.downHeld && rhino.onGround;
  rhino.ducking = shouldDuck;
  rhino.height = shouldDuck ? duckingHeight : standingHeight;
  rhino.width = shouldDuck ? 64 : 54;

  if (rhino.onGround) {
    rhino.y = GROUND_Y - rhino.height;
    rhino.runFrame += delta * (game.speed * 0.03);
  }

  rhino.blinkTimer += delta;
}

function updateWorld(delta: number): void {
  if (!game.started) {
    return;
  }

  game.distance += delta * (game.speed * 0.1);
  game.speed = Math.min(MAX_SPEED, game.speed + delta * 8);

  if (game.distance >= game.nextMilestone) {
    playScoreSound();
    game.nextMilestone += 2000;
  }

  game.clouds.forEach((cloud) => {
    cloud.x -= CLOUD_SPEED * cloud.size * delta;
    if (cloud.x < -90) {
      cloud.x = WIDTH + Math.random() * 120;
      cloud.y = 26 + Math.random() * 48;
    }
  });

  game.stars.forEach((star) => {
    star.x -= STAR_SPEED * delta;
    if (star.x < -4) {
      star.x = WIDTH + Math.random() * 60;
      star.y = 12 + Math.random() * 80;
    }
  });

  updateHills(game.hillsFar, delta, 32);
  updateHills(game.hillsNear, delta, 68);
}

function updateHills(hills: Hill[], delta: number, factor: number): void {
  hills.forEach((hill) => {
    hill.x -= delta * factor;
    if (hill.x + hill.width < -20) {
      const rightMost = hills.reduce((max, item) => Math.max(max, item.x + item.width), 0);
      hill.x = rightMost + 18 + Math.random() * 28;
    }
  });
}

function updateObstacles(delta: number): void {
  game.obstacles.forEach((obstacle) => {
    obstacle.x -= game.speed * obstacle.speedScale * delta;
    obstacle.flapTimer += delta * 14;
  });

  game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -40);
}

function updateLikes(delta: number): void {
  game.likes.forEach((like) => {
    like.x -= game.speed * delta;
    like.bob += delta * 4;
  });

  game.likes = game.likes.filter((like) => like.x + like.size > -20);
}

function spawnObstacles(delta: number): void {
  if (!game.started) {
    return;
  }

  game.spawnTimer -= delta;
  if (game.spawnTimer > 0) {
    return;
  }

  const roll = Math.random();
  let obstacle: Obstacle;

  if (roll < 0.54) {
    const cluster = Math.random() < 0.35 ? 2 : 1;
    obstacle = {
      x: WIDTH + 20,
      y: GROUND_Y - 44,
      width: 22 * cluster + (cluster - 1) * 8,
      height: 44,
      speedScale: 1,
      type: "cactus",
      flapTimer: 0,
    };
  } else if (roll < 0.8) {
    obstacle = {
      x: WIDTH + 20,
      y: GROUND_Y - 22,
      width: 34,
      height: 22,
      speedScale: 1.06,
      type: "rock",
      flapTimer: 0,
    };
  } else {
    obstacle = {
      x: WIDTH + 20,
      y: GROUND_Y - (Math.random() < 0.5 ? 94 : 64),
      width: 44,
      height: 28,
      speedScale: 1.14,
      type: "ptero",
      flapTimer: 0,
    };
  }

  const last = game.obstacles.length > 0 ? game.obstacles[game.obstacles.length - 1] : undefined;
  if (last !== undefined && WIDTH - last.x < 170) {
    game.spawnTimer = 0.22;
    return;
  }

  game.obstacles.push(obstacle);
  const intervalFactor = 1 - (game.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
  game.spawnTimer = 0.78 + Math.random() * 0.6 + intervalFactor * 0.42;
}

function spawnLikes(delta: number): void {
  if (!game.started) {
    return;
  }

  game.likeSpawnTimer -= delta;
  if (game.likeSpawnTimer > 0) {
    return;
  }

  const lastObstacle = game.obstacles.length > 0 ? game.obstacles[game.obstacles.length - 1] : undefined;
  const lastLike = game.likes.length > 0 ? game.likes[game.likes.length - 1] : undefined;
  const spawnX = WIDTH + 30;

  if (lastObstacle !== undefined && spawnX - lastObstacle.x < 120) {
    game.likeSpawnTimer = 0.45;
    return;
  }

  if (lastLike !== undefined && spawnX - lastLike.x < 120) {
    game.likeSpawnTimer = 0.22;
    return;
  }

  const chainSize = Math.random() < 0.6 ? PhaserLikeRandomInt(2, 3) : 1;
  const baseY = 74 + Math.random() * 32;

  for (let index = 0; index < chainSize; index += 1) {
    game.likes.push({
      x: spawnX + index * 28,
      y: baseY - index * 4,
      size: 18,
      bob: Math.random() * Math.PI * 2,
    });
  }

  game.likeSpawnTimer = 0.95 + Math.random() * 0.7;
}

function updateAudio(delta: number): void {
  const rhino = game.rhino;
  if (!game.started || !rhino.onGround || game.gameOver) {
    game.footstepTimer = 0.06;
    return;
  }

  game.footstepTimer -= delta;
  if (game.footstepTimer > 0) {
    return;
  }

  const tempo = Math.max(0.065, 0.18 - (game.speed - START_SPEED) / 4200);
  game.footstepTimer = tempo;
  playStepSound();
}

function detectCollision(): void {
  const rhinoBox = getRhinoHitbox(game.rhino);
  const hit = game.obstacles.some((obstacle) => intersects(rhinoBox, getObstacleHitbox(obstacle)));

  if (!hit) {
    return;
  }

  game.gameOver = true;
  game.flashTimer = 0.35;
  game.highScore = Math.max(game.highScore, Math.floor(game.distance));
  window.localStorage.setItem("rhino-runner-hi", String(game.highScore));
  playCrashSound();
}

function collectLikes(): void {
  const rhinoBox = getRhinoHitbox(game.rhino);
  const remaining: Like[] = [];

  game.likes.forEach((like) => {
    const bobY = like.y + Math.sin(like.bob) * 4;
    const hitbox = new DOMRect(like.x + 2, bobY + 2, like.size - 4, like.size - 4);
    if (intersects(rhinoBox, hitbox)) {
      game.likesCollected += 1;
      playLikeSound();
      if (game.likesCollected % 10 === 0) {
        playCelebrationSound();
      }
      return;
    }

    remaining.push(like);
  });

  game.likes = remaining;
}

function getRhinoHitbox(rhino: RhinoState): DOMRect {
  if (rhino.ducking) {
    return new DOMRect(rhino.x + 8, rhino.y + 10, rhino.width - 18, rhino.height - 12);
  }

  return new DOMRect(rhino.x + 10, rhino.y + 6, rhino.width - 18, rhino.height - 8);
}

function getObstacleHitbox(obstacle: Obstacle): DOMRect {
  if (obstacle.type === "ptero") {
    return new DOMRect(obstacle.x + 4, obstacle.y + 6, obstacle.width - 8, obstacle.height - 10);
  }

  return new DOMRect(obstacle.x + 3, obstacle.y + 3, obstacle.width - 6, obstacle.height - 4);
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function render(t: number): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  drawSky();
  drawSun(t);
  drawClouds();
  drawStars(t);
  drawHills(game.hillsFar);
  drawHills(game.hillsNear);
  drawGround();
  drawObstacles();
  drawLikes();
  drawRhino();
  drawScore();
  drawMessages();

  if (game.flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${game.flashTimer * 0.35})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function isNight(): boolean {
  return Math.floor(game.distance / 2000) % 2 === 1;
}

function drawSky(): void {
  const night = isNight();
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  if (night) {
    gradient.addColorStop(0, "#102347");
    gradient.addColorStop(0.58, "#244b76");
    gradient.addColorStop(1, "#3a5570");
  } else {
    gradient.addColorStop(0, "#78d4ff");
    gradient.addColorStop(0.58, "#d9f4ff");
    gradient.addColorStop(1, "#fff5c5");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawSun(t: number): void {
  const night = isNight();
  const pulse = Math.sin(t * 0.8) * 3;
  ctx.fillStyle = night ? "rgba(205, 226, 255, 0.22)" : "rgba(255, 199, 68, 0.35)";
  ctx.beginPath();
  ctx.arc(820, 52, 36 + pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = night ? "#e8f3ff" : "#ffd24d";
  ctx.beginPath();
  ctx.arc(820, 52, 24, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(): void {
  const night = isNight();
  game.clouds.forEach((cloud) => {
    const w = 46 * cloud.size;
    const h = 18 * cloud.size;
    ctx.fillStyle = night ? "#aec4df" : "#ffffff";
    ctx.fillRect(cloud.x, cloud.y, w, h);
    ctx.fillRect(cloud.x + 10 * cloud.size, cloud.y - 8 * cloud.size, 22 * cloud.size, 10 * cloud.size);
    ctx.fillRect(cloud.x + 24 * cloud.size, cloud.y - 4 * cloud.size, 18 * cloud.size, 8 * cloud.size);
    ctx.fillStyle = night ? "rgba(28, 45, 74, 0.35)" : "rgba(113, 175, 209, 0.25)";
    ctx.fillRect(cloud.x + 2, cloud.y + h - 4, w - 4, 4);
  });
}

function drawStars(t: number): void {
  const night = isNight();
  game.stars.forEach((star, index) => {
    const pulseBase = night ? 0.2 : 0.08;
    const pulse = pulseBase + Math.abs(Math.sin(t * 1.5 + index)) * star.alpha;
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
}

function drawHills(hills: Hill[]): void {
  const night = isNight();
  hills.forEach((hill) => {
    ctx.fillStyle = night ? shadeColor(hill.color, -55) : hill.color;
    ctx.beginPath();
    ctx.moveTo(hill.x, hill.baseY);
    ctx.lineTo(hill.x + hill.width * 0.45, hill.baseY - hill.height);
    ctx.lineTo(hill.x + hill.width, hill.baseY);
    ctx.closePath();
    ctx.fill();
  });
}

function drawGround(): void {
  const night = isNight();
  ctx.fillStyle = night ? "#7f6a43" : "#f3c869";
  ctx.fillRect(0, GROUND_Y + 2, WIDTH, HEIGHT - GROUND_Y);

  ctx.strokeStyle = night ? "#493924" : "#7c5d2f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 2);
  ctx.lineTo(WIDTH, GROUND_Y + 2);
  ctx.stroke();

  ctx.fillStyle = night ? "#5f4b2b" : "#a17635";
  for (let x = -20; x < WIDTH + 20; x += 26) {
    const offset = (performance.now() * game.speed * 0.00014 + x * 0.04) % 26;
    ctx.fillRect(x - offset, GROUND_Y + 10, 12, 3);
    ctx.fillRect(x + 9 - offset, GROUND_Y + 16, 7, 3);
  }

  ctx.fillStyle = night ? "#715731" : "#c69541";
  for (let x = 0; x < WIDTH; x += 64) {
    ctx.fillRect(x + 10, GROUND_Y + 24, 20, 4);
    ctx.fillRect(x + 40, GROUND_Y + 30, 10, 3);
  }
}

function drawScore(): void {
  const compact = isCompactHud();
  ctx.fillStyle = isNight() ? "#e8f3ff" : "#34506d";
  ctx.font = compact ? 'bold 18px "Trebuchet MS", sans-serif' : 'bold 24px "Trebuchet MS", sans-serif';
  ctx.textAlign = "left";
  drawHeartIcon(compact ? 14 : 18, compact ? 14 : 18, compact ? 16 : 18);
  ctx.font = compact ? 'bold 16px "Trebuchet MS", sans-serif' : 'bold 20px "Trebuchet MS", sans-serif';
  ctx.fillText(`${game.likesCollected}`, compact ? 34 : 42, compact ? 27 : 31);
  ctx.textAlign = "right";
  ctx.font = compact ? 'bold 18px "Trebuchet MS", sans-serif' : 'bold 24px "Trebuchet MS", sans-serif';
  const score = String(Math.floor(game.distance)).padStart(5, "0");
  const hi = String(game.highScore).padStart(5, "0");
  ctx.fillText(`HI ${hi}   ${score}`, WIDTH - (compact ? 12 : 18), compact ? 27 : 32);
  ctx.textAlign = "left";
}

function drawMessages(): void {
  const compact = isCompactHud();
  ctx.fillStyle = isNight() ? "#e8f3ff" : "#34506d";
  ctx.font = compact ? 'bold 12px "Trebuchet MS", sans-serif' : 'bold 16px "Trebuchet MS", sans-serif';

  if (!game.started) {
    ctx.textAlign = "center";
    const startText = compact ? "Тап по экрану или Space" : "Space чтобы стартовать";
    const hintText = compact
      ? "Тап - прыжок, удержание - пригнуться"
      : "Носорог бежит сам, ты только прыгай и пригибайся";
    ctx.fillText(startText, WIDTH / 2, compact ? 48 : 32);
    ctx.fillStyle = isNight() ? "#b7cae1" : "#6e8da7";
    ctx.fillText(hintText, WIDTH / 2, compact ? 66 : 56);
    ctx.textAlign = "left";
  }

  if (game.gameOver) {
    ctx.fillStyle = "#b54234";
    ctx.textAlign = "center";
    ctx.fillText(compact ? "Носорог врезался. Тапни для рестарта" : "Носорог врезался. Нажми Space", WIDTH / 2, compact ? 48 : 32);
    ctx.textAlign = "left";
  }
}

function drawObstacles(): void {
  game.obstacles.forEach((obstacle) => {
    if (obstacle.type === "cactus") {
      drawCactus(obstacle);
      return;
    }

    if (obstacle.type === "rock") {
      drawRock(obstacle);
      return;
    }

    drawPtero(obstacle);
  });
}

function drawLikes(): void {
  game.likes.forEach((like) => {
    const bobY = like.y + Math.sin(like.bob) * 4;
    drawHeartIcon(like.x, bobY, like.size);
  });
}

function drawHeartIcon(x: number, y: number, size: number): void {
  const s = size / 18;
  ctx.fillStyle = "#ff4d67";
  ctx.fillRect(x + 4 * s, y + 2 * s, 4 * s, 4 * s);
  ctx.fillRect(x + 8 * s, y + 2 * s, 4 * s, 4 * s);
  ctx.fillRect(x + 2 * s, y + 4 * s, 12 * s, 4 * s);
  ctx.fillRect(x + 3 * s, y + 8 * s, 10 * s, 3 * s);
  ctx.fillRect(x + 5 * s, y + 11 * s, 6 * s, 3 * s);
  ctx.fillStyle = "#ff8a9b";
  ctx.fillRect(x + 5 * s, y + 3 * s, 2 * s, 2 * s);
  ctx.fillRect(x + 9 * s, y + 3 * s, 2 * s, 2 * s);
}

function drawCactus(obstacle: Obstacle): void {
  ctx.fillStyle = "#2a9440";
  ctx.fillRect(obstacle.x + 8, obstacle.y, 10, obstacle.height);
  ctx.fillRect(obstacle.x, obstacle.y + 16, 10, 8);
  ctx.fillRect(obstacle.x + 12, obstacle.y + 12, 8, 6);
  ctx.fillRect(obstacle.x + obstacle.width - 12, obstacle.y + 10, 8, 6);
  ctx.fillRect(obstacle.x + obstacle.width - 10, obstacle.y + 16, 10, 8);
  if (obstacle.width > 30) {
    ctx.fillRect(obstacle.x + 28, obstacle.y + 2, 10, obstacle.height - 4);
  }

  ctx.fillStyle = "#53be59";
  ctx.fillRect(obstacle.x + 10, obstacle.y + 4, 3, obstacle.height - 8);
  ctx.fillRect(obstacle.x + obstacle.width - 8, obstacle.y + 18, 2, 6);
}

function drawRock(obstacle: Obstacle): void {
  ctx.fillStyle = "#8f6d47";
  ctx.fillRect(obstacle.x, obstacle.y + 6, obstacle.width, obstacle.height - 6);
  ctx.fillRect(obstacle.x + 4, obstacle.y + 2, obstacle.width - 8, 6);
  ctx.fillStyle = "#b48c5e";
  ctx.fillRect(obstacle.x + 5, obstacle.y + 8, 6, 5);
  ctx.fillRect(obstacle.x + 18, obstacle.y + 6, 8, 4);
  ctx.fillStyle = "#6d5234";
  ctx.fillRect(obstacle.x + 8, obstacle.y + 12, 4, 4);
  ctx.fillRect(obstacle.x + 20, obstacle.y + 8, 3, 3);
}

function drawPtero(obstacle: Obstacle): void {
  const wingUp = Math.sin(obstacle.flapTimer) > 0;
  ctx.fillStyle = "#7b4d90";
  ctx.fillRect(obstacle.x + 12, obstacle.y + 8, 18, 8);
  ctx.fillRect(obstacle.x + 8, obstacle.y + 10, 6, 6);
  ctx.fillRect(obstacle.x + 30, obstacle.y + 9, 7, 5);
  ctx.fillRect(obstacle.x + 36, obstacle.y + 10, 5, 2);
  ctx.fillStyle = "#9f6fc2";
  if (wingUp) {
    ctx.fillRect(obstacle.x, obstacle.y + 2, 16, 5);
    ctx.fillRect(obstacle.x + 21, obstacle.y, 19, 5);
  } else {
    ctx.fillRect(obstacle.x, obstacle.y + 14, 16, 5);
    ctx.fillRect(obstacle.x + 21, obstacle.y + 14, 19, 5);
  }
  ctx.fillStyle = "#fff5f5";
  ctx.fillRect(obstacle.x + 32, obstacle.y + 10, 2, 2);
}

function drawRhino(): void {
  const rhino = game.rhino;
  const running = rhino.onGround && !rhino.ducking;
  const stepWave = running ? Math.sin(rhino.runFrame * 1.1) : 0;
  const bodyBob = running ? Math.round(Math.abs(stepWave) * 2) : 0;
  const frontLegLift = running ? Math.max(0, Math.round(stepWave * 4)) : 0;
  const backLegLift = running ? Math.max(0, Math.round(-stepWave * 4)) : 0;
  const x = Math.round(rhino.x);
  const y = Math.round(rhino.y + bodyBob);
  const blink = Math.floor(rhino.blinkTimer * 0.7) % 7 === 0;
  const bodyColor = game.gameOver ? "#8d92a1" : "#6f7486";
  const bodyLight = game.gameOver ? "#b4b8c1" : "#a1a9ba";
  const shadow = game.gameOver ? "#6a6f7d" : "#4e5365";
  const horn = "#efe6d0";
  const innerEar = "#d8bfd7";
  const eye = "#1d2430";
  const jacket = game.gameOver ? "#d7be63" : "#f2c63d";
  const jacketLight = game.gameOver ? "#ecd788" : "#ffe07a";
  const pants = game.gameOver ? "#a85b57" : "#d94a3a";
  const pantsLight = game.gameOver ? "#c9887c" : "#ff7667";

  if (rhino.ducking) {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x + 18, y + 7, 18, 14);
    ctx.fillRect(x + 33, y + 9, 10, 10);
    ctx.fillRect(x + 41, y + 11, 10, 8);
    ctx.fillRect(x + 49, y + 13, 9, 5);
    ctx.fillRect(x + 20, y + 2, 5, 8);
    ctx.fillRect(x + 29, y + 3, 5, 7);
    ctx.fillStyle = bodyLight;
    ctx.fillRect(x + 22, y + 10, 10, 6);
    ctx.fillRect(x + 41, y + 12, 5, 3);
    ctx.fillStyle = horn;
    ctx.fillRect(x + 50, y + 10, 8, 4);
    ctx.fillRect(x + 57, y + 8, 5, 3);
    ctx.fillRect(x + 60, y + 7, 2, 2);

    ctx.fillStyle = jacket;
    ctx.fillRect(x + 11, y + 19, 23, 13);
    ctx.fillRect(x + 24, y + 20, 10, 9);
    ctx.fillRect(x + 16, y + 16, 8, 6);
    ctx.fillRect(x + 28, y + 16, 8, 6);
    ctx.fillStyle = jacketLight;
    ctx.fillRect(x + 14, y + 21, 10, 5);
    ctx.fillRect(x + 26, y + 21, 4, 6);
    ctx.fillStyle = pants;
    ctx.fillRect(x + 14, y + 32, 6, 10);
    ctx.fillRect(x + 26, y + 32, 6, 10);
    ctx.fillStyle = pantsLight;
    ctx.fillRect(x + 14, y + 35, 2, 5);
    ctx.fillRect(x + 27, y + 35, 2, 5);
  } else {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x + 18, y + 6, 18, 15);
    ctx.fillRect(x + 33, y + 8, 11, 11);
    ctx.fillRect(x + 42, y + 10, 11, 9);
    ctx.fillRect(x + 50, y + 12, 9, 6);
    ctx.fillRect(x + 20, y + 1, 5, 9);
    ctx.fillRect(x + 29, y + 2, 5, 8);

    ctx.fillStyle = jacket;
    ctx.fillRect(x + 11, y + 20, 22, 16);
    ctx.fillRect(x + 8, y + 24, 7, 9);
    ctx.fillRect(x + 16, y + 15, 9, 7);
    ctx.fillRect(x + 27, y + 15, 9, 7);
    ctx.fillRect(x + 31, y + 21, 7, 12);
    ctx.fillStyle = jacketLight;
    ctx.fillRect(x + 14, y + 22, 10, 7);
    ctx.fillRect(x + 26, y + 22, 5, 6);
    ctx.fillRect(x + 17, y + 16, 5, 3);

    ctx.fillStyle = pants;
    ctx.fillRect(x + 14, y + 36, 7, 20);
    ctx.fillRect(x + 26, y + 36, 7, 20);
    ctx.fillRect(x + 18, y + 31, 10, 8);
    ctx.fillStyle = pantsLight;
    ctx.fillRect(x + 15, y + 38, 2, 10);
    ctx.fillRect(x + 27, y + 38, 2, 10);
    ctx.fillRect(x + 19, y + 33, 6, 3);

    ctx.fillStyle = bodyLight;
    ctx.fillRect(x + 22, y + 10, 10, 7);
    ctx.fillRect(x + 42, y + 12, 5, 4);
    ctx.fillRect(x + 33, y + 17, 3, 2);

    ctx.fillStyle = horn;
    ctx.fillRect(x + 50, y + 10, 9, 5);
    ctx.fillRect(x + 58, y + 8, 5, 4);
    ctx.fillRect(x + 61, y + 6, 2, 2);

    if (rhino.onGround) {
      ctx.fillStyle = pants;
      ctx.fillRect(x + 14, y + 36 + frontLegLift, 7, 20 - frontLegLift);
      ctx.fillRect(x + 26, y + 36 + backLegLift, 7, 20 - backLegLift);
      ctx.fillStyle = pantsLight;
      ctx.fillRect(x + 15, y + 38 + frontLegLift, 2, Math.max(6, 10 - frontLegLift));
      ctx.fillRect(x + 27, y + 38 + backLegLift, 2, Math.max(6, 10 - backLegLift));
    }
  }

  ctx.fillStyle = bodyColor;
  ctx.fillRect(x + 14, y + 52 + frontLegLift, 8, 4);
  ctx.fillRect(x + 26, y + 52 + backLegLift, 8, 4);
  ctx.fillStyle = bodyLight;
  ctx.fillRect(x + 15, y + 52 + frontLegLift, 4, 2);
  ctx.fillRect(x + 27, y + 52 + backLegLift, 4, 2);

  ctx.fillStyle = shadow;
  ctx.fillRect(x + 7, y + 24, 3, 5);

  ctx.fillStyle = innerEar;
  ctx.fillRect(x + 21, y + 3, 2, 5);
  ctx.fillRect(x + 30, y + 4, 2, 4);

  ctx.fillStyle = "#ffffff";
  if (!blink) {
    ctx.fillRect(x + (rhino.ducking ? 41 : 44), y + 12, 3, 3);
  } else {
    ctx.fillRect(x + (rhino.ducking ? 40 : 43), y + 13, 5, 1);
  }
  ctx.fillStyle = eye;
  ctx.fillRect(x + (rhino.ducking ? 42 : 45), y + 13, 1, 1);
  ctx.fillRect(x + (rhino.ducking ? 41 : 43), y + 18, 6, 2);
  ctx.fillRect(x + (rhino.ducking ? 39 : 41), y + 21, 2, 1);
}

function unlockAudio(): void {
  if (audio.unlocked) {
    return;
  }

  const AudioContextCtor = window.AudioContext;
  if (AudioContextCtor === undefined) {
    return;
  }

  audio.context = audio.context ?? new AudioContextCtor();
  void audio.context.resume();
  audio.unlocked = true;
}

function createGainNode(volume: number): GainNode | null {
  const audioContext = audio.context;
  if (audioContext === null) {
    return null;
  }

  const gain = audioContext.createGain();
  gain.gain.value = volume;
  gain.connect(audioContext.destination);
  return gain;
}

function playTone(startFrequency: number, endFrequency: number, duration: number, volume: number, type: OscillatorType): void {
  const audioContext = audio.context;
  if (audioContext === null) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = createGainNode(volume);
  if (gain === null) {
    return;
  }

  const now = audioContext.currentTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playNoise(duration: number, volume: number): void {
  const audioContext = audio.context;
  if (audioContext === null) {
    return;
  }

  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;

  const gain = createGainNode(volume);
  if (gain === null) {
    return;
  }

  source.connect(filter);
  filter.connect(gain);
  source.start();
}

function playJumpSound(): void {
  playTone(440, 710, 0.08, 0.04, "square");
  playTone(520, 920, 0.06, 0.02, "triangle");
}

function playCrashSound(): void {
  playNoise(0.18, 0.08);
  playTone(180, 44, 0.22, 0.05, "sawtooth");
}

function playScoreSound(): void {
  playTone(660, 880, 0.08, 0.035, "square");
  const audioContext = audio.context;
  if (audioContext === null) {
    return;
  }

  window.setTimeout(() => {
    if (audio.context === null) {
      return;
    }
    playTone(880, 1120, 0.08, 0.03, "square");
  }, 70);
}

function playLikeSound(): void {
  playTone(920, 1320, 0.07, 0.028, "triangle");
}

function playCelebrationSound(): void {
  playTone(660, 880, 0.08, 0.03, "square");
  window.setTimeout(() => playTone(880, 1180, 0.09, 0.03, "square"), 70);
  window.setTimeout(() => playTone(1180, 1480, 0.11, 0.028, "triangle"), 150);
}

function PhaserLikeRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function isCompactHud(): boolean {
  return isTouchDevice() && window.innerWidth <= 720;
}

function setupTouchControls(): void {
  setupCanvasTouchControls();
}

function setupCanvasTouchControls(): void {
  let holdTimer: number | null = null;
  let pointerActive = false;
  let duckMode = false;
  const holdThresholdMs = 120;

  const release = (): void => {
    const shouldJump = pointerActive && !duckMode;
    pointerActive = false;
    input.downHeld = false;
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (shouldJump) {
      input.jumpPressed = true;
    }
    duckMode = false;
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!isTouchDevice()) {
      return;
    }

    event.preventDefault();
    unlockAudio();
    pointerActive = true;
    duckMode = false;
    input.downHeld = false;

    holdTimer = window.setTimeout(() => {
      if (!pointerActive) {
        return;
      }

      duckMode = true;
      input.downHeld = true;
    }, holdThresholdMs);
  });

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", release);
}

function shouldRestartGame(): boolean {
  return game.gameOver && input.jumpPressed;
}


function shadeColor(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(value.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(value.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(value.slice(4, 6), 16) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function playStepSound(): void {
  playTone(120, 95, 0.03, 0.012, "triangle");
}
