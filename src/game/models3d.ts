import * as THREE from 'three';
import {
  CUSTOMER_TABLE_POSITIONS,
  INGREDIENT_LIST,
  IngredientDef,
  STOVE_POSITION,
} from './recipes';

/**
 * Generates a warm pastel checkered tile texture for the bistro floor.
 */
export function createFloorTileTexture(
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm cream and pastel sand tiles
  const tiles = 8;
  const step = canvas.width / tiles;

  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const isEven = (x + y) % 2 === 0;
      ctx.fillStyle = isEven ? '#f5ebe0' : '#e8d7c5';
      ctx.fillRect(x * step, y * step, step, step);

      // Subtle grout line
      ctx.strokeStyle = '#d6c3af';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * step + 1, y * step + 1, step - 2, step - 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/**
 * Creates a soft radial contact shadow disc to ground characters and props.
 */
export function createContactShadow(radius = 0.65): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x2c221e,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  return mesh;
}

/**
 * Creates the blocky low-poly Chef character (9-part composite THREE.Group)
 * with square head, tall chef toque hat, cylindrical coat, apron, arms, and spoon.
 */
export function createChefModel(): {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  heldDishMesh: THREE.Group;
} {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // 1. Contact shadow
  root.add(createContactShadow(0.62));

  // Materials with varied roughness/metalness
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf4c7ab,
    roughness: 0.65,
    metalness: 0.05,
    flatShading: true,
  });
  const coatMat = new THREE.MeshStandardMaterial({
    color: 0xfaf7f2,
    roughness: 0.8,
    metalness: 0.05,
    flatShading: true,
  });
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0xe07a5f, // Warm terracotta orange apron
    roughness: 0.55,
    metalness: 0.08,
    flatShading: true,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x3d405b,
    roughness: 0.75,
    metalness: 0.1,
    flatShading: true,
  });
  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0x2b2d42,
    roughness: 0.25,
    metalness: 0.5,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xb57c4a,
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
  });

  // 2. Legs (2 cylinders)
  const legGeo = new THREE.CylinderGeometry(0.12, 0.11, 0.42, 8);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.14, 0.21, 0);
  leftLeg.castShadow = true;
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.14, 0.21, 0);
  rightLeg.castShadow = true;
  bodyGroup.add(rightLeg);

  // 3. Cylindrical torso (Chef jacket)
  const torsoGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.78, 12);
  const torso = new THREE.Mesh(torsoGeo, coatMat);
  torso.position.y = 0.78;
  torso.castShadow = true;
   torso.receiveShadow = true;
  bodyGroup.add(torso);

  // 4. Apron wrap + front pocket
  const apronGeo = new THREE.CylinderGeometry(
    0.335,
    0.375,
    0.52,
    12,
    1,
    false,
    -Math.PI * 0.45,
    Math.PI * 0.9
  );
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = 0.66;
  apron.castShadow = true;
  bodyGroup.add(apron);

  // 5. Neckerchief / Scarf accent
  const scarfGeo = new THREE.TorusGeometry(0.24, 0.055, 6, 12);
  scarfGeo.rotateX(Math.PI / 2);
  const scarf = new THREE.Mesh(scarfGeo, apronMat);
  scarf.position.y = 1.17;
  bodyGroup.add(scarf);

  // 6. Double-breasted buttons
  const btnGeo = new THREE.SphereGeometry(0.035, 8, 8);
  for (let row = 0; row < 2; row++) {
    for (const side of [-0.08, 0.08]) {
      const btn = new THREE.Mesh(btnGeo, buttonMat);
      btn.position.set(side, 0.96 - row * 0.14, 0.33);
      bodyGroup.add(btn);
    }
  }

  // 7. Blocky Head (Square low-poly head, minimal eyes)
  const headGeo = new THREE.BoxGeometry(0.56, 0.52, 0.54);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.48;
  head.castShadow = true;
  bodyGroup.add(head);

  // Minimal blocky ears
  const earGeo = new THREE.BoxGeometry(0.08, 0.16, 0.12);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-0.3, 1.48, 0);
  bodyGroup.add(leftEar);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(0.3, 1.48, 0);
  bodyGroup.add(rightEar);

  // Subtle dark eyes on front (+Z) so facing direction is clear
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.08, 0.03);
  const leftEye = new THREE.Mesh(eyeGeo, buttonMat);
  leftEye.position.set(-0.12, 1.5, 0.275);
  bodyGroup.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, buttonMat);
  rightEye.position.set(0.12, 1.5, 0.275);
  bodyGroup.add(rightEye);

  // 8. Tall Chef Hat (Toque: cylinder band + puffy crown)
  const hatBandGeo = new THREE.CylinderGeometry(0.28, 0.27, 0.22, 12);
  const hatBand = new THREE.Mesh(hatBandGeo, coatMat);
  hatBand.position.y = 1.85;
  hatBand.castShadow = true;
  bodyGroup.add(hatBand);

  const hatPuffGeo = new THREE.CylinderGeometry(0.36, 0.28, 0.28, 10);
  const hatPuff = new THREE.Mesh(hatPuffGeo, coatMat);
  hatPuff.position.y = 2.08;
  hatPuff.castShadow = true;
  bodyGroup.add(hatPuff);

  // 9. Arms + Wooden Spoon
  const armGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.46, 8);
  const leftArm = new THREE.Mesh(armGeo, coatMat);
  leftArm.position.set(-0.42, 0.85, 0.08);
  leftArm.rotation.z = 0.22;
  leftArm.rotation.x = -0.35;
  leftArm.castShadow = true;
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, coatMat);
  rightArm.position.set(0.42, 0.85, 0.14);
  rightArm.rotation.z = -0.22;
  rightArm.rotation.x = -0.55;
  rightArm.castShadow = true;
  bodyGroup.add(rightArm);

  // Wooden tasting spoon in right hand
  const spoonHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6),
    woodMat
  );
  spoonHandle.position.set(0.46, 0.96, 0.36);
  spoonHandle.rotation.x = Math.PI / 4;
  bodyGroup.add(spoonHandle);

  // 10. Held Dish Platter (visible when chef carries a cooked dish)
  const heldDishMesh = new THREE.Group();
  heldDishMesh.position.set(0, 1.02, 0.56);
  heldDishMesh.visible = false;

  const platterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.1,
  });
  const clocheMat = new THREE.MeshStandardMaterial({
    color: 0xe64833,
    roughness: 0.35,
    metalness: 0.15,
    flatShading: true,
  });

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.06, 12),
    platterMat
  );
  heldDishMesh.add(plate);

  const foodDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    clocheMat
  );
  foodDome.position.y = 0.03;
  foodDome.name = 'dishDome';
  heldDishMesh.add(foodDome);

  bodyGroup.add(heldDishMesh);

  return { root, bodyGroup, heldDishMesh };
}

