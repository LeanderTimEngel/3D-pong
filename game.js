import * as THREE from 'three';

// Game constants
const PADDLE_WIDTH = 3;
const PADDLE_HEIGHT = 1;
const PADDLE_DEPTH = 0.2;
const BALL_RADIUS = 0.2;
const BALL_SPEED = 0.15;
const PADDLE_SPEED = 0.2;
const MAX_SCORE = 5; // Game ends when a player reaches this score

// Sound effects setup with error handling
const sounds = {
    paddle: new Audio(),
    wall: new Audio(),
    score: new Audio(),
    background: new Audio(),
    win: new Audio()
};

// Try to load sounds but don't block the game
try {
    sounds.paddle.src = 'sounds/paddle_hit.wav';
    sounds.wall.src = 'sounds/wall_hit.mp3';
    sounds.score.src = 'sounds/score.mp3';
    sounds.background.src = 'sounds/background.mp3';
    sounds.win.src = 'sounds/win.mp3';
    sounds.background.loop = true;
    sounds.background.volume = 0.3;
} catch (e) {
    console.log('Sound loading failed, continuing without sound');
}

// Hide loading screen immediately
document.getElementById('loading-overlay').style.display = 'none';

// Game state
let gameState = 'menu';
let gameMode = '';
let difficulty = 'medium';
let ballVelocity = new THREE.Vector3(BALL_SPEED, 0, BALL_SPEED);
let player1Score = 0;
let player2Score = 0;
let isPaused = false;
let consecutiveHits = 0; // Track rally length
let maxRally = 0;
let initialBallSpeed = BALL_SPEED;
let currentBallSpeed = BALL_SPEED;

// AI settings
const AI_DIFFICULTIES = {
    easy: { speed: 0.1, reactionTime: 0.8, predictionError: 0.3 },
    medium: { speed: 0.15, reactionTime: 0.5, predictionError: 0.2 },
    hard: { speed: 0.2, reactionTime: 0.2, predictionError: 0.1 }
};

let aiPredictedX = 0;
let lastPredictionTime = 0;

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 20, 40);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Renderer setup with better graphics
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game-container').appendChild(renderer.domElement);

// Enhanced lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(0, 20, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 40;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.top = 15;
directionalLight.shadow.camera.bottom = -15;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Add spotlights 
const spotlight1 = new THREE.SpotLight(0x00ff00, 1);
spotlight1.position.set(-10, 10, 0);
spotlight1.angle = Math.PI / 6;
spotlight1.penumbra = 0.3;
scene.add(spotlight1);

const spotlight2 = new THREE.SpotLight(0x00ff00, 1);
spotlight2.position.set(10, 10, 0);
spotlight2.angle = Math.PI / 6;
spotlight2.penumbra = 0.3;
scene.add(spotlight2);

// Create paddles 
const paddleGeometry = new THREE.BoxGeometry(PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_DEPTH);
const paddleMaterial = new THREE.MeshPhongMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.2,
    shininess: 30
});
const player1Paddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
const player2Paddle = new THREE.Mesh(paddleGeometry, paddleMaterial);

player1Paddle.castShadow = true;
player2Paddle.castShadow = true;
player1Paddle.position.z = -8;
player2Paddle.position.z = 8;
scene.add(player1Paddle);
scene.add(player2Paddle);

// Create ball with glowing effect
const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS);
const ballMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5,
    shininess: 50
});
const ball = new THREE.Mesh(ballGeometry, ballMaterial);
ball.castShadow = true;
scene.add(ball);

// Add this after creating the ball
const ballTrail = [];
const MAX_TRAIL_LENGTH = 20;

