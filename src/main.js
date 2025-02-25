import * as THREE from 'three';
import './style.css';

const doorWidth = 2;
const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });

// Scene setup
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
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

// Player
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

// Game objects
const walls = [];
const enemies = [];
const items = [];
const projectiles = [];
const doors = [];
let dungeon = [];
let boss = null;

// Dungeon JSON
const dungeonTemplates = {
  rooms: [
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

// **Voice Recognition Setup**
const recognition = new (window.SpeechRecognition ||
  window.webkitSpeechRecognition)();
recognition.lang = 'en-US';
recognition.interimResults = false;
recognition.maxAlternatives = 1;
let listening = false;

window.addEventListener('keydown', (event) => {
  if (event.key === 'v' && !listening) {
    listening = true;
    recognition.start();
    console.log('Listening for voice command...');
  }
});

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  console.log('Voice command:', transcript);
  sendToAI(transcript);
};

recognition.onend = () => {
  listening = false;
  console.log('Stopped listening');
};

recognition.onerror = (event) => {
  console.error('Speech recognition error', event.error);
  listening = false;
};

// **AI Integration**
async function sendToAI(transcript) {
  const prompt = `
You are an AI assistant named Genie in a roguelike game.

The player is in room ${player.currentRoom.id}, health: ${
    player.health
  }, inventory: ${player.inventory.join(
    ', '
  )}. The player said: "${transcript}".
Provide a command to manipulate the game state. Or answer a question.`;
  const response = await callAIAPI(prompt);
  console.log('AI response:', response);
  executeAICommand(response);
}

async function callAIAPI(prompt) {
  const mock = false; // Set to true to use mock API response
  if (mock) {
    // Mock API call (replace with actual GPT-4o-mini API endpoint)
    // In practice, use fetch() with your API key and endpoint
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate AI response based on transcript (for demo purposes)
        if (prompt.includes('need a key') || prompt.includes('spawn a key')) {
          resolve(`spawn key at player`);
        } else if (prompt.includes('unlock the door')) {
          resolve(`unlock door in room ${player.currentRoom.id}`);
        } else if (prompt.includes('heal me')) {
          resolve(`heal player by 20`);
        } else if (prompt.includes('hurt enemies')) {
          resolve(`damage enemies by 10`);
        } else {
          resolve(`spawn potion at player`);
        }
      }, 500);
    });
  } else {
    const functions = [
      {
        name: 'game_master',
        description:
          'Answers questions and provides commands to manipulate the game state.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['agent_response', 'new_game_state', 'js_game_script'],
              description:
                'Possible types of responses that can be generated. Only generate js to manipulate the game state when generating a script.',
            },
            response: {
              type: 'string',
              description:
                'The response that will be used. This will be used based on which type is selected.',
            },
          },
          required: ['positivePrompt', 'negativePrompt'],
        },
      },
    ];
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        functions,
        function_call: { name: 'game_master' },
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
      }),
    });
    const data = await response.json();
    const message = data.choices[0]?.message;
    try {
      if (message?.function_call?.name === 'game_master') {
        const args = JSON.parse(message.function_call.arguments);
        if (!args.type || !args.response) {
          throw new Error('Incomplete prompt data received from OpenAI.');
        }
        return args;
      } else {
        throw new Error('No function call was made by the assistant.');
      }
    } catch (error) {
      console.error('Error with prompts:', error.message);
    }
  }
}