/**
 * Creates a blocky low-poly Customer NPC seated at a table.
 */
export function createCustomerNPC(shirtColor: number, hairColor: number): THREE.Group {
  const npc = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf1c27d,
    roughness: 0.65,
    flatShading: true,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtColor,
    roughness: 0.75,
    flatShading: true,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.85,
    flatShading: true,
  });

  // Cylindrical body
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.33, 0.72, 10),
    shirtMat
  );
  torso.position.y = 0.72;
  torso.castShadow = true;
  npc.add(torso);

  // Collar trim
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.04, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xfaf0ca, roughness: 0.5 })
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.08;
  npc.add(collar);

  // Blocky head
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.48, 0.5),
    skinMat
  );
  head.position.y = 1.38;
  head.castShadow = true;
  npc.add(head);

  // Blocky hair cap
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.18, 0.54),
    hairMat
  );
  hair.position.y = 1.64;
  hair.castShadow = true;
  npc.add(hair);

  // Arms resting toward table
  const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.42, 8);
  for (const side of [-0.36, 0.36]) {
    const arm = new THREE.Mesh(armGeo, shirtMat);
    arm.position.set(side, 0.78, 0.14);
    arm.rotation.x = -0.6;
    npc.add(arm);
  }

  return npc;
}

/**
 * Builds an individual ingredient pantry crate with sculpted 3D low-poly produce inside.
 */
