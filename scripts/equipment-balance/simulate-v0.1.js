#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RESULT_FILE = path.join(__dirname, 'v0.1-results.json');
const SEED = 20260905;
const CANONICAL_RUNS = 100000;
const RUNS = Number(process.env.EQUIPMENT_SIM_RUNS || CANONICAL_RUNS);
const COOLDOWN_RUNS = 200000;
const APPROVED_ENHANCEMENT_HASH_100K = 'de8f78eb1a55e711d80c42808dd96c5865b28ceae514dce14b9d65b39d4f0f43';
const APPROVED_HEADLINE_100K = {
  3: { attempts: [19, 21, 24], silverHours: [1.86, 2.14, 2.43] },
  6: { attempts: [42, 48, 52], silverHours: [6.14, 7.17, 8.12] },
  9: { attempts: [83, 103, 123], silverHours: [18.31, 24.08, 30.71] },
  12: { attempts: [150, 193, 238], silverHours: [45.14, 61.84, 81.22] },
  15: { attempts: [230, 299, 373], silverHours: [106.43, 145.28, 189.32] },
};

const LEVELS = [1, 10, 20, 30, 40, 50, 60];
const SLOTS = [
  { id: 'weapon', name: '武器', share: 0.30 },
  { id: 'body', name: '身体', share: 0.20 },
  { id: 'head', name: '头部', share: 0.13 },
  { id: 'wrist', name: '腕部', share: 0.13 },
  { id: 'feet', name: '足部', share: 0.12 },
  { id: 'accessory', name: '佩饰', share: 0.12 },
];

// 用户给定的终局显示比例合计为 100.1%，这是保留一位小数造成的舍入。
// 内部使用能够精确闭合到 180 EP 的隐藏值；界面只显示一位小数。
const FINAL_DISPLAY = {
  level: 18.0,
  attributePoints: 5.0,
  talents: 12.0,
  equipmentBase: 20.6,
  enhancement: 26.7,
  affixes: 11.1,
  setBonus: 6.7,
};
const TERMINAL_POWER_EP = 180; // 60 级精品 +0 标准角色 = 100 EP，终局目标 +80%。
const TERMINAL_COMPONENT_EP = {
  level: 32.4,
  attributePoints: 9,
  talents: 21.6,
  equipmentBase: 37,
  enhancement: 48,
  affixes: 20,
  setBonus: 12,
};

// 60 级精品 +0 标准装的 37 EP 拆成 32 EP 白板属性与 5 EP 的六条平均蓝词条。
// 各品阶使用独立的“白板池 + 词条池”，禁止再用单一品质倍率乘整个装备预算。
const BLUE_BASE_EP = 32;
const BLUE_AFFIX_EP = 5;

const RANKS = [
  { id: 'white', name: '凡品', baseEP: 32, affixCount: 0, affixEP: 0, cap: 3, hasSet: false },
  { id: 'blue', name: '精品', baseEP: 32, affixCount: 1, affixEP: 5, cap: 6, hasSet: true },
  { id: 'purple', name: '珍品', baseEP: 101 / 3, affixCount: 2, affixEP: 10, cap: 9, hasSet: true },
  { id: 'orange', name: '绝品', baseEP: 106 / 3, affixCount: 3, affixEP: 15, cap: 12, hasSet: true },
  { id: 'red', name: '神兵', baseEP: 37, affixCount: 4, affixEP: 20, cap: 15, hasSet: true },
];

// 每级均相对装备 +0 白板加算；最高档由“打造 48 EP”反算。
const TERMINAL_ENHANCE_RATIO = TERMINAL_COMPONENT_EP.enhancement / TERMINAL_COMPONENT_EP.equipmentBase;
const TERMINAL_BASE_MULTIPLIER = 1 + TERMINAL_ENHANCE_RATIO;
const TOP_GAIN = (TERMINAL_ENHANCE_RATIO - 3 * 0.04 - 3 * 0.06 - 3 * 0.10) / 6;
const ENHANCE_GAIN = [
  0,
  0.04, 0.04, 0.04,
  0.06, 0.06, 0.06,
  0.10, 0.10, 0.10,
  TOP_GAIN, TOP_GAIN, TOP_GAIN, TOP_GAIN, TOP_GAIN, TOP_GAIN,
];

// 银两单位是当前实例的参考价值 R；材料数量与槽位无关，R 已承担槽位差异。
const ATTEMPT_COST = [
  null,
  { silverR: 0.04, mats: { M1: 1 } },
  { silverR: 0.05, mats: { M1: 1 } },
  { silverR: 0.06, mats: { M1: 2 } },
  { silverR: 0.075, mats: { M2: 1 } },
  { silverR: 0.09, mats: { M2: 1 } },
  { silverR: 0.11, mats: { M2: 2 } },
  { silverR: 0.13, mats: { M2: 1, M3: 1 } },
  { silverR: 0.16, mats: { M2: 1, M3: 1 } },
  { silverR: 0.20, mats: { M2: 2, M3: 1 } },
  { silverR: 0.18, mats: { M3: 1, M4: 1 } },
  { silverR: 0.23, mats: { M3: 1, M4: 1 } },
  { silverR: 0.30, mats: { M3: 1, M4: 1 } },
  { silverR: 0.40, mats: { M3: 2, M4: 1 } },
  { silverR: 0.54, mats: { M3: 2, M4: 1 } },
  { silverR: 0.72, mats: { M3: 2, M4: 1 } },
];
const EXPECTED_ATTEMPT_COST_SIGNATURES = [
  '0.04|M1:1', '0.05|M1:1', '0.06|M1:2',
  '0.075|M2:1', '0.09|M2:1', '0.11|M2:2',
  '0.13|M2:1,M3:1', '0.16|M2:1,M3:1', '0.2|M2:2,M3:1',
  '0.18|M3:1,M4:1', '0.23|M3:1,M4:1', '0.3|M3:1,M4:1',
  '0.4|M3:2,M4:1', '0.54|M3:2,M4:1', '0.72|M3:2,M4:1',
];

