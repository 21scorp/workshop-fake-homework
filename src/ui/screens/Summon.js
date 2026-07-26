/**
 * Summon.js — the banner screen.
 *
 * Every number a player could want is on this screen without a tap: what the
 * pull costs, what they have, how far pity is, what the current SSR chance
 * actually is, and whether their next SSR is guaranteed to be the featured one.
 * Hiding those numbers doesn't sell more pulls — it sells distrust.
 */

import { el, fill, pulse } from '../dom.js';
import { currencyRail, header, button, sheet, progressBar } from '../components/Chrome.js';
import { SpriteCanvas } from '../components/SpriteCanvas.js';
import { BANNERS, getBanner, rateTable, ssrChanceAt } from '../../data/banners.js';
import { getAstra, astraSprite } from '../../data/astra.js';
import { RARITY_INFO } from '../../data/constants.js';
import { pull, pityInfo, canAfford } from '../../systems/Gacha.js';
import { freePullAvailable, consumeFreePull } from '../../systems/Daily.js';
import { save } from '../../core/Save.js';
import { abbrev, pct, clamp01 } from '../../core/Math2.js';
import { Sfx } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { bus, EV } from '../../core/Events.js';
import { PullReveal } from '../PullReveal.js';

export function SummonScreen(ctx, params = {}) {
  let bannerIdx = Math.max(0, BANNERS.findIndex((b) => b.id === (params.banner ?? save.profile.lastBanner ?? 'kairos')));
  const sprites = [];

  const node = el('div.summon');
  const stageWrap = el('div.summon__stage');
  const infoWrap = el('div.summon__info');
  const actionWrap = el('div.summon__actions');

  const tabs = el('div.summon__tabs', null,
    ...BANNERS.map((b, i) => el('button.stab', {
      dataset: { on: i === bannerIdx ? '1' : '0', limited: b.limited ? '1' : '0' },
      onclick: () => { if (i !== bannerIdx) { Sfx.play('tap'); haptic('light'); bannerIdx = i; render(); } },
    }, el('span', { text: b.name }))),
  );

  node.append(
    el('div.topbar', null,
      el('button.backbtn', { onclick: () => { Sfx.play('back'); ctx.go('home', { replace: true }); } }, el('span', { text: '‹' })),
      currencyRail(['stardust', 'shards']),
    ),
    tabs,
    stageWrap,
    infoWrap,
    actionWrap,
  );

  function render() {
    const banner = BANNERS[bannerIdx];
    save.profile.lastBanner = banner.id;
    ctx.backdrop?.setAccent(banner.accent, banner.colors[1]);

    [...tabs.children].forEach((t, i) => (t.dataset.on = i === bannerIdx ? '1' : '0'));

    const pity = pityInfo(banner.id);
    const featured = (banner.featured ?? []).map(getAstra).filter(Boolean)
      .sort((a, b) => b.rarity - a.rarity);
    const star = featured[0];

    /* ---------------- banner art ---------------- */
    while (sprites.length) sprites.pop().destroy();

    const heroSprite = new SpriteCanvas(astraSprite(star, 'idle'), {
      size: 270, tint: star.colors.primary, tint2: star.colors.secondary, scale: 1, speed: 0.85,
    });
    sprites.push(heroSprite);

    const sideEls = featured.slice(1, 3).map((a) => {
      const s = new SpriteCanvas(astraSprite(a, 'idle'), {
        size: 74, tint: a.colors.primary, tint2: a.colors.secondary, scale: 1,
      });
      sprites.push(s);
      return el('div.summon__side', { style: { '--c': RARITY_INFO[a.rarity].color } },
        s.canvas, el('span', { text: a.name }));
    });

    fill(stageWrap, el('div.bannerart', {
      style: {
        '--g1': banner.colors[0], '--g2': banner.colors[1],
        '--g3': banner.colors[2] ?? banner.colors[0], '--acc': banner.accent,
      },
    },
      el('div.bannerart__glow'),
      el('div.bannerart__rays'),
      banner.limited ? el('div.bannerart__limited', { text: 'BEPERKT' }) : null,
      el('div.bannerart__hero', null, heroSprite.canvas),
      el('div.bannerart__txt', null,
        el('div.bannerart__rarity', { dataset: { r: RARITY_INFO[star.rarity].key.toLowerCase() }, text: RARITY_INFO[star.rarity].name.toUpperCase() }),
        el('h2', { text: banner.name }),
        el('p', { text: banner.tagline }),
      ),
      sideEls.length ? el('div.bannerart__sides', null, ...sideEls) : null,
    ));

    /* ---------------- pity + rates ---------------- */
    const chance = ssrChanceAt(banner, pity.sinceSSR);
    const softFrac = clamp01(pity.sinceSSR / banner.pity.hard);

    fill(infoWrap,
      el('div.pity', null,
        el('div.pity__row', null,
          el('span.pity__label', { text: 'Pity' }),
          el('span.pity__val', null,
            el('b', { text: String(pity.sinceSSR) }), ' / ', String(banner.pity.hard),
            el('em', { text: `nog ${pity.toHard}` }),
          ),
        ),
        progressBar(softFrac, { color: pity.inSoft ? '#fbbf24' : banner.accent, height: 8 }),
        el('div.pity__meta', null,
          el('span', null, 'Stellar+ kans nu: ', el('b', { text: pct(chance, chance < 0.05 ? 2 : 1) })),
          pity.inSoft ? el('span.pity__soft', { text: '⚡ SOFT PITY ACTIEF' }) : null,
          pity.guaranteedFeatured ? el('span.pity__guar', { text: '★ Volgende Stellar+ is gegarandeerd rate-up' }) : null,
        ),
        el('div.pity__row.pity__row--sr', null,
          el('span.pity__label', { text: 'Superior garantie' }),
          el('span.pity__val', null, el('b', { text: String(pity.toSR) }), ' pulls'),
        ),
        el('button.linkbtn.pity__rates', {
          text: 'Bekijk exacte percentages ›',
          onclick: () => openRates(banner),
        }),
      ),
    );

    /* ---------------- actions ---------------- */
    const a1 = canAfford(banner.id, 1);
    const a10 = canAfford(banner.id, 10);
    const sym = banner.currency === 'shards' ? '◈' : '✦';
    const free = banner.id === 'standard' && freePullAvailable();

    fill(actionWrap,
      free ? el('button.freepull', {
        onclick: () => { consumeFreePull(); doPull(banner, 1, true); },
      }, el('span.freepull__glow'), '🎁 GRATIS DAGELIJKSE SUMMON') : null,
      el('div.summon__btns', null,
        button('Summon ×1', {
          variant: 'ghost', size: 'lg', disabled: !a1.ok,
          sub: `${sym} ${abbrev(a1.cost)}`,
          onclick: () => doPull(banner, 1),
        }),
        button('Summon ×10', {
          variant: 'gold', size: 'lg', disabled: !a10.ok,
          sub: `${sym} ${abbrev(a10.cost)}  ·  −10%`,
          onclick: () => doPull(banner, 10),
        }),
      ),
      el('div.summon__guar', { text: '×10 garandeert minimaal één Superior of hoger' }),
      !a10.ok ? el('button.linkbtn.summon__need', {
        text: `Je hebt ${abbrev(a10.cost - a10.have)} ${sym} te weinig — naar de winkel ›`,
        onclick: () => ctx.go('shop'),
      }) : null,
    );
  }

  function openRates(banner) {
    const rows = rateTable(banner);
    const body = el('div', null,
      el('p.sheet__lead', { text: 'Alle percentages zijn exact zoals de code ze gebruikt.' }),
      el('div.rates', null, ...rows.map((r) => el('div.rates__row', { dataset: { t: RARITY_INFO[r.tier].key.toLowerCase() } },
        el('span.rates__n', { text: r.name }),
        el('span.rates__v', { text: r.label }),
      ))),
      el('h3.sheet__h3', { text: 'Pity-regels' }),
      el('ul.rules', null,
        el('li', { text: `Vanaf pull ${banner.pity.soft} stijgt de Stellar+ kans elke pull tot 100% op pull ${banner.pity.hard}.` }),
        el('li', { text: `Elke ${banner.pity.srEvery} pulls is minimaal Superior gegarandeerd.` }),
        el('li', { text: `Een ×10 garandeert minimaal één Superior of hoger.` }),
        el('li', { text: `${Math.round((banner.featuredBoost ?? 0.5) * 100)}% kans dat een Stellar+ de rate-up Astra is. Zo niet, dan is de volgende Stellar+ gegarandeerd rate-up.` }),
        el('li', { text: 'Dubbele Astra worden Echoes en Stardust — niets is verspild.' }),
      ),
      el('h3.sheet__h3', { text: 'Rate-up Astra' }),
      el('div.rates__feat', null, ...(banner.featured ?? []).map(getAstra).filter(Boolean).map((a) =>
        el('span.rates__chip', { style: { '--c': RARITY_INFO[a.rarity].color } },
          `${RARITY_INFO[a.rarity].short} · ${a.name}`))),
    );
    node.appendChild(sheet('Percentages & pity', body));
  }

  async function doPull(banner, count, isFree = false) {
    if (busy) return;
    busy = true;

    let res;
    if (isFree) {
      // The free pull doesn't charge, but still moves pity — same roller.
      const before = save.profile.currency[banner.currency];
      save.profile.currency[banner.currency] += banner.cost1;
      res = pull(banner.id, 1);
      if (!res.ok) save.profile.currency[banner.currency] = before;
    } else {
      res = pull(banner.id, count);
    }

    if (!res.ok) {
      Sfx.play('error');
      bus.emit(EV.TOAST, { text: 'Niet genoeg valuta', tone: 'bad' });
      busy = false;
      return;
    }

    ctx.backdrop?.setIntensity(1);
    const reveal = new PullReveal(ctx.overlayRoot ?? node);
    await reveal.play(res.results, {
      bannerAccent: banner.accent,
      summary: res.summary,
      onDone: () => {
        busy = false;
        ctx.backdrop?.setIntensity(0);
        render();
      },
      onAgain: () => { busy = false; render(); doPull(banner, count); },
    });
  }

  let busy = false;
  render();

  return {
    node,
    dispose() { while (sprites.length) sprites.pop().destroy(); },
  };
}