function createIngredientCrateStation(ing: IngredientDef): THREE.Group {
  const group = new THREE.Group();
  group.position.set(ing.position.x, 0, ing.position.z);

  const woodCabinetMat = new THREE.MeshStandardMaterial({
    color: 0xd9a773,
    roughness: 0.7,
    metalness: 0.05,
    flatShading: true,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x9c6b3b,
    roughness: 0.8,
    metalness: 0.05,
    flatShading: true,
  });
  const counterTopMat = new THREE.MeshStandardMaterial({
    color: 0xf6efe6,
    roughness: 0.35,
    metalness: 0.08,
  });
  const produceMat = new THREE.MeshStandardMaterial({
    color: ing.color,
    roughness: 0.42,
    metalness: 0.05,
    flatShading: true,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x4cd137,
    roughness: 0.6,
    flatShading: true,
  });

  // 1. Base cabinet counter
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.88, 1.35),
    woodCabinetMat
  );
  base.position.y = 0.44;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Countertop slab
  const topSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.1, 1.45),
    counterTopMat
  );
  topSlab.position.y = 0.93;
  topSlab.castShadow = true;
  topSlab.receiveShadow = true;
  group.add(topSlab);

  // 3. Wooden crate rim on top of counter
  const crateBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.24, 0.95),
    darkWoodMat
  );
  crateBase.position.y = 1.1;
  crateBase.castShadow = true;
  group.add(crateBase);

  // 4. Front color badge strip
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.22, 0.05),
    produceMat
  );
  badge.position.set(0, 0.56, 0.69);
  group.add(badge);

  // 5. Sculpted produce items inside crate (5 items arranged in cluster)
  const offsets = [
    [-0.28, 1.28, -0.14],
    [0.28, 1.28, -0.12],
    [0, 1.32, 0.12],
    [-0.24, 1.26, 0.18],
    [0.26, 1.26, 0.18],
  ];

  offsets.forEach(([ox, oy, oz]) => {
    const itemGroup = new THREE.Group();
    itemGroup.position.set(ox, oy, oz);

    if (ing.id === 'CHEESE' || ing.id === 'BUTTER') {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.18, 0.24),
        produceMat
      );
      block.rotation.y = ox * 1.2;
      itemGroup.add(block);
    } else if (ing.id === 'BREAD') {
      const loaf = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.13, 0.22, 6, 8),
        produceMat
      );
      loaf.rotation.z = Math.PI / 2;
      itemGroup.add(loaf);
    } else if (ing.id === 'MUSHROOM') {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.16, 8),
        counterTopMat
      );
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        produceMat
      );
      cap.position.y = 0.06;
      itemGroup.add(stem, cap);
    } else {
      // Spherical/polyhedral produce (Tomato, Apple, Onion, Garlic, Lettuce)
      const sphere = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.16, 1),
        produceMat
      );
      itemGroup.add(sphere);

      if (ing.id === 'TOMATO' || ing.id === 'APPLE') {
        const stem = new THREE.Mesh(
          new THREE.ConeGeometry(0.05, 0.09, 5),
          leafMat
        );
        stem.position.y = 0.16;
        itemGroup.add(stem);
      }
    }
    group.add(itemGroup);
  });

  // 6. Subtle floor interaction halo ring in front of the crate
  const ringGeo = new THREE.RingGeometry(0.32, 0.44, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ing.color,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  const ringOffsetZ = ing.position.z < -4 ? 1.15 : 0;
  const ringOffsetX = ing.position.x > 5 ? -1.15 : 0;
  ring.position.set(ringOffsetX, 0.025, ringOffsetZ);
  group.add(ring);

  return group;
}

/**
 * Builds the central Cooking Stove & Prep Island with burners, copper soup pot, and pan.
 */
