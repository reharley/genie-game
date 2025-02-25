import * as THREE from 'three';
import { loadMeshGLTFModel } from './loader';
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
  animations: [], // Present once the model is loaded
  mixer: null, // Present once the model is loaded
  health: 100,
  inventory: ['sword', 'genie lamp'],
  lastCastTime: null,
  radius: 0.5,
  position: new THREE.Vector3(0, 0.1, 0),
  moveDirection: new THREE.Vector3(),
  facingDirection: new THREE.Vector3(0, 0, 1),
  currentRoom: null,
};
loadMeshGLTFModel(
  'https://novelscapestorage.blob.core.windows.net/game-assets/char.glb',
  scene,
  player
);
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
let gameOver = false;

let idCounter = 0;
function generateUniqueId() {
  return idCounter++;
}

function updatePlayerUI() {
  document.getElementById('health').innerText = `Health: ${player.health}`;
  document.getElementById(
    'inventory'
  ).innerText = `Inventory: ${player.inventory.join(', ')}`;
}
function addMessageToChatLog(sender, message) {
  const chatMessages = document.getElementById('chat-messages');
  const chatLogContainer = document.getElementById('chat-log');
  const messageElement = document.createElement('div');
  messageElement.className = `message ${sender}-message`;
  if (sender === 'Agent') {
    messageElement.innerHTML = `<div><strong>${sender}:</strong>   ${message.type}</div>  ${message.response}`;
  } else {
    messageElement.innerText = `${sender}: ${message}`;
  }
  chatMessages.appendChild(messageElement);
  chatLogContainer.scrollTop = chatLogContainer.scrollHeight;
}
function createEnemyHealthBar(enemy) {
  const healthBar = document.createElement('div');
  healthBar.className = 'enemy-health-bar';
  healthBar.innerHTML = `<div class="health" style="width: ${enemy.health}%"></div>`;
  document.body.appendChild(healthBar);
  enemy.healthBar = healthBar; // Attach health bar to enemy object
}
function updateEnemyHealthBars() {
  enemies.forEach((enemy) => {
    if (enemy.healthBar) {
      // Update health
      const healthElement = enemy.healthBar.querySelector('.health');
      healthElement.style.width = `${(enemy.health / enemy.maxHealth) * 100}%`;

      // Update position (convert 3D to 2D screen coordinates)
      const vector = enemy.mesh.position.clone();
      vector.project(camera);
      const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
      enemy.healthBar.style.left = `${x - 25}px`; // Center the 50px-wide bar
      enemy.healthBar.style.top = `${y - 30}px`; // Position above enemy
    }
  });
}
function removeEnemyHealthBars() {
  enemies.forEach((enemy) => {
    if (enemy.healthBar) {
      document.body.removeChild(enemy.healthBar);
      enemy.healthBar = null;
    }
  });
}
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

function executeScript(script) {
  const context = {
    player, // Player object
    enemies, // Array of enemies
    items, // Array of items
    projectiles, // Array of projectiles
    doors, // Array of doors
    dungeon, // Array of room objects
    boss, // Boss object (null if no boss)
    scene, // THREE.js scene
    createItem, // Function to create items
    spawnItemAt: (type, position) => {
      const item = createItem(type, [position.x, 0.5, position.z], [0, 0, 0]);
      items.push(item);
      scene.add(item);
    },
  };
  try {
    const newScript = script;
    console.log('Executing AI script:');
    console.log(newScript);
    const func = new Function('context', newScript);
    func(context);
  } catch (error) {
    console.error('Error executing AI script:', error);
  }
}

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  console.log('Voice command:', transcript);
  addMessageToChatLog('Player', transcript);
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

