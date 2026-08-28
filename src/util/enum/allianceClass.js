/**
 * Alliance classes, keyed the way OGame numbers them.
 *
 * Deliberately the same values as `playerClass.js`: the game uses one numbering for
 * both, and the two used to exist in `ogkush.js` as eight separate `const`s
 * (`ALLY_CLASS_*` / `PLAYER_CLASS_*`) that had to agree by hand.
 *
 * The in-game icon calls the miner alliance "trader", which is why
 * `getAllianceClass()` maps a `.trader` icon onto `MINER`.
 */
export default Object.freeze({
  EXPLORER: 3,
  WARRIOR: 2,
  MINER: 1,
  NONE: 0,
});