function createStoveIsland(): {
  stoveGroup: THREE.Group;
  potLiquidMesh: THREE.Mesh;
  steamParticles: THREE.Mesh[];
} {
  const stoveGroup = new THREE.Group();
  stoveGroup.position.set(STOVE_POSITION.x, 0, STOVE_POSITION.z);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x353b48,
    roughness: 0.45,
    metalness: 0.4,
    flatShading: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xdcdde1,
    roughness: 0.25,
    metalness: 0.75,
  });
  const woodPrepMat = new THREE.MeshStandardMaterial({
    color: 0xe1b17e,
    roughness: 0.6,
    metalness: 0.05,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd35400,
    roughness: 0.3,
    metalness: 0.65,
    flatShading: true,
  });
  const burnerGlowMat = new THREE.MeshStandardMaterial({
    color: 0xff6b35,
    emissive: 0xff5722,
    emissiveIntensity: 0.85,
    roughness: 0.3,
  });

  // 1. Main range unit
  const rangeBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.92, 1.35),
    bodyMat
  );
  rangeBox.position.y = 0.46;
  rangeBox.castShadow = true;
  rangeBox.receiveShadow = true;
  stoveGroup.add(rangeBox);

  // 2. Brushed stainless top plate
  const topPlate = new THREE.Mesh(
    new THREE.BoxGeometry(2.26, 0.08, 1.4),
    trimMat
  );
  topPlate.position.y = 0.95;
  topPlate.receiveShadow = true;
  stoveGroup.add(topPlate);

  // 3. Wooden cutting board side section
  const cuttingBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.06, 1.1),
    woodPrepMat
  );
  cuttingBoard.position.set(0.62, 1.01, 0);
  stoveGroup.add(cuttingBoard);

  // 4. Oven door & handle on front
  const ovenDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.56, 0.06),
    trimMat
  );
  ovenDoor.position.set(-0.4, 0.42, 0.68);
  stoveGroup.add(ovenDoor);

  // 5. Glowing burner & Copper Cooking Pot
  const burner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.34, 0.05, 16),
    burnerGlowMat
  );
  burner.position.set(-0.45, 1.0, 0);
  stoveGroup.add(burner);

  const potBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.3, 0.42, 14),
    copperMat
  );
  potBody.position.set(-0.45, 1.23, 0);
  potBody.castShadow = true;
  stoveGroup.add(potBody);

  // Pot handles
  for (const side of [-0.36, 0.36]) {
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.022, 6, 10),
      trimMat
    );
    handle.position.set(-0.45 + side, 1.32, 0);
    stoveGroup.add(handle);
  }

  // Pot liquid surface
  const potLiquidMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.31, 14),
    new THREE.MeshStandardMaterial({
      color: 0xe64833,
      roughness: 0.25,
      emissive: 0xe64833,
      emissiveIntensity: 0.2,
    })
  );
  potLiquidMesh.rotation.x = -Math.PI / 2;
  potLiquidMesh.position.set(-0.45, 1.43, 0);
  stoveGroup.add(potLiquidMesh);

  // 6. Steam puffs above the pot
  const steamParticles: THREE.Mesh[] = [];
  const steamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
  });
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.09 + i * 0.02, 0),
      steamMat.clone()
    );
    puff.position.set(
      -0.45 + (i % 2 === 0 ? 0.06 : -0.06),
      1.55 + i * 0.22,
      0
    );
    stoveGroup.add(puff);
    steamParticles.push(puff);
  }

  // 7. Floor interaction marker ring
  const stoveRing = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.54, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xff7f50,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    })
  );
  stoveRing.position.set(0, 0.025, 1.15);
  stoveGroup.add(stoveRing);

  return { stoveGroup, potLiquidMesh, steamParticles };
}

/**
 * Builds a warm low-poly Dining Table + Chairs + Customer NPC.
 */