const SET_BUDGET = {
  twoPiece: 3 / TERMINAL_POWER_EP,
  fourPiece: 7 / TERMINAL_POWER_EP,
  sixPiece: TERMINAL_COMPONENT_EP.setBonus / TERMINAL_POWER_EP,
  fourPlusTwo: 10 / TERMINAL_POWER_EP,
};
const EQUIPMENT_CAPS = {
  critChancePoints: 15,
  critDamage: 0.30,
  dodgePoints: 12,
  cooldownExtraAdvance: 0.15,
};
const GLOBAL_CAPS = { critChance: 0.40, critMultiplier: 2.00, dodgeBonus: 0.25 };
const CRIT_CHANCE_POINTS_PER_EP = 2.50;
const EXPECTED_SIX_SLOT_CRIT_EP = SLOTS.reduce((sum, slot) => sum + BLUE_AFFIX_EP * slot.share, 0);
const HIGH_ROLL_SIX_SLOT_CRIT_EP = EXPECTED_SIX_SLOT_CRIT_EP * 1.20;
const BASELINE_PERMANENT_CRIT = 0.08 + 0.03 + 0.04;
const REPAIR_ASSUMPTIONS = {
  rewardedCombatsPerHour: 60,
  referenceCombats: 100,
  durabilityLossPerCombat: 1,
  fullSetReferenceValueHours: 12,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function growth(level) {
  return Math.pow(1.075, Math.min(level - 1, 19))
    * Math.pow(1.06, Math.min(Math.max(level - 20, 0), 25))
    * Math.pow(1.045, Math.min(Math.max(level - 45, 0), 15));
}

function gearShare(level) {
  return 0.35 + 0.02 * (level - 1) / 59;
}

const G60 = growth(60);

function baseline(level) {
  const g = growth(level);
  const ratio = g / G60;
  // EP 以 60 级精品 +0 标准角色为 100；growth 保留原始等级成长倍率便于审计。
  const totalEP = 100 * ratio;
  const equipmentEP = totalEP * gearShare(level);
  const attack = 112 * ratio;
  const defense = 42 * ratio;
  const hp = 1200 * ratio * 142 / (100 + 42 * ratio);
  const mp = 100 * ratio;
  const selfDamage = attack * 100 / (100 + defense);
  return {
    level,
    growth: round(g),
    totalEP: round(totalEP, 2),
    nonEquipmentEP: round(totalEP - equipmentEP, 2),
    equipmentEP: round(equipmentEP, 2),
    equipmentShare: round(gearShare(level), 6),
    hp: Math.round(hp),
    mp: round(mp, 2),
    attack: round(attack, 2),
    defense: round(defense, 2),
    selfTtk: round(hp / selfDamage, 3),
    slots: Object.fromEntries(SLOTS.map(slot => [slot.id, round(equipmentEP * slot.share, 2)])),
  };
}

function enhanceBaseMultiplier(level) {
  let result = 1;
  for (let n = 1; n <= level; n += 1) result += ENHANCE_GAIN[n];
  return result;
}

function buildRankProfile(rank) {
  const baseMultiplierAtCap = enhanceBaseMultiplier(rank.cap);
  const enhancementEP = rank.baseEP * (baseMultiplierAtCap - 1);
  const setEP = rank.hasSet ? TERMINAL_COMPONENT_EP.setBonus : 0;
  const equipmentAtZeroNoSet = rank.baseEP + rank.affixEP;
  const equipmentAtCapNoSet = rank.baseEP + enhancementEP + rank.affixEP;
  const equipmentAtCapFullSet = rank.baseEP + enhancementEP + rank.affixEP + setEP;
  const totalAtZeroNoSet = 63 + equipmentAtZeroNoSet;
  const totalAtCapNoSet = 63 + equipmentAtCapNoSet;
  const totalAtCapFullSet = 63 + equipmentAtCapFullSet;
  return {
    id: rank.id,
    name: rank.name,
    baseFactorVsBlue: round(rank.baseEP / BLUE_BASE_EP, 6),
    affixCount: rank.affixCount,
    enhanceCap: rank.cap,
    baseMultiplierAtCap: round(baseMultiplierAtCap, 6),
    atZeroNoSet: {
      baseEP: round(rank.baseEP, 6),
      affixEP: round(rank.affixEP, 6),
      equipmentEP: round(equipmentAtZeroNoSet, 6),
      totalPowerVsBluePlusZero: round(totalAtZeroNoSet / 100, 6),
    },
    atCapNoSet: {
      baseEP: round(rank.baseEP, 6),
      enhancementEP: round(enhancementEP, 6),
      affixEP: round(rank.affixEP, 6),
      equipmentEP: round(equipmentAtCapNoSet, 6),
      totalEP: round(totalAtCapNoSet, 6),
      totalPowerVsBluePlusZero: round(totalAtCapNoSet / 100, 6),
      equipmentShare: round(equipmentAtCapNoSet / totalAtCapNoSet, 6),
    },
    atCapFullSet: {
      baseEP: round(rank.baseEP, 6),
      enhancementEP: round(enhancementEP, 6),
      affixEP: round(rank.affixEP, 6),
      setEP: round(setEP, 6),
      equipmentEP: round(equipmentAtCapFullSet, 6),
      totalEP: round(totalAtCapFullSet, 6),
      totalPowerVsBluePlusZero: round(totalAtCapFullSet / 100, 6),
      equipmentShare: round(equipmentAtCapFullSet / totalAtCapFullSet, 6),
    },
  };
}

function illustrativeEqualTtkStatsAt60(totalPowerVsBluePlusZero) {
  // 在精品 +0 与神兵满打造两端插值；端点都保持约 15.21 次 1.0 威力自击 TTK。
  const t = (totalPowerVsBluePlusZero - 1) / 0.8;
  const attack = 112 + (220.1 - 112) * t;
  const hp = 1200 + (1978 - 1200) * t;
  const defense = 42 + (69.2 - 42) * t;
  const selfDamage = attack * 100 / (100 + defense);
  return { hp: round(hp, 1), attack: round(attack, 1), defense: round(defense, 1), selfTtk: round(hp / selfDamage, 3) };
}

function probabilities(currentLevel, streak) {
  let p;
  if (currentLevel <= 2) p = { great: 0.08, success: 0.82, fail: 0.10, disaster: 0 };
  else if (currentLevel <= 5) p = { great: 0.06, success: 0.64, fail: 0.30, disaster: 0 };
  else if (currentLevel <= 8) p = { great: 0.05, success: 0.60, fail: 0.35, disaster: 0 };
  else p = { great: 0.04, success: 0.55, fail: 0.38, disaster: 0.03 };

  if (streak >= 3) {
    const wanted = Math.min((streak - 2) * 0.08, 0.32);
    const shifted = Math.min(wanted, p.fail);
    p.success += shifted;
    p.fail -= shifted;
  }
  if (currentLevel >= 9 && streak >= 5 && p.disaster > 0) {
    p.success += p.disaster;
    p.disaster = 0;
  }
  return p;
}

function resolveEnhancementAttempt(currentLevel, cap, streak, roll) {
  const p = probabilities(currentLevel, streak);
  if (roll < p.great) {
    return { kind: 'great', nextLevel: Math.min(cap, currentLevel + 2), nextStreak: 0, levelsLost: 0 };
  }
  if (roll < p.great + p.success) {
    return { kind: 'success', nextLevel: currentLevel + 1, nextStreak: 0, levelsLost: 0 };
  }
  if (roll < p.great + p.success + p.fail) {
    const nextLevel = currentLevel >= 6 ? Math.max(0, currentLevel - 1) : currentLevel;
    return { kind: 'fail', nextLevel, nextStreak: streak + 1, levelsLost: currentLevel - nextLevel };
  }
  const nextLevel = Math.max(0, currentLevel - 2);
  return { kind: 'disaster', nextLevel, nextStreak: streak + 1, levelsLost: currentLevel - nextLevel };
}

function rng(seed) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function simulateOneEnhancement(cap, seed) {
  const random = rng(seed);
  const result = { attempts: 0, silverR: 0, downgradeEvents: 0, levelsLost: 0, mats: { M1: 0, M2: 0, M3: 0, M4: 0 } };
  let level = 0;
  let streak = 0;
  while (level < cap) {
    assert(result.attempts < 10000, `打造未收敛: cap=${cap}`);
    const target = level + 1;
    const cost = ATTEMPT_COST[target];
    const roll = random();
    result.attempts += 1;
    result.silverR += cost.silverR;
    for (const [material, amount] of Object.entries(cost.mats)) result.mats[material] += amount;

    const outcome = resolveEnhancementAttempt(level, cap, streak, roll);
    level = outcome.nextLevel;
    streak = outcome.nextStreak;
    if (outcome.kind !== 'great' && outcome.kind !== 'success') {
      if (outcome.levelsLost > 0) {
        result.downgradeEvents += 1;
        result.levelsLost += outcome.levelsLost;
      }
    }
  }
  result.silverR = round(result.silverR, 6);
  return result;
}

function quantile(sorted, q) {
  return sorted[Math.floor((sorted.length - 1) * q)];
}

function summarizeEnhancement(rank) {
  const attempts = [];
  const silverHours = [];
  const materials = { M1: [], M2: [], M3: [], M4: [] };
  let totalAttempts = 0;
  let totalSilverR = 0;
  let totalDowngradeEvents = 0;
  let totalLevelsLost = 0;

  for (let run = 0; run < RUNS; run += 1) {
    let setAttempts = 0;
    let setSilverHours = 0;
    const setMats = { M1: 0, M2: 0, M3: 0, M4: 0 };
    for (let slotIndex = 0; slotIndex < SLOTS.length; slotIndex += 1) {
      const one = simulateOneEnhancement(rank.cap, SEED ^ hash(`${rank.id}:${run}:${slotIndex}`));
      setAttempts += one.attempts;
      // R(slot) = 12H × slotShare。
      setSilverHours += one.silverR * 12 * SLOTS[slotIndex].share;
      totalAttempts += one.attempts;
      totalSilverR += one.silverR;
      totalDowngradeEvents += one.downgradeEvents;
      totalLevelsLost += one.levelsLost;
      for (const material of Object.keys(setMats)) setMats[material] += one.mats[material];
    }
    attempts.push(setAttempts);
    silverHours.push(setSilverHours);
    for (const material of Object.keys(materials)) materials[material].push(setMats[material]);
  }

  attempts.sort((a, b) => a - b);
  silverHours.sort((a, b) => a - b);
  for (const values of Object.values(materials)) values.sort((a, b) => a - b);

  return {
    cap: rank.cap,
    setAttempts: {
      p50: quantile(attempts, 0.50),
      p90: quantile(attempts, 0.90),
      p99: quantile(attempts, 0.99),
    },
    setSilverHours: {
      p50: round(quantile(silverHours, 0.50), 2),
      p90: round(quantile(silverHours, 0.90), 2),
      p99: round(quantile(silverHours, 0.99), 2),
    },
    setMaterials: Object.fromEntries(Object.entries(materials).map(([material, values]) => [material, {
      p50: quantile(values, 0.50),
      p90: quantile(values, 0.90),
      p99: quantile(values, 0.99),
    }])),
    perItemMean: {
      attempts: round(totalAttempts / (RUNS * SLOTS.length), 3),
      silverR: round(totalSilverR / (RUNS * SLOTS.length), 3),
      downgradeEvents: round(totalDowngradeEvents / (RUNS * SLOTS.length), 3),
      levelsLost: round(totalLevelsLost / (RUNS * SLOTS.length), 3),
    },
  };
}

function simulateCooldown(baseCooldown, chance, runs = COOLDOWN_RUNS) {
  const random = rng(SEED ^ hash(`cooldown:${baseCooldown}:${chance}`));
  let total = 0;
  for (let run = 0; run < runs; run += 1) {
    let remaining = baseCooldown;
    let unavailable = 0;
    while (remaining > 0) {
      unavailable += 1;
      remaining -= 1;
      if (remaining > 0 && baseCooldown >= 2 && random() < chance) remaining -= 1;
    }
    total += unavailable;
  }
  return round(total / runs, 3);
}

function expectedTrialsWithPublicGuarantee(chance, guaranteeAt) {
  return (1 - Math.pow(1 - chance, guaranteeAt)) / chance;
}

function fileHashes(files) {
  return Object.fromEntries(files.map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex'),
  ]));
}

