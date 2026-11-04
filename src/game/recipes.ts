export interface IngredientDef {
  id: string;
  word: string;
  translationPt: string;
  phonetic: string;
  category: 'vegetable' | 'dairy' | 'grain' | 'fruit' | 'spice';
  color: number;
  accentHex: string;
  position: { x: number; z: number };
  acceptedAliases: string[];
  hintPt: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  translationPt: string;
  phonetic: string;
  customerRequest: string;
  customerRequestPt: string;
  ingredients: string[];
  rewardCoins: number;
  rewardXp: number;
  dishColor: number;
  acceptedAliases: string[];
}

export const INGREDIENTS: Record<string, IngredientDef> = {
  TOMATO: {
    id: 'TOMATO',
    word: 'TOMATO',
    translationPt: 'Tomate',
    phonetic: '/təˈmeɪ.toʊ/',
    category: 'vegetable',
    color: 0xe64833,
    accentHex: '#ef4444',
    position: { x: -6.2, z: -5.4 },
    acceptedAliases: ['tomato', 'tomatoes', 'tomatos', 'tuhmato', 'tamato'],
    hintPt: 'Diga "tuh-MEI-tou"',
  },
  ONION: {
    id: 'ONION',
    word: 'ONION',
    translationPt: 'Cebola',
    phonetic: '/ˈʌn.jən/',
    category: 'vegetable',
    color: 0xd99b52,
    accentHex: '#f59e0b',
    position: { x: -3.6, z: -5.4 },
    acceptedAliases: ['onion', 'onions', 'unyun', 'union'],
    hintPt: 'Diga "ÂN-iãn"',
  },
  GARLIC: {
    id: 'GARLIC',
    word: 'GARLIC',
    translationPt: 'Alho',
    phonetic: '/ˈɡɑːr.lɪk/',
    category: 'spice',
    color: 0xf3ece0,
    accentHex: '#e2e8f0',
    position: { x: -1.0, z: -5.4 },
    acceptedAliases: ['garlic', 'garlick', 'garlik'],
    hintPt: 'Diga "GÁR-lik"',
  },
  CHEESE: {
    id: 'CHEESE',
    word: 'CHEESE',
    translationPt: 'Queijo',
    phonetic: '/tʃiːz/',
    category: 'dairy',
    color: 0xf4b41a,
    accentHex: '#eab308',
    position: { x: 1.6, z: -5.4 },
    acceptedAliases: ['cheese', 'cheeze', 'chees', 'sheese', 'keys'],
    hintPt: 'Diga "TCHÍZ"',
  },
  BREAD: {
    id: 'BREAD',
    word: 'BREAD',
    translationPt: 'Pão',
    phonetic: '/bred/',
    category: 'grain',
    color: 0xc88a4b,
    accentHex: '#d97706',
    position: { x: 4.2, z: -5.4 },
    acceptedAliases: ['bread', 'bred', 'brred'],
    hintPt: 'Diga "BRÉD"',
  },
  LETTUCE: {
    id: 'LETTUCE',
    word: 'LETTUCE',
    translationPt: 'Alface',
    phonetic: '/ˈlet.ɪs/',
    category: 'vegetable',
    color: 0x6ab04c,
    accentHex: '#22c55e',
    position: { x: 6.4, z: -3.2 },
    acceptedAliases: ['lettuce', 'letus', 'lettis', 'letis'],
    hintPt: 'Diga "LÉ-tis"',
  },
  APPLE: {
    id: 'APPLE',
    word: 'APPLE',
    translationPt: 'Maçã',
    phonetic: '/ˈæp.əl/',
    category: 'fruit',
    color: 0xd63031,
    accentHex: '#f43f5e',
    position: { x: 6.4, z: -0.6 },
    acceptedAliases: ['apple', 'apples', 'apol', 'epol'],
    hintPt: 'Diga "É-pôl"',
  },
  BUTTER: {
    id: 'BUTTER',
    word: 'BUTTER',
    translationPt: 'Manteiga',
    phonetic: '/ˈbʌt.ər/',
    category: 'dairy',
    color: 0xffeaa7,
    accentHex: '#fde047',
    position: { x: 6.4, z: 2.0 },
    acceptedAliases: ['butter', 'buter', 'budder'],
    hintPt: 'Diga "BÂ-târ"',
  },
  MUSHROOM: {
    id: 'MUSHROOM',
    word: 'MUSHROOM',
    translationPt: 'Cogumelo',
    phonetic: '/ˈmʌʃ.ruːm/',
    category: 'vegetable',
    color: 0xa67c52,
    accentHex: '#a8a29e',
    position: { x: 6.4, z: 4.6 },
    acceptedAliases: ['mushroom', 'mushrooms', 'mashroom', 'muchroom'],
    hintPt: 'Diga "MÂSH-rum"',
  },
};

