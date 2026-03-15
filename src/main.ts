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
const LIKE_POWER_DURATION = 3;
const LIKE_POWER_SPEED_MULTIPLIER = 1.33;

type InputState = {
  jumpPressed: boolean;
};

type RhinoState = {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  onGround: boolean;
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
  cactusVariant?: CactusVariant;
  cactusVariantAlt?: CactusVariant;
  poopVariant?: PoopVariant;
};

type CactusVariant = "classic" | "thin" | "tall" | "hook";
type PoopVariant = "swirl" | "wide" | "lump";

type Cloud = {
  x: number;
  y: number;
  size: number;
  variant: number;
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
  variant: number;
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
  farClouds: Cloud[];
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
  likePowerTimer: number;
};

type AudioEngine = {
  context: AudioContext | null;
  unlocked: boolean;
};

const input: InputState = {
  jumpPressed: false,
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
});

window.addEventListener("pointerdown", () => {
  unlockAudio();
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
      runFrame: 0,
      blinkTimer: 0,
    },
    obstacles: [],
    likes: [],
    farClouds: createFarClouds(),
    clouds: createClouds(),
    stars: createStars(),
    hillsFar: createHills("#d7a15c", 3, 170, 62, 210),
    hillsNear: createHills("#b86b34", 4, 182, 82, 170),
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
    likePowerTimer: 0,
  };
}

function createClouds(): Cloud[] {
  return [
    { x: 210, y: 42, size: 1.1, variant: 0 },
    { x: 510, y: 60, size: 0.9, variant: 1 },
    { x: 800, y: 36, size: 1.2, variant: 2 },
  ];
}

function createFarClouds(): Cloud[] {
  return [
    { x: 120, y: 28, size: 0.62, variant: 0 },
    { x: 430, y: 22, size: 0.55, variant: 2 },
    { x: 740, y: 30, size: 0.58, variant: 1 },
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
    variant: index % 4,
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

  if (game.likePowerTimer > 0) {
    game.likePowerTimer = Math.max(0, game.likePowerTimer - delta);
  }

  if (!game.gameOver) {
    game.started = game.started || input.jumpPressed;
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

  if (input.jumpPressed && rhino.onGround) {
    rhino.velocityY = JUMP_VELOCITY;
    rhino.onGround = false;
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

  rhino.height = 58;
  rhino.width = 54;

  if (rhino.onGround) {
    rhino.y = GROUND_Y - rhino.height;
    rhino.runFrame += delta * (currentSpeed() * 0.03);
  }

  rhino.blinkTimer += delta;
}

function updateWorld(delta: number): void {
  if (!game.started) {
    return;
  }

  game.distance += delta * (currentSpeed() * 0.1);
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
      cloud.variant = PhaserLikeRandomInt(0, 2);
    }
  });

  game.farClouds.forEach((cloud) => {
    cloud.x -= CLOUD_SPEED * 0.45 * cloud.size * delta;
    if (cloud.x < -70) {
      cloud.x = WIDTH + Math.random() * 140;
      cloud.y = 18 + Math.random() * 26;
      cloud.variant = PhaserLikeRandomInt(0, 2);
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
    obstacle.x -= currentSpeed() * obstacle.speedScale * delta;
    obstacle.flapTimer += delta * 14;
  });

  game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -40);
}

function updateLikes(delta: number): void {
  game.likes.forEach((like) => {
    like.x -= currentSpeed() * delta;
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
    const variants: CactusVariant[] = ["classic", "thin", "tall", "hook"];
    const cactusVariant = variants[PhaserLikeRandomInt(0, variants.length - 1)];
    const cactusVariantAlt = variants[PhaserLikeRandomInt(0, variants.length - 1)];
    obstacle = {
      x: WIDTH + 20,
      y: GROUND_Y - 44,
      width: 22 * cluster + (cluster - 1) * 8,
      height: 44,
      speedScale: 1,
      type: "cactus",
      flapTimer: 0,
      cactusVariant,
      cactusVariantAlt,
    };
  } else if (roll < 0.8) {
    const poopVariants: PoopVariant[] = ["swirl", "wide", "lump"];
    obstacle = {
      x: WIDTH + 20,
      y: GROUND_Y - 22,
      width: 34,
      height: 22,
      speedScale: 1.06,
      type: "rock",
      flapTimer: Math.random() * 12,
      poopVariant: poopVariants[PhaserLikeRandomInt(0, poopVariants.length - 1)],
    };
  } else {
    const flightHeights = [60, 88, 108];
    obstacle = {
      x: WIDTH + 20,
      y: GROUND_Y - flightHeights[PhaserLikeRandomInt(0, flightHeights.length - 1)],
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
      size: 22,
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

  const tempo = Math.max(0.055, 0.18 - (currentSpeed() - START_SPEED) / 4200);
  game.footstepTimer = tempo;
  playStepSound();
}

function detectCollision(): void {
  const rhinoBox = getRhinoHitbox(game.rhino);
  const hitIndex = game.obstacles.findIndex((obstacle) => intersects(rhinoBox, getObstacleHitbox(obstacle)));

  if (hitIndex === -1) {
    return;
  }

  if (game.likePowerTimer > 0) {
    const obstacle = game.obstacles[hitIndex];
    game.obstacles.splice(hitIndex, 1);
    game.flashTimer = 0.18;
    playPowerCrashSound();
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
        activateLikePower();
      }
      return;
    }

    remaining.push(like);
  });

  game.likes = remaining;
}