function updateBallTrail() {
    // Add new position to trail
    ballTrail.unshift(ball.position.clone());
    
    // Remove old positions if trail is too long
    if (ballTrail.length > MAX_TRAIL_LENGTH) {
        ballTrail.pop();
    }
    
    // Update trail visualization
    ballTrail.forEach((pos, index) => {
        const scale = 1 - (index / MAX_TRAIL_LENGTH);
        const trailSegment = new THREE.Mesh(
            new THREE.SphereGeometry(BALL_RADIUS * scale),
            new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: scale * 0.3
            })
        );
        trailSegment.position.copy(pos);
        scene.add(trailSegment);
        
        // Remove trail segment after a frame
        setTimeout(() => {
            scene.remove(trailSegment);
        }, 0);
    });
}

// Create arena with better visuals
const floorGeometry = new THREE.PlaneGeometry(20, 20);
const floorMaterial = new THREE.MeshPhongMaterial({
    color: 0x222222,
    shininess: 10,
    transparent: true,
    opacity: 0.8
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Arena boundaries with neon effect
const createArenaBoundary = (width, height, depth, position) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshPhongMaterial({
        color: 0x000000,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.3
    });
    const boundary = new THREE.Mesh(geometry, material);
    boundary.position.copy(position);
    boundary.receiveShadow = true;
    return boundary;
};

// Create arena boundaries
const leftWall = createArenaBoundary(0.5, 12, 20, new THREE.Vector3(-10, 6, 0));
const rightWall = createArenaBoundary(0.5, 12, 20, new THREE.Vector3(10, 6, 0));
const topWall = createArenaBoundary(20, 0.5, 20, new THREE.Vector3(0, 12, 0));
scene.add(leftWall);
scene.add(rightWall);
scene.add(topWall);

// Add center line
const centerLineGeometry = new THREE.PlaneGeometry(20, 0.1);
const centerLineMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.3
});
const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
centerLine.rotation.x = -Math.PI / 2;
scene.add(centerLine);

// Camera position for better gameplay view
camera.position.set(0, 25, 0);
camera.lookAt(0, 0, 0);

// Input handling
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    a: false,
    d: false
};

window.addEventListener('keydown', (e) => {
    if (e.key in keys) {
        keys[e.key] = true;
    }
    if (e.key === 'Escape' && gameState === 'playing') {
        togglePause();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key in keys) {
        keys[e.key] = false;
    }
});

// Add this function to handle button hover effects
function addButtonEffects(button) {
    if (button.dataset.hasEffects) return; // Prevent duplicate listeners
    
    button.dataset.hasEffects = 'true';
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
    });
    
    button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(0.95)';
    });
    
    button.addEventListener('mouseup', () => {
        button.style.transform = 'scale(1.05)';
    });
}

// Update the button effects application
function initializeButtons() {
    // Main menu buttons
    document.querySelectorAll('button').forEach(addButtonEffects);
    
    // Difficulty buttons
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        if (btn.dataset.hasListener) return; // Prevent duplicate listeners
        btn.dataset.hasListener = 'true';
        
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficulty = btn.dataset.difficulty;
        });
    });
}

// Call this function after showing menus
function initializeMenuButtons() {
    const singlePlayerBtn = document.getElementById('singleplayer');
    const multiPlayerBtn = document.getElementById('multiplayer');
    
    if (!singlePlayerBtn.dataset.hasListener) {
        singlePlayerBtn.dataset.hasListener = 'true';
        singlePlayerBtn.addEventListener('click', () => startGame('singleplayer'));
    }
    
    if (!multiPlayerBtn.dataset.hasListener) {
        multiPlayerBtn.dataset.hasListener = 'true';
        multiPlayerBtn.addEventListener('click', () => startGame('multiplayer'));
    }
}

// Update the showMenu function
function showMenu() {
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    isPaused = true;
    try {
        sounds.background.pause();
    } catch (e) {}
    
    initializeMenuButtons();
    initializeButtons();
}

// Update the game initialization
window.addEventListener('load', () => {
    initializeButtons();
    showMenu();
});

function hideMenu() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    isPaused = false;
}

