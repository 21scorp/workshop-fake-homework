/**
 * Starpass.js — the season pass screen.
 *
 * A horizontal tier track with two rows: free on top, premium below. You can
 * see the whole season at a glance, which is the entire point — a pass you
 * have to scroll through one tier at a time doesn't motivate anyone.
 */

import { el, clear, countTo } from '../dom.js';
import { currencyRail, header, button, progressBar, sheet } from '../components/Chrome.js';
import { CURRENCY } from '../../data/constants.js';
import { HIGHLIGHTS } from '../../data/starpass.js';
import {
  SEASON, TIERS, progress, pending, claimTier, claimAll, claimed,
  hasPremium, msUntilSeasonEnd,
} from '../../systems/Starpass.js';
import { getSku, priceLabel, buy } from '../../data/shop.js';
import { abbrev, durationStr } from '../../core/Math2.js';
import { Sfx } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { bus, EV } from '../../core/Events.js';

export function StarpassScreen(ctx) {
  ctx.backdrop?.setAccent('#a855f7', '#fbbf24');

  const track = el('div.pass__track');
  const head = el('div.pass__head');
  const foot = el('div.pass__foot');

  function render() {
    const pr = progress();
    const pend = pending();
    const premium = hasPremium();
    const sku = getSku('starpass_season');

    /* ---------------- header ---------------- */
    clear(head).append(
      el('div.pass__title', null,
        el('div.pass__season', { text: SEASON.name }),
        el('div.pass__timer', { text: `nog ${durationStr(msUntilSeasonEnd())}` }),
      ),
      el('div.pass__tier', null,
        el('b', { text: String(pr.tier) }),
        el('span', { text: `/ ${pr.maxTier}` }),
      ),
      progressBar(pr.pct, {
        color: premium ? '#fbbf24' : '#a855f7', height: 8,
        label: pr.complete ? 'Seizoen voltooid' : `${abbrev(pr.into)} / ${abbrev(pr.need)} XP`,
      }),
      el('div.pass__hl', null, ...HIGHLIGHTS.map((h) =>
        el('span.pass__hlitem', { dataset: { track: h.track, on: pr.tier >= h.at ? '1' : '0' } },
          `T${h.at} · ${h.label}`))),
    );

    /* ---------------- tier track ---------------- */
    clear(track);
    for (const t of TIERS) {
      const reached = t.n <= pr.tier;
      track.appendChild(el('div.tier', { dataset: { reached: reached ? '1' : '0', big: t.big ? '1' : '0' } },
        el('div.tier__n', { text: String(t.n) }),
        rewardCell(t, 'free', reached, premium),
        rewardCell(t, 'premium', reached, premium),
      ));
    }

    // Scroll the current tier into view so the screen opens where you are.
    requestAnimationFrame(() => {
      const cur = track.children[Math.max(0, pr.tier - 2)];
      cur?.scrollIntoView({ inline: 'start', block: 'nearest' });
    });

    /* ---------------- footer ---------------- */
    clear(foot).append(
      pend.total > 0
        ? button(`Alles ophalen (${pend.total})`, {
            variant: 'gold', size: 'lg', full: true, sfx: 'confirm', haptics: 'success',
            onclick: () => {
              const r = claimAll();
              if (r.count) {
                bus.emit(EV.TOAST, { text: `${r.count} beloningen opgehaald`, tone: 'gold' });
                render();
              }
            },
          })
        : el('div.pass__none', { text: pr.complete ? 'Alles opgehaald. Tot volgend seizoen.' : 'Speel runs om tiers te verdienen.' }),

      premium
        ? el('div.pass__owned', { text: '✓ Premium track actief' })
        : button('Ontgrendel premium track', {
            variant: 'primary', size: 'lg', full: true,
            sub: sku ? priceLabel(sku) : null,
            onclick: () => confirmBuy(sku),
          }),
    );
  }

  function rewardCell(t, trackName, reached, premium) {
    const bag = trackName === 'premium' ? t.premium : t.free;
    const isClaimed = claimed(t.n, trackName);
    const locked = trackName === 'premium' && !premium;
    const canClaim = reached && !isClaimed && !locked;

    return el('button.tier__cell', {
      dataset: { track: trackName, claimed: isClaimed ? '1' : '0', locked: locked ? '1' : '0', can: canClaim ? '1' : '0' },
      onclick: () => {
        if (!canClaim) {
          if (locked) { Sfx.play('error'); bus.emit(EV.TOAST, { text: 'Premium track niet actief', tone: 'info' }); }
          return;
        }
        const r = claimTier(t.n, trackName);
        if (r.ok) { Sfx.play('coin'); haptic('medium'); render(); }
      },
    },
      ...Object.entries(bag).map(([k, v]) => el('span.tier__r', { style: { '--c': CURRENCY[k].color } },
        el('i', { text: CURRENCY[k].symbol }), abbrev(v))),
      isClaimed ? el('span.tier__check', { text: '✓' }) : null,
      locked ? el('span.tier__lock', { text: '🔒' }) : null,
    );
  }

  function confirmBuy(sku) {
    if (!sku) return;
    const s = sheet('Premium track', el('div.buyc', null,
      el('div.buyc__name', { text: sku.name }),
      el('p.sheet__lead', { text: 'Ontgrendelt de premium beloning van elke tier — ook alle tiers die je al hebt gehaald. Wie later koopt loopt niets mis.' }),
      el('div.buyc__price', { text: priceLabel(sku) }),
      el('p.buyc__note', { text: 'Demo: er wordt geen betaling gedaan.' }),
      button('Bevestigen', {
        variant: 'gold', size: 'lg', full: true,
        onclick: async () => { s.close(); const r = await buy(sku.id); if (r.ok) render(); },
      }),
    ));
    node.appendChild(s);
  }

  const node = el('div.pass', null,
    el('div.topbar', null,
      el('button.backbtn', { onclick: () => { Sfx.play('back'); ctx.go('home', { replace: true }); } }, el('span', { text: '‹' })),
      currencyRail(['shards', 'stardust', 'cores']),
    ),
    head,
    el('div.pass__scrollx', null, track),
    el('ul.pass__how', null,
      el('h3', { text: 'Hoe het werkt' }),
      el('li', null, el('i', { text: '▸' }), el('span', null,
        el('b', { text: 'Tiers verdien je door te spelen. ' }),
        'Elke run levert seizoen-XP op; dieper komen levert meer op. Tiers zijn niet te koop.')),
      el('li', null, el('i', { text: '▸' }), el('span', null,
        el('b', { text: 'De gratis track loopt door tot tier 30. ' }),
        'Wie nooit betaalt haalt het hele seizoen uit.')),
      el('li', null, el('i', { text: '▸' }), el('span', null,
        el('b', { text: 'Later kopen kost je niets. ' }),
        'De premium track keert met terugwerkende kracht uit voor elke tier die je al gehaald hebt.')),
    ),
    foot,
  );

  render();
  return { node };
}
