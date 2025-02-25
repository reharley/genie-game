import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
const loader = new GLTFLoader();

export function loadMeshGLTFModel(url, scene, player) {
  loader.load(url, (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    player.mesh = model;
    player.animations = gltf.animations;
    player.mesh.position.copy(player.position);

    // Add a light to the player model
    const playerLight = new THREE.PointLight(0xffffaa, 1, 20);
    playerLight.position.set(0, 2, 0);
    player.mesh.add(playerLight);

    // Find the skinned mesh and its skeleton
    let skinnedMesh;
    model.traverse((child) => {
      if (child.isSkinnedMesh) {
        skinnedMesh = child;
      }
    });
    if (skinnedMesh) {
      player.skeleton = skinnedMesh.skeleton;
      player.rootBone = player.skeleton.bones[0]; // Assuming the first bone is the root
    }

    // Set up animations
    if (player.animations && player.animations.length > 0) {
      player.mixer = new THREE.AnimationMixer(model);
      const idleClip = player.animations.find((clip) => clip.name === 'idle');
      const walkClip = player.animations.find((clip) => clip.name === 'walk');
      const castingClip = player.animations.find(
        (clip) => clip.name === 'casting'
      );

      if (player.rootBone) {
        const rootBoneName = player.rootBone.name;

        if (idleClip) {
          idleClip.tracks = idleClip.tracks.filter(
            (track) => !track.name.startsWith(rootBoneName + '.position')
          );
          player.idleAction = player.mixer.clipAction(idleClip);
          player.idleAction.play();
          player.currentAction = player.idleAction;
        }

        if (walkClip) {
          walkClip.tracks = walkClip.tracks.filter(
            (track) => !track.name.startsWith(rootBoneName + '.position')
          );
          player.walkAction = player.mixer.clipAction(walkClip);
        }

        if (castingClip) {
          castingClip.tracks = castingClip.tracks.filter(
            (track) => !track.name.startsWith(rootBoneName + '.position')
          );
          player.castAction = player.mixer.clipAction(castingClip);
        }
      }
    }
  });
}