export const INGREDIENT_LIST: IngredientDef[] = Object.values(INGREDIENTS);

export const RECIPES: RecipeDef[] = [
  {
    id: 'tomato_soup',
    name: 'Tomato Soup',
    translationPt: 'Sopa de Tomate',
    phonetic: '/təˈmeɪ.toʊ suːp/',
    customerRequest: 'I want a Tomato Soup, please!',
    customerRequestPt: 'Eu quero uma Sopa de Tomate, por favor!',
    ingredients: ['TOMATO', 'ONION', 'GARLIC'],
    rewardCoins: 45,
    rewardXp: 50,
    dishColor: 0xe64833,
    acceptedAliases: ['tomato soup', 'tomatosoup', 'tomato sup'],
  },
  {
    id: 'cheese_burger',
    name: 'Cheese Burger',
    translationPt: 'Hambúrguer com Queijo',
    phonetic: '/ˈtʃiːzˌbɜːr.ɡər/',
    customerRequest: 'I want a Cheese Burger, please!',
    customerRequestPt: 'Eu quero um Hambúrguer com Queijo, por favor!',
    ingredients: ['BREAD', 'CHEESE', 'LETTUCE'],
    rewardCoins: 55,
    rewardXp: 60,
    dishColor: 0xf4b41a,
    acceptedAliases: ['cheese burger', 'cheeseburger', 'cheeze burger'],
  },
  {
    id: 'apple_pie',
    name: 'Apple Pie',
    translationPt: 'Torta de Maçã',
    phonetic: '/ˈæp.əl paɪ/',
    customerRequest: 'I want an Apple Pie, please!',
    customerRequestPt: 'Eu quero uma Torta de Maçã, por favor!',
    ingredients: ['APPLE', 'BUTTER', 'BREAD'],
    rewardCoins: 65,
    rewardXp: 70,
    dishColor: 0xe17055,
    acceptedAliases: ['apple pie', 'applepie', 'apol pie'],
  },
  {
    id: 'mushroom_toast',
    name: 'Mushroom Toast',
    translationPt: 'Torrada de Cogumelos',
    phonetic: '/ˈmʌʃ.ruːm toʊst/',
    customerRequest: 'I want a Mushroom Toast, please!',
    customerRequestPt: 'Eu quero uma Torrada de Cogumelos, por favor!',
    ingredients: ['MUSHROOM', 'GARLIC', 'BUTTER'],
    rewardCoins: 60,
    rewardXp: 65,
    dishColor: 0xa67c52,
    acceptedAliases: ['mushroom toast', 'mushroomtoast', 'mashroom toast'],
  },
];

export const STOVE_POSITION = { x: -1.4, z: -0.6 };
export const SERVICE_COUNTER_POSITION = { x: -2.2, z: 2.6 };
export const CUSTOMER_TABLE_POSITIONS = [
  { x: -5.0, z: 3.6, label: 'Table 1' },
  { x: -1.0, z: 4.8, label: 'Table 2' },
];
