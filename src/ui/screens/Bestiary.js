/**
 * Bestiary.js — the enemy codex.
 *
 * Every archetype carries marks that promise a behaviour: a barrel means it
 * shoots, a lance means it will dash at you, a seam means killing it makes
 * more. Those marks are only worth drawing if the player learns to read them,
 * and a 90-second run never stops to explain. This screen does — afterwards,
 * with no clock running.
 *
 * Rows are discovery-gated. What you have not met is a silhouette and a
 * question mark, so the list keeps paying out as runs go deeper and the first
 * Reaper is an event instead of a row read weeks ago.
 */

import { el, clear, fill } from '../dom.js';
import { SpriteCanvas } from '../components/SpriteCanvas.js';
import { progressBar, sheet, statTile } from '../components/Chrome.js';
import {
  enemyRows, bossRows, eliteRows, bestiaryProgress, totalRecorded, MARK_INFO,
} from '../../systems/Bestiary.js';
import { grouped, clamp } from '../../core/Math2.js';
import Assets from '../../core/AssetRegistry.js';
import { Sfx } from '../../core/Audio.js';

const MARK_GLYPH = { barrel: '⌖', lance: '➤', seam: '⌥', fins: '⋈' };

export function BestiaryScreen(ctx) {
  ctx.backdrop?.setAccent('#f43f5e', '#22d3ee');

  const list = el('div.bes__list');
  const head = el('div.bes__head');

  /** One card. Unknown rows still draw the sprite, blacked out to a shape. */
  function card(row) {
    const def = row.def;
    // A Swarm is 26 units and a Bastion 74. At true scale one is a speck and
    // the other overflows the tile, so the range is compressed rather than
    // flattened — relative size still reads, it just fits in a card.
    const nominal = Assets.meta(def.sprite)?.w ?? 48;
    const sprite = new SpriteCanvas(def.sprite, {
      size: row.boss ? 84 : 72,
      scale: clamp(46 / nominal, 0.75, 1.9),
      tint: row.known ? def.color : '#1e293b',
      tint2: row.known ? def.color2 : '#334155',
      charge: 0.45,          // guns show their barrel lit, lances extended
      speed: 0.8,
      className: 'bes__art',
    });

    return el('button.bescard', {
      dataset: { known: row.known ? '1' : '0', boss: row.boss ? '1' : '0' },
      onclick: () => { Sfx.play('tap'); openDetail(row); },
    },
      el('div.bescard__art', null, sprite.canvas),
      el('div.bescard__body', null,
        el('div.bescard__name', { text: row.known ? def.name : '???' }),
        el('div.bescard__marks', null, ...row.marks.map((m) =>
          el('span.mark', { dataset: { m }, text: MARK_GLYPH[m] ?? '•', title: MARK_INFO[m]?.name }))),
        row.known
          ? el('div.bescard__kills', { text: `${grouped(row.kills)} geveld` })
          : el('div.bescard__kills', { text: 'Nog niet ontmoet' }),
      ),
    );
  }

  function openDetail(row) {
    const def = row.def;
    if (!row.known) {
      // Say where it lives. A locked row that only says "no" is a dead end;
      // one that says "wave 8" is a reason to start another run.
      const where = row.boss
        ? `Verschijnt als baas vanaf golf ${5 * (bossRows().indexOf(row) + 1)}.`
        : `Verschijnt vanaf golf ${def.minWave ?? 1}.`;
      node.appendChild(sheet('Nog niet ontmoet', el('div.besdet', null,
        el('div.besdet__art', null,
          new SpriteCanvas(def.sprite, {
            size: 120, tint: '#1e293b', tint2: '#334155', speed: 0.6, className: 'bes__locked',
          }).canvas),
        el('p.besdet__lore', { text: where }),
        row.marks.length
          ? el('div.besdet__marks', null,
              el('h4', { text: 'Wat je er wel van weet' }),
              ...row.marks.map((m) => el('div.besdet__mark', null,
                el('span.mark', { dataset: { m }, text: MARK_GLYPH[m] ?? '•' }),
                el('div', null,
                  el('b', { text: MARK_INFO[m].name }),
                  el('span', { text: MARK_INFO[m].desc }),
                ),
              )))
          : null,
      )));
      return;
    }

    const sprite = new SpriteCanvas(def.sprite, {
      size: 140, tint: def.color, tint2: def.color2, charge: 0.5, speed: 0.85,
    });

    const body = el('div.besdet', null,
      el('div.besdet__art', null, sprite.canvas),
      el('p.besdet__lore', { text: def.desc ?? def.subtitle ?? '' }),
      el('div.besdet__stats', null,
        statTile('Ontmoet', grouped(row.seen)),
        statTile('Geveld', grouped(row.kills)),
        row.boss
          ? statTile('Fases', String(def.phases?.length ?? 1))
          : statTile('Vanaf golf', String(def.minWave ?? 1)),
      ),
    );

    if (row.marks.length) {
      body.appendChild(el('div.besdet__marks', null,
        el('h4', { text: 'Waar je op let' }),
        ...row.marks.map((m) => el('div.besdet__mark', null,
          el('span.mark', { dataset: { m }, text: MARK_GLYPH[m] ?? '•' }),
          el('div', null,
            el('b', { text: MARK_INFO[m].name }),
            el('span', { text: MARK_INFO[m].desc }),
          ),
        )),
      ));
    }

    if (row.boss && def.phases) {
      body.appendChild(el('div.besdet__phases', null,
        el('h4', { text: 'Fases' }),
        ...def.phases.map((p, i) => el('div.besdet__phase', null,
          el('b', { text: `${i + 1}` }),
          el('span', { text: p.note }),
          el('i', { text: `${Math.round(p.at * 100)}% HP` }),
        )),
      ));
    }

    node.appendChild(sheet(def.name, body));
  }

  function render() {
    const pr = bestiaryProgress();

    clear(head).append(
      el('div.bes__prog', null,
        el('div.bes__progtop', null,
          el('span', { text: 'ONTDEKT' }),
          el('b', { text: `${pr.have} / ${pr.total}` }),
        ),
        progressBar(pr.total ? pr.have / pr.total : 0, { color: '#f43f5e', height: 8 }),
        el('div.bes__progsub', { text: `${grouped(totalRecorded())} geveld in totaal` }),
      ),
      // The legend is the reason this screen exists: four marks, four
      // promises, learnable in one read.
      el('div.bes__legend', null,
        ...Object.entries(MARK_INFO).map(([k, info]) => el('div.bes__leg', null,
          el('span.mark', { dataset: { m: k }, text: MARK_GLYPH[k] }),
          el('div', null, el('b', { text: info.name }), el('span', { text: info.desc })),
        )),
      ),
    );

    fill(list,
      el('h3.bes__section', { text: 'Vijanden' }),
      el('div.bes__grid', null, ...enemyRows().map(card)),
      el('h3.bes__section', { text: 'Bazen' }),
      el('div.bes__grid', null, ...bossRows().map(card)),
      el('h3.bes__section', { text: 'Elite-varianten' }),
      el('div.bes__elites', null, ...eliteRows().map((m) =>
        el('div.beselite', { style: { '--c': m.color } },
          el('b', { text: m.name }),
          el('span', { text: eliteBlurb(m) }),
        ))),
    );
  }

  const node = el('div.bes', null,
    el('div.topbar', null,
      el('button.backbtn', { onclick: () => { Sfx.play('back'); ctx.go('home', { replace: true }); } },
        el('span', { text: '‹' })),
      el('div.topbar__title', { text: 'Bestiarium' }),
    ),
    el('div.bes__scroll', null, head, list),
  );

  render();
  return { node };
}

/** Elites are numbers, not shapes — say what the numbers do. */
function eliteBlurb(m) {
  const bits = [`${m.hp}× HP`];
  if (m.speed !== 1) bits.push(`${m.speed}× snelheid`);
  if (m.armor) bits.push(`${Math.round(m.armor * 100)}% pantser`);
  if (m.dmg > 1) bits.push(`${m.dmg}× schade`);
  if (m.explodeOnDeath) bits.push('ontploft bij dood');
  if (m.healAura) bits.push('geneest zijn buren');
  return bits.join(' · ');
}