function getRhinoHitbox(rhino: RhinoState): DOMRect {
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
  drawFarClouds();
  drawClouds();
  drawStars(t);
  drawHills(game.hillsFar, "far");
  drawHills(game.hillsNear, "near");
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
  return Math.floor(game.distance / 1500) % 2 === 1;
}

function drawSky(): void {
  const night = isNight();
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  if (night) {
    gradient.addColorStop(0, "#08152e");
    gradient.addColorStop(0.45, "#17365a");
    gradient.addColorStop(1, "#38506e");
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
  if (night) {
    ctx.fillStyle = "#ffd85a";
    ctx.beginPath();
    ctx.arc(820, 52, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#102347";
    ctx.beginPath();
    ctx.arc(828, 47, 16, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.fillStyle = "rgba(255, 199, 68, 0.35)";
  ctx.beginPath();
  ctx.arc(820, 52, 36 + pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffd24d";
  ctx.beginPath();
  ctx.arc(820, 52, 24, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(): void {
  const night = isNight();
  game.clouds.forEach((cloud) => {
    const x = cloud.x;
    const y = cloud.y;
    const s = cloud.size;
    const fill = night ? "#aec4df" : "#fffdf6";
    const shade = night ? "rgba(28, 45, 74, 0.28)" : "rgba(113, 175, 209, 0.18)";

    ctx.fillStyle = fill;
    if (cloud.variant === 0) {
      ctx.fillRect(x + 10 * s, y + 8 * s, 40 * s, 10 * s);
      ctx.fillRect(x + 18 * s, y + 2 * s, 12 * s, 8 * s);
      ctx.fillRect(x + 28 * s, y, 18 * s, 12 * s);
      ctx.fillRect(x + 42 * s, y + 4 * s, 12 * s, 8 * s);
    } else if (cloud.variant === 1) {
      ctx.fillRect(x + 6 * s, y + 10 * s, 52 * s, 10 * s);
      ctx.fillRect(x + 14 * s, y + 4 * s, 16 * s, 10 * s);
      ctx.fillRect(x + 30 * s, y + 1 * s, 20 * s, 13 * s);
      ctx.fillRect(x + 46 * s, y + 6 * s, 18 * s, 8 * s);
    } else {
      ctx.fillRect(x + 8 * s, y + 9 * s, 46 * s, 10 * s);
      ctx.fillRect(x + 12 * s, y + 5 * s, 12 * s, 8 * s);
      ctx.fillRect(x + 22 * s, y + 1 * s, 16 * s, 11 * s);
      ctx.fillRect(x + 34 * s, y + 4 * s, 14 * s, 9 * s);
      ctx.fillRect(x + 46 * s, y + 7 * s, 10 * s, 6 * s);
    }

    ctx.fillStyle = shade;
    ctx.fillRect(x + 12 * s, y + 16 * s, 34 * s, 3 * s);
  });
}

function drawFarClouds(): void {
  const night = isNight();
  game.farClouds.forEach((cloud) => {
    const x = cloud.x;
    const y = cloud.y;
    const s = cloud.size;
    const fill = night ? "rgba(155, 182, 214, 0.4)" : "rgba(255, 255, 248, 0.55)";

    ctx.fillStyle = fill;
    if (cloud.variant === 0) {
      ctx.fillRect(x + 8 * s, y + 6 * s, 34 * s, 7 * s);
      ctx.fillRect(x + 16 * s, y + 1 * s, 10 * s, 6 * s);
      ctx.fillRect(x + 26 * s, y, 14 * s, 8 * s);
    } else if (cloud.variant === 1) {
      ctx.fillRect(x + 6 * s, y + 7 * s, 40 * s, 7 * s);
      ctx.fillRect(x + 12 * s, y + 3 * s, 12 * s, 6 * s);
      ctx.fillRect(x + 24 * s, y + 1 * s, 12 * s, 7 * s);
      ctx.fillRect(x + 34 * s, y + 4 * s, 10 * s, 5 * s);
    } else {
      ctx.fillRect(x + 7 * s, y + 6 * s, 36 * s, 7 * s);
      ctx.fillRect(x + 12 * s, y + 2 * s, 10 * s, 5 * s);
      ctx.fillRect(x + 22 * s, y, 11 * s, 7 * s);
      ctx.fillRect(x + 31 * s, y + 3 * s, 9 * s, 5 * s);
    }
  });
}

function drawStars(t: number): void {
  const night = isNight();
  if (!night) {
    return;
  }

  game.stars.forEach((star, index) => {
    const pulse = 0.28 + Math.abs(Math.sin(t * 1.5 + index)) * (star.alpha + 0.1);
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
}

function drawHills(hills: Hill[], depth: "far" | "near"): void {
  const night = isNight();
  const hazeTop = depth === "far" ? 140 : 154;
  const hazeBottom = depth === "far" ? 196 : 192;

  hills.forEach((hill) => {
    const baseColor = night
      ? shadeColor(hill.color, depth === "far" ? -70 : -55)
      : depth === "far"
        ? shadeColor(hill.color, 8)
        : hill.color;
    const lightColor = night
      ? shadeColor(hill.color, depth === "far" ? -36 : -20)
      : depth === "far"
        ? shadeColor(hill.color, 22)
        : shadeColor(hill.color, 28);
    const darkColor = night
      ? shadeColor(hill.color, depth === "far" ? -88 : -82)
      : depth === "far"
        ? shadeColor(hill.color, -18)
        : shadeColor(hill.color, -36);
    const crackColor = night ? shadeColor(hill.color, -95) : shadeColor(hill.color, -52);
    const footColor = night
      ? depth === "far"
        ? "rgba(73, 88, 103, 0.55)"
        : "rgba(88, 78, 60, 0.65)"
      : depth === "far"
        ? "rgba(232, 205, 153, 0.78)"
        : "rgba(233, 176, 103, 0.72)";
    const left = hill.x;
    const baseY = hill.baseY;
    const width = hill.width;
    const height = hill.height;
    const profiles = [
      [
        [0, 0],
        [0.14, -0.34],
        [0.26, -0.3],
        [0.43, -0.78],
        [0.54, -1],
        [0.66, -0.74],
        [0.82, -0.46],
        [1, 0],
      ],
      [
        [0, 0],
        [0.12, -0.18],
        [0.24, -0.62],
        [0.38, -0.88],
        [0.47, -0.66],
        [0.59, -0.92],
        [0.76, -0.52],
        [1, 0],
      ],
      [
        [0, 0],
        [0.1, -0.22],
        [0.22, -0.26],
        [0.35, -0.72],
        [0.48, -0.58],
        [0.64, -0.94],
        [0.81, -0.48],
        [1, 0],
      ],
      [
        [0, 0],
        [0.16, -0.28],
        [0.32, -0.82],
        [0.46, -0.98],
        [0.6, -0.76],
        [0.73, -0.58],
        [0.88, -0.3],
        [1, 0],
      ],
    ] as const;
    const profile = profiles[hill.variant % profiles.length];
    const peak = profile.reduce((best, point) => (point[1] < best[1] ? point : best), profile[0]);
    const peakX = left + width * peak[0];
    const peakY = baseY + height * peak[1];

    ctx.fillStyle = footColor;
    ctx.beginPath();
    ctx.moveTo(left - width * 0.12, baseY + 4);
    ctx.quadraticCurveTo(left + width * 0.12, baseY - 1, left + width * 0.26, baseY + 2);
    ctx.quadraticCurveTo(left + width * 0.48, baseY + 8, left + width * 0.7, baseY + 3);
    ctx.quadraticCurveTo(left + width * 0.88, baseY - 1, left + width * 1.12, baseY + 5);
    ctx.lineTo(left + width * 1.12, baseY + 10);
    ctx.lineTo(left - width * 0.12, baseY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(left, baseY);
    profile.forEach(([px, py]) => {
      ctx.lineTo(left + width * px, baseY + height * py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.moveTo(left + width * 0.08, baseY);
    ctx.lineTo(left + width * 0.2, baseY - height * 0.22);
    ctx.lineTo(left + width * 0.32, baseY - height * 0.36);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(left + width * 0.66, baseY - height * 0.44);
    ctx.lineTo(left + width * 0.56, baseY - height * 0.38);
    ctx.lineTo(left + width * 0.24, baseY - height * 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    ctx.lineTo(left + width * 0.74, baseY - height * 0.54);
    ctx.lineTo(left + width * 0.9, baseY - height * 0.24);
    ctx.lineTo(left + width * 0.96, baseY);
    ctx.lineTo(left + width * 0.58, baseY);
    ctx.lineTo(left + width * 0.62, baseY - height * 0.24);
    ctx.closePath();
    ctx.fill();

    if (height > 70) {
      ctx.strokeStyle = crackColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left + width * 0.56, baseY - height * 0.9);
      ctx.lineTo(left + width * 0.53, baseY - height * 0.68);
      ctx.lineTo(left + width * 0.57, baseY - height * 0.52);
      ctx.lineTo(left + width * 0.54, baseY - height * 0.34);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left + width * 0.28, baseY - height * 0.48);
      ctx.lineTo(left + width * 0.25, baseY - height * 0.38);
      ctx.lineTo(left + width * 0.29, baseY - height * 0.26);
      ctx.stroke();
    }

    if (depth === "near") {
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.moveTo(left + width * 0.14, baseY + 2);
      ctx.lineTo(left + width * 0.2, baseY - 4);
      ctx.lineTo(left + width * 0.26, baseY + 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(left + width * 0.8, baseY + 2);
      ctx.lineTo(left + width * 0.86, baseY - 3);
      ctx.lineTo(left + width * 0.91, baseY + 2);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  });

  const haze = ctx.createLinearGradient(0, hazeTop, 0, hazeBottom);
  if (night) {
    haze.addColorStop(0, "rgba(103, 132, 167, 0)");
    haze.addColorStop(1, depth === "far" ? "rgba(111, 131, 151, 0.2)" : "rgba(85, 101, 123, 0.14)");
  } else {
    haze.addColorStop(0, "rgba(255, 241, 209, 0)");
    haze.addColorStop(1, depth === "far" ? "rgba(255, 233, 188, 0.34)" : "rgba(251, 223, 170, 0.18)");
  }
  ctx.fillStyle = haze;
  ctx.fillRect(0, hazeTop, WIDTH, hazeBottom - hazeTop);
}

function drawGround(): void {
  const night = isNight();
  const worldScroll = game.distance * 1.5;
  const roadTop = GROUND_Y + 2;
  const roadHeight = 42;
  const shoulderTop = roadTop + roadHeight;

  ctx.fillStyle = night ? "#7f6a43" : "#f3c869";
  ctx.fillRect(0, roadTop, WIDTH, roadHeight);
  ctx.fillStyle = night ? "#334b67" : "#d9ecf3";
  ctx.fillRect(0, shoulderTop, WIDTH, HEIGHT - shoulderTop);

  ctx.strokeStyle = night ? "#493924" : "#7c5d2f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, roadTop);
  ctx.lineTo(WIDTH, roadTop);
  ctx.stroke();

  ctx.fillStyle = night ? "#5f4b2b" : "#a17635";
  const dashStep = 34;
  const dashOffset = worldScroll % dashStep;
  for (let x = -dashStep; x < WIDTH + dashStep; x += dashStep) {
    ctx.fillRect(x - dashOffset, roadTop + 15, 14, 4);
    ctx.fillRect(x + 18 - dashOffset, roadTop + 26, 9, 3);
  }

  ctx.fillStyle = night ? "#947649" : "#f7d989";
  ctx.fillRect(0, roadTop + roadHeight - 6, WIDTH, 2);
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

  if (game.likePowerTimer > 0) {
    const barX = compact ? 112 : 164;
    const barY = compact ? 14 : 12;
    const barWidth = compact ? 154 : 238;
    const barHeight = compact ? 12 : 14;
    const progress = game.likePowerTimer / LIKE_POWER_DURATION;
    ctx.fillStyle = isNight() ? "rgba(8, 18, 38, 0.58)" : "rgba(69, 49, 0, 0.28)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = "#ffd84a";
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    ctx.strokeStyle = isNight() ? "#fff1a8" : "#8e6c00";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = isNight() ? "#fff7cf" : "#5f4300";
    ctx.font = compact ? 'bold 13px "Trebuchet MS", sans-serif' : 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillText(`LIKE POWER ${game.likePowerTimer.toFixed(1)}s`, barX, barY + (compact ? 29 : 34));
  }
}

function drawMessages(): void {
  const compact = isCompactHud();
  ctx.fillStyle = isNight() ? "#e8f3ff" : "#34506d";
  ctx.font = compact ? 'bold 12px "Trebuchet MS", sans-serif' : 'bold 16px "Trebuchet MS", sans-serif';

  if (!game.started) {
    ctx.textAlign = "center";
    const startText = compact ? "Тап по экрану или Space" : "Space чтобы стартовать";
    const hintText = compact ? "Тап по экрану, чтобы прыгать" : "Носорог бежит сам, ты только прыгай";
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
  const width = size;
  const height = size * 0.9;
  const left = x;
  const top = y;
  const centerX = left + width / 2;
  const bottomY = top + height;
  const notchY = top + height * 0.28;

  ctx.fillStyle = "#f01722";
  ctx.beginPath();
  ctx.moveTo(centerX, bottomY);
  ctx.bezierCurveTo(
    left + width * 0.08,
    top + height * 0.68,
    left - width * 0.02,
    top + height * 0.34,
    left + width * 0.22,
    top + height * 0.18,
  );
  ctx.bezierCurveTo(
    left + width * 0.36,
    top + height * 0.04,
    centerX - width * 0.18,
    top + height * 0.1,
    centerX,
    notchY,
  );
  ctx.bezierCurveTo(
    centerX + width * 0.18,
    top + height * 0.1,
    left + width * 0.64,
    top + height * 0.04,
    left + width * 0.78,
    top + height * 0.18,
  );
  ctx.bezierCurveTo(
    left + width * 1.02,
    top + height * 0.34,
    left + width * 0.92,
    top + height * 0.68,
    centerX,
    bottomY,
  );
  ctx.closePath();
  ctx.fill();
}

function drawCactus(obstacle: Obstacle): void {
  const body = "#3c9a16";
  const light = "#79c92d";
  const dark = "#2c6d0d";
  const spine = "#d7e88a";
  const rock = "#d9b06a";
  const rockShadow = "#b9863a";

  const drawSaguaro = (
    x: number,
    y: number,
    width: number,
    height: number,
    leftArm: boolean,
    rightArm: boolean,
    armHeightLeft: number,
    armHeightRight: number,
  ): void => {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.28, y + height);
    ctx.lineTo(x + width * 0.18, y + height * 0.2);
    ctx.quadraticCurveTo(x + width * 0.2, y, x + width * 0.5, y);
    ctx.quadraticCurveTo(x + width * 0.8, y, x + width * 0.82, y + height * 0.2);
    ctx.lineTo(x + width * 0.72, y + height);
    ctx.closePath();
    ctx.fill();

    if (leftArm) {
      ctx.beginPath();
      ctx.moveTo(x + width * 0.24, y + height * armHeightLeft);
      ctx.quadraticCurveTo(
        x - width * 0.18,
        y + height * (armHeightLeft - 0.12),
        x - width * 0.1,
        y + height * (armHeightLeft - 0.3),
      );
      ctx.quadraticCurveTo(
        x - width * 0.02,
        y + height * (armHeightLeft - 0.48),
        x + width * 0.18,
        y + height * (armHeightLeft - 0.34),
      );
      ctx.quadraticCurveTo(
        x + width * 0.28,
        y + height * (armHeightLeft - 0.26),
        x + width * 0.24,
        y + height * armHeightLeft,
      );
      ctx.closePath();
      ctx.fill();
    }

    if (rightArm) {
      ctx.beginPath();
      ctx.moveTo(x + width * 0.76, y + height * armHeightRight);
      ctx.quadraticCurveTo(
        x + width * 1.1,
        y + height * (armHeightRight - 0.12),
        x + width * 1.04,
        y + height * (armHeightRight - 0.3),
      );
      ctx.quadraticCurveTo(
        x + width,
        y + height * (armHeightRight - 0.48),
        x + width * 0.82,
        y + height * (armHeightRight - 0.34),
      );
      ctx.quadraticCurveTo(
        x + width * 0.7,
        y + height * (armHeightRight - 0.26),
        x + width * 0.76,
        y + height * armHeightRight,
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = light;
    ctx.fillRect(x + width * 0.34, y + height * 0.08, width * 0.1, height * 0.84);
    ctx.fillRect(x + width * 0.52, y + height * 0.08, width * 0.08, height * 0.84);
    if (leftArm) {
      ctx.fillRect(x + width * 0.03, y + height * (armHeightLeft - 0.24), width * 0.06, height * 0.16);
    }
    if (rightArm) {
      ctx.fillRect(x + width * 0.9, y + height * (armHeightRight - 0.26), width * 0.05, height * 0.16);
    }

    ctx.fillStyle = dark;
    ctx.fillRect(x + width * 0.2, y + height * 0.08, width * 0.07, height * 0.86);
    ctx.fillRect(x + width * 0.66, y + height * 0.08, width * 0.07, height * 0.86);

    ctx.strokeStyle = spine;
    ctx.lineWidth = 1;
    for (let rib = 0; rib < 4; rib += 1) {
      const ribX = x + width * (0.22 + rib * 0.16);
      for (let spike = 0; spike < 5; spike += 1) {
        const spikeY = y + height * (0.18 + spike * 0.16);
        ctx.beginPath();
        ctx.moveTo(ribX, spikeY);
        ctx.lineTo(ribX - 2, spikeY - 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ribX, spikeY);
        ctx.lineTo(ribX + 2, spikeY - 1);
        ctx.stroke();
      }
    }
  };

  const drawBaseRocks = (x: number, y: number): void => {
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 8);
    ctx.lineTo(x + 10, y + 2);
    ctx.lineTo(x + 18, y + 4);
    ctx.lineTo(x + 16, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 10);
    ctx.lineTo(x + 20, y + 4);
    ctx.lineTo(x + 27, y + 7);
    ctx.lineTo(x + 24, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rockShadow;
    ctx.fillRect(x + 8, y + 10, 8, 2);
    ctx.fillRect(x + 18, y + 11, 6, 2);
  };

  const drawVariant = (x: number, y: number, variant: CactusVariant, secondary: boolean): void => {
    switch (variant) {
      case "thin":
        drawBaseRocks(x - 2, y + obstacle.height - (secondary ? 2 : 3));
        drawSaguaro(x + (secondary ? 4 : 3), y + (secondary ? 2 : 0), secondary ? 12 : 14, secondary ? obstacle.height - 2 : obstacle.height, true, false, 0.74, 0.66);
        break;
      case "tall":
        drawBaseRocks(x - 1, y + obstacle.height - (secondary ? 3 : 4));
        drawSaguaro(x + (secondary ? 2 : 1), y - (secondary ? 2 : 3), secondary ? 14 : 16, secondary ? obstacle.height : obstacle.height + 3, true, true, 0.78, 0.6);
        break;
      case "hook":
        drawBaseRocks(x - 2, y + obstacle.height - (secondary ? 2 : 3));
        drawSaguaro(x + (secondary ? 2 : 1), y + (secondary ? 1 : 0), secondary ? 14 : 17, secondary ? obstacle.height - 1 : obstacle.height, false, true, 0.68, 0.74);
        break;
      case "classic":
      default:
        drawBaseRocks(x - 2, y + obstacle.height - (secondary ? 2 : 3));
        drawSaguaro(x + (secondary ? 2 : 1), y, secondary ? 14 : 18, obstacle.height, true, true, 0.68, 0.66);
        break;
    }
  };

  if (obstacle.width > 30) {
    drawVariant(obstacle.x + 20, obstacle.y + 3, obstacle.cactusVariantAlt ?? "thin", true);
  }

  drawVariant(obstacle.x, obstacle.y, obstacle.cactusVariant ?? "classic", false);
}

function drawRock(obstacle: Obstacle): void {
  const base = "#70401a";
  const mid = "#8a5323";
  const light = "#b36a2d";
  const dark = "#4a2a10";
  const blink = Math.sin(obstacle.flapTimer * 0.45) > 0.93;
  const variant = obstacle.poopVariant ?? "swirl";
  const x = obstacle.x;
  const wideHop = variant === "wide" ? Math.max(0, Math.round((Math.sin(obstacle.flapTimer * 1.15) + 1) * 0.8)) : 0;
  const y = obstacle.y + (variant === "wide" ? 5 : 4) - wideHop;

  ctx.fillStyle = "rgba(83, 55, 23, 0.28)";
  ctx.fillRect(x + 4, y + 18, 22, 3);

  ctx.fillStyle = base;
  if (variant === "wide") {
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 18);
    ctx.quadraticCurveTo(x + 2, y + 14, x + 8, y + 13);
    ctx.quadraticCurveTo(x + 5, y + 10, x + 12, y + 9);
    ctx.quadraticCurveTo(x + 10, y + 6, x + 17, y + 6);
    ctx.quadraticCurveTo(x + 23, y + 6, x + 22, y + 9);
    ctx.quadraticCurveTo(x + 30, y + 10, x + 29, y + 14);
    ctx.quadraticCurveTo(x + 34, y + 15, x + 31, y + 19);
    ctx.lineTo(x + 8, y + 19);
    ctx.quadraticCurveTo(x + 4, y + 19, x + 3, y + 18);
    ctx.closePath();
    ctx.fill();
  } else if (variant === "lump") {
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 19);
    ctx.quadraticCurveTo(x + 2, y + 16, x + 7, y + 13);
    ctx.quadraticCurveTo(x + 4, y + 11, x + 10, y + 9);
    ctx.quadraticCurveTo(x + 8, y + 7, x + 14, y + 6);
    ctx.quadraticCurveTo(x + 13, y + 3, x + 18, y + 3);
    ctx.quadraticCurveTo(x + 24, y + 4, x + 23, y + 8);
    ctx.quadraticCurveTo(x + 29, y + 9, x + 27, y + 13);
    ctx.quadraticCurveTo(x + 33, y + 15, x + 29, y + 19);
    ctx.lineTo(x + 9, y + 19);
    ctx.quadraticCurveTo(x + 6, y + 19, x + 5, y + 19);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 19);
    ctx.quadraticCurveTo(x + 2, y + 15, x + 8, y + 13);
    ctx.quadraticCurveTo(x + 4, y + 10, x + 11, y + 8);
    ctx.quadraticCurveTo(x + 8, y + 5, x + 16, y + 4);
    ctx.quadraticCurveTo(x + 15, y + 1, x + 20, y + 1);
    ctx.quadraticCurveTo(x + 26, y + 2, x + 24, y + 5);
    ctx.quadraticCurveTo(x + 31, y + 6, x + 28, y + 10);
    ctx.quadraticCurveTo(x + 35, y + 12, x + 31, y + 17);
    ctx.quadraticCurveTo(x + 30, y + 20, x + 24, y + 20);
    ctx.lineTo(x + 9, y + 20);
    ctx.quadraticCurveTo(x + 5, y + 20, x + 4, y + 19);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = mid;
  if (variant === "wide") {
    ctx.fillRect(x + 9, y + 6, 10, 3);
    ctx.fillRect(x + 7, y + 10, 16, 3);
    ctx.fillRect(x + 6, y + 14, 18, 3);
  } else if (variant === "lump") {
    ctx.fillRect(x + 10, y + 5, 9, 3);
    ctx.fillRect(x + 8, y + 9, 13, 3);
    ctx.fillRect(x + 7, y + 13, 16, 3);
    ctx.fillRect(x + 8, y + 16, 14, 2);
  } else {
    ctx.fillRect(x + 9, y + 4, 12, 4);
    ctx.fillRect(x + 7, y + 8, 16, 4);
    ctx.fillRect(x + 6, y + 12, 18, 4);
    ctx.fillRect(x + 7, y + 16, 16, 3);
  }

  ctx.fillStyle = light;
  if (variant === "wide") {
    ctx.fillRect(x + 11, y + 7, 4, 1);
    ctx.fillRect(x + 10, y + 11, 5, 1);
  } else if (variant === "lump") {
    ctx.fillRect(x + 11, y + 6, 4, 1);
    ctx.fillRect(x + 10, y + 10, 4, 1);
    ctx.fillRect(x + 9, y + 14, 3, 1);
  } else {
    ctx.fillRect(x + 11, y + 5, 4, 2);
    ctx.fillRect(x + 10, y + 9, 5, 2);
    ctx.fillRect(x + 9, y + 13, 4, 2);
  }

  ctx.fillStyle = "#ffffff";
  if (!blink) {
    ctx.fillRect(x + 10, y + 11, 4, 4);
    ctx.fillRect(x + 19, y + 11, 4, 4);
  } else {
    ctx.fillRect(x + 9, y + 13, 6, 1);
    ctx.fillRect(x + 18, y + 13, 6, 1);
  }

  ctx.fillStyle = dark;
  if (!blink) {
    ctx.fillRect(x + 12, y + 12, 1, 2);
    ctx.fillRect(x + 21, y + 12, 1, 2);
  }
  ctx.fillRect(x + 15, y + 16, 3, 1);
  ctx.fillRect(x + 14, y + 17, 5, 1);
}

function drawPtero(obstacle: Obstacle): void {
  const wingUp = Math.sin(obstacle.flapTimer) > 0;
  const wing = "#1f1d23";
  const wingLight = "#3b3842";
  const body = "#403a41";
  const neck = "#d08e97";
  const ruff = "#f1efe6";
  const beak = "#d9a63f";
  const talon = "#c8994f";
  const eye = "#171317";

  ctx.fillStyle = wing;
  if (wingUp) {
    ctx.fillRect(obstacle.x + 2, obstacle.y + 5, 12, 4);
    ctx.fillRect(obstacle.x + 4, obstacle.y + 3, 8, 2);
    ctx.fillRect(obstacle.x + 21, obstacle.y + 3, 16, 4);
    ctx.fillRect(obstacle.x + 27, obstacle.y + 1, 8, 2);
  } else {
    ctx.fillRect(obstacle.x + 1, obstacle.y + 15, 13, 4);
    ctx.fillRect(obstacle.x + 22, obstacle.y + 15, 16, 4);
    ctx.fillRect(obstacle.x + 4, obstacle.y + 18, 7, 2);
    ctx.fillRect(obstacle.x + 28, obstacle.y + 18, 7, 2);
  }

  ctx.fillStyle = wingLight;
  ctx.fillRect(obstacle.x + 23, obstacle.y + 8, 10, 10);
  ctx.fillRect(obstacle.x + 18, obstacle.y + 10, 7, 7);
  ctx.fillRect(obstacle.x + 26, obstacle.y + 18, 6, 3);

  ctx.fillStyle = body;
  ctx.fillRect(obstacle.x + 20, obstacle.y + 9, 10, 8);
  ctx.fillRect(obstacle.x + 17, obstacle.y + 10, 4, 6);
  ctx.fillRect(obstacle.x + 28, obstacle.y + 10, 4, 5);

  ctx.fillStyle = ruff;
  ctx.fillRect(obstacle.x + 18, obstacle.y + 9, 6, 4);
  ctx.fillRect(obstacle.x + 20, obstacle.y + 7, 5, 3);
  ctx.fillRect(obstacle.x + 24, obstacle.y + 9, 3, 3);

  ctx.fillStyle = neck;
  ctx.fillRect(obstacle.x + 11, obstacle.y + 8, 6, 3);
  ctx.fillRect(obstacle.x + 9, obstacle.y + 10, 5, 3);
  ctx.fillRect(obstacle.x + 8, obstacle.y + 12, 5, 3);
  ctx.fillRect(obstacle.x + 7, obstacle.y + 14, 6, 2);

  ctx.fillStyle = beak;
  ctx.fillRect(obstacle.x + 2, obstacle.y + 9, 8, 3);
  ctx.fillRect(obstacle.x + 5, obstacle.y + 12, 5, 2);
  ctx.fillRect(obstacle.x + 1, obstacle.y + 10, 3, 1);

  ctx.fillStyle = eye;
  ctx.fillRect(obstacle.x + 10, obstacle.y + 10, 2, 2);
  ctx.fillRect(obstacle.x + 11, obstacle.y + 14, 3, 1);

  ctx.fillStyle = talon;
  ctx.fillRect(obstacle.x + 22, obstacle.y + 18, 2, 4);
  ctx.fillRect(obstacle.x + 27, obstacle.y + 18, 2, 4);
  ctx.fillRect(obstacle.x + 21, obstacle.y + 21, 3, 1);
  ctx.fillRect(obstacle.x + 26, obstacle.y + 21, 3, 1);
}

function drawRhino(): void {
  const rhino = game.rhino;
  const running = rhino.onGround;
  const stepWave = running ? Math.sin(rhino.runFrame * 1.18) : 0;
  const strideWave = running ? Math.sin(rhino.runFrame * 2.36) : 0;
  const bodyBob = running ? Math.round(Math.abs(stepWave) * 2) : 0;
  const frontLegLift = running ? Math.max(0, Math.round(stepWave * 5)) : 0;
  const backLegLift = running ? Math.max(0, Math.round(-stepWave * 5)) : 0;
  const coatSwing = running ? Math.round(stepWave * 2) : 0;
  const armSwing = running ? Math.round(stepWave * 2) : 0;
  const bellyShift = running ? Math.round(strideWave * 1) : 0;
  const x = Math.round(rhino.x);
  const y = Math.round(rhino.y + bodyBob);
  const blinkCycle = rhino.blinkTimer % 8.5;
  const blink = blinkCycle > 7.75 && blinkCycle < 8.05;
  const earCycle = rhino.blinkTimer % 6.25;
  const earTwitch = earCycle > 5.7 && earCycle < 5.95 ? -1 : 0;
  const bodyColor = game.gameOver ? "#8d92a1" : "#6f7486";
  const bodyLight = game.gameOver ? "#b4b8c1" : "#a1a9ba";
  const shadow = game.gameOver ? "#6a6f7d" : "#4e5365";
  const bodyMid = game.gameOver ? "#979daa" : "#858c9b";
  const horn = "#efe6d0";
  const innerEar = "#d8bfd7";
  const eye = "#1d2430";
  const jacket = game.gameOver ? "#d7be63" : "#f2c63d";
  const jacketLight = game.gameOver ? "#ecd788" : "#ffe07a";
  const jacketDark = game.gameOver ? "#b89b47" : "#bb9620";
  const pants = game.gameOver ? "#a85b57" : "#d94a3a";
  const pantsLight = game.gameOver ? "#c9887c" : "#ff7667";
  const shoe = game.gameOver ? "#7f8794" : "#8f97a6";

  ctx.fillStyle = bodyColor;
  ctx.fillRect(x + 16, y + 8, 16, 16);
  ctx.fillRect(x + 28, y + 8, 13, 15);
  ctx.fillRect(x + 38, y + 10, 9, 10);
  ctx.fillRect(x + 43, y + 12, 6, 5);
  ctx.fillRect(x + 20, y + 2 + earTwitch, 4, 8);
  ctx.fillRect(x + 29, y + 3, 4, 7);

  ctx.fillStyle = bodyMid;
  ctx.fillRect(x + 29, y + 11, 10, 7);
  ctx.fillRect(x + 38, y + 12, 4, 4);

  ctx.fillStyle = bodyLight;
  ctx.fillRect(x + 18, y + 10, 9, 7);
  ctx.fillRect(x + 28, y + 11, 6, 5);
  ctx.fillRect(x + 37, y + 12, 3, 3);
  ctx.fillRect(x + 25, y + 6, 5, 2);

  ctx.fillStyle = horn;
  ctx.fillRect(x + 42, y + 9, 7, 6);
  ctx.fillRect(x + 47, y + 7, 4, 5);
  ctx.fillRect(x + 50, y + 5, 2, 3);

  ctx.fillStyle = jacket;
  ctx.fillRect(x + 8, y + 22, 27, 17);
  ctx.fillRect(x + 12, y + 18, 9, 7);
  ctx.fillRect(x + 24, y + 17, 11, 8);
  ctx.fillRect(x + 18, y + 27, 15, 12);
  ctx.fillRect(x + 7, y + 26 + coatSwing, 8, 11 - Math.max(0, coatSwing));
  ctx.fillRect(x + 31, y + 25 - coatSwing, 9, 14 + Math.max(0, coatSwing));

  ctx.fillStyle = jacketLight;
  ctx.fillRect(x + 11, y + 23, 10, 10);
  ctx.fillRect(x + 24, y + 22, 6, 8);
  ctx.fillRect(x + 14, y + 19, 4, 3);
  ctx.fillRect(x + 27, y + 18, 4, 3);
  ctx.fillRect(x + 33, y + 27, 3, 7);

  ctx.fillStyle = jacketDark;
  ctx.fillRect(x + 21, y + 24, 2, 14);
  ctx.fillRect(x + 30, y + 24, 2, 11);
  ctx.fillRect(x + 9, y + 34 + coatSwing, 6, 2);
  ctx.fillRect(x + 32, y + 36 - coatSwing, 7, 2);

  ctx.fillStyle = shadow;
  ctx.fillRect(x + 8, y + 28 + armSwing, 6, 8);
  ctx.fillRect(x + 34, y + 29 - armSwing, 5, 8);
  ctx.fillRect(x + 8, y + 36 + armSwing, 4, 3);
  ctx.fillRect(x + 35, y + 37 - armSwing, 4, 3);

  ctx.fillStyle = pants;
  ctx.fillRect(x + 14, y + 38, 8, 16);
  ctx.fillRect(x + 25, y + 38, 8, 16);
  ctx.fillRect(x + 16, y + 33 + bellyShift, 14, 9);
  ctx.fillStyle = pantsLight;
  ctx.fillRect(x + 15, y + 40, 2, 8);
  ctx.fillRect(x + 27, y + 40, 2, 8);
  ctx.fillRect(x + 19, y + 35 + bellyShift, 6, 3);

  if (rhino.onGround) {
    ctx.fillStyle = pants;
    ctx.fillRect(x + 14, y + 39 + frontLegLift, 8, 15 - frontLegLift);
    ctx.fillRect(x + 25, y + 39 + backLegLift, 8, 15 - backLegLift);
    ctx.fillRect(x + 16, y + 47 + Math.max(0, frontLegLift - 1), 3, Math.max(4, 6 - frontLegLift));
    ctx.fillRect(x + 28, y + 47 + Math.max(0, backLegLift - 1), 3, Math.max(4, 6 - backLegLift));
    ctx.fillStyle = pantsLight;
    ctx.fillRect(x + 15, y + 40 + frontLegLift, 2, Math.max(5, 8 - frontLegLift));
    ctx.fillRect(x + 27, y + 40 + backLegLift, 2, Math.max(5, 8 - backLegLift));
  }

  ctx.fillStyle = shoe;
  ctx.fillRect(x + 14, y + 53 + frontLegLift, 9, 4);
  ctx.fillRect(x + 25, y + 53 + backLegLift, 9, 4);
  ctx.fillStyle = bodyLight;
  ctx.fillRect(x + 15, y + 53 + frontLegLift, 4, 2);
  ctx.fillRect(x + 26, y + 53 + backLegLift, 4, 2);

  ctx.fillStyle = innerEar;
  ctx.fillRect(x + 22, y + 3 + earTwitch, 2, 5);
  ctx.fillRect(x + 30, y + 4, 2, 4);

  ctx.fillStyle = shadow;
  ctx.fillRect(x + 34, y + 18, 5, 2);
  ctx.fillRect(x + 31, y + 21, 7, 2);
  ctx.fillRect(x + 29, y + 24, 3, 1);

  ctx.fillStyle = "#ffffff";
  if (!blink) {
    ctx.fillRect(x + 33, y + 11, 4, 4);
  } else {
    ctx.fillRect(x + 32, y + 13, 6, 1);
  }
  ctx.fillStyle = eye;
  ctx.fillRect(x + 34, y + 12, 2, 2);
  ctx.fillRect(x + 33, y + 18, 6, 2);
  ctx.fillRect(x + 31, y + 21, 2, 2);
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

function playPowerCrashSound(): void {
  playTone(380, 620, 0.08, 0.035, "sawtooth");
  window.setTimeout(() => playTone(620, 420, 0.07, 0.03, "triangle"), 50);
}

function PhaserLikeRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function currentSpeed(): number {
  return game.speed * (game.likePowerTimer > 0 ? LIKE_POWER_SPEED_MULTIPLIER : 1);
}

function isCompactHud(): boolean {
  return isTouchDevice() && window.innerWidth <= 720;
}

function setupTouchControls(): void {
  setupCanvasTouchControls();
}

function setupCanvasTouchControls(): void {
  canvas.addEventListener("pointerdown", (event) => {
    if (!isTouchDevice()) {
      return;
    }

    event.preventDefault();
    unlockAudio();
    input.jumpPressed = true;
  });
}

function shouldRestartGame(): boolean {
  return game.gameOver && input.jumpPressed;
}

function activateLikePower(): void {
  game.likePowerTimer = LIKE_POWER_DURATION;
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
