/**
 * Settings.js — options, profile transfer, credits.
 */

import { el } from '../dom.js';
import { button, header, sheet } from '../components/Chrome.js';
import { save } from '../../core/Save.js';
import { engine, Music, Sfx } from '../../core/Audio.js';
import { setHaptics, haptic } from '../../core/Input.js';
import { bus, EV } from '../../core/Events.js';
import Assets from '../../core/AssetRegistry.js';
import { abbrev, timeStr, grouped } from '../../core/Math2.js';

export function SettingsScreen(ctx) {
  const s = save.profile.settings;
  ctx.backdrop?.setAccent('#64748b', '#22d3ee');

  const node = el('div.settings', null,
    header('Instellingen', { onBack: () => ctx.back() }),
    el('div.settings__scroll', null,

      section('Geluid', [
        slider('Effecten', s.sfx, (v) => { s.sfx = v; engine.applySettings(); save.touch(); }, () => Sfx.play('tap')),
        slider('Muziek', s.music, (v) => { s.music = v; engine.applySettings(); save.touch(); }),
      ]),

      section('Gevoel', [
        toggle('Trillen', s.haptics, (v) => { s.haptics = v; setHaptics(v); save.touch(); if (v) haptic('medium'); }),
        toggle('Minder flitsen', s.reducedFlash, (v) => { s.reducedFlash = v; save.touch(); },
          'Vermindert schermflitsen en schudden.'),
        toggle('FPS tonen', s.showFps, (v) => { s.showFps = v; save.touch(); document.body.dataset.fps = v ? '1' : '0'; }),
      ]),

      section('Profiel', [
        textRow('Naam', save.profile.name, (v) => { save.profile.name = v.slice(0, 14) || 'Pilot'; save.touch(); }),
        row('Speler-ID', save.profile.playerId),
        el('div.srow', null,
          el('div.srow__mid', null,
            el('div.srow__label', { text: 'Overzetten' }),
            el('div.srow__hint', { text: 'Kopieer je voortgang naar een ander apparaat.' }),
          ),
          button('Exporteer', { variant: 'ghost', size: 'sm', onclick: openExport }),
        ),
        el('div.srow', null,
          el('div.srow__mid', null,
            el('div.srow__label', { text: 'Importeren' }),
            el('div.srow__hint', { text: 'Overschrijft je huidige voortgang.' }),
          ),
          button('Importeer', { variant: 'ghost', size: 'sm', onclick: openImport }),
        ),
      ]),

      section('Statistieken', [
        row('Runs gespeeld', grouped(save.profile.stats.runs)),
        row('Totale speeltijd', timeStr(save.profile.stats.totalTime, false)),
        row('Vijanden verslagen', grouped(save.profile.stats.kills)),
        row('Bosses verslagen', grouped(save.profile.stats.bossesKilled)),
        row('Summons', grouped(save.profile.stats.pulls)),
        row('Stellar getrokken', grouped(save.profile.stats.ssrCount)),
        row('Ultra getrokken', grouped(save.profile.stats.urCount)),
      ]),

      section('Over', [
        row('Versie', 'ASTRAFALL v0.10.0'),
        row('Rendermodus', Assets.report().mode),
        el('p.settings__note', {
          text: 'Alle artwork is nu procedureel getekend. De sprite-registry staat klaar ' +
                'om echte sprite-atlassen te laden zonder gameplay-code aan te raken.',
        }),
        el('div.srow', null,
          el('div.srow__mid', null,
            el('div.srow__label', { text: 'Voortgang wissen' }),
            el('div.srow__hint', { text: 'Verwijdert alles. Dit kan niet ongedaan worden.' }),
          ),
          button('Wissen', { variant: 'danger', size: 'sm', onclick: confirmReset }),
        ),
      ]),
    ),
  );

  function openExport() {
    const code = save.export();
    const ta = el('textarea.codebox', { readonly: true, value: code, rows: 6 });
    node.appendChild(sheet('Exportcode', el('div', null,
      el('p.sheet__lead', { text: 'Kopieer deze code en plak hem op je andere apparaat.' }),
      ta,
      button('Kopieer', {
        variant: 'primary', full: true,
        onclick: async () => {
          try { await navigator.clipboard.writeText(code); bus.emit(EV.TOAST, { text: 'Gekopieerd', tone: 'good' }); }
          catch { ta.select(); }
        },
      }),
    )));
  }

  function openImport() {
    const ta = el('textarea.codebox', { rows: 6, placeholder: 'Plak je exportcode…' });
    const sh = sheet('Importeren', el('div', null,
      el('p.sheet__lead', { text: 'Let op: dit vervangt je huidige voortgang volledig.' }),
      ta,
      button('Importeren', {
        variant: 'danger', full: true,
        onclick: () => {
          if (save.import(ta.value)) {
            bus.emit(EV.TOAST, { text: 'Profiel geladen', tone: 'good' });
            sh.close();
            ctx.go('home', { replace: true, force: true });
          } else {
            bus.emit(EV.TOAST, { text: 'Ongeldige code', tone: 'bad' });
            Sfx.play('error');
          }
        },
      }),
    ));
    node.appendChild(sh);
  }

  function confirmReset() {
    const sh = sheet('Weet je het zeker?', el('div', null,
      el('p.sheet__lead', { text: 'Al je Astra, valuta en records worden verwijderd. Dit kan niet ongedaan gemaakt worden.' }),
      button('Ja, wis alles', {
        variant: 'danger', full: true, size: 'lg',
        onclick: () => { save.reset(); sh.close(); ctx.go('home', { replace: true, force: true }); },
      }),
      button('Annuleren', { variant: 'quiet', full: true, onclick: () => sh.close() }),
    ));
    node.appendChild(sh);
  }

  return { node };
}

/* ------------------------------------------------------------------ */

function section(title, rows) {
  return el('section.sgroup', null,
    el('h3.sgroup__t', { text: title }),
    el('div.sgroup__body', null, ...rows),
  );
}

function row(label, value) {
  return el('div.srow', null,
    el('div.srow__mid', null, el('div.srow__label', { text: label })),
    el('div.srow__value', { text: String(value) }),
  );
}

function toggle(label, value, onChange, hint) {
  const node = el('button.srow.srow--toggle', {
    dataset: { on: value ? '1' : '0' },
    onclick: () => {
      const next = node.dataset.on !== '1';
      node.dataset.on = next ? '1' : '0';
      Sfx.play('tap');
      onChange(next);
    },
  },
    el('div.srow__mid', null,
      el('div.srow__label', { text: label }),
      hint ? el('div.srow__hint', { text: hint }) : null,
    ),
    el('div.switch', null, el('i')),
  );
  return node;
}

function slider(label, value, onChange, onRelease) {
  const val = el('span.srow__value', { text: Math.round(value * 100) + '%' });
  const input = el('input.slider', {
    type: 'range', min: '0', max: '100', value: String(Math.round(value * 100)),
    oninput: (e) => {
      const v = Number(e.target.value) / 100;
      val.textContent = Math.round(v * 100) + '%';
      onChange(v);
    },
    onchange: () => onRelease?.(),
  });
  return el('div.srow.srow--slider', null,
    el('div.srow__mid', null, el('div.srow__label', { text: label }), input),
    val,
  );
}

function textRow(label, value, onChange) {
  return el('div.srow', null,
    el('div.srow__mid', null, el('div.srow__label', { text: label })),
    el('input.textin', {
      type: 'text', value, maxlength: '14',
      onchange: (e) => onChange(e.target.value),
    }),
  );
}