async function sendToAI(transcript) {
  const gameState = getCurrentGameState();
  const prompt = `
You are an AI assistant named Genie in a roguelike game.

Current game state:
${JSON.stringify(gameState, null, 2)}

The player said: "${transcript}".
Provide a command to manipulate the game state or answer the question.`;
  const response = await callAIAPI(prompt);
  addMessageToChatLog('Agent', response);
  console.log('AI response:', response);
  if (response && response.type === 'js_game_script') {
    executeScript(response.response);
  } else if (response && response.type === 'agent_response') {
    console.log('AI says:', response.response);
    // Optionally, display to player in a UI if added later
  } else {
    console.log('Invalid or no response from AI');
  }
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
              enum: [
                'agent_response',
                // 'new_game_state',
                'js_game_script',
              ],
              description: `Possible types of responses that can be generated.
Only generate js to manipulate the game state when generating a script.
When generating a script always use ids to reference objects.
Use direct manipulation when editing the game state.
All the objects are three js objects in a scene. When altering the scene make sure to add and remove objects from the scene.

Here's a sample script removing an object from the scene:
\`\`\`javascript
const key = items.find(item => item.id === 3);
if (key) {
    player.inventory.push(key.type);
    items.splice(items.indexOf(key), 1);
    scene.remove(key.mesh);
}
\`\`\`
Here is the function executing the script:
\`\`\`javascript
function executeScript(script) {
  const context = {
    player, // Player object
    enemies, // Array of enemies
    items, // Array of items
    projectiles, // Array of projectiles
    doors, // Array of doors
    dungeon, // Array of room objects
    boss, // Boss object (null if no boss)
    scene, // THREE.js scene
    createItem, // Function to create items
    spawnItemAt: (type, position) => {
      const item = createItem(type, [position.x, 0.5, position.z], [0, 0, 0]);
      items.push(item);
      scene.add(item);
    },
  };
  try {
    let newScript = \`const { player, enemies, items, projectiles, doors, dungeon, boss, scene, createItem, spawnItemAt } = context;\n$ {script}\`;
    const func = new Function('context', newScript);
    func(context);
  } catch (error) {
    console.error('Error executing AI script:', error);
  }
}
\`\`\`
The code should always begin with the following line:
\`\`\`javascript
const { player, enemies, items, projectiles, doors, dungeon, boss, scene, createItem, spawnItemAt } = context;
\`\`\`
`,
            },
            response: {
              type: 'string',
              description:
                'The response that will be used. This will be used based on which type is selected.',
            },
          },
          required: ['type', 'response'],
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
        // max_tokens: 50,
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