function initializePauseMenuButtons() {
    const resumeBtn = document.getElementById('resume');
    const restartBtn = document.getElementById('restart');
    const quitBtn = document.getElementById('quit');
    
    if (!resumeBtn.dataset.hasListener) {
        resumeBtn.dataset.hasListener = 'true';
        resumeBtn.addEventListener('click', togglePause);
    }
    
    if (!restartBtn.dataset.hasListener) {
        restartBtn.dataset.hasListener = 'true';
        restartBtn.addEventListener('click', () => {
            resetGame();
            togglePause();
        });
    }
    
    if (!quitBtn.dataset.hasListener) {
        quitBtn.dataset.hasListener = 'true';
        quitBtn.addEventListener('click', () => {
            gameState = 'menu';
            showMenu();
        });
    }
}

// Add event listeners for the pause and menu buttons
function initializeGameButtons() {
    const pauseBtn = document.getElementById('pause-btn');
    const menuBtn = document.getElementById('menu-btn');
    
    if (!pauseBtn.dataset.hasListener) {
        pauseBtn.dataset.hasListener = 'true';
        pauseBtn.addEventListener('click', togglePause);
    }
    
    if (!menuBtn.dataset.hasListener) {
        menuBtn.dataset.hasListener = 'true';
        menuBtn.addEventListener('click', () => {
            gameState = 'menu';
            showMenu();
        });
    }
}

// Update the startGame function to initialize game buttons
function startGame(mode) {
    gameMode = mode;
    gameState = 'playing';
    resetGame();
    hideMenu();
    initializeGameButtons();
    try {
        sounds.background.play().catch(() => {});
    } catch (e) {}
    
    document.getElementById('player1-name').textContent = 'Player 1';
    document.getElementById('player2-name').textContent = gameMode === 'singleplayer' ? 'AI' : 'Player 2';
}

function resetGame() {
    player1Score = 0;
    player2Score = 0;
    consecutiveHits = 0;
    currentBallSpeed = initialBallSpeed;
    
    // Reset UI
    document.getElementById('player1-score').textContent = '0';
    document.getElementById('player2-score').textContent = '0';
    document.getElementById('rally-count').textContent = '0';
    document.getElementById('ball-speed').textContent = '1x';
    
    // Reset paddles
    player1Paddle.position.x = 0;
    player2Paddle.position.x = 0;
    
    // Reset ball
    resetBall(1);
    
    // Reset active player
    updateActivePlayer(1);
}

function resetBall(direction) {
    ball.position.set(0, 0, 0);
    const angle = (Math.random() - 0.5) * Math.PI / 4;
    ballVelocity.x = currentBallSpeed * Math.sin(angle);
    ballVelocity.z = currentBallSpeed * direction * Math.cos(angle);
    
    // Reset consecutive hits and speed
    consecutiveHits = 0;
    currentBallSpeed = initialBallSpeed;
    
    // Update UI
    document.getElementById('rally-count').textContent = '0';
    document.getElementById('ball-speed').textContent = '1x';
}

function updateAI() {
    if (gameMode !== 'singleplayer') return;

    const aiSettings = AI_DIFFICULTIES[difficulty];
    const currentTime = Date.now();

    if (currentTime - lastPredictionTime > aiSettings.reactionTime * 1000) {
        const timeToIntercept = (player2Paddle.position.z - ball.position.z) / ballVelocity.z;
        const predictedX = ball.position.x + ballVelocity.x * timeToIntercept;
        const errorAmount = (Math.random() - 0.5) * aiSettings.predictionError * PADDLE_WIDTH;
        aiPredictedX = predictedX + errorAmount;
        lastPredictionTime = currentTime;
    }

    const diff = aiPredictedX - player2Paddle.position.x;
    if (Math.abs(diff) > 0.1) {
        const direction = Math.sign(diff);
        player2Paddle.position.x += direction * aiSettings.speed;
        player2Paddle.position.x = Math.max(-8, Math.min(8, player2Paddle.position.x));
    }
}

