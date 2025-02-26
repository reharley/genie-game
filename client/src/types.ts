import * as THREE from 'three';

// Player interface: Represents the player character
interface Player {
  mesh: THREE.Object3D;           // Player's 3D model (can be ArrowHelper or loaded model)
  animations: THREE.AnimationClip[]; // Animation clips for player movement
  mixer: THREE.AnimationMixer | null; // Animation mixer for playing animations
  health: number;                 // Player's health points
  inventory: string[];           // Array of item names in player's possession
  lastCastTime: number | null;   // Timestamp of last spell cast
  radius: number;                // Collision radius
  position: THREE.Vector3;       // Current position in 3D space
  moveDirection: THREE.Vector3;  // Direction of movement
  facingDirection: THREE.Vector3; // Direction player is facing
  currentRoom: Room | null;      // Reference to the current room
  isDashing?: boolean;           // Optional: Indicates if player is dashing
}

// AICompanion interface: Represents the AI companion assisting the player
interface AICompanion {
  interventionPoints: number;    // Points available for AI interventions
  lastInterventionTime: number;  // Timestamp of last intervention
}

// Enemy interface: Represents enemies in the game
interface Enemy {
  id: number;                    // Unique identifier
  mesh: THREE.Mesh;              // 3D mesh for the enemy
  health: number;                // Current health
  maxHealth: number;             // Maximum health
  type: string;                  // Enemy type (e.g., 'goblin', 'boss')
  lastAttackTime: number;        // Timestamp of last attack
  room: Room;                    // Room where the enemy resides
}

// Item interface: Represents collectible items
interface Item {
  id: number;                    // Unique identifier
  mesh: THREE.Mesh;              // 3D mesh for the item
  type: string;                  // Item type (e.g., 'key', 'potion')
}

// Projectile interface: Represents projectiles cast by the player
interface Projectile {
  id: number;                    // Unique identifier
  mesh: THREE.Mesh;              // 3D mesh for the projectile
  velocity: THREE.Vector3;       // Movement velocity
  creationTime: number;          // Timestamp of creation
}

// Door interface: Represents doors connecting rooms
interface Door {
  id: number;                    // Unique identifier
  mesh: THREE.Mesh;              // 3D mesh for the door
  locked: boolean;               // Whether the door is locked
  to: number;                    // ID of the room the door leads to
}

// Room interface: Represents a room in the dungeon
interface Room {
  id: number;                    // Unique identifier
  type: string;                  // Room type (e.g., 'normal', 'treasure')
  size: [number, number];        // Width and depth of the room
  position: [number, number, number]; // Position in the dungeon grid
  doors: Array<{
    to: number;                  // Room ID the door connects to
    position: [number, number, number]; // Position relative to the room
    locked: boolean;             // Whether the door is locked
  }>;                            // Array of door definitions
}

// Game interface: The central game object
interface Game {
  scene: THREE.Scene;            // Three.js scene containing all 3D objects
  camera: THREE.PerspectiveCamera; // Camera for rendering the scene
  renderer: THREE.WebGLRenderer; // Renderer for displaying the scene
  player: Player;                // The player object
  aiCompanion: AICompanion;      // The AI companion object
  walls: THREE.Mesh[];           // Array of wall meshes
  enemies: Enemy[];              // Array of enemies in the game
  items: Item[];                 // Array of items in the game
  projectiles: Projectile[];     // Array of active projectiles
  doors: Door[];                 // Array of doors in the dungeon
  dungeon: Room[];               // Array of rooms forming the dungeon
  boss: Enemy | null;            // The boss enemy, or null if not spawned
  gameOver: boolean;             // Indicates if the game has ended
  idCounter: number;             // Counter for generating unique IDs

  // Generates a unique ID
  generateUniqueId: () => number;

  // Creates an item at a specific position relative to a room
  createItem: (
    type: string,
    position: [number, number, number],
    roomPosition: [number, number, number]
  ) => Item;

  // Spawns an item at a given position in the game world
  spawnItemAt: (type: string, position: THREE.Vector3) => void;
}