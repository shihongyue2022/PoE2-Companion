import { describe, expect, it } from 'vitest';
import { translateCurrency, translateMod, toEngineMod } from './localization';

describe('Chinese labels for actual crafting route strings', () => {
  it.each([
    ['Exalted', '崇高石'],
    ['Annulment', '剥离石'],
    ['Exalted (Perfect) + Omen: Greater Exaltation', '崇高石 (完美) + 大幅提升之兆'],
    ['Exalted (Perfect) + Omen of Greater Exaltation', '崇高石 (完美) + 大幅提升之兆'],
    ['Exalt (Sinistral, Greater)', '崇高石 (左旋（前缀）, 高阶)'],
    ['Annul (Omen of Light)', '剥离石 (光明预兆)'],
    ['Chaos + Omen of Whittling', '混沌石 + 削切之兆'],
    ['Exalted Orb + Omen of Sinistral Exaltation', '崇高石 + 左旋提升之兆'],
    ['Perfect Essence (Dextral)', '完美 精华 (右旋（后缀）)'],
    ['Start over with a new base', '更换底材重新开始'],
  ])('translates %s without leaking its English action name', (source, expected) => {
    expect(translateCurrency(source)).toBe(expected);
  });

  it('translates the screenshot removal wrapper and keeps unknown endpoints honest', () => {
    expect(translateMod('removes Adds # to 3 Fire damage to Attacks')).toBe('移除：攻击附加#至#火焰伤害');
    expect(translateMod('Adds 1 to # Lightning damage to Attacks')).toBe('攻击附加#至#闪电伤害');
    expect(translateMod('Adds1to#Lightning')).toBe('攻击附加#至#闪电伤害');
    expect(translateMod('removes Adds 28 to 45 Fire damage to Attacks')).toBe('移除：攻击附加28至45火焰伤害');
  });

  it('translates cold/chaos hybrid modifiers on both lines', () => {
    expect(translateMod('#% increased Cold Damage\n#% increased Chaos Damage')).toBe('增加#%冰冷伤害\n增加#%混沌伤害');
    expect(translateMod('removes 24% increased Cold Damage\n24% increased Chaos Damage')).toBe('移除：增加24%冰冷伤害\n增加24%混沌伤害');
  });

  it('preserves rolled values, tier ranges, signs and actual first-endpoint amounts', () => {
    expect(translateMod('Adds 2 to 66 Lightning damage to Attacks')).toBe('攻击附加2至66闪电伤害');
    expect(translateMod('Adds 25–29 to 37–45 Fire damage to Attacks')).toBe('攻击附加25–29至37–45火焰伤害');
    expect(translateMod('-17% to Fire Resistance')).toBe('-17%火焰抗性');
  });

  it('translates fixed-route chaos and perfect-essence add/remove pairs', () => {
    expect(translateMod('−+# to maximum Mana  ++# to maximum Life')).toBe('移除：+#最大魔力；添加：+#最大生命');
    expect(translateMod('++# to maximum Life  −the throwaway prefix (random)')).toBe('添加：+#最大生命；随机移除：过渡前缀');
    expect(translateMod('any suffix — a throwaway for the next step to remove')).toBe('任意后缀，作为下一步移除用的过渡词缀');
  });

  it('translates alchemy and double-exalt collections and policy alternatives', () => {
    expect(translateMod('+# to maximum Mana + +# to maximum Life')).toBe('+#最大魔力 + +#最大生命');
    expect(translateMod('++# to maximum Mana  ++# to maximum Life')).toBe('添加：+#最大魔力；添加：+#最大生命');
    expect(translateMod('+#% to Cold Resistance or +#% to Lightning Resistance')).toBe('+#%冰冷抗性 或 +#%闪电抗性');
  });

  it('keeps parser templates and unknown diagnostic text unchanged', () => {
    expect(toEngineMod('攻擊附加2至66閃電傷害')).toBe('Adds 2 to 66 Lightning damage to Attacks');
    expect(translateMod('unknown diagnostic: Rings/NotKnown')).toBe('unknown diagnostic: Rings/NotKnown');
    expect(translateCurrency('Unknown Proper Name')).toBe('Unknown Proper Name');
  });
});
