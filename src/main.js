import * as THREE from 'three';
import './style.css';

const doorWidth = 2; // Doors will be 2 units wide
const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });

// Create scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Position camera above the scene, looking down
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

// Player object with additional stats
const player = {
  mesh: new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 0),
    1,
    0x00ff00
  ),
  health: 100,
  inventory: [],
  radius: 0.5,
  position: new THREE.Vector3(0, 0.1, 0),
  moveDirection: new THREE.Vector3(),
  facingDirection: new THREE.Vector3(0, 0, 1),
  currentRoom: null,
};
scene.add(player.mesh);
player.mesh.position.copy(player.position);

// AI Companion
const aiCompanion = {
  interventionPoints: 3,
  lastInterventionTime: Date.now(),
};

// Dungeon data
const walls = [];
const enemies = [];
const items = [];
const projectiles = [];
const doors = []; // Array to store door objects
let dungeon = [];
let boss = null;

// Load dungeon templates (hardcoded for now, replace with fetch from rooms.json)
const dungeonTemplates = {
  rooms: [
    // Stage 1: Forest Theme
    {
      id: 0,
      type: 'start',
      size: [10, 10],
      enemies: [
        { type: 'spider', position: [2, 0.5, 2] },
        { type: 'spider', position: [-2, 0.5, -2] },
      ],
      items: [],
      puzzles: [],
      doors: [{ to: 1, position: [5, 0, 0], locked: false }],
    },
    {
      id: 1,
      type: 'puzzle',
      size: [10, 10],
      enemies: [],
      items: [{ type: 'key', position: [0, 0.5, 0] }],
      puzzles: [{ type: 'switch_puzzle', solution: ['switch1', 'switch2'] }],
      doors: [
        { to: 0, position: [-5, 0, 0], locked: false },
        { to: 2, position: [0, 0, 5], locked: true },
      ],
    },
    // Stage 2: Shadow Theme
    {
      id: 2,
      type: 'combat',
      size: [10, 10],
      enemies: [
        { type: 'shadow', position: [3, 0.5, 3] },
        { type: 'shadow', position: [-3, 0.5, -3] },
      ],
      items: [],
      puzzles: [],
      doors: [
        { to: 1, position: [0, 0, -5], locked: false },
        { to: 3, position: [5, 0, 0], locked: false },
      ],
    },
    {
      id: 3,
      type: 'boss',
      size: [15, 15],
      enemies: [{ type: 'boss', position: [0, 0.5, 0] }],
      items: [],
      puzzles: [],
      doors: [{ to: 2, position: [-7.5, 0, 0], locked: false }],
    },
  ],
};

// Generate dungeon
function generateDungeon(templates) {
  const dungeonLayout = [
    { ...templates.rooms[0], position: [0, 0, 0] },
    { ...templates.rooms[1], position: [15, 0, 0] },
    { ...templates.rooms[2], position: [30, 0, 0] },
    { ...templates.rooms[3], position: [45, 0, 0] },
  ];
  dungeonLayout.forEach((room, index) => {
    room.index = index;
    createRoom(room);
  });
  return dungeonLayout;
}

function createWallSegments(wallDirection, room) {
  const { name, position, size, axis, doorCheck } = wallDirection;
  const doorsOnWall = room.doors.filter(doorCheck);

  const min =
    axis === 'z' ? position[2] - size[2] / 2 : position[0] - size[0] / 2;
  const max =
    axis === 'z' ? position[2] + size[2] / 2 : position[0] + size[0] / 2;

  if (doorsOnWall.length === 0) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      wallMaterial
    );
    wall.position.set(position[0], position[1], position[2]);
    scene.add(wall);
    walls.push(wall);
  } else {
    const door = doorsOnWall[0];
    const doorPos = axis === 'z' ? door.position[2] : door.position[0];
    const doorStart = doorPos - doorWidth / 2;
    const doorEnd = doorPos + doorWidth / 2;

    if (min < doorStart) {
      const segmentSize = doorStart - min;
      const segmentGeometry =
        axis === 'z'
          ? new THREE.BoxGeometry(size[0], size[1], segmentSize)
          : new THREE.BoxGeometry(segmentSize, size[1], size[2]);
      const wallSegment = new THREE.Mesh(segmentGeometry, wallMaterial);
      const segmentPos =
        axis === 'z'
          ? [position[0], position[1], min + segmentSize / 2]
          : [min + segmentSize / 2, position[1], position[2]];
      wallSegment.position.set(segmentPos[0], segmentPos[1], segmentPos[2]);
      scene.add(wallSegment);
      walls.push(wallSegment);
    }

    if (doorEnd < max) {
      const segmentSize = max - doorEnd;
      const segmentGeometry =
        axis === 'z'
          ? new THREE.BoxGeometry(size[0], size[1], segmentSize)
          : new THREE.BoxGeometry(segmentSize, size[1], size[2]);
      const wallSegment = new THREE.Mesh(segmentGeometry, wallMaterial);
      const segmentPos =
        axis === 'z'
          ? [position[0], position[1], doorEnd + segmentSize / 2]
          : [doorEnd + segmentSize / 2, position[1], position[2]];
      wallSegment.position.set(segmentPos[0], segmentPos[1], segmentPos[2]);
      scene.add(wallSegment);
      walls.push(wallSegment);
    }
  }
}