function executeAICommand(command) {
  if (command.startsWith('spawn')) {
    const match = command.match(/spawn (\w+) at (\w+|\d+,\d+,\d+)/);
    if (match) {
      const itemType = match[1];
      let position;
      if (match[2] === 'player') {
        position = [player.mesh.position.x, 0.5, player.mesh.position.z];
      } else {
        const coords = match[2].split(',').map(Number);
        position = [coords[0], 0.5, coords[2]];
      }
      spawnItem(itemType, position);
      console.log(`Spawned ${itemType} at [${position}]`);
    }
  } else if (command.startsWith('unlock door in room')) {
    const match = command.match(/unlock door in room (\d+)/);
    if (match) {
      const roomId = parseInt(match[1]);
      unlockDoorInRoom(roomId);
      console.log(`Unlocked doors in room ${roomId}`);
    }
  } else if (command.startsWith('heal player by')) {
    const match = command.match(/heal player by (\d+)/);
    if (match) {
      const amount = parseInt(match[1]);
      healPlayer(amount);
      console.log(`Healed player by ${amount}`);
    }
  } else if (command.startsWith('damage enemies by')) {
    const match = command.match(/damage enemies by (\d+)/);
    if (match) {
      const amount = parseInt(match[1]);
      damageEnemies(amount);
      console.log(`Damaged enemies by ${amount}`);
    }
  } else {
    console.log('Unknown AI command:', command);
  }
}

function spawnItem(type, position) {
  const item = createItem(type, [position[0], 0, position[2]], [0, 0, 0]);
  item.position.y = 0.5; // Ensure item is above ground
  items.push(item);
}

function unlockDoorInRoom(roomId) {
  const room = dungeon.find((r) => r.id === roomId);
  if (room) {
    room.doors.forEach((doorData) => {
      const door = doors.find((d) => d.to === doorData.to && d.locked);
      if (door) {
        door.locked = false;
        scene.remove(door);
        const index = doors.indexOf(door);
        if (index > -1) doors.splice(index, 1);
      }
    });
  }
}

function healPlayer(amount) {
  player.health = Math.min(player.health + amount, 100);
}

function damageEnemies(amount) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.health = Math.max(enemy.health - amount, 0);
    if (enemy.health <= 0) {
      scene.remove(enemy);
      enemies.splice(i, 1);
    }
  }
}

// Existing Functions (unchanged for brevity, assume they remain as in the document)
function generateDungeon(templates) {
  const roomMap = {};
  templates.rooms.forEach((room) => {
    roomMap[room.id] = room;
  });
  const positions = { 0: [0, 0, 0] };
  const queue = [0];
  while (queue.length > 0) {
    const roomId = queue.shift();
    const room = roomMap[roomId];
    const pos = positions[roomId];
    for (const door of room.doors) {
      const connectedId = door.to;
      if (!(connectedId in positions)) {
        const connectedRoom = roomMap[connectedId];
        const sizeA = room.size;
        const sizeB = connectedRoom.size;
        let offset;
        if (door.position[0] === sizeA[0] / 2)
          offset = [sizeA[0] / 2 + sizeB[0] / 2, 0, 0];
        else if (door.position[0] === -sizeA[0] / 2)
          offset = [-(sizeA[0] / 2 + sizeB[0] / 2), 0, 0];
        else if (door.position[2] === sizeA[1] / 2)
          offset = [0, 0, sizeA[1] / 2 + sizeB[1] / 2];
        else offset = [0, 0, -(sizeA[1] / 2 + sizeB[1] / 2)];
        positions[connectedId] = [
          pos[0] + offset[0],
          pos[1] + offset[1],
          pos[2] + offset[2],
        ];
        queue.push(connectedId);
      }
    }
  }
  const dungeonLayout = templates.rooms.map((room) => ({
    ...room,
    position: positions[room.id],
  }));
  dungeonLayout.forEach((room, index) => {
    room.index = index;
    createRoom(room);
  });
  return dungeonLayout;
}

