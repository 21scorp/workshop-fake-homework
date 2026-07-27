/**
 * Shop.js — store + permanent upgrades.
 *
 * Two tabs, deliberately in this order: **Werf** (spend earned Cores on
 * permanent upgrades) comes first, **Winkel** (real money) second. A player
 * should hit the free progression track before the paid one.
 *
 * Every paid SKU is clearly labelled as a simulation right now, because
 * pretending to charge money without charging money is the kind of thing that
 * gets an app pulled.
 */

import { el, clear } from '../dom.js';
import { currencyRail, button, progressBar, sheet } from '../components/Chrome.js';
import {
  SKUS, priceLabel, valuePerEuro, owned, buy, restorePurchases,
  META_UPGRADES, upgradeLevel, buyUpgrade,
} from '../../data/shop.js';
import { save } from '../../core/Save.js';
import { abbrev } from '../../core/Math2.js';
import { CURRENCY } from '../../data/constants.js';
import { Sfx } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { bus, EV } from '../../core/Events.js';

export function ShopScreen(ctx, params = {}) {
  let tab = params.tab ?? 'yard';
  ctx.backdrop?.setAccent('#34d399', '#fbbf24');

  const body = el('div.shop__body');
  const tabs = el('div.tabs', null,
    el('button.tab', { dataset: { on: '1' }, onclick: () => setTab('yard') }, '⬢ Werf'),
    el('button.tab', { onclick: () => setTab('store') }, '◈ Winkel'),
    el('button.tab', { onclick: () => { Sfx.play('tap'); ctx.go('starpass'); } }, '★ Starpass'),
  );

  const TAB_IDS = ['yard', 'store'];
  const syncTabs = () => [...tabs.children].forEach((b, i) => {
    // The third tab navigates away, so it is never the active one.
    b.dataset.on = TAB_IDS[i] === tab ? '1' : '0';
  });

  function setTab(t) {
    if (t === tab) return;
    tab = t;
    Sfx.play('tap');
    haptic('light');
    syncTabs();
    render();
  }

  /* ============================================================
     YARD — Cores → permanent upgrades
     ============================================================ */

  function renderYard() {
    const cores = save.profile.currency.cores ?? 0;
    const list = el('div.upgrades');

    for (const up of META_UPGRADES) {
      const lvl = upgradeLevel(up.id);
      const maxed = lvl >= up.max;
      const cost = maxed ? null : up.cost(lvl);
      const can = !maxed && cores >= cost;

      list.appendChild(el('div.upg', { dataset: { maxed: maxed ? '1' : '0' } },
        el('div.upg__icon', { text: up.icon }),
        el('div.upg__mid', null,
          el('div.upg__name', { text: up.name }),
          el('div.upg__desc', { text: maxed ? 'Volledig ontwikkeld' : up.desc(lvl) }),
          el('div.upg__pips', null,
            ...Array.from({ length: up.max }, (_, i) =>
              el('span.upg__pip', { dataset: { on: i < lvl ? '1' : '0' } })),
          ),
        ),
        maxed
          ? el('div.upg__max', { text: 'MAX' })
          : button(`⬢ ${cost}`, {
              variant: can ? 'primary' : 'quiet', size: 'sm', disabled: !can,
              onclick: () => {
                const r = buyUpgrade(up.id);
                if (r.ok) {
                  Sfx.play('levelup'); haptic('success');
                  bus.emit(EV.TOAST, { text: `${up.name} → ${r.level}`, tone: 'good' });
                  render();
                } else Sfx.play('error');
              },
            }),
      ));
    }

    return el('div', null,
      el('div.shop__lead', null,
        el('h2', { text: 'De Werf' }),
        el('p', { text: 'Permanente upgrades voor elke run. Betaald met Cores, die je alleen door te spelen verdient.' }),
        el('div.shop__cores', null, el('b', { text: `⬢ ${abbrev(cores)}` }), ' beschikbaar'),
      ),
      list,
    );
  }

  /* ============================================================
     STORE — SKUs through the payment provider
     ============================================================ */

  function renderStore() {
    const list = el('div.skus');

    for (const sku of SKUS) {
      const isOwned = sku.oneTime && owned(sku.id);
      const vpe = valuePerEuro(sku);

      list.appendChild(el('div.sku', {
        dataset: { kind: sku.kind, owned: isOwned ? '1' : '0' },
        style: { '--c': sku.accent ?? '#22d3ee' },
      },
        sku.badge ? el('div.sku__badge', { text: sku.badge }) : null,
        el('div.sku__glow'),
        el('div.sku__top', null,
          el('div.sku__name', { text: sku.name }),
          sku.tagline ? el('div.sku__tag', { text: sku.tagline }) : null,
        ),
        el('div.sku__grants', null,
          ...Object.entries(sku.grants).map(([k, v]) =>
            el('span.sku__g', { style: { '--c': CURRENCY[k].color } },
              CURRENCY[k].symbol, ' ', abbrev(v))),
          sku.bonusPct ? el('span.sku__bonus', { text: `+${sku.bonusPct}% bonus` }) : null,
        ),
        sku.extra ? el('div.sku__extra', { text: sku.extra }) : null,
        el('div.sku__foot', null,
          vpe ? el('span.sku__vpe', { text: `${Math.round(vpe)} ◈ per €` }) : el('span'),
          isOwned
            ? el('span.sku__owned', { text: '✓ In bezit' })
            : button(priceLabel(sku), {
                variant: sku.badge ? 'gold' : 'primary', size: 'sm',
                onclick: () => confirmBuy(sku),
              }),
        ),
      ));
    }

    return el('div', null,
      el('div.shop__lead', null,
        el('h2', { text: 'Winkel' }),
        el('p', { text: 'Alles wat hier staat kun je ook verdienen door te spelen. Betalen koopt tijd, geen kracht.' }),
      ),
      el('div.shop__notice', null,
        el('b', { text: 'Demo-modus' }),
        ' — er wordt niets afgeschreven. Aankopen lopen via een mock-provider; ' +
        'de echte betaalintegratie sluit later op dezelfde interface aan.',
      ),
      list,
      el('div.shop__legal', null,
        el('button.linkbtn', { text: 'Aankopen herstellen', onclick: () => restorePurchases() }),
        el('span', { text: 'Prijzen incl. btw · Geen abonnement' }),
      ),
    );
  }

  function confirmBuy(sku) {
    const s = sheet('Bevestig aankoop', el('div.buyc', null,
      el('div.buyc__name', { text: sku.name }),
      el('div.buyc__grants', null, ...Object.entries(sku.grants).map(([k, v]) =>
        el('div.buyc__row', null,
          el('span', { style: { color: CURRENCY[k].color }, text: CURRENCY[k].symbol }),
          el('span', { text: CURRENCY[k].name }),
          el('b', { text: '+' + abbrev(v) }),
        ))),
      sku.extra ? el('div.buyc__extra', { text: sku.extra }) : null,
      !save.profile.flags.firstPurchase && sku.kind === 'currency'
        ? el('div.buyc__bonus', { text: '🎁 Eerste aankoop: dubbele valuta' }) : null,
      el('div.buyc__price', { text: priceLabel(sku) }),
      el('p.buyc__note', { text: 'Demo: er wordt geen betaling gedaan.' }),
      button('Bevestigen', {
        variant: 'gold', size: 'lg', full: true,
        onclick: async () => {
          s.close();
          const r = await buy(sku.id);
          if (r.ok) { Sfx.play('levelup'); haptic('success'); render(); }
        },
      }),
    ));
    node.appendChild(s);
  }

  function render() {
    clear(body).appendChild(tab === 'yard' ? renderYard() : renderStore());
  }

  const node = el('div.shop', null,
    el('div.topbar', null,
      el('button.backbtn', { onclick: () => { Sfx.play('back'); ctx.go('home', { replace: true }); } }, el('span', { text: '‹' })),
      currencyRail(['cores', 'shards', 'stardust']),
    ),
    tabs,
    el('div.shop__scroll', null, body),
  );

  syncTabs();
  render();

  return { node };
}