function createRoom(room) {
  const width = room.size[0];
  const depth = room.size[1];
  const centerX = room.position[0];
  const centerZ = room.position[2];
  const height = 5;
  const thickness = 0.5;

  // Create the floor
  const floorGeometry = new THREE.PlaneGeometry(width, depth);
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  scene.add(floor);

  // Define wall directions
  const wallDirections = [
    {
      name: 'east',
      position: [centerX + width / 2, height / 2, centerZ],
      size: [thickness, height, depth],
      axis: 'z',
      doorCheck: (door) => door.position[0] === width / 2,
    },
    {
      name: 'west',
      position: [centerX - width / 2, height / 2, centerZ],
      size: [thickness, height, depth],
      axis: 'z',
      doorCheck: (door) => door.position[0] === -width / 2,
    },
    {
      name: 'north',
      position: [centerX, height / 2, centerZ + depth / 2],
      size: [width, height, thickness],
      axis: 'x',
      doorCheck: (door) => door.position[2] === depth / 2,
    },
    {
      name: 'south',
      position: [centerX, height / 2, centerZ - depth / 2],
      size: [width, height, thickness],
      axis: 'x',
      doorCheck: (door) => door.position[2] === -depth / 2,
    },
  ];

  // Create walls with door gaps
  wallDirections.forEach((wallDir) => createWallSegments(wallDir, room));

  // Create door meshes for locked doors only
  room.doors.forEach((doorData) => {
    if (doorData.locked) {
      const doorGeometry = new THREE.BoxGeometry(doorWidth, 5, 0.5); // Increased depth to 0.5 for visibility
      const doorMaterial = new THREE.MeshBasicMaterial({ color: 0x885522 });
      const door = new THREE.Mesh(doorGeometry, doorMaterial);
      door.position.set(
        room.position[0] + doorData.position[0],
        2.5,
        room.position[2] + doorData.position[2]
      );
      if (doorData.position[2] !== 0) {
        door.rotation.y = 0; // North/South walls
      } else {
        door.rotation.y = Math.PI / 2; // East/West walls
      }
      door.locked = true;
      door.to = doorData.to;
      scene.add(door);
      doors.push(door);

      // Add a top plane for visibility from the top-down view
      const doorTop = new THREE.Mesh(
        new THREE.PlaneGeometry(doorWidth, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff0000 }) // Red for visibility
      );
      doorTop.position.set(0, 2.5, 0); // Positioned at the top of the door
      doorTop.rotation.x = -Math.PI / 2; // Horizontal plane
      door.add(doorTop); // Attach as a child of the door
    }
  });

  // Add enemies
  room.enemies.forEach((enemyData) => {
    const enemy = createEnemy(
      enemyData.type,
      enemyData.position,
      room.position
    );
    enemy.room = room;
    enemies.push(enemy);
  });

  // Add items
  room.items.forEach((itemData) => {
    const item = createItem(itemData.type, itemData.position, room.position);
    items.push(item);
  });
}