function updateGame() {
    if (gameState !== 'playing' || isPaused) return;

    // Rotate starfield for dynamic background
    starField.rotation.y += 0.0001;
    starField.rotation.x += 0.0001;

    // Move paddles
    if (keys.ArrowLeft && gameMode === 'multiplayer' && player2Paddle.position.x > -8) {
        player2Paddle.position.x -= PADDLE_SPEED;
    }
    if (keys.ArrowRight && gameMode === 'multiplayer' && player2Paddle.position.x < 8) {
        player2Paddle.position.x += PADDLE_SPEED;
    }
    if (keys.a && player1Paddle.position.x > -8) {
        player1Paddle.position.x -= PADDLE_SPEED;
    }
    if (keys.d && player1Paddle.position.x < 8) {
        player1Paddle.position.x += PADDLE_SPEED;
    }

    updateAI();

    // Move ball
    ball.position.add(ballVelocity);

    // Ball collision with walls
    if (Math.abs(ball.position.x) > 9) {
        ballVelocity.x *= -1;
        playSound('wall');
    }

    // Ball collision with paddles
    if (ball.position.z < player1Paddle.position.z + PADDLE_DEPTH &&
        ball.position.z > player1Paddle.position.z - PADDLE_DEPTH &&
        Math.abs(ball.position.x - player1Paddle.position.x) < PADDLE_WIDTH / 2) {
        handlePaddleHit(player1Paddle);
    }

    if (ball.position.z > player2Paddle.position.z - PADDLE_DEPTH &&
        ball.position.z < player2Paddle.position.z + PADDLE_DEPTH &&
        Math.abs(ball.position.x - player2Paddle.position.x) < PADDLE_WIDTH / 2) {
        handlePaddleHit(player2Paddle);
    }

    // Scoring
    if (ball.position.z < -10) {
        player2Score++;
        document.getElementById('player2-score').textContent = player2Score;
        createScoreEffect(ball.position.clone());
        playSound('score');
        checkWinCondition();
        resetBall(1);
    } else if (ball.position.z > 10) {
        player1Score++;
        document.getElementById('player1-score').textContent = player1Score;
        createScoreEffect(ball.position.clone());
        playSound('score');
        checkWinCondition();
        resetBall(-1);
    }

    // Rotate ball for visual effect
    ball.rotation.x += ballVelocity.z * 0.1;
    ball.rotation.z -= ballVelocity.x * 0.1;
}

function handlePaddleHit(paddle) {
    consecutiveHits++;
    
    // Update max rally
    if (consecutiveHits > maxRally) {
        maxRally = consecutiveHits;
        document.getElementById('max-rally').textContent = maxRally;
    }
    
    // Update current rally
    document.getElementById('rally-count').textContent = consecutiveHits;
    
    // Increase ball speed
    currentBallSpeed = initialBallSpeed * (1 + Math.min(consecutiveHits * 0.1, 1));
    document.getElementById('ball-speed').textContent = `${(currentBallSpeed / initialBallSpeed).toFixed(1)}x`;
    
    // Update ball velocity
    ballVelocity.z *= -1.1;
    const paddleHitPosition = (ball.position.x - paddle.position.x) / (PADDLE_WIDTH / 2);
    ballVelocity.x = currentBallSpeed * paddleHitPosition;
    
    // Enhanced visual and physical feedback
    paddle.material.emissiveIntensity = 0.8;
    paddle.scale.x = 1.2;
    paddle.scale.y = 0.8;
    
    // Add a shockwave effect
    const shockwave = new THREE.Mesh(
        new THREE.RingGeometry(0, 2, 32),
        new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5
        })
    );
    
    shockwave.position.copy(ball.position);
    shockwave.rotation.x = Math.PI / 2;
    scene.add(shockwave);
    
    // Animate shockwave
    const expandShockwave = () => {
        shockwave.scale.x += 0.2;
        shockwave.scale.y += 0.2;
        shockwave.material.opacity -= 0.05;
        
        if (shockwave.material.opacity > 0) {
            requestAnimationFrame(expandShockwave);
        } else {
            scene.remove(shockwave);
        }
    };
    
    expandShockwave();
    
    setTimeout(() => {
        paddle.material.emissiveIntensity = 0.2;
        paddle.scale.x = 1;
        paddle.scale.y = 1;
    }, 100);
    
    // Update active player indication
    updateActivePlayer(paddle === player1Paddle ? 2 : 1);
    
    playSound('paddle');
    
    // Update rally counter
    if (consecutiveHits > 5) {
        showRallyText();
    }
}

