// 角色权重参考 WWUID GPL-3.0 配置，来源见 NOTICE.md。
export const characterRules = {
  '1210': {
    characterName: '爱弥斯',
    templateName: '爱弥斯-通用',
    attribute: 'Fusion',
    mainWeights: {
      1: { 'ATK%': 0.4 },
      3: { ATK: 0.025, 'ATK%': 0.275, AttributeDMG: 0.275 },
      4: { ATK: 0.025, 'ATK%': 0.275, 'Crit Rate': 0.5, 'Crit DMG': 0.25 }
    },
    subWeights: {
      ATK: 0.1, 'ATK%': 1.1, 'Crit Rate': 2, 'Crit DMG': 1,
      SkillDMG: 1.3, 'Energy Regen': 0.3
    },
    skillWeights: {
      'Basic Attack DMG Bonus': 0,
      'Heavy Attack DMG Bonus': 0,
      'Resonance Skill DMG Bonus': 0,
      'Resonance Liberation DMG Bonus': 0.7
    },
    maxScoreByCost: { 1: 78.516, 3: 82.066, 4: 86.066 },
    thresholds: [0, 0.48, 0.6, 0.7, 0.78, 0.84]
  }
};

export const characterNames = {
  '1210': '爱弥斯',
  '1108': 'Hiyuki'
};

export const weaponNames = {
  '21020076': '永耀星辉',
  '21020086': 'Frostburn'
};

