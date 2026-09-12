#!/usr/bin/env node
/**
 * Verifies the deployed course site in a real browser, at phone and desktop width.
 *
 * Run by the PostToolUse hook after every `git push`, and usable by hand:
 *   node scripts/verify-deploy.cjs            # wait for Pages, then check the live URL
 *   node scripts/verify-deploy.cjs --no-wait  # check whatever is live right now
 *   node scripts/verify-deploy.cjs --url http://localhost:8000/
 *
 * Exits 0 when everything passes, 2 when something is broken (the hook turns a
 * non-zero exit into a visible failure). Screenshots land in .deploy-checks/.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SHOTS = path.join(ROOT, '.deploy-checks');
var LIVE = 'https://booya1986.github.io/claude-code-course/';
var PW = '/Users/avilevi/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright-core';

var args = process.argv.slice(2);
var url = argVal('--url') || LIVE;
var wait = args.indexOf('--no-wait') === -1 && url === LIVE;

function argVal(flag) {
  var i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

function sh(cmd, a) {
  return execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8' }).trim();
}

var problems = [];
function fail(where, msg) { problems.push(where + ': ' + msg); }

/* Pages serves the previous build until the workflow for this commit finishes,
   so checking too early would verify the old site and call it green. */
function waitForPages() {
  var sha;
  try { sha = sh('git', ['rev-parse', 'HEAD']); } catch (e) { return null; }
  var deadline = Date.now() + 5 * 60 * 1000;
  process.stdout.write('waiting for the Pages build of ' + sha.slice(0, 7) + ' ');
  while (Date.now() < deadline) {
    var rows = [];
    try {
      rows = JSON.parse(sh('gh', ['run', 'list', '--limit', '15', '--json',
        'headSha,name,status,conclusion']));
    } catch (e) { /* gh missing or offline: fall through to the timeout */ }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.headSha !== sha || !/pages/i.test(r.name)) continue;
      if (r.status !== 'completed') break;
      process.stdout.write('\n');
      if (r.conclusion !== 'success') {
        fail('deploy', 'the Pages workflow for ' + sha.slice(0, 7) + ' ended as ' + r.conclusion);
        return sha;
      }
      // Pages needs a breath after the workflow reports success.
      execFileSync('sleep', ['5']);
      return sha;
    }
    process.stdout.write('.');
    execFileSync('sleep', ['10']);
  }
  process.stdout.write('\n');
  fail('deploy', 'no successful Pages build for ' + sha.slice(0, 7) + ' within 5 minutes');
  return sha;
}

var VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false }
];

async function main() {
  if (wait) waitForPages();
  fs.mkdirSync(SHOTS, { recursive: true });

  var pw = require(PW);
  var browser = await pw.chromium.launch({ channel: 'chrome' });

  for (var v = 0; v < VIEWPORTS.length; v++) {
    var vp = VIEWPORTS[v];
    var ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.mobile,
      hasTouch: vp.mobile
    });
    var page = await ctx.newPage();
    var errors = [];
    var bad = [];
    page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', function (e) { errors.push(String(e)); });
    page.on('response', function (r) {
      if (r.status() >= 400 && r.url().indexOf(url.split('#')[0]) === 0) {
        bad.push(r.status() + ' ' + r.url());
      }
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    /* The welcome screen. */
    var welcome = await page.evaluate(function () {
      var w = document.getElementById('welcome');
      return {
        shown: !!w && !w.hidden,
        cards: document.querySelectorAll('.w-grid a, .w-grid .card, .w-grid > *').length,
        intro: !!document.querySelector('#welcome video'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    if (!welcome.shown) fail(vp.name + ' welcome', 'the welcome screen did not render');
    if (!welcome.intro) fail(vp.name + ' welcome', 'the intro video element is missing');
    if (welcome.overflow > 1) fail(vp.name + ' welcome', 'scrolls sideways by ' + welcome.overflow + 'px');
    await page.screenshot({ path: path.join(SHOTS, vp.name + '-welcome.png'), fullPage: false });

    /* Every chapter, on the player and on the reading material. */
    var count = await page.evaluate(function () { return window.COURSE.chapters.length; });
    if (count !== welcome.cards) fail(vp.name + ' welcome', count + ' chapters but ' + welcome.cards + ' cards');
    for (var n = 1; n <= count; n++) {
      await page.goto(url + '#ch' + n, { waitUntil: 'load' });
      await page.waitForTimeout(700);

      var ch = await page.evaluate(function () {
        var video = document.querySelector('#stage video');
        return {
          player: !document.getElementById('player').hidden,
          title: (document.getElementById('ch-title') || {}).textContent || '',
          src: video ? video.currentSrc || video.getAttribute('src') || '' : '',
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      if (!ch.player) fail(vp.name + ' ch' + n, 'the chapter view did not open');
      if (!ch.title.trim()) fail(vp.name + ' ch' + n, 'the chapter title is empty');
      if (ch.overflow > 1) fail(vp.name + ' ch' + n, 'the player scrolls sideways by ' + ch.overflow + 'px');
      if (ch.src) {
        var head = await page.request.fetch(ch.src, { method: 'HEAD' });
        if (head.status() >= 400) fail(vp.name + ' ch' + n, 'the video returns ' + head.status());
        else if (!head.headers()['accept-ranges']) fail(vp.name + ' ch' + n, 'the video is served without range support, so seeking will break');
      }

      await page.click('#tab-reading');
      await page.waitForTimeout(400);
      var read = await page.evaluate(function () {
        var box = document.getElementById('reading');
        var wide = 0, worst = '';
        var els = box ? box.querySelectorAll('*') : [];
        for (var i = 0; i < els.length; i++) {
          var over = els[i].scrollWidth - els[i].clientWidth;
          // Elements under 40px wide are the visually-hidden ones (a clipped
          // <thead>, a skip link); their scrollWidth is meaningless here.
          if (els[i].clientWidth > 40 && over > 2 && over > wide) {
            wide = over;
            worst = els[i].tagName.toLowerCase() + (els[i].className ? '.' + String(els[i].className).split(' ')[0] : '');
          }
        }
        return {
          empty: !box || box.textContent.trim().length < 200,
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          wide: wide, worst: worst
        };
      });
      if (read.empty) fail(vp.name + ' ch' + n, 'the reading material is empty');
      if (read.page > 1) fail(vp.name + ' ch' + n, 'the reading tab scrolls sideways by ' + read.page + 'px');
      if (read.wide > 2) fail(vp.name + ' ch' + n, 'reading content overflows its box by ' + read.wide + 'px (' + read.worst + ')');
    }

    await page.goto(url + '#ch7', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.click('#tab-reading');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, vp.name + '-reading.png'), fullPage: false });

    if (errors.length) fail(vp.name, errors.length + ' console error(s): ' + errors.slice(0, 3).join(' | '));
    if (bad.length) fail(vp.name, bad.length + ' failed request(s): ' + bad.slice(0, 3).join(' | '));

    await ctx.close();
    console.log('checked ' + vp.name + ' (' + vp.width + 'px)');
  }

  await browser.close();

  if (problems.length) {
    console.error('\nDeploy check FAILED on ' + url);
    for (var i = 0; i < problems.length; i++) console.error('  - ' + problems[i]);
    console.error('screenshots: ' + SHOTS);
    process.exit(2);
  }
  console.log('\nDeploy check passed on ' + url + ' (mobile 390px and desktop 1440px, every chapter).');
}

main().catch(function (e) {
  console.error('Deploy check could not run: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
