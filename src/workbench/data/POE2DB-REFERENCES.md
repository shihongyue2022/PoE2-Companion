# PoE2DB cross references

Checked on 2026-10-22:

- [Modifiers](https://poe2db.tw/tw/Modifiers)
- [The Ordained](https://poe2db.tw/tw/The_Ordained)
- [Morior Invictus](https://poe2db.tw/tw/Morior_Invictus)
- [Igniferis](https://poe2db.tw/tw/Igniferis)
- [The Taming](https://poe2db.tw/tw/The_Taming)

`../poe2dbReference.ts` records a small, manually checked set of game stat identifiers and their reference pages. It does not mirror the site's articles or create a complete modifier database. Existing bilingual labels and official trading mappings remain in the separately attributed Exiled Exchange 2 vocabulary.

The Spear Throw display flag is recognized as a skill effect even though the pinned official trading index has no corresponding independent filter. Its internal stat identifier and boolean flag are never sent as trading conditions or scored as damage. Unresolved PoB review markers remain unresolved.

The Taming's fixed PoB values are reparsed from the original file: Dexterity and both resistance lines are additive base stats. Damage per elemental ailment is a conditional coefficient, not unconditional final damage. Wind ground effects remain separate mechanics. Multiline combinations keep the corresponding bilingual variant, rather than translating every variant as Chilled Ground. The shared official condition does not prove the exact ground combination; the item text remains authoritative.

Local item defence modifiers and global defence modifiers per filled augment socket retain distinct identifiers and calculations. A reference link does not validate an item's roll, the current crafting pool, or T1 bounds; those still need version-specific rules. No crafting probabilities or prices are inferred from these links.

The shared equipment/trading affix panel offers native English reference links. Expanding it initiates a read of the named English PoE2DB item popup through `/api/workbench/affix-reference`. Only an allowlisted official English item name is sent; copied gear, account data and roll values are not sent. The service rejects redirects, mismatched item titles, oversized responses and non-HTML content; successful results are cached for six hours. It extracts current popup modifier descriptions, not lore, related items, articles or history. This initial manual review covers the listed effects, not every modifier in the game.

English `ref`, `statId` and `englishText` identify affixes; simplified Chinese labels are presentation only. The full native English constant variant is retained (including ground combinations). Reference range endpoints are used only to recognize grammar against the existing pinned official-ID vocabulary, never to fill an owned item's numeric values. Only mapped missing effects are offered as unchecked presence conditions, clearly labeled as references; random unique modifiers are not automatically assumed to exist on the worn item. Failed/unknown references do not alter the original item or manufacture official trade IDs. Runtime references are session/server caches, not a redistributed wiki article corpus.