function createDiningTableSet(
  tablePos: { x: number; z: number },
  shirtColor: number,
  hairColor: number
): {
  tableGroup: THREE.Group;
  customerGroup: THREE.Group;
  servedPlateGroup: THREE.Group;
} {
  const tableGroup = new THREE.Group();
  tableGroup.position.set(tablePos.x, 0, tablePos.z);

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xc89666,
    roughness: 0.6,
    metalness: 0.05,
    flatShading: true,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xf7ede2,
    roughness: 0.75,
    flatShading: true,
  });
  const accentRunnerMat = new THREE.MeshStandardMaterial({
    color: 0xe07a5f,
    roughness: 0.7,
    flatShading: true,
  });

  // Table pedestal + legs
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.18, 0.76, 10),
    woodMat
  );
  pillar.position.y = 0.38;
  pillar.castShadow = true;
  tableGroup.add(pillar);

  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.52, 0.08, 12),
    woodMat
  );
  foot.position.y = 0.04;
  tableGroup.add(foot);

  // Tabletop
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.1, 1.35),
    woodMat
  );
  top.position.y = 0.8;
  top.castShadow = true;
  top.receiveShadow = true;
  tableGroup.add(top);

  // Tablecloth runner
  const runner = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.115, 1.37),
    accentRunnerMat
  );
  runner.position.y = 0.805;
  tableGroup.add(runner);

  // Place mat
  const mat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.02, 12),
    clothMat
  );
  mat.position.set(0, 0.86, 0.15);
  tableGroup.add(mat);

  // Served dish plate on table (hidden until served or shows current table decor)
  const servedPlateGroup = new THREE.Group();
  servedPlateGroup.position.set(0, 0.88, 0.15);
  const plateMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.18, 0.04, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
  );
  servedPlateGroup.add(plateMesh);
  tableGroup.add(servedPlateGroup);

  // Wooden Chair behind table (+Z side facing -Z)
  const chairSeat = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.08, 0.62),
    woodMat
  );
  chairSeat.position.set(0, 0.46, 0.85);
  chairSeat.castShadow = true;
  tableGroup.add(chairSeat);

  const chairBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.58, 0.08),
    woodMat
  );
  chairBack.position.set(0, 0.78, 1.12);
  chairBack.castShadow = true;
  tableGroup.add(chairBack);

  // Customer NPC sitting on chair facing -Z (into the kitchen)
  const customerGroup = createCustomerNPC(shirtColor, hairColor);
  customerGroup.position.set(0, 0.12, 0.82);
  customerGroup.rotation.y = Math.PI; // Face toward kitchen (-Z)
  tableGroup.add(customerGroup);

  return { tableGroup, customerGroup, servedPlateGroup };
}

/**
 * Builds the entire low-poly isometric restaurant & kitchen scene.
 */
