/**
 * Collection.js — the Astra roster.
 *
 * The grid shows locked Astra as silhouettes rather than hiding them. Knowing
 * exactly what you don't have yet is the entire engine of a collection game.
 */

import { el, clear } from '../dom.js';
import { currencyRail, header, button, astraCard, sheet, progressBar, statTile } from '../components/Chrome.js';
import { SpriteCanvas } from '../components/SpriteCanvas.js';
import { ASTRA, getAstra, astraSprite } from '../../data/astra.js';
import { RARITY_INFO, ELEMENT, STAR_TABLE, MAX_STAR, starPower } from '../../data/constants.js';
import { starUp, starCost, collectionStats } from '../../systems/Gacha.js';
import { save } from '../../core/Save.js';
import { abbrev, pct } from '../../core/Math2.js';
import { Sfx } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { bus, EV } from '../../core/Events.js';

const FILTERS = [
  { id: 'all', label: 'Alles' },
  { id: 'owned', label: 'In bezit' },
  { id: 'missing', label: 'Ontbreekt' },
];

export function CollectionScreen(ctx, params = {}) {
  const sprites = [];
  let filter = params.filter ?? 'all';
  let sort = 'rarity';

  const stats = collectionStats();
  ctx.backdrop?.setAccent('#a855f7', '#22d3ee');

  const grid = el('div.cgrid');
  const node = el('div.collection');

  const filterBar = el('div.filters', null,
    ...FILTERS.map((f) => el('button.filter', {
      dataset: { on: f.id === filter ? '1' : '0' },
      onclick: () => { filter = f.id; Sfx.play('tap'); renderGrid(); syncFilters(); },
    }, f.label)),
    el('div.filters__spacer'),
    el('button.filter.filter--sort', {
      onclick: () => {
        sort = sort === 'rarity' ? 'element' : sort === 'element' ? 'new' : 'rarity';
        Sfx.play('tap');
        renderGrid();
        syncFilters();
      },
    }, () => ''),
  );

  function syncFilters() {
    [...filterBar.querySelectorAll('.filter')].forEach((b, i) => {
      if (i < FILTERS.length) b.dataset.on = FILTERS[i].id === filter ? '1' : '0';
    });
    filterBar.querySelector('.filter--sort').textContent =
      sort === 'rarity' ? '⇅ Zeldzaamheid' : sort === 'element' ? '⇅ Element' : '⇅ Nieuwste';
  }

  function renderGrid() {
    while (sprites.length) sprites.pop().destroy?.();
    clear(grid);

    let list = ASTRA.slice();
    if (filter === 'owned') list = list.filter((a) => save.profile.collection[a.id]);
    if (filter === 'missing') list = list.filter((a) => !save.profile.collection[a.id]);

    if (sort === 'rarity') list.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    else if (sort === 'element') list.sort((a, b) => a.element.localeCompare(b.element) || b.rarity - a.rarity);
    else list.sort((a, b) => (save.profile.collection[b.id]?.obtainedAt ?? 0) - (save.profile.collection[a.id]?.obtainedAt ?? 0));

    if (!list.length) {
      grid.appendChild(el('div.empty', null,
        el('div.empty__icon', { text: '◈' }),
        el('div.empty__title', { text: 'Niets hier' }),
      ));
      return;
    }

    for (const a of list) {
      const entry = save.profile.collection[a.id];
      grid.appendChild(astraCard(a, entry, {
        size: 96,
        equipped: save.profile.equipped === a.id,
        onclick: () => openDetail(a),
      }));
    }
  }

  function openDetail(astra) {
    const entry = save.profile.collection[astra.id];
    const info = RARITY_INFO[astra.rarity];
    const elem = ELEMENT[astra.element];
    const owned = !!entry;
    const stars = entry?.stars ?? 0;

    if (entry?.isNew) { delete entry.isNew; save.touch(); }

    const sprite = new SpriteCanvas(astraSprite(astra, 'idle'), {
      size: 210, tint: astra.colors.primary, tint2: astra.colors.secondary, scale: 1,
    });
    sprites.push(sprite);

    const s = astra.stats;
    const mul = owned ? starPower(stars) : 1;
    const statRows = [
      ['Kracht', (s.power * mul).toFixed(1)],
      ['Vuursnelheid', s.fireRate.toFixed(1) + '/s'],
      ['Projectielen', String(s.projectiles)],
      ['HP', String(s.hp)],
      ['Krit', pct(s.crit, 0)],
      ['Snelheid', `${Math.round(s.speed * 100)}%`],
    ];

    const nextCost = owned && stars < MAX_STAR ? starCost(stars) : null;
    const echoes = save.profile.currency.echoes;
    const canStar = nextCost !== null && echoes >= nextCost;

    const body = el('div.adetail', { style: { '--c': astra.colors.primary, '--r': info.color } },
      el('div.adetail__hero', null,
        el('div.adetail__halo'),
        sprite.canvas,
      ),
      el('div.adetail__head', null,
        el('div.adetail__rarity', { dataset: { r: info.key.toLowerCase() }, text: info.name.toUpperCase() }),
        el('h2', { text: owned ? astra.name : '???' }),
        el('div.adetail__title', { text: astra.title }),
        el('div.adetail__stars', null,
          ...Array.from({ length: info.stars }, (_, i) =>
            el('span', { dataset: { on: i < stars ? '1' : '0' }, text: '★' })),
        ),
        el('div.adetail__tags', null,
          el('span.tag', { style: { '--c': elem.color } }, `${elem.icon} ${elem.name}`),
          el('span.tag', { text: weaponLabel(astra.weapon.type) }),
        ),
      ),

      el('div.adetail__lore', { text: astra.lore }),

      el('div.adetail__stats', null, ...statRows.map(([k, v]) =>
        el('div.arow', null, el('span', { text: k }), el('b', { text: v })))),

      el('div.adetail__abilities', null,
        abilityBlock('PASSIEF', astra.passive.name, astra.passive.desc, elem.color),
        abilityBlock('ULTIMATE', astra.ult.name, astra.ult.desc, '#fbbf24', `Laadkosten ${astra.ult.cost}`),
        abilityBlock('ELEMENT', elem.trait, elem.traitDesc, elem.color),
      ),

      owned ? el('div.adetail__star', null,
        el('div.adetail__starhead', null,
          el('span', { text: stars >= MAX_STAR ? 'Maximaal ontwikkeld' : `★${stars} → ★${stars + 1}` }),
          nextCost !== null ? el('b', { text: `◉ ${nextCost}` }) : null,
        ),
        nextCost !== null ? progressBar(Math.min(1, echoes / nextCost), {
          color: canStar ? '#fbbf24' : '#475569',
          label: `${abbrev(echoes)} / ${abbrev(nextCost)}`,
        }) : null,
        nextCost !== null ? el('div.adetail__starnote', { text: STAR_TABLE[stars]?.note ?? '' }) : null,
      ) : null,

      el('div.adetail__actions', null,
        owned ? button(save.profile.equipped === astra.id ? 'Uitgerust' : 'Uitrusten', {
          variant: save.profile.equipped === astra.id ? 'quiet' : 'primary',
          size: 'lg', full: true,
          disabled: save.profile.equipped === astra.id,
          onclick: () => {
            save.profile.equipped = astra.id;
            save.touch();
            bus.emit(EV.ASTRA_EQUIP, { id: astra.id });
            bus.emit(EV.TOAST, { text: `${astra.name} uitgerust`, tone: 'good' });
            sh.close();
            renderGrid();
          },
        }) : button('Nog niet in bezit', { variant: 'quiet', size: 'lg', full: true, disabled: true }),

        owned && nextCost !== null ? button(`Ster verhogen`, {
          variant: 'gold', size: 'lg', full: true, disabled: !canStar,
          sub: canStar ? null : `nog ${abbrev(nextCost - echoes)} ◉`,
          onclick: () => {
            const r = starUp(astra.id);
            if (r.ok) {
              Sfx.play('levelup');
              haptic('success');
              bus.emit(EV.TOAST, { text: `${astra.name} → ★${r.stars}`, tone: 'gold', ttl: 2400 });
              sh.close();
              renderGrid();
            } else Sfx.play('error');
          },
        }) : null,
      ),
    );

    const sh = sheet(owned ? astra.name : 'Onbekende Astra', body, {
      onClose: () => sprite.destroy(),
    });
    node.appendChild(sh);
  }

  /* ---------------- assemble ---------------- */

  const progress = el('div.cprogress', null,
    el('div.cprogress__top', null,
      el('span', { text: 'Verzameling' }),
      el('b', { text: `${stats.owned} / ${stats.total}` }),
    ),
    progressBar(stats.pct, { color: '#a855f7', height: 8 }),
    el('div.cprogress__tiers', null,
      ...RARITY_INFO.map((r, i) => el('span.ctier', { style: { '--c': r.color } },
        el('b', { text: r.short }), ` ${stats.byTier[i]}/${stats.totalByTier[i]}`)),
    ),
  );

  node.append(
    el('div.topbar', null,
      el('button.backbtn', { onclick: () => { Sfx.play('back'); ctx.go('home', { replace: true }); } }, el('span', { text: '‹' })),
      currencyRail(['echoes', 'stardust']),
    ),
    progress,
    filterBar,
    el('div.collection__scroll', null, grid),
  );

  syncFilters();
  renderGrid();

  return { node, dispose() { while (sprites.length) sprites.pop().destroy?.(); } };
}

function abilityBlock(kind, name, desc, color, extra) {
  return el('div.abil', { style: { '--c': color } },
    el('div.abil__kind', { text: kind }),
    el('div.abil__name', { text: name }),
    el('div.abil__desc', { text: desc }),
    extra ? el('div.abil__extra', { text: extra }) : null,
  );
}

const WEAPON_LABELS = {
  straight: 'Recht schot', spread: 'Waaier', wave: 'Golfbaan', homing: 'Zoeker',
  lob: 'Boogschot', pierce: 'Doorborend', cone: 'Kegel', beam: 'Straal',
  orbit: 'Orbitaal', slam: 'Inslag', nova: 'Rondom', singularity: 'Singulariteit',
  prismshot: 'Prisma', boomerang: 'Boemerang', chain: 'Ketting',
};
const weaponLabel = (t) => WEAPON_LABELS[t] ?? t;