function resetGame() {
  // Reset player
  player.health = 100;
  player.position.set(0, 0.1, 0);
  player.mesh.position.copy(player.position);
  player.inventory = ['sword', 'genie lamp'];

  // Remove all enemies
  enemies.forEach((enemy) => {
    scene.remove(enemy.mesh);
  });
  removeEnemyHealthBars();

  enemies.length = 0;
  boss = null;

  // Remove all items
  items.forEach((item) => scene.remove(item.mesh));
  items.length = 0;

  // Remove all projectiles
  projectiles.forEach((projectile) => scene.remove(projectile.mesh));
  projectiles.length = 0;

  // Remove all doors
  doors.forEach((door) => scene.remove(door.mesh));
  doors.length = 0;

  // Recreate enemies, items, and locked doors based on dungeon templates
  dungeon.forEach((room) => {
    // Recreate enemies
    room.enemies.forEach((enemyData) => {
      const enemy = createEnemy(
        enemyData.type,
        enemyData.position,
        room.position
      );
      enemy.room = room;
      enemies.push(enemy);
    });

    // Recreate items
    room.items.forEach((itemData) => {
      const item = createItem(itemData.type, itemData.position, room.position);
      items.push(item);
    });

    // Recreate locked doors
    room.doors.forEach((doorData) => {
      if (doorData.locked) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(doorWidth, 5, 0.5),
          new THREE.MeshBasicMaterial({ color: 0x885522 })
        );
        mesh.position.set(
          room.position[0] + doorData.position[0],
          2.5,
          room.position[2] + doorData.position[2]
        );
        mesh.rotation.y = doorData.position[2] !== 0 ? 0 : Math.PI / 2;
        const door = {
          id: generateUniqueId(),
          mesh,
          locked: true,
          to: doorData.to,
        };
        scene.add(mesh);
        doors.push(door);

        const doorTop = new THREE.Mesh(
          new THREE.PlaneGeometry(doorWidth, 0.5),
          new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        doorTop.position.set(0, 2.5, 0);
        doorTop.rotation.x = -Math.PI / 2;
        mesh.add(doorTop);
      }
    });
  });

  // Reset AI companion
  aiCompanion.interventionPoints = 3;
  aiCompanion.lastInterventionTime = Date.now();

  gameOver = false;
  animate();
}

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
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, 5, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x885522 })
      );
      mesh.position.set(
        room.position[0] + doorData.position[0],
        2.5,
        room.position[2] + doorData.position[2]
      );
      mesh.rotation.y = doorData.position[2] !== 0 ? 0 : Math.PI / 2;
      const door = {
        id: generateUniqueId(),
        mesh,
        locked: true,
        to: doorData.to,
      };
      scene.add(mesh);
      doors.push(door);
      const doorTop = new THREE.Mesh(
        new THREE.PlaneGeometry(doorWidth, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      doorTop.position.set(0, 2.5, 0);
      doorTop.rotation.x = -Math.PI / 2;
      mesh.add(doorTop);
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

function getCurrentGameState() {
  const currentRoom = player.currentRoom;
  const roomState = {
    id: currentRoom.id,
    type: currentRoom.type,
    size: currentRoom.size,
    enemies: enemies
      .filter((e) => e.room === currentRoom)
      .map((e) => ({
        id: e.id,
        type: e.type,
        position: [e.mesh.position.x, e.mesh.position.y, e.mesh.position.z],
        health: e.health,
      })),
    items: items
      .filter((item) => {
        const dx = item.mesh.position.x - currentRoom.position[0];
        const dz = item.mesh.position.z - currentRoom.position[2];
        return (
          Math.abs(dx) < currentRoom.size[0] / 2 &&
          Math.abs(dz) < currentRoom.size[1] / 2
        );
      })
      .map((item) => ({
        id: item.id,
        type: item.type,
        position: [
          item.mesh.position.x,
          item.mesh.position.y,
          item.mesh.position.z,
        ],
      })),
    projectiles: projectiles
      .filter((p) => {
        const dx = p.mesh.position.x - currentRoom.position[0];
        const dz = p.mesh.position.z - currentRoom.position[2];
        return (
          Math.abs(dx) < currentRoom.size[0] / 2 &&
          Math.abs(dz) < currentRoom.size[1] / 2
        );
      })
      .map((p) => ({
        id: p.id,
        position: [p.mesh.position.x, p.mesh.position.y, p.mesh.position.z],
      })),
    doors: currentRoom.doors.map((doorData) => {
      const doorPosition = new THREE.Vector3(
        currentRoom.position[0] + doorData.position[0],
        doorData.position[1],
        currentRoom.position[2] + doorData.position[2]
      );
      const doorObj = doors.find(
        (d) => d.mesh.position.distanceTo(doorPosition) < 0.1
      );
      return {
        to: doorData.to,
        position: [doorPosition.x, doorPosition.y, doorPosition.z],
        locked: !!doorObj,
        meshId: doorObj ? doorObj.id : null,
      };
    }),
  };
  const playerState = {
    position: [player.position.x, player.position.y, player.position.z],
    health: player.health,
    inventory: player.inventory,
    currentRoom: currentRoom.id,
  };
  const gameState = {
    player: playerState,
    currentRoom: roomState,
  };
  if (boss && boss.room === currentRoom) {
    gameState.boss = {
      id: boss.id,
      position: [
        boss.mesh.position.x,
        boss.mesh.position.y,
        boss.mesh.position.z,
      ],
      health: boss.health,
    };
  }
  return gameState;
}

function createEnemy(type, position, roomPosition) {
  const geometry =
    type === 'boss'
      ? new THREE.BoxGeometry(2, 2, 2)
      : new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: type === 'boss' ? 0x550000 : 0xff0000,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    roomPosition[0] + position[0],
    position[1],
    roomPosition[2] + position[2]
  );
  const enemy = {
    id: generateUniqueId(),
    mesh,
    health: type === 'boss' ? 100 : 20,
    maxHealth: type === 'boss' ? 100 : 20,
    type,
    lastAttackTime: 0,
    room: null, // Will be set later
  };
  scene.add(mesh);
  createEnemyHealthBar(enemy);
  if (type === 'boss') boss = enemy;
  return enemy;
}

function createItem(type, position, roomPosition) {
  const geometry = new THREE.SphereGeometry(0.2, 8, 8);
  const material = new THREE.MeshBasicMaterial({
    color: type === 'key' ? 0xffff00 : 0xff5555,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    roomPosition[0] + position[0],
    position[1],
    roomPosition[2] + position[2]
  );
  const item = {
    id: generateUniqueId(),
    mesh,
    type,
  };
  scene.add(mesh);
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
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    mesh.position.copy(player.mesh.position);
    const projectile = {
      id: generateUniqueId(),
      mesh,
      velocity: player.facingDirection.clone().multiplyScalar(10),
      creationTime: Date.now(),
    };
    scene.add(mesh);
    projectiles.push(projectile);
    player.lastCastTime = Date.now();
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
      new THREE.Box3().setFromObject(door.mesh).intersectsSphere(playerSphere)
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
function showGameOverUI(message) {
  const gameOverUI = document.getElementById('game-over');
  document.getElementById('restart-button').addEventListener('click', () => {
    resetGame();
    gameOverUI.style.display = 'none';
    gameOver = false;
  });
  document.getElementById('game-over-message').innerText = message;
  gameOverUI.style.display = 'flex';
}
function animate() {
  if (gameOver) {
    renderer.render(scene, camera);
    return;
  }
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
    player.mesh.lookAt(player.mesh.position.clone().add(direction));
    player.facingDirection = direction.clone();
  }

  if (player.mixer) {
    player.mixer.update(deltaTime); // Update animations with time delta
    if (player.lastCastTime && currentTime - player.lastCastTime < 1250) {
      if (player.castAction) {
        if (player.currentAction !== player.castAction) {
          if (player.currentAction) player.currentAction.stop();
          player.castAction.play();
          player.currentAction = player.castAction;
        }
      }
    } else if (moveVector.length() > 0 && player.walkAction) {
      if (player.currentAction !== player.walkAction) {
        if (player.currentAction) player.currentAction.stop();
        player.walkAction.play();
        player.currentAction = player.walkAction;
      }
    } else if (player.idleAction) {
      if (player.currentAction !== player.idleAction) {
        if (player.currentAction) player.currentAction.stop();
        player.idleAction.play();
        player.currentAction = player.idleAction;
      }
    }
  }

  player.currentRoom = dungeon.find((room) => {
    const dx = player.mesh.position.x - room.position[0];
    const dz = player.mesh.position.z - room.position[2];
    return Math.abs(dx) < room.size[0] / 2 && Math.abs(dz) < room.size[1] / 2;
  });

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    projectile.mesh.position.add(
      projectile.velocity.clone().multiplyScalar(deltaTime)
    );
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (projectile.mesh.position.distanceTo(enemies[j].mesh.position) < 0.6) {
        enemies[j].health -= 10;
        if (enemies[j].health <= 0) {
          scene.remove(enemies[j].mesh);
          if (enemies[j].healthBar) {
            document.body.removeChild(enemies[j].healthBar);
            enemies[j].healthBar = null;
          }
          enemies.splice(j, 1);
        }
        scene.remove(projectile.mesh);
        projectiles.splice(i, 1);
        break;
      }
    }
    if (currentTime - projectile.creationTime > 1000) {
      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
    }
  }

  for (let i = items.length - 1; i >= 0; i--) {
    if (player.mesh.position.distanceTo(items[i].mesh.position) < 0.7) {
      player.inventory.push(items[i].type);
      if (items[i].type === 'potion')
        player.health = Math.min(player.health + 20, 100);
      scene.remove(items[i].mesh);
      items.splice(i, 1);
    }
  }

  if (pressedKeys['e'] && !interacting) {
    interacting = true;
    doors.forEach((door) => {
      if (
        player.mesh.position.distanceTo(door.mesh.position) < 3.5 &&
        door.locked
      ) {
        console.log('inventory:', player.inventory);
        if (player.inventory.includes('key')) {
          door.locked = false;
          scene.remove(door.mesh);
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
        .sub(enemy.mesh.position)
        .normalize();
      enemy.mesh.position.add(direction.multiplyScalar(2 * deltaTime));
      if (
        player.mesh.position.distanceTo(enemy.mesh.position) < 1.5 &&
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
      boss.mesh.position.add(
        player.mesh.position
          .clone()
          .sub(boss.mesh.position)
          .normalize()
          .multiplyScalar(3 * deltaTime)
      );
    } else {
      boss.mesh.position.add(
        player.mesh.position
          .clone()
          .sub(boss.mesh.position)
          .normalize()
          .multiplyScalar(5 * deltaTime)
      );
    }
    if (player.mesh.position.distanceTo(boss.mesh.position) < 1.5) {
      player.health -= 10 * deltaTime;
    }
  }

  camera.position.set(player.mesh.position.x, 10, player.mesh.position.z);
  camera.lookAt(player.mesh.position.x, 0, player.mesh.position.z);

  updatePlayerUI();
  updateEnemyHealthBars();

  if (player.health <= 0) {
    gameOver = true;
    showGameOverUI('Game Over!');
  }
  if (boss && boss.health <= 0) {
    gameOver = true;
    showGameOverUI('You Win!');
  }

  renderer.render(scene, camera);
}

dungeon = generateDungeon(dungeonTemplates);
resizeRenderer();
animate();
