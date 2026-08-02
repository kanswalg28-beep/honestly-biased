#!/usr/bin/env node
/* Generates /assets/lucide-local.js — a self-contained lucide icon bundle
   containing ONLY the icons used by the site, plus a lucide.createIcons()
   implementation that preserves inline style (width/height/color) + class.
   Icons fetched from lucide-static@0.453.0 (ISC license) to match current build. */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ICONS = [
  'search','sun','moon','arrow-right','clock','loader','cpu','arrow-up-right',
  'upload','shield-check','pen-tool','landmark','image','external-link',
  'chevron-right','chevron-left','arrow-left','zap','x','video','users','user',
  'shield-alert','search-code','play','map-pin','layout-grid','instagram','home',
  'heart-pulse','globe','flag','eye','download','crown','clapperboard',
  'circle-dollar-sign','calendar','bell','archive'
];

// lucide renames old names -> current icon file names (aliases). Map the site's
// attribute names to the file that exists in lucide-static v0.453.0.
const ALIASES = { 'home': 'house' };

const BASE = 'https://unpkg.com/lucide-static@0.453.0/icons/';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

// Extract the inner SVG body (the <path>/<circle>/... elements) from the file.
function innerSvg(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!m) throw new Error('no svg found');
  // strip the leading license comment
  return m[1].replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
}

(async () => {
  const icons = {};
  const failures = [];
  for (const name of ICONS) {
    try {
      const file = ALIASES[name] || name;
      const raw = await get(BASE + file + '.svg');
      const inner = innerSvg(raw);
      // normalize whitespace between children
      icons[name] = inner.replace(/\n\s*/g, '\n').trim();
    } catch (e) {
      failures.push(name);
    }
  }
  if (failures.length) {
    console.error('FAILED to fetch:', failures.join(', '));
    process.exit(1);
  }

  const body = `/* @license lucide-static v0.453.0 - ISC
   Auto-generated local bundle — https://github.com/lucide-icons/lucide
   Contains only icons used by Honestly Biased. */
(function () {
  'use strict';
  var ICONS = ${JSON.stringify(icons, null, 2)};

  // Build an <svg> from a stored icon body, copying class + inline style
  // (width/height/color) from the original <i> element so rendering is identical.
  function buildSvg(element, inner) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    // Preserve class
    var cls = element.getAttribute('class');
    if (cls) svg.setAttribute('class', cls);
    // Preserve inline style (width/height/color sizing the site relies on)
    var style = element.getAttribute('style');
    if (style) svg.setAttribute('style', style);
    // Preserve aria-hidden present on some icons
    var ariaHidden = element.getAttribute('aria-hidden');
    if (ariaHidden) svg.setAttribute('aria-hidden', ariaHidden);
    svg.innerHTML = inner;
    return svg;
  }

  function createIcons() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-lucide]'));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute('data-lucide');
      var inner = ICONS[name || ''];
      if (!inner) continue; // unknown icon: leave untouched
      var svg = buildSvg(el, inner);
      el.parentNode.replaceChild(svg, el);
    }
  }

  var lucide = { createIcons: createIcons, icons: ICONS };
  if (typeof window !== 'undefined') window.lucide = lucide;
  if (typeof module !== 'undefined') module.exports = lucide;
})();
`;

  const out = path.join(__dirname, '..', 'assets', 'lucide-local.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body);
  console.log('Wrote', out, '-', body.length, 'bytes,', Object.keys(icons).length, 'icons');
})();
