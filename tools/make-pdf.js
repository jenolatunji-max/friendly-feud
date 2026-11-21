#!/usr/bin/env node
/* Builds dist/Friendly-Feud-Start-Here.pdf, the file buyers download from Etsy.
   Uses Playwright's Chromium (dev dependency) to print src/etsy-guide.html.
   Set PLAY_URL to change the game's web address. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PLAY_URL = (process.env.PLAY_URL || 'https://friendly-feud-eight.vercel.app').replace(/\/$/, '');
const ZIP_URL = PLAY_URL + '/friendly-feud.zip';

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const brand = /const BRAND_NAME = '([^']+)'/.exec(read('js/core.js'))[1];
const logoSVG = new Function(read('js/logo.js') + '\nreturn logoSVG;')();
let font = '';
try {
  const f = require.resolve('@fontsource/anton/files/anton-latin-400-normal.woff2', { paths: [ROOT] });
  font = `@font-face{font-family:'Anton';src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format('woff2');}`;
} catch (e) { console.warn('  ! Anton font not found, using Impact.'); }

const html = read('etsy-guide.html')
  .replace('/*@FONT*/', () => font)
  .replace('{{LOGO}}', () => logoSVG(brand))
  .replace(/\{\{BRAND\}\}/g, brand)
  .replace(/\{\{PLAY_URL\}\}/g, PLAY_URL)
  .replace(/\{\{ZIP_URL\}\}/g, ZIP_URL);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(ROOT, 'dist', fileName(brand) + '-Start-Here.pdf');
  await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`Made ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB), links to ${PLAY_URL}`);
})();

function fileName(s) { return s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
