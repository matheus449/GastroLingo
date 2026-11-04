import {
  CUSTOMER_TABLE_POSITIONS,
  INGREDIENTS,
  INGREDIENT_LIST,
  RECIPES,
  RecipeDef,
  STOVE_POSITION,
} from './recipes';

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type OrderPhase = 'collecting' | 'ready_to_cook' | 'cooked' | 'served';

export interface InteractableStation {
  id: string;
  type: 'ingredient' | 'stove' | 'table';
  label: string;
  subLabel: string;
  position: { x: number; z: number };
  interactRadius: number;
  ingredientId?: string;
}

export interface KitchenGameState {
  screen: GameScreenState;
  level: number;
  xp: number;
  xpToNextLevel: number;
  coins: number;
  streak: number;
  dishesServed: number;
  targetDishesForShift: number;
  pronunciationAttempts: number;
  pronunciationSuccesses: number;
  currentRecipeIndex: number;
  currentRecipe: RecipeDef;
  activeTableIndex: number;
  inventory: string[]; // Ingredient IDs currently held
  cookedDish: string | null; // Recipe ID if cooked and ready to serve
  orderPhase: OrderPhase;
  customerHappiness: number; // 0 to 100
}

export const KITCHEN_BOUNDS = {
  minX: -7.2,
  maxX: 7.2,
  minZ: -6.0,
  maxZ: 6.0,
};

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Obstacles in the kitchen (stove island, dining tables, counters)
export const KITCHEN_OBSTACLES: ObstacleBox[] = [
  // Central stove / prep island
  { minX: -2.6, maxX: -0.2, minZ: -1.4, maxZ: 0.2 },
  // Dining Table 1
  { minX: -6.1, maxX: -3.9, minZ: 2.6, maxZ: 4.6 },
  // Dining Table 2
  { minX: -2.1, maxX: 0.1, minZ: 3.8, maxZ: 5.8 },
];

export function createInitialGameState(autostart = false): KitchenGameState {
  const firstRecipe = RECIPES[0];
  return {
    screen: autostart ? 'playing' : 'title',
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    coins: 120,
    streak: 0,
    dishesServed: 0,
    targetDishesForShift: 5,
    pronunciationAttempts: 0,
    pronunciationSuccesses: 0,
    currentRecipeIndex: 0,
    currentRecipe: firstRecipe,
    activeTableIndex: 0,
    inventory: [],
    cookedDish: null,
    orderPhase: 'collecting',
    customerHappiness: 100,
  };
}

export function getMissingIngredients(state: KitchenGameState): string[] {
  return state.currentRecipe.ingredients.filter(
    (reqId) => !state.inventory.includes(reqId)
  );
}

export function hasAllRecipeIngredients(state: KitchenGameState): boolean {
  return getMissingIngredients(state).length === 0;
}

export function addIngredientToInventory(
  state: KitchenGameState,
  ingredientId: string
): KitchenGameState {
  if (!INGREDIENTS[ingredientId]) return state;
  const alreadyHas = state.inventory.includes(ingredientId);
  const nextInventory = alreadyHas
    ? state.inventory
    : [...state.inventory, ingredientId];

  const allCollected = state.currentRecipe.ingredients.every((req) =>
    nextInventory.includes(req)
  );

  return {
    ...state,
    inventory: nextInventory,
    pronunciationAttempts: state.pronunciationAttempts + 1,
    pronunciationSuccesses: state.pronunciationSuccesses + 1,
    streak: state.streak + 1,
    orderPhase:
      state.cookedDish !== null
        ? 'cooked'
        : allCollected
        ? 'ready_to_cook'
        : 'collecting',
  };
}

export function recordPronunciationFailure(
  state: KitchenGameState
): KitchenGameState {
  return {
    ...state,
    pronunciationAttempts: state.pronunciationAttempts + 1,
    streak: 0,
  };
}

export function cookCurrentDish(state: KitchenGameState): KitchenGameState {
  if (!hasAllRecipeIngredients(state)) {
    return state;
  }
  return {
    ...state,
    cookedDish: state.currentRecipe.id,
    orderPhase: 'cooked',
    pronunciationAttempts: state.pronunciationAttempts + 1,
    pronunciationSuccesses: state.pronunciationSuccesses + 1,
    streak: state.streak + 1,
  };
}

