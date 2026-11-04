import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePronunciation,
  levenshteinDistance,
  normalizeSpeechText,
} from './pronunciation';
import {
  addIngredientToInventory,
  cookCurrentDish,
  createInitialGameState,
  findNearestStation,
  hasAllRecipeIngredients,
  resolvePositionWithCollisions,
  serveDishToCustomer,
} from './gameState';

test('levenshteinDistance computes accurate edit distances', () => {
  assert.equal(levenshteinDistance('tomato', 'tomato'), 0);
  assert.equal(levenshteinDistance('tomato', 'tomatos'), 1);
  assert.equal(levenshteinDistance('cheese', 'cheeze'), 1);
  assert.equal(levenshteinDistance('apple', 'orange'), 5);
});

test('evaluatePronunciation matches exact, phrase-contained, and accent-tolerant speech', () => {
  const exact = evaluatePronunciation('Tomato', 'TOMATO');
  assert.equal(exact.isMatch, true);
  assert.equal(exact.score, 100);

  const inPhrase = evaluatePronunciation('I said tomato please', 'TOMATO');
  assert.equal(inPhrase.isMatch, true);

  const slightAccent = evaluatePronunciation('tomatu', 'TOMATO');
  assert.equal(slightAccent.isMatch, true);

  const wrongWord = evaluatePronunciation('banana', 'TOMATO');
  assert.equal(wrongWord.isMatch, false);

  const rhymingWrongWord = evaluatePronunciation('Potato', 'TOMATO');
  assert.equal(rhymingWrongWord.isMatch, false);

  const emptySpeech = evaluatePronunciation('   ', 'TOMATO');
  assert.equal(emptySpeech.isMatch, false);
});

test('normalizeSpeechText removes punctuation and extra spaces', () => {
  assert.equal(normalizeSpeechText('  Tomato,   SOUP!! '), 'tomato soup');
});

test('game state loop: collect ingredients -> cook at stove -> serve customer -> advance recipe & XP', () => {
  let state = createInitialGameState(true);
  assert.equal(state.screen, 'playing');
  assert.equal(state.currentRecipe.id, 'tomato_soup');
  assert.deepEqual(state.currentRecipe.ingredients, ['TOMATO', 'ONION', 'GARLIC']);
  assert.equal(hasAllRecipeIngredients(state), false);

  state = addIngredientToInventory(state, 'TOMATO');
  state = addIngredientToInventory(state, 'ONION');
  assert.equal(state.orderPhase, 'collecting');

  state = addIngredientToInventory(state, 'GARLIC');
  assert.equal(hasAllRecipeIngredients(state), true);
  assert.equal(state.orderPhase, 'ready_to_cook');

  state = cookCurrentDish(state);
  assert.equal(state.orderPhase, 'cooked');
  assert.equal(state.cookedDish, 'tomato_soup');

  const prevCoins = state.coins;
  state = serveDishToCustomer(state);
  assert.equal(state.dishesServed, 1);
  assert.ok(state.coins > prevCoins);
  assert.equal(state.inventory.length, 0);
  assert.equal(state.cookedDish, null);
  assert.equal(state.currentRecipe.id, 'cheese_burger');
});

test('findNearestStation detects ingredient crates and stove within radius', () => {
  const nearTomato = findNearestStation({ x: -6.0, z: -5.0 }, 0);
  assert.ok(nearTomato);
  assert.equal(nearTomato.type, 'ingredient');
  assert.equal(nearTomato.ingredientId, 'TOMATO');

  const nearStove = findNearestStation({ x: -1.4, z: -0.6 }, 0);
  assert.ok(nearStove);
  assert.equal(nearStove.type, 'stove');

  const farAway = findNearestStation({ x: 2.0, z: 1.5 }, 0);
  assert.equal(farAway, null);
});

test('resolvePositionWithCollisions keeps chef within bounds and out of stove island', () => {
  const clamped = resolvePositionWithCollisions(
    { x: 0, z: 0 },
    { x: 99, z: -99 }
  );
  assert.ok(clamped.x <= 7.2);
  assert.ok(clamped.z >= -6.0);
});