export function buildKitchenEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
) {
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  // 1. Checkered Floor + Base Platform
  const floorTex = createFloorTileTexture(renderer);
  const floorGeo = new THREE.PlaneGeometry(16, 14);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.05,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  floorMesh.name = 'walkableFloor';
  envGroup.add(floorMesh);

  // Thick wooden slab underneath floor so isometric edges look like a crafted diorama
  const foundationMat = new THREE.MeshStandardMaterial({
    color: 0xb08968,
    roughness: 0.8,
    flatShading: true,
  });
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(16.4, 0.6, 14.4),
    foundationMat
  );
  foundation.position.y = -0.31;
  foundation.receiveShadow = true;
  envGroup.add(foundation);

  // 2. Pastel Back & Right Cutaway Walls (Isometric Diorama Style)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf4e8d8, // Warm pastel cream
    roughness: 0.85,
    flatShading: true,
  });
  const wainscotMat = new THREE.MeshStandardMaterial({
    color: 0xdcb892, // Warm light oak wainscoting
    roughness: 0.7,
    flatShading: true,
  });

  // Back wall (-Z)
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(16.4, 3.8, 0.4),
    wallMat
  );
  backWall.position.set(0, 1.9, -7.0);
  backWall.receiveShadow = true;
  backWall.castShadow = true;
  envGroup.add(backWall);

  const backWainscot = new THREE.Mesh(
    new THREE.BoxGeometry(16.2, 1.1, 0.44),
    wainscotMat
  );
  backWainscot.position.set(0, 0.55, -6.98);
  envGroup.add(backWainscot);

  // Right wall (+X)
  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 3.8, 14.4),
    wallMat
  );
  rightWall.position.set(8.0, 1.9, 0);
  rightWall.receiveShadow = true;
  rightWall.castShadow = true;
  envGroup.add(rightWall);

  const rightWainscot = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 1.1, 14.2),
    wainscotMat
  );
  rightWainscot.position.set(7.98, 0.55, 0);
  envGroup.add(rightWainscot);

  // Wall shelves & Hanging copper pans on Back Wall
  const shelfGeo = new THREE.BoxGeometry(4.6, 0.1, 0.45);
  const shelf1 = new THREE.Mesh(shelfGeo, wainscotMat);
  shelf1.position.set(-2.5, 2.55, -6.6);
  shelf1.castShadow = true;
  envGroup.add(shelf1);

  const shelf2 = new THREE.Mesh(shelfGeo, wainscotMat);
  shelf2.position.set(3.2, 2.55, -6.6);
  shelf2.castShadow = true;
  envGroup.add(shelf2);

  // Decorative jars & pots on shelves
  const jarColors = [0xe64833, 0x6ab04c, 0xf4b41a, 0x7ed6df, 0xe056fd];
  for (let i = 0; i < 5; i++) {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.34, 10),
      new THREE.MeshStandardMaterial({
        color: jarColors[i],
        roughness: 0.35,
        flatShading: true,
      })
    );
    jar.position.set(-4.1 + i * 0.85, 2.77, -6.6);
    jar.castShadow = true;
    envGroup.add(jar);
  }

  // 3. Ingredient Stations
  const stationMeshes: Map<string, THREE.Group> = new Map();
  INGREDIENT_LIST.forEach((ing) => {
    const crateGroup = createIngredientCrateStation(ing);
    envGroup.add(crateGroup);
    stationMeshes.set(ing.id, crateGroup);
  });

  // 4. Central Stove & Prep Island
  const { stoveGroup, potLiquidMesh, steamParticles } = createStoveIsland();
  envGroup.add(stoveGroup);

  // 5. Dining Tables & Customer NPCs
  const customerMeshes: THREE.Group[] = [];
  const tableConfigs = [
    { pos: CUSTOMER_TABLE_POSITIONS[0], shirt: 0x5f9ea0, hair: 0x4a3525 },
    { pos: CUSTOMER_TABLE_POSITIONS[1], shirt: 0xe07a5f, hair: 0x2c221e },
  ];

  tableConfigs.forEach((cfg) => {
    const { tableGroup, customerGroup } = createDiningTableSet(
      cfg.pos,
      cfg.shirt,
      cfg.hair
    );
    envGroup.add(tableGroup);
    customerMeshes.push(customerGroup);
  });

  // 6. Blue Floor Navigation Indicator Rings (like the reference image's blue floor dots)
  const navDotsGroup = new THREE.Group();
  const dotPositions = [
    { x: -4.5, z: -3.2 },
    { x: -1.4, z: -3.2 },
    { x: 2.0, z: -3.2 },
    { x: 4.4, z: -2.0 },
    { x: 4.4, z: 1.5 },
    { x: -1.4, z: 1.4 },
    { x: -4.5, z: 1.6 },
  ];
  const dotGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.04, 16);
  const dotMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    transparent: true,
    opacity: 0.82,
  });

  dotPositions.forEach((pt) => {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(pt.x, 0.02, pt.z);
    navDotsGroup.add(dot);
  });
  envGroup.add(navDotsGroup);

  // Active Click Target Indicator Ring on the floor
  const targetMarkerGroup = new THREE.Group();
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.46, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
  );
  const innerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
  );
  targetMarkerGroup.add(outerRing, innerDisc);
  targetMarkerGroup.position.y = 0.03;
  targetMarkerGroup.visible = false;
  scene.add(targetMarkerGroup);

  return {
    floorMesh,
    stationMeshes,
    stoveGroup,
    potLiquidMesh,
    steamParticles,
    customerMeshes,
    targetMarkerGroup,
  };
}