export function serveDishToCustomer(state: KitchenGameState): KitchenGameState {
  if (state.cookedDish !== state.currentRecipe.id) {
    return state;
  }

  const streakBonus = Math.min(state.streak * 5, 30);
  const earnedCoins = state.currentRecipe.rewardCoins + streakBonus;
  const earnedXp = state.currentRecipe.rewardXp;

  let nextXp = state.xp + earnedXp;
  let nextLevel = state.level;
  let nextXpThreshold = state.xpToNextLevel;

  while (nextXp >= nextXpThreshold) {
    nextXp -= nextXpThreshold;
    nextLevel += 1;
    nextXpThreshold = Math.round(nextXpThreshold * 1.25);
  }

  const nextDishesServed = state.dishesServed + 1;
  const nextRecipeIdx = (state.currentRecipeIndex + 1) % RECIPES.length;
  const nextTableIdx =
    (state.activeTableIndex + 1) % CUSTOMER_TABLE_POSITIONS.length;

  return {
    ...state,
    level: nextLevel,
    xp: nextXp,
    xpToNextLevel: nextXpThreshold,
    coins: state.coins + earnedCoins,
    dishesServed: nextDishesServed,
    currentRecipeIndex: nextRecipeIdx,
    currentRecipe: RECIPES[nextRecipeIdx],
    activeTableIndex: nextTableIdx,
    inventory: [],
    cookedDish: null,
    orderPhase: 'collecting',
    customerHappiness: 100,
  };
}

export function getAllStations(activeTableIndex = 0): InteractableStation[] {
  const stations: InteractableStation[] = INGREDIENT_LIST.map((ing) => ({
    id: `station_${ing.id}`,
    type: 'ingredient',
    label: ing.word,
    subLabel: ing.translationPt,
    position: ing.position,
    interactRadius: 2.1,
    ingredientId: ing.id,
  }));

  stations.push({
    id: 'station_stove',
    type: 'stove',
    label: 'STOVE',
    subLabel: 'Fogão · Preparar Prato',
    position: STOVE_POSITION,
    interactRadius: 2.3,
  });

  const activeTable =
    CUSTOMER_TABLE_POSITIONS[activeTableIndex] || CUSTOMER_TABLE_POSITIONS[0];
  stations.push({
    id: 'station_table',
    type: 'table',
    label: activeTable.label.toUpperCase(),
    subLabel: 'Cliente · Entregar Pedido',
    position: { x: activeTable.x, z: activeTable.z - 0.8 },
    interactRadius: 2.5,
  });

  return stations;
}

export function findNearestStation(
  playerPos: { x: number; z: number },
  activeTableIndex = 0
): InteractableStation | null {
  const stations = getAllStations(activeTableIndex);
  let nearest: InteractableStation | null = null;
  let bestDist = Infinity;

  for (const st of stations) {
    const dx = playerPos.x - st.position.x;
    const dz = playerPos.z - st.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= st.interactRadius && dist < bestDist) {
      bestDist = dist;
      nearest = st;
    }
  }
  return nearest;
}

export function resolvePositionWithCollisions(
  current: { x: number; z: number },
  desired: { x: number; z: number },
  radius = 0.45
): { x: number; z: number } {
  let x = Math.max(
    KITCHEN_BOUNDS.minX + radius,
    Math.min(KITCHEN_BOUNDS.maxX - radius, desired.x)
  );
  let z = Math.max(
    KITCHEN_BOUNDS.minZ + radius,
    Math.min(KITCHEN_BOUNDS.maxZ - radius, desired.z)
  );

  for (const box of KITCHEN_OBSTACLES) {
    const expandedMinX = box.minX - radius;
    const expandedMaxX = box.maxX + radius;
    const expandedMinZ = box.minZ - radius;
    const expandedMaxZ = box.maxZ + radius;

    if (
      x > expandedMinX &&
      x < expandedMaxX &&
      z > expandedMinZ &&
      z < expandedMaxZ
    ) {
      // Push out along the shallowest penetration axis
      const overlapLeft = Math.abs(x - expandedMinX);
      const overlapRight = Math.abs(expandedMaxX - x);
      const overlapTop = Math.abs(z - expandedMinZ);
      const overlapBottom = Math.abs(expandedMaxZ - z);
      const minOverlap = Math.min(
        overlapLeft,
        overlapRight,
        overlapTop,
        overlapBottom
      );

      if (minOverlap === overlapLeft) x = expandedMinX;
      else if (minOverlap === overlapRight) x = expandedMaxX;
      else if (minOverlap === overlapTop) z = expandedMinZ;
      else z = expandedMaxZ;
    }
  }

  // Ensure still inside outer bounds
  x = Math.max(
    KITCHEN_BOUNDS.minX + radius,
    Math.min(KITCHEN_BOUNDS.maxX - radius, x)
  );
  z = Math.max(
    KITCHEN_BOUNDS.minZ + radius,
    Math.min(KITCHEN_BOUNDS.maxZ - radius, z)
  );

  return { x, z };
}
