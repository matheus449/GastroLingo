import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CUSTOMER_TABLE_POSITIONS,
  INGREDIENTS,
} from '../game/recipes';
import {
  findNearestStation,
  getAllStations,
  InteractableStation,
  KitchenGameState,
  resolvePositionWithCollisions,
} from '../game/gameState';
import {
  buildKitchenEnvironment,
  createChefModel,
} from '../game/models3d';
import { soundFX } from '../game/sound';

export interface ScreenAnchorPositions {
  customerBubble: { x: number; y: number; visible: boolean };
  nearbyStationPrompt: {
    x: number;
    y: number;
    station: InteractableStation | null;
  };
  stationLabels: Array<{
    id: string;
    word: string;
    translationPt: string;
    x: number;
    y: number;
    isRequired: boolean;
    isCollected: boolean;
  }>;
}

interface KitchenCanvasProps {
  gameState: KitchenGameState;
  isModalOpen: boolean;
  onInteractStation: (station: InteractableStation) => void;
  onScreenAnchorsUpdate: (anchors: ScreenAnchorPositions) => void;
}

// Pre-allocated scratch vectors outside render loop to guarantee Zero GC
const _projVec = new THREE.Vector3();
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();

export const KitchenCanvas: React.FC<KitchenCanvasProps> = ({
  gameState,
  isModalOpen,
  onInteractStation,
  onScreenAnchorsUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest React props in refs so the 60fps loop never tears down the WebGL context
  const gameStateRef = useRef<KitchenGameState>(gameState);
  gameStateRef.current = gameState;

  const isModalOpenRef = useRef<boolean>(isModalOpen);
  isModalOpenRef.current = isModalOpen;

  const onInteractRef = useRef(onInteractStation);
  onInteractRef.current = onInteractStation;

  const onAnchorsUpdateRef = useRef(onScreenAnchorsUpdate);
  onAnchorsUpdateRef.current = onScreenAnchorsUpdate;

  // Player kinematic state in ref (spawn on open central walkway, completely unobstructed)
  const playerRef = useRef({
    x: 1.6,
    z: 0.2,
    rotationY: 0,
    targetX: null as number | null,
    targetZ: null as number | null,
    pendingStation: null as InteractableStation | null,
    walkDistance: 0,
    lastStepDist: 0,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect software WebGL (SwiftShader / llvmpipe) per Three.js skill
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialW = container.clientWidth || window.innerWidth;
    const initialH = container.clientHeight || window.innerHeight;
    renderer.setSize(initialW, initialH);
    renderer.domElement.dataset.testid = 'kitchen-3d-canvas';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene & Studio RoomEnvironment + Warm/Cool Lighting
    const scene = new THREE.Scene();
    const bgHex = 0x221d1a; // Warm dark espresso backdrop framing the pastel isometric diorama
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 45, 85);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // Isometric Orthographic Camera (45 degree azimuth, ~35.264 degree elevation)
    const aspect = initialW / initialH;
    const frustumSize = 13.5;
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      120
    );
    camera.position.set(-14, 14.5, 14);
    _camLookAt.set(0, 0.6, -0.3);
    camera.lookAt(_camLookAt);

    // Cool sky / warm ground HemisphereLight fill
    const hemiLight = new THREE.HemisphereLight(0xfff3e0, 0x8d6e63, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Warm golden Directional Key Light
    const keyLight = new THREE.DirectionalLight(0xffe8cc, 1.55);
    keyLight.position.set(-10, 18, 12);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    const d = 11;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 45;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Subtle Rim Light
    const rimLight = new THREE.DirectionalLight(0x90caf9, 0.45);
    rimLight.position.set(12, 10, -10);
    scene.add(rimLight);

    // 3. Build Kitchen Diorama & Chef Character
    const env = buildKitchenEnvironment(scene, renderer);
    const chef = createChefModel();
    chef.root.position.set(playerRef.current.x, 0, playerRef.current.z);
    scene.add(chef.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 4. Input Handling (WASD / Arrows + Raycaster Click on Floor or Station)
    const keysHeld = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current || gameStateRef.current.screen !== 'playing') {
        return;
      }
      keysHeld.add(e.code);

      if (e.code === 'KeyE' || e.code === 'Space') {
        const nearest = findNearestStation(
          { x: playerRef.current.x, z: playerRef.current.z },
          gameStateRef.current.activeTableIndex
        );
        if (nearest) {
          e.preventDefault();
          onInteractRef.current(nearest);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const onWindowBlur = () => {
      keysHeld.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    // Raycasting on pointerdown
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();

    const onPointerDown = (e: PointerEvent) => {
      if (isModalOpenRef.current || gameStateRef.current.screen !== 'playing') {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.ray.intersectPlane(groundPlane, intersectPoint);
      if (hit) {
        const clamped = resolvePositionWithCollisions(
          { x: playerRef.current.x, z: playerRef.current.z },
          { x: intersectPoint.x, z: intersectPoint.z }
        );

        // Check if user clicked directly on or near a station
        const clickedStation = findNearestStation(
          { x: intersectPoint.x, z: intersectPoint.z },
          gameStateRef.current.activeTableIndex
        );

        // If already close enough to that station, open immediately; otherwise walk to it
        if (clickedStation) {
          const distFromChef = Math.hypot(
            playerRef.current.x - clickedStation.position.x,
            playerRef.current.z - clickedStation.position.z
          );
          if (distFromChef <= clickedStation.interactRadius) {
            onInteractRef.current(clickedStation);
            return;
          }
          playerRef.current.pendingStation = clickedStation;
        } else {
          playerRef.current.pendingStation = null;
        }

        playerRef.current.targetX = clamped.x;
        playerRef.current.targetZ = clamped.z;
        env.targetMarkerGroup.position.set(clamped.x, 0.03, clamped.z);
        env.targetMarkerGroup.visible = true;
        soundFX.playPop();
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // ResizeObserver for crisp responsive orthographic frustum
    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const nextAspect = w / h;
      camera.left = (-frustumSize * nextAspect) / 2;
      camera.right = (frustumSize * nextAspect) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 5. Paced Animation Loop (with software-WebGL fenceSync guard)
    let frameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();
    let lastHudSyncTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync
        ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        : null;
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function projectToScreen(worldX: number, worldY: number, worldZ: number) {
      _projVec.set(worldX, worldY, worldZ);
      _projVec.project(camera);
      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;
      return {
        x: ((_projVec.x + 1) / 2) * w,
        y: (-(_projVec.y - 1) / 2) * h,
        inFrustum: _projVec.z >= -1 && _projVec.z <= 1,
      };
    }

    function tick() {
      if (isDisposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = clock.getElapsedTime();
      const state = gameStateRef.current;

      // Camera Choreography: smooth orbit pan on Title Screen, isometric lock in Playing
      const dampFactor = dt > 0 ? 1 - Math.exp(-5 * dt) : 1;
      if (state.screen === 'title') {
        const orbitAngle = -Math.PI * 0.25 + Math.sin(elapsed * 0.35) * 0.18;
        const radius = 19.5;
        _camTargetPos.set(
          Math.sin(orbitAngle) * radius,
          14.5,
          Math.cos(orbitAngle) * radius
        );
        _desiredLookAt.set(-1.5, 0.5, 0.2);
      } else {
        // Classic 45-degree isometric view
        _camTargetPos.set(
          -14.2 + playerRef.current.x * 0.12,
          14.6,
          14.2 + playerRef.current.z * 0.12
        );
        _desiredLookAt.set(
          playerRef.current.x * 0.15,
          0.5,
          playerRef.current.z * 0.15 - 0.3
        );
      }

      camera.position.lerp(_camTargetPos, dampFactor);
      _camLookAt.lerp(_desiredLookAt, dampFactor);
      camera.lookAt(_camLookAt);

      // Update Chef Movement when in 'playing' and modal closed
      if (state.screen === 'playing' && !isModalOpenRef.current) {
        let moveX = 0;
        let moveZ = 0;

        // Isometric-aligned WASD / Arrow controls
        if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp')) moveZ -= 1;
        if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown')) moveZ += 1;
        if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft')) moveX -= 1;
        if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight')) moveX += 1;

        const speed = 4.6;

        if (moveX !== 0 || moveZ !== 0) {
          // Cancel click-to-move when keyboard is used
          playerRef.current.targetX = null;
          playerRef.current.targetZ = null;
          playerRef.current.pendingStation = null;
          env.targetMarkerGroup.visible = false;

          const len = Math.hypot(moveX, moveZ);
          const nx = moveX / len;
          const nz = moveZ / len;

          const nextPos = resolvePositionWithCollisions(
            { x: playerRef.current.x, z: playerRef.current.z },
            {
              x: playerRef.current.x + nx * speed * dt,
              z: playerRef.current.z + nz * speed * dt,
            }
          );

          const stepMoved = Math.hypot(
            nextPos.x - playerRef.current.x,
            nextPos.z - playerRef.current.z
          );
          playerRef.current.x = nextPos.x;
          playerRef.current.z = nextPos.z;
          playerRef.current.walkDistance += stepMoved;

          const targetAngle = Math.atan2(nx, nz);
          playerRef.current.rotationY = targetAngle;
        } else if (
          playerRef.current.targetX !== null &&
          playerRef.current.targetZ !== null
        ) {
          const dx = playerRef.current.targetX - playerRef.current.x;
          const dz = playerRef.current.targetZ - playerRef.current.z;
          const dist = Math.hypot(dx, dz);

          if (dist < 0.15) {
            playerRef.current.targetX = null;
            playerRef.current.targetZ = null;
            env.targetMarkerGroup.visible = false;

            if (playerRef.current.pendingStation) {
              const st = playerRef.current.pendingStation;
              playerRef.current.pendingStation = null;
              onInteractRef.current(st);
            }
          } else {
            const step = Math.min(dist, speed * dt);
            const nx = dx / dist;
            const nz = dz / dist;
            const nextPos = resolvePositionWithCollisions(
              { x: playerRef.current.x, z: playerRef.current.z },
              {
                x: playerRef.current.x + nx * step,
                z: playerRef.current.z + nz * step,
              }
            );
            playerRef.current.x = nextPos.x;
            playerRef.current.z = nextPos.z;
            playerRef.current.walkDistance += step;
            playerRef.current.rotationY = Math.atan2(nx, nz);

            // Check if arrived within pendingStation radius
            if (playerRef.current.pendingStation) {
              const st = playerRef.current.pendingStation;
              const distToStation = Math.hypot(
                playerRef.current.x - st.position.x,
                playerRef.current.z - st.position.z
              );
              if (distToStation <= st.interactRadius * 0.9) {
                playerRef.current.targetX = null;
                playerRef.current.targetZ = null;
                playerRef.current.pendingStation = null;
                env.targetMarkerGroup.visible = false;
                onInteractRef.current(st);
              }
            }
          }
        }
      }

      // Sync Chef 3D transform & gait bobbing
      chef.root.position.set(playerRef.current.x, 0, playerRef.current.z);
      chef.bodyGroup.rotation.y = playerRef.current.rotationY;
      const walkBob =
        Math.abs(Math.sin(playerRef.current.walkDistance * 3.2)) * 0.08;
      chef.bodyGroup.position.y = walkBob;

      if (
        playerRef.current.walkDistance - playerRef.current.lastStepDist >
        1.15
      ) {
        playerRef.current.lastStepDist = playerRef.current.walkDistance;
        soundFX.playStep();
      }

      // Show held cooked platter if Chef has cooked the dish
      chef.heldDishMesh.visible = state.cookedDish !== null;

      // Animate stove steam particles & customer idle bob
      env.steamParticles.forEach((puff, idx) => {
        const cycle = (elapsed * 0.65 + idx * 0.25) % 1;
        puff.position.y = 1.5 + cycle * 0.75;
        const scale = 0.7 + Math.sin(cycle * Math.PI) * 0.55;
        puff.scale.setScalar(scale);
      });

      env.customerMeshes.forEach((cust, idx) => {
        cust.position.y = 0.12 + Math.sin(elapsed * 2.2 + idx) * 0.03;
      });

      // Animate click floor ring scale gently
      if (env.targetMarkerGroup.visible) {
        const ringScale = 0.9 + Math.sin(elapsed * 6) * 0.12;
        env.targetMarkerGroup.scale.setScalar(ringScale);
      }

      renderer.render(scene, camera);

      // Throttle 2D screen-space HUD projections to ~12Hz to keep React ultra-fast
      if (elapsed - lastHudSyncTime > 0.08) {
        lastHudSyncTime = elapsed;
        const activeTable =
          CUSTOMER_TABLE_POSITIONS[state.activeTableIndex] ||
          CUSTOMER_TABLE_POSITIONS[0];
        const custProj = projectToScreen(
          activeTable.x - 1.1,
          2.1,
          activeTable.z + 1.0
        );

        const nearest = findNearestStation(
          { x: playerRef.current.x, z: playerRef.current.z },
          state.activeTableIndex
        );
        let promptAnchor = {
          x: 0,
          y: 0,
          station: null as InteractableStation | null,
        };
        if (nearest) {
          const stProj = projectToScreen(
            nearest.position.x,
            1.95,
            nearest.position.z
          );
          promptAnchor = {
            x: stProj.x,
            y: stProj.y,
            station: nearest,
          };
        }

        const stationLabels = getAllStations(state.activeTableIndex)
          .filter((st) => st.type === 'ingredient' && st.ingredientId)
          .map((st) => {
            const ing = INGREDIENTS[st.ingredientId!];
            const proj = projectToScreen(
              st.position.x,
              1.65,
              st.position.z
            );
            return {
              id: ing.id,
              word: ing.word,
              translationPt: ing.translationPt,
              x: proj.x,
              y: proj.y,
              isRequired: state.currentRecipe.ingredients.includes(ing.id),
              isCollected: state.inventory.includes(ing.id),
            };
          });

        onAnchorsUpdateRef.current({
          customerBubble: {
            x: custProj.x,
            y: custProj.y,
            visible: custProj.inFrustum,
          },
          nearbyStationPrompt: promptAnchor,
          stationLabels,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 h-full w-full overflow-hidden select-none"
      aria-label="Isometric 3D Kitchen Viewport"
    />
  );
};
