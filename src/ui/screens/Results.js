/**
 * Results.js — the post-run screen.
 *
 * The order here is deliberate: score first (the emotional payload), then
 * rewards counting up (the "that wasn't wasted" beat), then *Nog een keer* as
 * the biggest button on screen. Share sits next to it, never in front of it —
 * the retry is the loop, sharing is the bonus.
 */

import { el, countTo, stagger, sleep } from '../dom.js';
import { button, statTile, progressBar } from '../components/Chrome.js';
import { SpriteCanvas } from '../components/SpriteCanvas.js';
import { getAstra, astraSprite } from '../../data/astra.js';
import { RARITY_INFO, CURRENCY } from '../../data/constants.js';
import { getCard } from '../../data/cards.js';
import { grouped, timeStr, abbrev } from '../../core/Math2.js';
import { save } from '../../core/Save.js';
import { Sfx, Music } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { renderShareCard, shareRun, downloadBlob } from '../../systems/Share.js';
import { rankFor } from '../../systems/Rank.js';
import { accountProgress } from '../../systems/Economy.js';
import { bus, EV } from '../../core/Events.js';

export function ResultsScreen(ctx, params = {}) {
  const run = params.run ?? {};
  const rewards = params.rewards ?? {};
  const levels = params.levels ?? [];
  const unlocked = params.unlocked ?? [];
  const season = params.season ?? null;
  const astra = getAstra(run.astraId) ?? getAstra('pip');
  const info = RARITY_INFO[astra.rarity];
  const isBest = run.score >= (save.profile.stats.bestScore ?? 0) && run.score > 0;
  const rank = rankFor(run.score ?? 0);

  ctx.backdrop?.setAccent(astra.colors.primary, info.color);
  ctx.backdrop?.setIntensity(0.25);
  Music.start('result');

  const sprite = new SpriteCanvas(astraSprite(astra, 'idle'), {
    size: 150, tint: astra.colors.primary, tint2: astra.colors.secondary, scale: 1,
  });

  const scoreEl = el('div.res__score', { text: '0' });
  const prog = accountProgress();

  // Collapse the pick list into one chip per card with a stack count.
  const uniqueChips = [];
  const seen = new Map();
  for (const c of run.cards ?? []) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  for (const [id, n] of seen) {
    const def = getCard(id);
    if (!def) continue;
    uniqueChips.push(el('span.chip', { style: { '--c': def.color } },
      el('span.chip__i', { text: def.icon }), def.name, n > 1 ? el('b', { text: `×${n}` }) : null));
  }

  const rewardRows = [
    ['stardust', rewards.stardust],
    ['shards', rewards.shards],
    ['cores', rewards.cores],
  ].filter(([, v]) => v > 0);

  const node = el('div.res', { style: { '--c': astra.colors.primary } },
    el('div.res__scroll', null,

      el('div.res__head', null,
        isBest ? el('div.res__best', { text: '★ NIEUW RECORD ★' }) : null,
        el('div.res__eyebrow', { text: run.died ? 'RUN BEËINDIGD' : 'RUN VOLTOOID' }),
        scoreEl,
        el('div.res__sub', null,
          `Golf ${run.wave ?? 1}`, el('i'), `${run.kills ?? 0} kills`,
          el('i'), timeStr(run.time ?? 0, false),
        ),
        // The rank turns the score into something you can say out loud, and
        // the bar under it gives the next run a target that is nearer than
        // the personal best.
        el('div.res__rank', { style: { '--c': rank.color } },
          el('b.res__rankk', { text: rank.key }),
          el('div.res__rankm', null,
            el('span', { text: rank.label }),
            rank.next
              ? el('i', { text: `nog ${abbrev(rank.toNext)} voor ${rank.next.key}` })
              : el('i', { text: 'hoogste rang' }),
          ),
        ),
        rank.next ? progressBar(rank.pct, { color: rank.color, height: 6 }) : null,
      ),

      el('div.res__astra', null,
        sprite.canvas,
        el('div', null,
          el('div.res__aname', { text: astra.name }),
          el('div.res__atitle', { text: astra.title }),
          el('div.res__combo', { text: `Hoogste combo ${run.maxCombo ?? 0}×` }),
        ),
      ),

      el('div.res__tiles', null,
        statTile('Level bereikt', String(run.level ?? 1), { color: '#22d3ee' }),
        statTile('Bosses', String(run.bossesKilled ?? 0), { color: '#f43f5e' }),
        statTile('Ultimates', String(run.ultsFired ?? 0), { color: '#fbbf24' }),
      ),

      uniqueChips.length ? el('div.res__block', null,
        el('h3', { text: 'Jouw build' }),
        el('div.chips', null, ...stagger(uniqueChips)),
      ) : null,

      el('div.res__block', null,
        el('h3', { text: 'Beloningen' }),
        el('div.rewards', null, ...rewardRows.map(([k, v]) => {
          const c = CURRENCY[k];
          const val = el('b', { text: '0' });
          setTimeout(() => countTo(val, v, { duration: 900, format: (x) => '+' + abbrev(x) }), 320);
          return el('div.reward', { style: { '--c': c.color } },
            el('span.reward__i', { text: c.symbol }),
            el('span.reward__n', { text: c.name }),
            val,
          );
        })),
        el('div.res__xp', null,
          el('div.res__xphead', null,
            el('span', { text: `Account Lv ${prog.level}` }),
            el('b', { text: `+${abbrev(rewards.xp ?? 0)} XP` }),
          ),
          progressBar(prog.pct, { color: '#a855f7', height: 8, label: `${abbrev(prog.xp)}/${abbrev(prog.need)}` }),
        ),
        levels.length ? el('div.res__levelup', { text: `⬆ Level ${levels[levels.length - 1].level} bereikt!` }) : null,
      ),

      unlocked.length ? el('div.res__block', null,
        el('h3', { text: 'Prestaties' }),
        el('div.res__achs', null, ...unlocked.map((a) =>
          el('div.res__ach', null,
            el('span.res__achi', { text: a.icon }),
            el('span', null, el('b', { text: a.name }), el('i', { text: a.desc })),
          ))),
      ) : null,

      season && season.tiersGained > 0 ? el('div.res__pass', {
        onclick: () => ctx.go('starpass'),
      },
        el('span', { text: '★' }),
        el('span', null,
          el('b', { text: `Starpass tier ${season.tier}` }),
          el('i', { text: `+${season.gained} seizoen-XP · ${season.tiersGained} nieuwe tier${season.tiersGained > 1 ? 's' : ''}` }),
        ),
        el('span.res__passgo', { text: '›' }),
      ) : null,

      run.isTrial ? el('div.res__trial', { style: { '--c': astra.colors.primary } },
        el('div', null,
          el('div.res__trialtop', { text: 'PROEFVLUCHT AFGELOPEN' }),
          el('div.res__trialtxt', { text: `${astra.name} gaat terug naar de leegte. Zelf toevoegen aan je verzameling?` }),
        ),
        button('Summon', {
          variant: 'gold', size: 'md', icon: '✦',
          onclick: () => ctx.go('summon'),
        }),
      ) : null,

      run.seed ? el('div.res__seed', null,
        el('div', null,
          el('span', { text: run.isDaily ? 'DAGELIJKSE SEED' : 'RUN SEED' }),
          el('b', { text: run.seed }),
        ),
        el('button.linkbtn', { text: 'Kopieer link', onclick: () => shareRun({ ...run }) }),
      ) : null,
    ),

    el('div.res__actions', null,
      el('div.res__actions2', null,
        button('Deel', {
          variant: 'ghost', icon: '↗', size: 'md',
          onclick: () => doShare(),
        }),
        button('Basis', {
          variant: 'ghost', icon: '⌂', size: 'md',
          onclick: () => ctx.go('home', { replace: true }),
        }),
      ),
      button('NOG EEN KEER', {
        variant: 'gold', size: 'xl', full: true, sfx: 'confirm', haptics: 'medium',
        // A trial Astra is borrowed for exactly one run, so the retry falls
        // back to whatever the player actually owns.
        onclick: () => ctx.startRun({
          astraId: run.isTrial ? undefined : astra.id,
          seed: run.isDaily ? run.seed : undefined,
          daily: run.isDaily,
        }),
      }),
    ),
  );

  let sharing = false;
  async function doShare() {
    if (sharing) return;
    sharing = true;
    bus.emit(EV.TOAST, { text: 'Kaart maken…', tone: 'info', ttl: 1200 });
    try {
      const { blob, canvas } = await renderShareCard({ ...run, personalBest: isBest });
      const res = await shareRun({ ...run, blob });
      if (!res.ok || res.via === 'clipboard') {
        // No native share sheet — hand them the file so they can post it anyway.
        downloadBlob(blob, `astrafall-${run.seed ?? 'run'}.png`);
        bus.emit(EV.TOAST, { text: 'Kaart gedownload', tone: 'good' });
      }
      haptic('success');
    } catch (err) {
      console.error('[share] failed', err);
      bus.emit(EV.TOAST, { text: 'Delen mislukt', tone: 'bad' });
    }
    sharing = false;
  }

  // Score counts up, then the rest of the screen lands.
  setTimeout(() => {
    countTo(scoreEl, run.score ?? 0, { duration: 1100, format: (v) => grouped(v) });
    Sfx.play('coin');
    if (isBest) setTimeout(() => { Sfx.play('levelup'); haptic('success'); }, 900);
  }, 220);

  return { node, dispose() { sprite.destroy(); } };
}