function createEnemy(type, position, roomPosition) {
  const geometry =
    type === 'boss'
      ? new THREE.BoxGeometry(2, 2, 2)
      : new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: type === 'boss' ? 0x550000 : 0xff0000,
  });
  const enemy = new THREE.Mesh(geometry, material);
  enemy.position.set(
    roomPosition[0] + position[0],
    position[1],
    roomPosition[2] + position[2]
  );
  enemy.health = type === 'boss' ? 100 : 20;
  enemy.type = type;
  enemy.lastAttackTime = 0;
  scene.add(enemy);
  if (type === 'boss') boss = enemy;
  return enemy;
}

function createItem(type, position, roomPosition) {
  const geometry = new THREE.SphereGeometry(0.2, 8, 8);
  const material = new THREE.MeshBasicMaterial({
    color: type === 'key' ? 0xffff00 : 0xff5555,
  });
  const item = new THREE.Mesh(geometry, material);
  item.position.set(
    roomPosition[0] + position[0],
    position[1],
    roomPosition[2] + position[2]
  );
  item.type = type;
  scene.add(item);
  return item;
}

// Input handling
const pressedKeys = {};
window.addEventListener('keydown', (event) => {
  pressedKeys[event.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (event) => {
  pressedKeys[event.key.toLowerCase()] = false;
});

const mouse = new THREE.Vector2();
let targetPoint = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(plane, targetPoint);
});

window.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    projectile.position.copy(player.mesh.position);
    projectile.velocity = player.facingDirection.clone().multiplyScalar(10);
    projectile.creationTime = Date.now();
    scene.add(projectile);
    projectiles.push(projectile);
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === ' ' && !player.isDashing) {
    player.isDashing = true;
    const direction =
      player.moveDirection.clone().length() > 0
        ? player.moveDirection
        : player.facingDirection;
    const dashDistance = 25;
    const newPos = player.mesh.position
      .clone()
      .add(direction.multiplyScalar(dashDistance));
    if (checkCollisions(newPos)) player.mesh.position.copy(newPos);
    setTimeout(() => {
      player.isDashing = false;
    }, 500);
  }
  if (event.key === 'h' && aiCompanion.interventionPoints > 0) {
    requestAIHelp();
  }
});

// Collision detection
function checkCollisions(newPosition) {
  const playerSphere = new THREE.Sphere(newPosition, player.radius);
  for (const wall of walls) {
    const wallBox = new THREE.Box3().setFromObject(wall);
    if (wallBox.intersectsSphere(playerSphere)) return false;
  }
  for (const door of doors) {
    if (door.locked) {
      const doorBox = new THREE.Box3().setFromObject(door);
      if (doorBox.intersectsSphere(playerSphere)) return false;
    }
  }
  return true;
}

// AI Companion logic
function requestAIHelp() {
  if (
    aiCompanion.interventionPoints <= 0 ||
    Date.now() - aiCompanion.lastInterventionTime < 5000
  )
    return;

  if (player.health < 30) {
    spawnHealthPotion(player.mesh.position);
  } else if (enemies.length > 3) {
    weakenEnemies();
  } else {
    spawnHealthPotion(player.mesh.position); // Default action
  }
  aiCompanion.interventionPoints--;
  aiCompanion.lastInterventionTime = Date.now();
}

function spawnHealthPotion(position) {
  const potion = createItem('potion', [0, 0.5, 0], [position.x, 0, position.z]);
  items.push(potion);
}

function weakenEnemies() {
  enemies.forEach((enemy) => {
    if (enemy.type !== 'boss') enemy.health = Math.max(enemy.health - 10, 0);
  });
}

// Resize renderer
function resizeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);

// Animation loop
let lastTime = Date.now();
let interacting = false; // Flag to handle interaction