const baselineTable = LEVELS.map(baseline);
const rankProfiles = RANKS.map(buildRankProfile);

const maxRed = rankProfiles.find(rank => rank.id === 'red');
const redRank = RANKS.find(rank => rank.id === 'red');
function terminalAtAffixRoll(affixRoll) {
  const enhancementEP = redRank.baseEP * (enhanceBaseMultiplier(redRank.cap) - 1);
  const affixEP = redRank.affixEP * affixRoll;
  const equipmentEP = redRank.baseEP + enhancementEP + affixEP + TERMINAL_COMPONENT_EP.setBonus;
  const totalEP = 63 + equipmentEP;
  return {
    affixRoll,
    affixEP: round(affixEP, 6),
    equipmentEP: round(equipmentEP, 6),
    totalEP: round(totalEP, 6),
    equipmentShare: round(equipmentEP / totalEP, 6),
  };
}
const terminalAffixRollRange = {
  theoreticalMinimum: terminalAtAffixRoll(0.80),
  expected: terminalAtAffixRoll(1.00),
  theoreticalMaximum: terminalAtAffixRoll(1.20),
};

function enumerateSingleQualitySteps(affixRoll) {
  const steps = [];
  for (let index = 1; index < RANKS.length; index += 1) {
    const from = RANKS[index - 1];
    const to = RANKS[index];
    const commonCap = Math.min(from.cap, to.cap);
    for (let enhanceLevel = 0; enhanceLevel <= commonCap; enhanceLevel += 1) {
      const baseMultiplier = enhanceBaseMultiplier(enhanceLevel);
      const fromTotalEP = 63 + from.baseEP * baseMultiplier + from.affixEP * affixRoll;
      for (const slot of SLOTS) {
        const deltaEP = slot.share * (
          (to.baseEP - from.baseEP) * baseMultiplier
          + (to.affixEP - from.affixEP) * affixRoll
        );
        steps.push({
          from: from.id,
          to: to.id,
          slot: slot.id,
          enhanceLevel,
          affixRoll,
          deltaEP,
          fromTotalEP,
          relativePowerGain: deltaEP / fromTotalEP,
        });
      }
    }
  }
  return steps.sort((a, b) => b.relativePowerGain - a.relativePowerGain);
}

