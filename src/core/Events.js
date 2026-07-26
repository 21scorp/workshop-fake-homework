/**
 * Events.js — tiny synchronous event bus.
 *
 * Systems talk through this instead of holding references to each other.
 * Gacha doesn't know the UI exists; it emits `gacha:pull`. The UI listens.
 */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._map = new Map();
    this._depth = 0;
    this.debug = false;
  }

  /** @returns {() => void} unsubscribe */
  on(type, fn) {
    let set = this._map.get(type);
    if (!set) this._map.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  /** Fires at most once. */
  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }

  off(type, fn) {
    const set = this._map.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this._map.delete(type);
  }

  emit(type, payload) {
    if (this.debug) console.debug('%c⟶ ' + type, 'color:#a855f7', payload ?? '');
    const set = this._map.get(type);
    if (set) {
      // Copy: handlers are allowed to unsubscribe during dispatch.
      for (const fn of [...set]) {
        try { fn(payload, type); }
        catch (err) { console.error(`[events] handler for "${type}" threw`, err); }
      }
    }
    const wild = this._map.get('*');
    if (wild) for (const fn of [...wild]) {
      try { fn(payload, type); } catch (err) { console.error('[events] wildcard threw', err); }
    }
  }

  /** Drop every listener for a type, or everything when called bare. */
  clear(type) {
    if (type) this._map.delete(type);
    else this._map.clear();
  }

  count(type) { return this._map.get(type)?.size ?? 0; }
}

/** Global bus. One game, one bus. */
export const bus = new EventBus();

/**
 * Canonical event names. Keeping them here means a typo is a missing import
 * rather than a listener that silently never fires.
 */
export const EV = {
  // lifecycle
  BOOT_DONE:     'boot:done',
  SCENE_ENTER:   'scene:enter',
  SCENE_EXIT:    'scene:exit',
  NAV:           'nav',
  PAUSE:         'game:pause',
  RESUME:        'game:resume',
  VISIBILITY:    'game:visibility',
  RESIZE:        'game:resize',

  // run
  RUN_START:     'run:start',
  RUN_END:       'run:end',
  RUN_TICK:      'run:tick',
  WAVE_START:    'run:wave',
  BOSS_SPAWN:    'run:boss',
  BOSS_DEAD:     'run:bossdead',
  LEVEL_UP:      'run:levelup',
  CARD_PICKED:   'run:card',
  PLAYER_HIT:    'run:hit',
  PLAYER_DEAD:   'run:dead',
  ENEMY_KILLED:  'run:kill',
  COMBO:         'run:combo',
  ULT_READY:     'run:ultready',
  ULT_FIRED:     'run:ult',
  NEAR_DEATH:    'run:neardeath',

  // economy / meta
  CURRENCY:      'econ:currency',
  REWARD:        'econ:reward',
  PURCHASE:      'econ:purchase',
  GACHA_PULL:    'gacha:pull',
  GACHA_DONE:    'gacha:done',
  ASTRA_NEW:     'collection:new',
  ASTRA_STAR:    'collection:star',
  ASTRA_EQUIP:   'collection:equip',
  QUEST_DONE:    'quest:done',
  LEVEL_ACCOUNT: 'account:level',

  // ui / fx
  TOAST:         'ui:toast',
  SHAKE:         'fx:shake',
  FLASH:         'fx:flash',
  HITSTOP:       'fx:hitstop',
  SFX:           'audio:sfx',
  MUSIC:         'audio:music',
  HAPTIC:        'ui:haptic',
};