function updateActivePlayer(playerNum) {
    document.getElementById('player1-info').classList.toggle('active', playerNum === 1);
    document.getElementById('player2-info').classList.toggle('active', playerNum === 2);
}

function showRallyText() {
    const rallyText = document.createElement('div');
    rallyText.className = 'rally-text';
    rallyText.textContent = `${consecutiveHits} Hit Combo!`;
    document.body.appendChild(rallyText);
    
    // Add animation class after a brief delay to trigger the animation
    requestAnimationFrame(() => {
        rallyText.classList.add('rally-text-animate');
    });
    
    setTimeout(() => {
        rallyText.classList.add('rally-text-fade');
        setTimeout(() => rallyText.remove(), 500);
    }, 1000);
}

function checkWinCondition() {
    if (player1Score >= MAX_SCORE || player2Score >= MAX_SCORE) {
        const winner = player1Score > player2Score ? 'Player 1' : (gameMode === 'singleplayer' ? 'AI' : 'Player 2');
        showWinScreen(winner);
    }
}

function showWinScreen(winner) {
    gameState = 'menu';
    playSound('win');
    
    // Remove any existing win screen
    const existingWinScreen = document.querySelector('.win-screen');
    if (existingWinScreen) {
        document.body.removeChild(existingWinScreen);
    }
    
    const winScreen = document.createElement('div');
    winScreen.className = 'win-screen menu';
    winScreen.innerHTML = `
        <h2>${winner} Wins!</h2>
        <div class="score-summary">
            <div class="final-score">
                <div class="score-item ${player1Score > player2Score ? 'winner' : ''}">
                    <span class="player-label">Player 1</span>
                    <span class="score-value">${player1Score}</span>
                </div>
                <div class="score-divider">-</div>
                <div class="score-item ${player2Score > player1Score ? 'winner' : ''}">
                    <span class="player-label">${gameMode === 'singleplayer' ? 'AI' : 'Player 2'}</span>
                    <span class="score-value">${player2Score}</span>
                </div>
            </div>
            <div class="stats-summary">
                <div class="stat">Longest Rally: ${maxRally}</div>
                <div class="stat">Max Ball Speed: ${(currentBallSpeed / initialBallSpeed).toFixed(1)}x</div>
            </div>
        </div>
        <div class="menu-options">
            <button class="glow-effect" id="play-again-btn">🔄 Play Again</button>
            <button class="glow-effect" id="back-menu-btn">🏠 Back to Menu</button>
        </div>
    `;
    document.body.appendChild(winScreen);

    // Add celebration particles
    createWinCelebration();

    // Add proper event listeners
    document.getElementById('play-again-btn').addEventListener('click', () => {
        document.body.removeChild(winScreen);
        resetGame();
        startGame(gameMode);
    });

    document.getElementById('back-menu-btn').addEventListener('click', () => {
        document.body.removeChild(winScreen);
        showMenu();
    });
}