function createRoom(room) {
  const width = room.size[0];
  const depth = room.size[1];
  const centerX = room.position[0];
  const centerZ = room.position[2];
  const height = 5;
  const thickness = 0.5;
  const floorGeometry = new THREE.PlaneGeometry(width, depth);
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  scene.add(floor);
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
  wallDirections.forEach((wallDir) => createWallSegments(wallDir, room));
  room.doors.forEach((doorData) => {
    if (doorData.locked) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, 5, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x885522 })
      );
      door.position.set(
        room.position[0] + doorData.position[0],
        2.5,
        room.position[2] + doorData.position[2]
      );
      door.rotation.y = doorData.position[2] !== 0 ? 0 : Math.PI / 2;
      door.locked = true;
      door.to = doorData.to;
      scene.add(door);
      doors.push(door);
      const doorTop = new THREE.Mesh(
        new THREE.PlaneGeometry(doorWidth, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      doorTop.position.set(0, 2.5, 0);
      doorTop.rotation.x = -Math.PI / 2;
      door.add(doorTop);
    }
  });
  room.enemies.forEach((enemyData) => {
    const enemy = createEnemy(
      enemyData.type,
      enemyData.position,
      room.position
    );
    enemy.room = room;
    enemies.push(enemy);
  });
  room.items.forEach((itemData) => {
    const item = createItem(itemData.type, itemData.position, room.position);
    items.push(item);
  });
}

function createWallSegments(wallDirection, room) {
  const { position, size, axis, doorCheck } = wallDirection;
  const doorsOnWall = room.doors.filter(doorCheck);
  const min =
    axis === 'z' ? position[2] - size[2] / 2 : position[0] - size[0] / 2;
  const max =
    axis === 'z' ? position[2] + size[2] / 2 : position[0] + size[0] / 2;
  const gapWidth = doorWidth + 2 * player.radius;
  if (doorsOnWall.length === 0) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      wallMaterial
    );
    wall.position.set(position[0], position[1], position[2]);
    scene.add(wall);
    walls.push(wall);
  } else {
    const gaps = doorsOnWall.map((door) => {
      const doorPos =
        axis === 'z'
          ? room.position[2] + door.position[2]
          : room.position[0] + door.position[0];
      return [doorPos - gapWidth / 2, doorPos + gapWidth / 2];
    });
    gaps.sort((a, b) => a[0] - b[0]);
    let currentPos = min;
    for (const [gapStart, gapEnd] of gaps) {
      if (currentPos < gapStart) {
        const segmentSize = gapStart - currentPos;
        const segmentGeometry =
          axis === 'z'
            ? new THREE.BoxGeometry(size[0], size[1], segmentSize)
            : new THREE.BoxGeometry(segmentSize, size[1], size[2]);
        const wallSegment = new THREE.Mesh(segmentGeometry, wallMaterial);
        const segmentPos =
          axis === 'z'
            ? [position[0], position[1], currentPos + segmentSize / 2]
            : [currentPos + segmentSize / 2, position[1], position[2]];
        wallSegment.position.set(segmentPos[0], segmentPos[1], segmentPos[2]);
        scene.add(wallSegment);
        walls.push(wallSegment);
      }
      currentPos = gapEnd;
    }
    if (currentPos < max) {
      const segmentSize = max - currentPos;
      const segmentGeometry =
        axis === 'z'
          ? new THREE.BoxGeometry(size[0], size[1], segmentSize)
          : new THREE.BoxGeometry(segmentSize, size[1], size[2]);
      const wallSegment = new THREE.Mesh(segmentGeometry, wallMaterial);
      const segmentPos =
        axis === 'z'
          ? [position[0], position[1], currentPos + segmentSize / 2]
          : [currentPos + segmentSize / 2, position[1], position[2]];
      wallSegment.position.set(segmentPos[0], segmentPos[1], segmentPos[2]);
      scene.add(wallSegment);
      walls.push(wallSegment);
    }
  }
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
    const newPos = player.mesh.position
      .clone()
      .add(direction.multiplyScalar(25));
    if (checkCollisions(newPos)) player.mesh.position.copy(newPos);
    setTimeout(() => {
      player.isDashing = false;
    }, 500);
  }
  if (event.key === 'h' && aiCompanion.interventionPoints > 0) requestAIHelp();
});

function checkCollisions(newPosition) {
  const playerSphere = new THREE.Sphere(newPosition, player.radius);
  for (const wall of walls) {
    if (new THREE.Box3().setFromObject(wall).intersectsSphere(playerSphere))
      return false;
  }
  for (const door of doors) {
    if (
      door.locked &&
      new THREE.Box3().setFromObject(door).intersectsSphere(playerSphere)
    )
      return false;
  }
  return true;
}