// 2% 是同等级、同套装状态、同打造等级、期望词条（roll=1）的相对角色收益门槛。
// roll=1.2 仅作为随机极品诊断，不与品质本身的硬门槛混为一谈。
const singleQualitySteps = enumerateSingleQualitySteps(1);
const highRollQualitySteps = enumerateSingleQualitySteps(1.2);

const repair = [
  { rank: 'white', coefficient: 0.011 },
  { rank: 'blue', coefficient: 0.014 },
  { rank: 'purple', coefficient: 0.017 },
  { rank: 'orange', coefficient: 0.021 },
  { rank: 'red', coefficient: 0.025 },
].map(row => {
  const missingDurabilityRatio = Math.min(1,
    REPAIR_ASSUMPTIONS.referenceCombats * REPAIR_ASSUMPTIONS.durabilityLossPerCombat / 100);
  const fullRepairCostHours = REPAIR_ASSUMPTIONS.fullSetReferenceValueHours
    * missingDurabilityRatio * row.coefficient;
  const grossIncomeHours = REPAIR_ASSUMPTIONS.referenceCombats / REPAIR_ASSUMPTIONS.rewardedCombatsPerHour;
  return {
    ...row,
    targetGrossShare: round(fullRepairCostHours / grossIncomeHours, 4),
  };
});