function animate() {
  requestAnimationFrame(animate);

  const currentTime = Date.now();
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Player movement
  const speed = 5;
  const moveVector = new THREE.Vector3();
  if (pressedKeys['w']) moveVector.z -= 1;
  if (pressedKeys['s']) moveVector.z += 1;
  if (pressedKeys['a']) moveVector.x -= 1;
  if (pressedKeys['d']) moveVector.x += 1;

  if (moveVector.length() > 0 && !player.isDashing) {
    moveVector.normalize().multiplyScalar(speed * deltaTime);
    const newPosition = player.mesh.position.clone().add(moveVector);
    if (checkCollisions(newPosition)) {
      player.mesh.position.copy(newPosition);
      player.position.copy(newPosition);
    }
  }
  player.moveDirection = moveVector.clone();

  // Player facing
  if (targetPoint) {
    const direction = targetPoint.clone().sub(player.mesh.position);
    direction.y = 0;
    direction.normalize();
    player.mesh.setDirection(direction);
    player.facingDirection = direction.clone();
  }

  // Update current room
  player.currentRoom = dungeon.find((room) => {
    const dx = player.mesh.position.x - room.position[0];
    const dz = player.mesh.position.z - room.position[2];
    return Math.abs(dx) < room.size[0] / 2 && Math.abs(dz) < room.size[1] / 2;
  });

  // Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    projectile.position.add(
      projectile.velocity.clone().multiplyScalar(deltaTime)
    );

    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      if (projectile.position.distanceTo(enemy.position) < 0.6) {
        enemy.health -= 10;
        if (enemy.health <= 0) {
          scene.remove(enemy);
          enemies.splice(j, 1);
        }
        scene.remove(projectile);
        projectiles.splice(i, 1);
        break;
      }
    }

    if (currentTime - projectile.creationTime > 1000) {
      scene.remove(projectile);
      projectiles.splice(i, 1);
    }
  }

  // Item pickup
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (player.mesh.position.distanceTo(item.position) < 0.7) {
      player.inventory.push(item.type);
      if (item.type === 'potion')
        player.health = Math.min(player.health + 20, 100);
      scene.remove(item);
      items.splice(i, 1);
    }
  }

  // Door interaction
  if (pressedKeys['e'] && !interacting) {
    interacting = true;
    doors.forEach((door) => {
      if (player.mesh.position.distanceTo(door.position) < 3.5 && door.locked) {
        console.log('Interacting with doors');
        if (player.inventory.includes('key')) {
          door.locked = false;
          scene.remove(door);
          const index = doors.indexOf(door);
          if (index > -1) doors.splice(index, 1);
          // Remove key from inventory
          const keyIndex = player.inventory.indexOf('key');
          if (keyIndex > -1) player.inventory.splice(keyIndex, 1);
        } else {
          console.log('Door is locked. Need a key.');
        }
      }
    });
  } else if (!pressedKeys['e']) {
    interacting = false;
  }

  // Enemy AI (simple chase for non-boss enemies)
  const attackCooldown = 1000; // milliseconds
  const attackRange = 1.5;
  const attackDamage = 5;

  enemies.forEach((enemy) => {
    if (
      enemy.room === player.currentRoom &&
      enemy.health > 0 &&
      enemy.type !== 'boss'
    ) {
      // Movement
      const direction = player.mesh.position
        .clone()
        .sub(enemy.position)
        .normalize();
      enemy.position.add(direction.multiplyScalar(2 * deltaTime));

      // Attack
      const distance = player.mesh.position.distanceTo(enemy.position);
      if (
        distance < attackRange &&
        currentTime - enemy.lastAttackTime > attackCooldown
      ) {
        player.health -= attackDamage;
        enemy.lastAttackTime = currentTime;
      }
    }
  });

  // Boss AI
  if (boss && boss.health > 0 && boss.room === player.currentRoom) {
    if (boss.health > 70) {
      // Phase 1: Invulnerable (simplified, no switches yet)
    } else if (boss.health > 30) {
      // Phase 2: Chase and attack
      const direction = player.mesh.position
        .clone()
        .sub(boss.position)
        .normalize();
      boss.position.add(direction.multiplyScalar(3 * deltaTime));
    } else {
      // Phase 3: Enraged
      const direction = player.mesh.position
        .clone()
        .sub(boss.position)
        .normalize();
      boss.position.add(direction.multiplyScalar(5 * deltaTime));
    }
    if (player.mesh.position.distanceTo(boss.position) < 1.5) {
      player.health -= 10 * deltaTime;
    }
  }

  // Camera follows player
  camera.position.set(player.mesh.position.x, 10, player.mesh.position.z);
  camera.lookAt(player.mesh.position.x, 0, player.mesh.position.z);

  // Check win/lose conditions
  if (player.health <= 0) console.log('Game Over');
  if (boss && boss.health <= 0) console.log('You Win!');

  renderer.render(scene, camera);
}

// Initialize dungeon and start game
dungeon = generateDungeon(dungeonTemplates);
resizeRenderer();
animate();