// Add this new function for win celebration
function createWinCelebration() {
    const particleCount = 100;
    const colors = [0x00ff00, 0xffff00, 0x00ffff, 0xff00ff];
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            new THREE.MeshBasicMaterial({
                color: colors[Math.floor(Math.random() * colors.length)],
                transparent: true,
                opacity: 1
            })
        );
        
        // Position particles in a sphere around the center
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const r = 5;
        
        particle.position.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );
        
        particle.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            Math.random() * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        
        scene.add(particle);
        particles.push(particle);
    }
    
    // Animate celebration particles
    const animateParticles = () => {
        particles.forEach((particle, index) => {
            particle.position.add(particle.velocity);
            particle.velocity.y -= 0.005; // gentle gravity
            particle.material.opacity -= 0.01;
            particle.rotation.x += 0.1;
            particle.rotation.y += 0.1;
            
            if (particle.material.opacity <= 0) {
                scene.remove(particle);
                particles.splice(index, 1);
            }
        });
        
        if (particles.length > 0) {
            requestAnimationFrame(animateParticles);
        }
    };
    
    animateParticles();
}

// Create starfield background
const starGeometry = new THREE.BufferGeometry();
const starCount = 1000;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    starPositions[i3] = (Math.random() - 0.5) * 100;
    starPositions[i3 + 1] = (Math.random() - 0.5) * 100;
    starPositions[i3 + 2] = (Math.random() - 0.5) * 100;

    // Create different colored stars
    const color = new THREE.Color();
    color.setHSL(Math.random(), 0.5, 0.5);
    starColors[i3] = color.r;
    starColors[i3 + 1] = color.g;
    starColors[i3 + 2] = color.b;
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

const starMaterial = new THREE.PointsMaterial({
    size: 0.1,
    vertexColors: true,
    transparent: true
});

const starField = new THREE.Points(starGeometry, starMaterial);
scene.add(starField);

function createScoreEffect(position) {
    const particleCount = 30;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            new THREE.MeshBasicMaterial({ 
                color: 0x00ff00,
                transparent: true,
                opacity: 1 
            })
        );
        
        particle.position.copy(position);
        particle.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            Math.random() * 0.2,
            (Math.random() - 0.5) * 0.3
        );
        
        scene.add(particle);
        particles.push(particle);
    }
    
    // Animate particles
    const animateParticles = () => {
        particles.forEach((particle, index) => {
            particle.position.add(particle.velocity);
            particle.velocity.y -= 0.01; // gravity
            particle.material.opacity -= 0.02;
            
            if (particle.material.opacity <= 0) {
                scene.remove(particle);
                particles.splice(index, 1);
            }
        });
        
        if (particles.length > 0) {
            requestAnimationFrame(animateParticles);
        }
    };
    
    animateParticles();
}

function playSound(soundName) {
    try {
        if (sounds[soundName] && sounds[soundName].readyState >= 2) {
            sounds[soundName].currentTime = 0;
            sounds[soundName].play().catch(() => {});
        }
    } catch (e) {
        // Silently fail if sound playback fails
    }
}

function updateBackgroundColor() {
    const intensity = Math.min(consecutiveHits * 0.1, 1);
    const color = new THREE.Color(0x000000);
    color.lerp(new THREE.Color(0x001100), intensity);
    scene.background = color;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    updateGame();
    updateBallTrail();
    updateBackgroundColor();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the game
showMenu();
animate();

// Update togglePause function
function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pause-btn');
    
    if (isPaused) {
        document.getElementById('pause-menu').classList.remove('hidden');
        pauseBtn.querySelector('.button-content').textContent = '▶️ Resume';
        initializePauseMenuButtons();
        try {
            sounds.background.pause();
        } catch (e) {}
    } else {
        document.getElementById('pause-menu').classList.add('hidden');
        pauseBtn.querySelector('.button-content').textContent = '⏸️ Pause';
        if (gameState === 'playing') {
            try {
                sounds.background.play().catch(() => {});
            } catch (e) {}
        }
    }
} 