const enhancementResults = RANKS.map(summarizeEnhancement);
const enhancementSnapshotHash = crypto.createHash('sha256')
  .update(JSON.stringify(enhancementResults)).digest('hex');
const enhancementHeadline = Object.fromEntries(enhancementResults.map(row => [row.cap, {
  attempts: [row.setAttempts.p50, row.setAttempts.p90, row.setAttempts.p99],
  silverHours: [row.setSilverHours.p50, row.setSilverHours.p90, row.setSilverHours.p99],
}]));
const canonicalHeadlineMatched = JSON.stringify(enhancementHeadline) === JSON.stringify(APPROVED_HEADLINE_100K);
const rankNameByCap = Object.fromEntries(RANKS.map(rank => [rank.cap, rank.name]));
const craftingDocument = fs.readFileSync(path.join(ROOT, 'docs/装备与打造.md'), 'utf8');
const reportDocument = fs.readFileSync(path.join(ROOT, 'docs/装备数值模拟报告.md'), 'utf8');
const publishedHeadlineRowsMatched = enhancementResults.every(row => {
  const attempts = `${row.setAttempts.p50}／${row.setAttempts.p90}／${row.setAttempts.p99}`;
  const silver = `${row.setSilverHours.p50.toFixed(2)}／${row.setSilverHours.p90.toFixed(2)}／${row.setSilverHours.p99.toFixed(2)}`;
  return craftingDocument.includes(`| ${rankNameByCap[row.cap]} +${row.cap} | ${attempts} | ${silver} |`)
    && reportDocument.includes(`| ${rankNameByCap[row.cap]} \`+${row.cap}\` | ${attempts} | ${silver} |`);
});