function requestAIHelp() {
  if (
    aiCompanion.interventionPoints <= 0 ||
    Date.now() - aiCompanion.lastInterventionTime < 5000
  )
    return;
  if (player.health < 30) spawnHealthPotion(player.mesh.position);
  else if (enemies.length > 3) weakenEnemies();
  else spawnHealthPotion(player.mesh.position);
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

function resizeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);

let lastTime = Date.now();
let interacting = false;

function animate() {
  requestAnimationFrame(animate);
  const currentTime = Date.now();
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

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

  if (targetPoint) {
    const direction = targetPoint
      .clone()
      .sub(player.mesh.position)
      .setY(0)
      .normalize();
    player.mesh.setDirection(direction);
    player.facingDirection = direction.clone();
  }

  player.currentRoom = dungeon.find((room) => {
    const dx = player.mesh.position.x - room.position[0];
    const dz = player.mesh.position.z - room.position[2];
    return Math.abs(dx) < room.size[0] / 2 && Math.abs(dz) < room.size[1] / 2;
  });

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    projectile.position.add(
      projectile.velocity.clone().multiplyScalar(deltaTime)
    );
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (projectile.position.distanceTo(enemies[j].position) < 0.6) {
        enemies[j].health -= 10;
        if (enemies[j].health <= 0) {
          scene.remove(enemies[j]);
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

  for (let i = items.length - 1; i >= 0; i--) {
    if (player.mesh.position.distanceTo(items[i].position) < 0.7) {
      player.inventory.push(items[i].type);
      if (items[i].type === 'potion')
        player.health = Math.min(player.health + 20, 100);
      scene.remove(items[i]);
      items.splice(i, 1);
    }
  }

  if (pressedKeys['e'] && !interacting) {
    interacting = true;
    doors.forEach((door) => {
      if (player.mesh.position.distanceTo(door.position) < 3.5 && door.locked) {
        if (player.inventory.includes('key')) {
          door.locked = false;
          scene.remove(door);
          const index = doors.indexOf(door);
          if (index > -1) doors.splice(index, 1);
          const keyIndex = player.inventory.indexOf('key');
          if (keyIndex > -1) player.inventory.splice(keyIndex, 1);
        } else {
          console.log('Door is locked. Need a key.');
        }
      }
    });
  } else if (!pressedKeys['e']) interacting = false;

  enemies.forEach((enemy) => {
    if (
      enemy.room === player.currentRoom &&
      enemy.health > 0 &&
      enemy.type !== 'boss'
    ) {
      const direction = player.mesh.position
        .clone()
        .sub(enemy.position)
        .normalize();
      enemy.position.add(direction.multiplyScalar(2 * deltaTime));
      if (
        player.mesh.position.distanceTo(enemy.position) < 1.5 &&
        currentTime - enemy.lastAttackTime > 1000
      ) {
        player.health -= 5;
        enemy.lastAttackTime = currentTime;
      }
    }
  });

  if (boss && boss.health > 0 && boss.room === player.currentRoom) {
    if (boss.health > 70) {
      // Phase 1
    } else if (boss.health > 30) {
      boss.position.add(
        player.mesh.position
          .clone()
          .sub(boss.position)
          .normalize()
          .multiplyScalar(3 * deltaTime)
      );
    } else {
      boss.position.add(
        player.mesh.position
          .clone()
          .sub(boss.position)
          .normalize()
          .multiplyScalar(5 * deltaTime)
      );
    }
    if (player.mesh.position.distanceTo(boss.position) < 1.5)
      player.health -= 10 * deltaTime;
  }

  camera.position.set(player.mesh.position.x, 10, player.mesh.position.z);
  camera.lookAt(player.mesh.position.x, 0, player.mesh.position.z);

  if (player.health <= 0) console.log('Game Over');
  if (boss && boss.health <= 0) console.log('You Win!');

  renderer.render(scene, camera);
}

dungeon = generateDungeon(dungeonTemplates);
resizeRenderer();
animate();