const result = {
  version: '0.1',
  seed: SEED,
  runs: RUNS,
  sourceHashes: fileHashes([
    'docs/数值基准.md',
    'docs/装备与打造.md',
    'docs/装备系统.md',
    'docs/装备数值模拟报告.md',
    'docs/turn-based-combat.md',
    'scripts/equipment-balance/simulate-v0.1.js',
  ]),
  baseline: baselineTable,
  calibration: {
    bluePlusZero: { totalEP: 100, nonEquipmentEP: 63, equipmentBaseEP: BLUE_BASE_EP, affixEP: BLUE_AFFIX_EP },
    terminalTotalEP: TERMINAL_POWER_EP,
    terminalBaseMultiplier: round(TERMINAL_BASE_MULTIPLIER, 9),
    canonicalRuns: CANONICAL_RUNS,
    cooldownRuns: COOLDOWN_RUNS,
    enhancementSnapshotHash,
    approvedEnhancementSnapshotHash: APPROVED_ENHANCEMENT_HASH_100K,
    canonicalSnapshotMatched: RUNS === CANONICAL_RUNS
      ? enhancementSnapshotHash === APPROVED_ENHANCEMENT_HASH_100K
      : null,
    canonicalHeadlineMatched: RUNS === CANONICAL_RUNS ? canonicalHeadlineMatched : null,
    publishedHeadlineRowsMatched: RUNS === CANONICAL_RUNS ? publishedHeadlineRowsMatched : null,
    enhanceGainByBand: {
      plus1To3: 0.04,
      plus4To6: 0.06,
      plus7To9: 0.10,
      plus10To15: round(TOP_GAIN, 9),
    },
  },
  slots: SLOTS,
  ranks: rankProfiles,
  terminalProfile: {
    affixRoll: 1,
    displayPercent: FINAL_DISPLAY,
    exactEP: TERMINAL_COMPONENT_EP,
    displaySum: round(Object.values(FINAL_DISPLAY).reduce((sum, value) => sum + value, 0), 1),
    totalEP: maxRed.atCapFullSet.totalEP,
    totalPowerVsBluePlusZero: maxRed.atCapFullSet.totalPowerVsBluePlusZero,
    equipmentEP: maxRed.atCapFullSet.equipmentEP,
    equipmentShare: maxRed.atCapFullSet.equipmentShare,
    theoreticalAffixRollRange: terminalAffixRollRange,
    illustrativeEqualTtkStatsAt60: illustrativeEqualTtkStatsAt60(maxRed.atCapFullSet.totalPowerVsBluePlusZero),
  },
  largestSingleQualityStep: {
    ...singleQualitySteps[0],
    deltaEP: round(singleQualitySteps[0].deltaEP, 6),
    fromTotalEP: round(singleQualitySteps[0].fromTotalEP, 6),
    relativePowerGain: round(singleQualitySteps[0].relativePowerGain, 6),
  },
  largestAlignedHighRollQualityStep: {
    ...highRollQualitySteps[0],
    deltaEP: round(highRollQualitySteps[0].deltaEP, 6),
    fromTotalEP: round(highRollQualitySteps[0].fromTotalEP, 6),
    relativePowerGain: round(highRollQualitySteps[0].relativePowerGain, 6),
  },
  setBudget: {
    ...SET_BUDGET,
    twoPieceEP: 3,
    fourPieceEP: 7,
    sixPieceEP: 12,
    fourPlusTwoEP: 10,
    sixVsFourPlusTwoBudgetGap: round(SET_BUDGET.sixPiece - SET_BUDGET.fourPlusTwo, 6),
    budgetGapAtTerminal: round(SET_BUDGET.sixPiece - SET_BUDGET.fourPlusTwo, 6),
  },
  caps: { equipment: EQUIPMENT_CAPS, global: GLOBAL_CAPS },
  permanentCritProfile: {
    base: 0.08,
    agility: 0.03,
    talents: 0.04,
    critChancePointsPerEP: CRIT_CHANCE_POINTS_PER_EP,
    sixSlotCritAffixEPAtExpectedRoll: round(EXPECTED_SIX_SLOT_CRIT_EP, 6),
    sixSlotCritAffixEPAtAlignedHighRoll: round(HIGH_ROLL_SIX_SLOT_CRIT_EP, 6),
    equipmentAtExpectedAffixRoll: round(EXPECTED_SIX_SLOT_CRIT_EP * CRIT_CHANCE_POINTS_PER_EP / 100, 6),
    equipmentAtAlignedHighRoll: round(HIGH_ROLL_SIX_SLOT_CRIT_EP * CRIT_CHANCE_POINTS_PER_EP / 100, 6),
    totalAtExpectedAffixRoll: round(BASELINE_PERMANENT_CRIT
      + EXPECTED_SIX_SLOT_CRIT_EP * CRIT_CHANCE_POINTS_PER_EP / 100, 6),
    totalAtAlignedHighRoll: round(BASELINE_PERMANENT_CRIT
      + HIGH_ROLL_SIX_SLOT_CRIT_EP * CRIT_CHANCE_POINTS_PER_EP / 100, 6),
    critMultiplierWithEquipment: 1.75,
    expectedDamageVsBaselineAtExpectedAffixRoll: round((1
      + (BASELINE_PERMANENT_CRIT + EXPECTED_SIX_SLOT_CRIT_EP * CRIT_CHANCE_POINTS_PER_EP / 100) * 0.75)
      / (1 + 0.08 * 0.45) - 1, 4),
    expectedDamageVsBaselineAtAlignedHighRoll: round((1
      + (BASELINE_PERMANENT_CRIT + HIGH_ROLL_SIX_SLOT_CRIT_EP * CRIT_CHANCE_POINTS_PER_EP / 100) * 0.75)
      / (1 + 0.08 * 0.45) - 1, 4),
  },
  cooldown: [1, 2, 3, 4].map(base => ({
    base,
    noReduction: base,
    atCap: simulateCooldown(base, EQUIPMENT_CAPS.cooldownExtraAdvance),
  })),
  enhancement: enhancementResults,
  acquisition: {
    ordinaryFinishedItem: {
      baseChance: 0.12,
      publicGuaranteeAt: 12,
      expectedEligibleSettlements: round(expectedTrialsWithPublicGuarantee(0.12, 12), 3),
      weeklyQuota: 12,
      bankCap: 24,
    },
    targetedPurple: {
      baseChance: 0.15,
      publicGuaranteeAt: 8,
      expectedEligibleSettlements: round(expectedTrialsWithPublicGuarantee(0.15, 8), 3),
    },
    targetedOrange: {
      baseChance: 0.10,
      publicGuaranteeAt: 12,
      expectedEligibleSettlements: round(expectedTrialsWithPublicGuarantee(0.10, 12), 3),
    },
    redPath: { weeklyFragmentGuarantee: 1, requiredFragments: 24 },
  },
  economy: {
    referenceValue: 'R(level, slot) = 12 × H(level) × slotShare(slot)',
    repairAssumptions: REPAIR_ASSUMPTIONS,
    repair,
    decompositionBaseReturn: { white: 0.20, blue: 0.25, purple: 0.30, orange: 0.35, red: 0.40 },
    decompositionEnhanceReturn: { M1: 0.20, M2: 0.15, M3: 0.10, M4: 0.05 },
    craftDecomposeTradeableHardLimit: 0.60,
    craftDecomposeDesignTarget: 0.40,
    marketP95HardLimit: 0.80,
  },
};

assert(Math.abs(SLOTS.reduce((sum, slot) => sum + slot.share, 0) - 1) < 1e-12, '槽位权重之和不为 100%');
assert(Number.isInteger(RUNS) && RUNS > 0, 'EQUIPMENT_SIM_RUNS 必须是正整数');
const baseProbabilityCases = [
  [0, [0.08, 0.82, 0.10, 0]],
  [3, [0.06, 0.64, 0.30, 0]],
  [6, [0.05, 0.60, 0.35, 0]],
  [9, [0.04, 0.55, 0.38, 0.03]],
];
assert(baseProbabilityCases.every(([level, expected]) => {
  const p = probabilities(level, 0);
  return [p.great, p.success, p.fail, p.disaster]
    .every((value, index) => Math.abs(value - expected[index]) < 1e-12);
}), '四档打造基础概率与定案表不一致');
const pityAtThree = probabilities(9, 3);
const pityAtFive = probabilities(9, 5);
assert(Math.abs(pityAtThree.success - 0.63) < 1e-12
  && Math.abs(pityAtThree.fail - 0.30) < 1e-12
  && Math.abs(pityAtThree.disaster - 0.03) < 1e-12
  && Math.abs(pityAtFive.success - 0.82) < 1e-12
  && Math.abs(pityAtFive.fail - 0.14) < 1e-12
  && pityAtFive.disaster === 0, '打造怜悯在 streak=3／5 边界不一致');
assert(JSON.stringify(ATTEMPT_COST.slice(1).map(cost => {
  const mats = Object.entries(cost.mats).sort(([a], [b]) => a.localeCompare(b))
    .map(([material, amount]) => `${material}:${amount}`).join(',');
  return `${cost.silverR}|${mats}`;
})) === JSON.stringify(EXPECTED_ATTEMPT_COST_SIGNATURES), '15 档打造银两或材料成本与定案表不一致');
const noDrop = resolveEnhancementAttempt(5, 6, 0, 0.99);
const dropOne = resolveEnhancementAttempt(6, 9, 0, 0.99);
const dropTwo = resolveEnhancementAttempt(9, 15, 0, 0.99);
const successClears = resolveEnhancementAttempt(9, 15, 5, 0.10);
const greatStopsAtCap = resolveEnhancementAttempt(14, 15, 0, 0);
assert(noDrop.kind === 'fail' && noDrop.nextLevel === 5 && noDrop.levelsLost === 0
  && dropOne.kind === 'fail' && dropOne.nextLevel === 5 && dropOne.levelsLost === 1
  && dropTwo.kind === 'disaster' && dropTwo.nextLevel === 7 && dropTwo.levelsLost === 2
  && successClears.kind === 'success' && successClears.nextStreak === 0
  && greatStopsAtCap.kind === 'great' && greatStopsAtCap.nextLevel === 15,
'打造不掉级／掉一级／大失败／清怜悯／上限语义不一致');
assert(baselineTable.every((row, index) => index === 0 || row.totalEP > baselineTable[index - 1].totalEP), '等级曲线不单调');
assert(baselineTable.every((row, index) => index === 0 || row.mp > baselineTable[index - 1].mp)
  && baselineTable.at(-1).mp === 100, 'BASE.mp 等级曲线不单调或 60 级锚点不为 100');
assert(Math.abs(baselineTable[0].selfTtk - baselineTable.at(-1).selfTtk) < 0.02, '等级两端 TTK 漂移');
assert(baselineTable.at(-1).totalEP === 100 && baselineTable.at(-1).equipmentEP === 37, '60 级标准档案不为 100／37 EP');
assert(rankProfiles.find(rank => rank.id === 'blue').atZeroNoSet.totalPowerVsBluePlusZero === 1, '精品 +0 基线不为 100 EP');
assert(rankProfiles.every((rank, index) => index === 0
  || rank.atZeroNoSet.equipmentEP > rankProfiles[index - 1].atZeroNoSet.equipmentEP), '品阶 +0 预算不单调');
assert(RANKS.every(rank => Math.abs(rank.affixEP - rank.affixCount * BLUE_AFFIX_EP) < 1e-12), '词条数量与词条 EP 不一致');
assert(Object.entries(FINAL_DISPLAY).every(([key, value]) => round(TERMINAL_COMPONENT_EP[key] / TERMINAL_POWER_EP * 100, 1) === value), '终局显示比例与精确 EP 不一致');
assert(result.largestSingleQualityStep.relativePowerGain <= 0.0200001, '期望词条下单件升品超过当前角色总战力 2%');
assert(singleQualitySteps.every(step => step.relativePowerGain > 0), '存在升品后战力反降的共同打造档案');
assert(round(result.largestAlignedHighRollQualityStep.relativePowerGain * 100, 3) === 2.277,
  '120% 对齐高滚值的单件升品理论最大值不为 2.277%');
assert(Math.abs(result.terminalProfile.totalPowerVsBluePlusZero - 1.8) < 1e-12, '终局总战力不为标准档案的 1.8 倍');
assert(Math.abs(result.terminalProfile.equipmentShare - 0.65) < 1e-12, '终局装备占比不为 65%');
assert(result.terminalProfile.theoreticalAffixRollRange.expected.totalEP === 180
  && result.terminalProfile.theoreticalAffixRollRange.expected.equipmentEP === 117,
'期望词条滚值的终局档案不为 180／117 EP');
assert(result.terminalProfile.theoreticalAffixRollRange.theoreticalMaximum.equipmentShare <= 0.66,
  '全词条理论高滚值使终局装备占比突破 66% 极值护栏');
assert(Math.abs(Object.values(TERMINAL_COMPONENT_EP).reduce((sum, value) => sum + value, 0) - TERMINAL_POWER_EP) < 1e-12, '终局 EP 不闭合');
assert(Math.abs(result.terminalProfile.equipmentEP - 117) < 1e-9, '终局装备 EP 不为 117');
assert(Math.abs(maxRed.atCapNoSet.enhancementEP - 48) < 1e-9, '神兵 +15 打造增量不为 48 EP');
assert(result.setBudget.sixPieceEP === 12 && result.setBudget.fourPlusTwoEP === 10
  && Math.abs(result.setBudget.sixPiece - result.setBudget.sixPieceEP / TERMINAL_POWER_EP) < 1e-12
  && Math.abs(result.setBudget.fourPlusTwo - result.setBudget.fourPlusTwoEP / TERMINAL_POWER_EP) < 1e-12, '套装预算不闭合');
assert(Array.from({ length: 15 }, (_, level) => level).every(level =>
  Array.from({ length: 21 }, (_, streak) => streak).every(streak => {
    const p = probabilities(level, streak);
    const values = [p.great, p.success, p.fail, p.disaster];
    return values.every(value => value >= 0 && value <= 1)
      && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-12;
  })), '打造怜悯后的概率不闭合');
assert(Math.abs(result.permanentCritProfile.equipmentAtExpectedAffixRoll - 0.125) < 1e-12
  && Math.abs(result.permanentCritProfile.equipmentAtAlignedHighRoll - EQUIPMENT_CAPS.critChancePoints / 100) < 1e-12,
'暴击词条期望值或极高滚值未闭合');
assert(result.permanentCritProfile.totalAtAlignedHighRoll <= GLOBAL_CAPS.critChance, '常驻暴击超过全局上限');
assert(result.economy.repair.every(row => row.targetGrossShare >= 0.07 && row.targetGrossShare <= 0.19), '修理目标越界');
assert(REPAIR_ASSUMPTIONS.referenceCombats * REPAIR_ASSUMPTIONS.durabilityLossPerCombat === 100,
  '修理校准档案没有在 100 场普通战斗后恰好耗尽耐久');
assert(result.economy.repair.every(row => Math.abs(row.targetGrossShare - 7.2 * row.coefficient) < 1e-12),
  '修理费占毛收入比例与校准假设不闭合');
if (RUNS === CANONICAL_RUNS) {
  assert(enhancementSnapshotHash === APPROVED_ENHANCEMENT_HASH_100K, '固定种子 100k 完整打造快照发生漂移');
  assert(canonicalHeadlineMatched, '固定种子 100k 打造 P50／P90／P99 与批准值不一致');
  assert(publishedHeadlineRowsMatched, '两份公开文档的打造 P50／P90／P99 与模拟结果不一致');
}

if (RUNS === CANONICAL_RUNS) fs.writeFileSync(RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`);

console.log(`equipment-balance v${result.version} seed=${result.seed} runs=${result.runs}`);
console.log(`growth lv1→60 ×${baselineTable.at(-1).growth.toFixed(3)}, TTK ${baselineTable[0].selfTtk.toFixed(2)}→${baselineTable.at(-1).selfTtk.toFixed(2)}`);
console.log(`terminal power ×${result.terminalProfile.totalPowerVsBluePlusZero.toFixed(3)}, equipment share ${(result.terminalProfile.equipmentShare * 100).toFixed(2)}%`);
console.log(`largest expected single quality step ${(result.largestSingleQualityStep.relativePowerGain * 100).toFixed(3)}% (aligned high roll ${(result.largestAlignedHighRollQualityStep.relativePowerGain * 100).toFixed(3)}%)`);
for (const row of result.enhancement) {
  console.log(`+${row.cap} set attempts P50/P90/P99=${row.setAttempts.p50}/${row.setAttempts.p90}/${row.setAttempts.p99} silver(H)=${row.setSilverHours.p50}/${row.setSilverHours.p90}/${row.setSilverHours.p99}`);
}
console.log(RUNS === CANONICAL_RUNS
  ? `result=${path.relative(ROOT, RESULT_FILE)}`
  : `debug run only; canonical ${path.relative(ROOT, RESULT_FILE)} was not overwritten`);
