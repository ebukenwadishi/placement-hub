// End-to-end checks for the Placement Hub website and staff app.
// Run with: npm test   (first time: npx playwright install chromium)
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;
const APP = `${BASE}/app/index.html`;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  →  ' + detail : ''}`); };

const server = await startServer(PORT);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function newPage(opts = phone) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) page.errors.push(m.text()); });
  return { ctx, page };
}
const openSheet = (page, name) => page.evaluate(n => { const b = document.createElement('button'); b.dataset.sheet = n; document.getElementById('app').appendChild(b); b.click(); }, name);
const hash = page => page.evaluate(() => location.hash);
const pageText = page => page.innerText('#page');
async function signInAs(page, who) {
  await page.click(`[data-demo-login="${who}@placementhub.demo"]`);
  await page.waitForTimeout(250);
}
async function signOut(page) {
  await page.click('.me-btn'); await page.click('[data-signout]'); await page.waitForTimeout(200);
}

try {
  // ---------------------------------------------------------------- website
  {
    const { ctx, page } = await newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1500 + 2400 * 2);
    check('Website loads without errors', page.errors.length === 0, page.errors.join(' | '));
    check('Website log book plays through the shift', await page.locator('.log li.now').count() === 1);
    const site = await page.innerText('main');
    check('Website (demo sign-in) doesn’t tell people to create an account', !/create (a free |an )?account/i.test(site) && site.includes('pick a demo account'));
    await page.click('.hero .btn-primary'); await page.waitForTimeout(500);
    check('"Try the demo" (demo sign-in) opens the app with demo accounts', page.url().endsWith('/app/index.html') && await page.locator('[data-demo-login]').count() >= 1, page.url());
    check('App shows "Back to the website"', await page.locator('.back-site').count() === 1);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(3500);
    check('Website stays still with reduced motion', await page.locator('.log li.now').count() === 0);
    await ctx.close();
  }

  // ---------------------------------------------------------------- website: contact and privacy
  const fitsPhone = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const shown = (page, sel) => page.locator(sel).first().isVisible();
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(400);
    check('Contact links stay hidden with no email set', !(await shown(page, '#contactBtn')) && !(await shown(page, '#footContact')));
    await page.click('footer a[href="privacy.html"]'); await page.waitForTimeout(400);
    check('Footer "Privacy" link opens the privacy page', page.url().endsWith('/privacy.html') && (await page.innerText('h1')) === 'Privacy', page.url());
    const t = await page.innerText('main');
    check('Privacy page describes demo sign-in (no Firebase wording)', t.includes('shared demo account') && !t.includes('Firebase'));
    check('Privacy page says there is no contact address yet', t.includes('don’t have a contact address yet') && !t.includes('If you email us'));
    check('Privacy page fits a phone screen', await fitsPhone(page));
    check('Privacy page has no errors', page.errors.length === 0, page.errors.join(' | '));
    await page.goto(`${BASE}/app/index.html`); await page.waitForTimeout(300);
    check('App sign-in links to the privacy page', await page.locator('.login-foot a[href="../privacy.html"]').count() === 1);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage();
    await page.route('**/site-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.PLACEMENT_HUB_CONTACT_EMAIL="hello@example.test";' }));
    await page.route('**/app/auth-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.PLACEMENT_HUB_FIREBASE={apiKey:"test",authDomain:"test.firebaseapp.com",projectId:"test",appId:"1"};' }));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(400);
    const site = await page.innerText('main');
    check('Website (real accounts) explains creating an account', site.includes('Create a free account with your email') && !site.includes('pick a demo account'));
    check('"Try the demo" (real accounts) opens Create account', (await page.getAttribute('.hero a[data-try]', 'href')) === 'app/index.html#signup');
    check('Contact button and footer link show when an email is set',
      await shown(page, '#contactBtn') && await shown(page, '#footContact') && (await page.getAttribute('#contactBtn', 'href')).startsWith('mailto:hello@example.test'));
    await page.goto(`${BASE}/privacy.html`); await page.waitForTimeout(300);
    const t = await page.innerText('main');
    check('Privacy page shows the contact email', (await page.getAttribute('[data-contact-link]', 'href')).startsWith('mailto:hello@example.test') && t.includes('If you email us'));
    check('Privacy page explains Firebase when real accounts are on', t.includes('Google Firebase Authentication') && !t.includes('shared demo account'));
    check('Privacy page (real accounts) has no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- staff app: support worker
  const { ctx, page } = await newPage();
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('placementhub.welcomed.v4', '1'); });
  await page.reload(); await page.waitForTimeout(300);
  check('App opens on the sign-in page', await page.locator('.login').count() === 1);

  await page.fill('#loginEmail', 'nia@placementhub.demo'); await page.fill('#loginPassword', 'wrong');
  await page.click('form[data-form=login] button[type=submit]'); await page.waitForTimeout(150);
  check('Wrong password shows a plain-English error', (await page.innerText('.login .notice.bad')).includes('isn’t right'));

  await signInAs(page, 'nia');
  check('Demo sign-in works', await page.locator('.tabbar').count() === 1);

  await page.evaluate(() => { location.hash = 'team'; }); await page.waitForTimeout(200);
  let t = await pageText(page);
  check('Support worker sees "Your shifts"', t.includes('Your shifts'));
  check('Support worker does not see other people’s shifts', !t.includes('Maple House · 07:30') && !t.includes('% training'));
  check('Support worker has no "Add shift" button', await page.locator('[data-sheet=shift]').count() === 0);
  check('Support worker isn’t asked to decide leave', !(await page.innerText('[data-seg="team|leave"]')).includes('to decide'));

  await page.evaluate(() => { location.hash = 'evidence'; }); await page.waitForTimeout(150);
  check('Manager-only page is blocked for support workers', (await pageText(page)).includes('for managers'));
  await openSheet(page, 'medPlan'); await page.waitForTimeout(150);
  check('Support worker can’t add medication to a plan', await page.locator('.sheet').count() === 0);

  await page.evaluate(() => { location.hash = 'home'; }); await page.waitForTimeout(150);
  await page.click('[data-sheet=startShift]'); await page.waitForTimeout(150);
  await page.click('form[data-form=startShift] input[value="Brookside House"] + span');
  await page.click('form[data-form=startShift] button[type=submit]'); await page.waitForTimeout(300);
  check('Start shift shows the house', (await page.innerText('.shift-card')).includes('Brookside House'));
  check('Late-back alert shows for Jordan', (await page.locator('.notice.bad').count()) >= 1);
  check('"Today" agenda lists medication and appointments', await page.locator('[data-sheet=dose][data-due]').count() >= 1);

  await page.locator('[data-sheet=dose][data-due]').first().click(); await page.waitForTimeout(150);
  await page.click('form[data-form=dose] input[value=Refused] + span');
  await page.click('form[data-form=dose] button[type=submit]'); await page.waitForTimeout(150);
  check('Refused dose needs a note', await page.locator('.sheet').count() === 1);
  await page.fill('form[data-form=dose] textarea[name=note]', 'Said they felt sick. On-call manager told.');
  await page.click('form[data-form=dose] button[type=submit]'); await page.waitForTimeout(200);
  check('Dose is recorded', (await page.innerText('#toast')).includes('Recorded'));

  await page.click('.notice.bad [data-missing]'); await page.waitForTimeout(150);
  check('Missing-episode form is pre-filled', (await page.inputValue('form[data-form=incident] textarea[name=description]')).includes('Signed out at'));
  await page.click('form[data-form=incident] button[type=submit]'); await page.waitForTimeout(300);
  check('Missing episode saves and opens the record', (await hash(page)).startsWith('#concern-INC-'));

  await page.evaluate(() => { location.hash = 'home'; }); await page.waitForTimeout(150);
  await page.click('.notice.bad [data-back-in]'); await page.waitForTimeout(150);
  await page.locator('[data-sheet=note]').first().click(); await page.waitForTimeout(150);
  await page.fill('form[data-form=note] textarea[name=note]', 'Went to college and cooked dinner with support.');
  await page.click('form[data-form=note] button[type=submit]'); await page.waitForTimeout(200);
  check('Daily note saves', (await page.innerText('#toast')).includes('Daily note saved'));

  await page.click('.shift-card [data-sheet=endShift]'); await page.waitForTimeout(150);
  check('End shift drafts the handover', (await page.inputValue('form[data-form=endShift] textarea[name=summary]')).includes('Daily notes this shift'));
  await page.click('form[data-form=endShift] button[type=submit]'); await page.waitForTimeout(300);
  check('Shift ends and home offers a new shift', await page.locator('.start-card').count() === 1);

  await page.reload(); await page.waitForTimeout(300);
  check('Still signed in after reload, and data is kept', await page.locator('.tabbar').count() === 1);

  // ---------------------------------------------------------------- manager
  await signOut(page);
  await signInAs(page, 'amira');
  await page.evaluate(() => { location.hash = 'team'; }); await page.waitForTimeout(150);
  check('Manager sees the full rota and "Add shift"', await page.locator('.day-nav').count() === 1 && await page.locator('[data-sheet=shift]').count() >= 1);
  await page.evaluate(() => { location.hash = 'health'; }); await page.waitForTimeout(150);
  await page.click('[data-seg="health|meds"]'); await page.waitForTimeout(100);
  await page.click('#page [data-sheet=medPlan]'); await page.waitForTimeout(150);
  await page.fill('form[data-form=medPlan] input[name=name]', 'Vitamin D'); await page.fill('form[data-form=medPlan] input[name=dose]', '1 capsule');
  await page.click('form[data-form=medPlan] input[value="08:00"] + span');
  await page.click('form[data-form=medPlan] button[type=submit]'); await page.waitForTimeout(200);
  check('Manager can add medication to a plan', (await pageText(page)).includes('Vitamin D'));

  // ---------------------------------------------------------------- every page, both roles
  const routes = ['home', 'people', 'tasks', 'more', 'health', 'log', 'safeguarding', 'evidence', 'documents', 'team', 'repairs', 'reports', 'about', 'person-yp1', 'person-yp2', 'concern-INC-104'];
  let overflow = [];
  for (const who of ['amira', 'maya']) {
    await signOut(page); await signInAs(page, who);
    for (const r of routes) {
      await page.evaluate(x => { location.hash = x; }, r); await page.waitForTimeout(60);
      for (const tab of await page.locator('.seg button').all()) { await tab.click(); await page.waitForTimeout(30); }
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push(`${who}:${r}`);
    }
  }
  check('Every page fits a phone screen (no sideways scrolling)', overflow.length === 0, overflow.join(', '));
  check('No errors anywhere in the app', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ---------------------------------------------------------------- night and day shifts (the clock is set, so these run the same at any hour)
  const atClock = (h, m) => { const t = new Date(); t.setHours(h, m, 0, 0); return t; };
  async function shiftAt(h, m, who = 'nia') {
    const { ctx, page } = await newPage();
    await page.clock.install({ time: atClock(h, m) });
    await page.goto(APP);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('placementhub.welcomed.v4', '1'); });
    await page.reload(); await page.waitForTimeout(300);
    await signInAs(page, who);
    if (who !== 'nia') return { ctx, page };
    await page.click('[data-sheet=startShift]'); await page.waitForTimeout(150);
    await page.click('form[data-form=startShift] input[value="Brookside House"] + span');
    await page.click('form[data-form=startShift] button[type=submit]'); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const checklistText = page => page.locator('.section-head:has-text("Before you finish") + .card').innerText();
  {
    const { ctx, page } = await shiftAt(23, 30);
    check('Night: shift card says "Night shift"', (await page.innerText('.shift-card')).includes('Night shift'));
    check('Night: day-shift doses aren’t on the night list', await page.locator('[data-sheet=dose][data-due="14:00"]').count() === 0);
    check('Night: the 20:00 dose is on the night list', await page.locator('[data-sheet=dose][data-due="20:00"]').count() >= 1);
    const left = page.locator('.section-head:has-text("Left from the day shift") + .card');
    check('Night: unrecorded day-shift items show as "Left from the day shift"', await left.count() === 1 && (await left.innerText()).includes('14:00'));
    const cl = await checklistText(page);
    check('Night: daily notes count this shift only', cl.includes('0 of 2 written this shift'));
    check('Night: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await shiftAt(2, 0);
    check('Night after midnight: last evening’s 20:00 dose counts as this shift', (await page.innerText('.shift-card')).includes('Night shift') && (await pageText(page)).includes('Taken at 20:05'));
    check('Night after midnight: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await shiftAt(10, 0);
    check('Day: shift card says "Day shift"', (await page.innerText('.shift-card')).includes('Day shift'));
    const cl = await checklistText(page);
    check('Day: checklist counts this shift’s daily notes', cl.includes('Daily notes') && cl.includes('written this shift'));
    check('Day: the 14:00 dose is on the day list', await page.locator('[data-sheet=dose][data-due="14:00"]').count() >= 1);
    check('Day: nothing left over when the night shift recorded everything', await page.locator('.section-head:has-text("Left from")').count() === 0);
    check('Day: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- support workers only see their own house
  async function signedIn(email, h = 10, m = 0) {
    const { ctx, page } = await newPage();
    await page.clock.install({ time: atClock(h, m) });
    await page.goto(APP);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('placementhub.welcomed.v4', '1'); });
    await page.reload(); await page.waitForTimeout(300);
    await page.fill('#loginEmail', email); await page.fill('#loginPassword', 'demo1234');
    await page.click('form[data-form=login] button[type=submit]'); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const goTo = async (page, h) => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(200); };
  {
    const { ctx, page } = await signedIn('nia@placementhub.demo');
    await goTo(page, 'people');
    let t = await pageText(page);
    check('House: Nia sees the young people at Brookside', t.includes('Jordan K.') && t.includes('Sam L.') && t.includes('at Brookside House'));
    check('House: Nia doesn’t see young people from other houses', !t.includes('Alex Y.') && !t.includes('Taylor M.'));
    await goTo(page, 'person-yp1');
    check('House: opening another house’s young person shows nothing about them', !(await pageText(page)).includes('Alex Y.'));
    await goTo(page, 'safeguarding');
    t = await pageText(page);
    check('House: concerns only from her house', t.includes('INC-104') && !t.includes('INC-103') && !t.includes('INC-102'));
    await goTo(page, 'repairs');
    t = await pageText(page);
    check('House: repairs only for her house', !t.includes('Maple House') && !t.includes('Willow House'));
    await openSheet(page, 'search'); await page.waitForTimeout(150);
    await page.fill('[data-search]', 'Alex'); await page.waitForTimeout(150);
    check('House: search doesn’t find other houses’ young people', !(await page.innerText('#searchResults')).includes('Alex Y.'));
    await page.keyboard.press('Escape'); await page.click('.sheet [data-close]').catch(() => {}); await page.waitForTimeout(150);
    await openSheet(page, 'note'); await page.waitForTimeout(150);
    const opts = await page.$$eval('form[data-form=note] select[name=youngId] option', os => os.map(o => o.textContent));
    check('House: forms only offer young people from her house', opts.length === 2 && opts.every(o => o.includes('Brookside House')), opts.join(', '));
    await page.evaluate(() => { const s = document.querySelector('form[data-form=note] select[name=youngId]'); s.add(new Option('Alex', 'yp1')); s.value = 'yp1'; });
    await page.fill('form[data-form=note] textarea[name=note]', 'Test.');
    await page.click('form[data-form=note] button[type=submit]'); await page.waitForTimeout(200);
    check('House: can’t save a record about someone in another house', (await page.innerText('#toast')).includes('only record for young people in your house'));
    await page.click('.sheet [data-close]').catch(() => {}); await page.waitForTimeout(150);
    await openSheet(page, 'staffHome'); await page.waitForTimeout(150);
    check('Support worker can’t change anyone’s house', await page.locator('.sheet').count() === 0);
    await goTo(page, 'home');
    await page.click('[data-sheet=startShift]'); await page.waitForTimeout(150);
    check('House: Nia can only start a shift at her own house', await page.locator('form[data-form=startShift] input[name=home]').count() === 1);
    check('House (Nia): no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await signedIn('daniel@placementhub.demo', 21, 0);
    await goTo(page, 'people');
    check('Cover: before the shift, Daniel only sees Brookside', !(await pageText(page)).includes('Alex Y.'));
    await goTo(page, 'home');
    await page.click('[data-sheet=startShift]'); await page.waitForTimeout(150);
    const homes = await page.$$eval('form[data-form=startShift] input[name=home]', is => is.map(i => i.value));
    check('Cover: Daniel can start at Brookside or at Maple, where he’s on the rota tonight', homes.length === 2 && homes.includes('Maple House') && homes.includes('Brookside House'), homes.join(', '));
    await page.click('form[data-form=startShift] input[value="Maple House"] + span');
    await page.click('form[data-form=startShift] button[type=submit]'); await page.waitForTimeout(300);
    await goTo(page, 'people');
    let t = await pageText(page);
    check('Cover: while covering Maple, Daniel sees Maple and his own house', t.includes('Alex Y.') && t.includes('Jordan K.') && !t.includes('Taylor M.'));
    await page.click('.me-btn').catch(() => {}); await page.waitForTimeout(150);
    await page.click('[data-sheet=endShift]'); await page.waitForTimeout(150);
    await page.click('form[data-form=endShift] button[type=submit]'); await page.waitForTimeout(300);
    await goTo(page, 'people');
    check('Cover: after the shift ends, Maple is hidden again', !(await pageText(page)).includes('Alex Y.'));
    check('Cover: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await signedIn('amira@placementhub.demo');
    await goTo(page, 'people');
    let t = await pageText(page);
    check('Manager sees young people in every house', ['Alex Y.', 'Jordan K.', 'Sam L.', 'Taylor M.'].every(n => t.includes(n)));
    await goTo(page, 'team');
    check('Manager sees each worker’s house', (await pageText(page)).includes('House: Brookside House'));
    await page.click('[data-sheet=staffHome][data-staff=st2]'); await page.waitForTimeout(150);
    await page.click('form[data-form=staffHome] input[value="Willow House"] + span');
    await page.click('form[data-form=staffHome] button[type=submit]'); await page.waitForTimeout(250);
    t = await page.innerText('.row:has-text("Nia P."):has-text("House:")');
    check('Manager can change a worker’s house', t.includes('House: Willow House'), t);
    check('House (manager): no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- "Their own words" was removed (15 Nov 2026)
  {
    const { ctx, page } = await signedIn('amira@placementhub.demo');
    await goTo(page, 'more');
    const inMore = (await pageText(page)).includes('Their own words');
    await goTo(page, 'voice');
    const pageGone = !(await pageText(page)).includes('Their own words');
    await goTo(page, 'person-yp3'); await page.click('[data-seg="person|plan"]'); await page.waitForTimeout(150);
    const inProfile = (await pageText(page)).includes('own words');
    await openSheet(page, 'record'); await page.waitForTimeout(150);
    const inRecord = (await page.innerText('body')).includes('Their own words');
    check('"Their own words" is gone from menus, Record and profiles', !inMore && pageGone && !inProfile && !inRecord, JSON.stringify({ inMore, pageGone, inProfile, inRecord }));
    check('"Their own words" removal: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- reading a young person's support plan and risk assessment
  {
    const { ctx, page } = await signedIn('nia@placementhub.demo');
    await goTo(page, 'person-yp2');
    check('Young person’s page has only the plan buttons (no Daily note, Sign out or Concern)', await page.locator('.profile-head [data-sheet=note], .profile-head [data-sheet=signOut], .profile-head [data-sheet=incident], .profile-head [data-back-in]').count() === 0 && await page.locator('.profile-head [data-sheet=ypPlan]').count() === 2);
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=support]'); await page.waitForTimeout(200);
    let t = await page.innerText('.sheet');
    check('Plans: support worker can read a young person’s support plan', t.includes('Support plan: Jordan K.') && t.includes('About Jordan') && t.includes('Make a safety and contact plan'));
    check('Plans: support plan has key information and sign-off', t.includes('Legal status') && t.includes('Westmoor Borough Council') && t.includes('Personal adviser') && t.includes('Review and sign-off') && t.includes('Approved by'));
    check('Plans: support plan lists every area of support with its status', (await page.locator('.sheet details.acc').count()) === 9 && t.includes('Needs more support') && t.includes('Moving on and turning 18'));
    await page.click('.sheet details.acc:has-text("Health") summary'); await page.waitForTimeout(150);
    const health = await page.innerText('.sheet details.acc:has-text("Health")');
    check('Plans: opening an area shows where things are, the goal and who’s doing what', /where things are now/i.test(health) && health.includes('Antibiotic tablets') && health.includes('Register with a local dentist') && health.includes('Jordan with Daniel O.'), health.slice(0, 200));
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=risk]'); await page.waitForTimeout(200);
    t = await page.innerText('.sheet');
    check('Plans: support worker can read their risk assessment', t.includes('Risk assessment: Jordan K.') && t.includes('Going missing') && /what staff do/i.test(t) && t.includes('If Jordan is late back or missing'), t.slice(0, 300));
    check('Plans: shows who reviewed it and when it’s next due', t.includes('Reviewed') && t.includes('by Daniel O.') && t.includes('Next review'));
    check('Plans: risk assessment has a summary, all risks and sign-off', t.includes('Summary') && t.includes('What helps keep Jordan safe') && (await page.locator('.sheet details.acc').count()) === 4 && t.includes('4 risks: 1 high, 2 medium, 1 low') && t.includes('Review and sign-off') && t.includes('Talked through with Jordan'), t.slice(0, 200));
    check('Plans: missing-from-home steps are set out with times', /places jordan might go/i.test(t) && t.includes('At 21:30') && t.includes('At 21:45') && /when jordan comes back/i.test(t) && t.includes('return home interview') && t.includes('Emergency Duty Team'));
    await page.click('.sheet details.acc:has-text("Exploitation") summary'); await page.waitForTimeout(150);
    const ex = await page.innerText('.sheet details.acc:has-text("Exploitation")');
    check('Plans: opening a risk shows history, warning signs, what to do and who to tell', /what’s happened before/i.test(ex) && /triggers and warning signs/i.test(ex) && /what jordan has agreed to do/i.test(ex) && /who to tell/i.test(ex) && /with these steps/i.test(ex), ex.slice(0, 200));
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);
    await page.click('[data-seg="person|plan"]'); await page.waitForTimeout(150);
    check('Plans: the Plan tab links to both', await page.locator('#page [data-sheet=ypPlan]').count() >= 4);
    check('Plans: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- young people's pictures (managers upload)
  {
    const { ctx, page } = await signedIn('nia@placementhub.demo');
    await goTo(page, 'people');
    check('Pictures: young people show a picture, not just initials', await page.locator('#page .avatar.pic svg').count() >= 2);
    await goTo(page, 'person-yp2');
    check('Pictures: support workers can’t change a picture', await page.locator('.profile-head .avatar-btn').count() === 0);
    await openSheet(page, 'ypPhoto'); await page.waitForTimeout(150);
    check('Pictures: support workers can’t open the picture form', await page.locator('.sheet').count() === 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await signedIn('amira@placementhub.demo');
    await goTo(page, 'person-yp2');
    await page.click('.profile-head .avatar-btn'); await page.waitForTimeout(200);
    check('Pictures: manager can open the picture form, with the made-up records warning', (await page.innerText('.sheet')).includes('Don’t upload a photo of a real young person'));
    const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#3366cc'; x.fillRect(0, 0, 400, 300); return c.toDataURL('image/png').split(',')[1]; });
    await page.setInputFiles('[data-photo-input]', { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await page.waitForFunction(() => document.querySelector('#photoPreview img'));
    await page.click('form[data-form=ypPhoto] button[type=submit]'); await page.waitForTimeout(250);
    const src = await page.getAttribute('.profile-head .avatar img', 'src').catch(() => '');
    check('Pictures: manager can upload a photo, saved as a small square picture', !!src && src.startsWith('data:image/jpeg') && src.length < 400000);
    await page.click('.profile-head .avatar-btn'); await page.waitForTimeout(200);
    await page.click('[data-photo-remove]'); await page.waitForTimeout(250);
    check('Pictures: manager can remove the photo and the drawn picture comes back', await page.locator('.profile-head .avatar svg').count() === 1);
    check('Pictures: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- managers edit and sign off plans and risk assessments
  {
    const { ctx, page } = await signedIn('amira@placementhub.demo');
    check('Manager isn’t asked to read their own handover', !(await pageText(page)).includes('from Amira R.'));
    await goTo(page, 'person-yp2');
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=support]'); await page.waitForTimeout(200);
    check('Edit: manager sees edit buttons on the support plan', await page.locator('.sheet [data-sheet=planEdit][data-part=details]').count() === 1 && await page.locator('.sheet [data-sheet=planEdit][data-part=area]').count() === 9 && await page.locator('.sheet [data-part=signoff]').count() === 1);
    await page.click('.sheet details.acc:has-text("Health") summary'); await page.waitForTimeout(100);
    await page.click('.sheet details.acc:has-text("Health") [data-part=area]'); await page.waitForTimeout(200);
    await page.click('form[data-form=planEdit] input[value="On track"] + span');
    await page.fill('form[data-form=planEdit] [name=a2_what]', 'Book an eye test');
    await page.fill('form[data-form=planEdit] [name=a2_who]', 'Jordan with Daniel O.');
    await page.click('form[data-form=planEdit] button[type=submit]'); await page.waitForTimeout(250);
    let t = await page.innerText('.sheet');
    check('Edit: manager can change an area and add an action', t.includes('Book an eye test') && t.includes('Not signed off yet'), t.slice(0, 160));
    await page.click('.sheet [data-part=signoff]'); await page.waitForTimeout(200);
    await page.fill('form[data-form=planEdit] [name=changes]', 'Added an eye test to the health actions.');
    await page.click('form[data-form=planEdit] button[type=submit]'); await page.waitForTimeout(250);
    t = await page.innerText('.sheet');
    check('Edit: signing off makes a new version and clears the warning', !t.includes('Not signed off yet') && t.includes('Added an eye test to the health actions.') && /Version\s*3/.test(t) && t.includes('by Amira R.'));
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);
    await goTo(page, 'documents');
    check('Edit: the Documents list shows the new version', (await pageText(page)).includes('Jordan K. · v3'));
    await goTo(page, 'person-yp2');
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=risk]'); await page.waitForTimeout(200);
    await page.click('.sheet [data-part=risk][data-i=new]'); await page.waitForTimeout(200);
    await page.fill('form[data-form=planEdit] [name=area]', 'Online safety');
    await page.fill('form[data-form=planEdit] [name=signs]', 'Talking to people online they haven’t met.');
    await page.fill('form[data-form=planEdit] [name=plan]', 'Talk about online safety in keywork.');
    await page.click('form[data-form=planEdit] button[type=submit]'); await page.waitForTimeout(250);
    t = await page.innerText('.sheet');
    check('Edit: manager can add a risk', t.includes('Online safety') && t.includes('5 risks'));
    await page.click('.sheet details.acc:has-text("Online safety") [data-part=risk]'); await page.waitForTimeout(200);
    await page.click('[data-risk-remove]'); await page.waitForTimeout(250);
    t = await page.innerText('.sheet');
    check('Edit: manager can remove a risk', !t.includes('Online safety') && t.includes('4 risks'));
    check('Edit (manager): no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await signedIn('nia@placementhub.demo');
    await goTo(page, 'person-yp2');
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=support]'); await page.waitForTimeout(200);
    check('Edit: support workers get no edit or sign-off buttons', await page.locator('.sheet [data-sheet=planEdit]').count() === 0);
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);
    await openSheet(page, 'planEdit'); await page.waitForTimeout(150);
    check('Edit: support workers can’t open the edit form', await page.locator('.sheet').count() === 0);
    await ctx.close();
  }

  // ---------------------------------------------------------------- managers add young people and archive files of those who've moved on
  {
    const { ctx, page } = await signedIn('amira@placementhub.demo');
    const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const yearsAgo = (y, extraMonths = 0) => { const dt = new Date(); dt.setFullYear(dt.getFullYear() - y); dt.setMonth(dt.getMonth() - extraMonths); return iso(dt); };
    await goTo(page, 'people');
    check('People (manager): Add button and Current / Archived tabs', await page.locator('#page [data-sheet=ypNew]').count() === 1 && await page.locator('[data-seg="people|archived"]').count() === 1);
    await page.click('[data-seg="people|archived"]'); await page.waitForTimeout(150);
    let t = await pageText(page);
    check('People (manager): the Archived tab lists files of people who moved on', t.includes('Leah M.') && t.includes('Moved to their own tenancy') && !t.includes('Jordan K.'), t.slice(0, 200));
    await page.click('[data-seg="people|current"]'); await page.waitForTimeout(150);
    check('People (manager): archived files aren’t in the current list', !(await pageText(page)).includes('Leah M.'));

    // add someone new
    await page.click('#page [data-sheet=ypNew]'); await page.waitForTimeout(200);
    await page.fill('form[data-form=ypNew] [name=name]', 'Robin T.');
    await page.fill('form[data-form=ypNew] [name=dob]', yearsAgo(20));
    await page.click('form[data-form=ypNew] button[type=submit]'); await page.waitForTimeout(200);
    check('Add young person: refuses anyone who isn’t 16 or 17', await page.locator('form[data-form=ypNew]').count() === 1 && !(await page.innerText('body')).includes('Robin T. added'));
    await page.fill('form[data-form=ypNew] [name=dob]', yearsAgo(16, 6));
    await page.click('form[data-form=ypNew] input[value="Willow House"] + span');
    await page.fill('form[data-form=ypNew] [name=la]', 'Westmoor Borough Council');
    await page.click('form[data-form=ypNew] button[type=submit]'); await page.waitForTimeout(300);
    t = await pageText(page);
    check('Add young person: opens their new page', /#person-yp/.test(page.url()) && t.includes('Robin T.') && t.includes('Willow House') && /16 ·/.test(t), page.url());
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=support]'); await page.waitForTimeout(200);
    t = await page.innerText('.sheet');
    check('Add young person: support plan starts with nine areas to write', t.includes('Not written yet') && await page.locator('.sheet [data-part=area]').count() === 9 && t.includes('Westmoor Borough Council'));
    await page.click('.sheet details.acc:has-text("Living skills") summary'); await page.waitForTimeout(100);
    await page.click('.sheet details.acc:has-text("Living skills") [data-part=area]'); await page.waitForTimeout(200);
    await page.fill('form[data-form=planEdit] [name=now]', 'Can make simple meals.');
    await page.fill('form[data-form=planEdit] [name=goal]', 'Cook three meals a week.');
    await page.click('form[data-form=planEdit] button[type=submit]'); await page.waitForTimeout(200);
    check('Add young person: an area can’t be saved without saying how it’s going', await page.locator('form[data-form=planEdit]').count() === 1);
    await page.click('form[data-form=planEdit] input[value="Some progress"] + span');
    await page.click('form[data-form=planEdit] button[type=submit]'); await page.waitForTimeout(250);
    check('Add young person: a manager can write the first area', (await page.innerText('.sheet')).includes('Cook three meals a week.'));
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);
    await goTo(page, 'home');
    check('Add young person: Home reminds the manager to write their plans', (await pageText(page)).includes('Robin T. needs a risk assessment and support plan'));

    // archiving: not while they're signed out
    await goTo(page, 'person-yp2');
    await page.click('[data-sheet=ypArchive]'); await page.waitForTimeout(200);
    check('Archive: not while they’re signed out', (await page.innerText('.sheet')).includes('signed out right now') && await page.locator('form[data-form=ypArchive]').count() === 0);
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);

    // archive Sam
    await goTo(page, 'health');
    await page.click('[data-seg="health|appts"]'); await page.waitForTimeout(150);
    const dentistBefore = (await pageText(page)).includes('High Street Dental');
    await goTo(page, 'person-yp3');
    await page.click('[data-sheet=ypArchive]'); await page.waitForTimeout(200);
    t = await page.innerText('.sheet');
    check('Archive: the form lists what’s still open', t.includes('1 open task') && t.includes('upcoming appointment'), t);
    await page.selectOption('form[data-form=ypArchive] [name=reason]', 'Moved to another placement');
    await page.fill('form[data-form=ypArchive] [name=note]', 'Moved to a placement nearer family.');
    await page.click('form[data-form=ypArchive] button[type=submit]'); await page.waitForTimeout(300);
    t = await pageText(page);
    check('Archive: the file moves to the Archived tab', t.includes('Sam L.') && t.includes('Moved to another placement') && t.includes('Leah M.'), t.slice(0, 200));
    await page.click('[data-seg="people|current"]'); await page.waitForTimeout(150);
    check('Archive: they leave the current list', !(await pageText(page)).includes('Sam L.'));
    await goTo(page, 'health');
    await page.click('[data-seg="health|appts"]'); await page.waitForTimeout(150);
    check('Archive: their appointments stop showing in Health', dentistBefore && !(await pageText(page)).includes('High Street Dental'));
    await goTo(page, 'person-yp3');
    t = await pageText(page);
    check('Archive: their page is read-only with a Restore button', t.includes('Archived file') && t.includes('nearer family') && await page.locator('[data-restore]').count() === 1 && await page.locator('[data-sheet=ypArchive]').count() === 0 && await page.locator('[data-sheet=ypPhoto]').count() === 0 && await page.locator('#page [data-sheet=appt]').count() === 0);
    await page.click('.profile-head [data-sheet=ypPlan][data-kind=support]'); await page.waitForTimeout(200);
    check('Archive: plans can be read but not edited', (await page.innerText('.sheet')).includes('Areas of support') && await page.locator('.sheet [data-sheet=planEdit]').count() === 0);
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);
    await openSheet(page, 'search'); await page.waitForTimeout(150);
    await page.fill('.sheet input[type=search]', 'Leah'); await page.waitForTimeout(250);
    check('Archive: managers can find archived files in search', (await page.innerText('.sheet')).includes('Archived file'));
    await page.click('.sheet [data-close]'); await page.waitForTimeout(150);

    // the same manager in the support worker view (Brookside House) can't see Sam's archived file
    await openSheet(page, 'me'); await page.waitForTimeout(150);
    await page.click('[data-view=worker]'); await page.waitForTimeout(250);
    await page.click('.sheet [data-close]').catch(() => {}); await page.waitForTimeout(150);
    await goTo(page, 'people');
    const wPeople = await pageText(page);
    await goTo(page, 'person-yp3');
    const wProfile = await pageText(page);
    await goTo(page, 'tasks');
    await page.click('[data-filter="taskWho|Everyone"]').catch(() => {}); await page.waitForTimeout(150);
    const wTasks = await pageText(page);
    check('Archive: support workers don’t see archived files or tasks about them', !wPeople.includes('Sam L.') && !wPeople.includes('Archived') && !wProfile.includes('Archived file') && !wTasks.includes('supported cooking'), JSON.stringify({ p: wPeople.includes('Sam L.'), f: wProfile.includes('Archived file'), t: wTasks.includes('supported cooking') }));
    await openSheet(page, 'me'); await page.waitForTimeout(150);
    await page.click('[data-view=manager]'); await page.waitForTimeout(250);
    await page.click('.sheet [data-close]').catch(() => {}); await page.waitForTimeout(150);

    // restore
    await goTo(page, 'person-yp3');
    await page.click('[data-restore]'); await page.waitForTimeout(250);
    t = await pageText(page);
    check('Restore: the file is current again', !t.includes('Archived file') && await page.locator('[data-sheet=ypArchive]').count() === 1);
    await goTo(page, 'people');
    await page.click('[data-seg="people|current"]'); await page.waitForTimeout(150);
    check('Restore: they’re back on the current list', (await pageText(page)).includes('Sam L.'));
    check('Add and archive: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await signedIn('nia@placementhub.demo');
    await goTo(page, 'people');
    check('Add and archive: support workers get no Add button or Archived tab', await page.locator('[data-sheet=ypNew]').count() === 0 && await page.locator('[data-seg="people|archived"]').count() === 0);
    await goTo(page, 'person-yp2');
    check('Add and archive: support workers can’t archive a file', await page.locator('[data-sheet=ypArchive]').count() === 0);
    await openSheet(page, 'ypNew'); await page.waitForTimeout(150);
    check('Add and archive: support workers can’t open the add form', await page.locator('.sheet').count() === 0);
    await ctx.close();
  }

  // ---------------------------------------------------------------- welfare checks were removed (15 Nov 2026)
  {
    const { ctx, page } = await shiftAt(23, 30);
    let body = await page.innerText('body');
    const onHome = /welfare|night check/i.test(body) || /Checked \d/.test(body);
    await openSheet(page, 'record'); await page.waitForTimeout(150);
    const inRecord = /welfare check/i.test(await page.innerText('body'));
    await page.click('.sheet [data-close]').catch(() => {}); await page.waitForTimeout(150);
    await goTo(page, 'person-yp2');
    const onProfile = /welfare|night check/i.test(await pageText(page)) || await page.locator('[data-sheet=round]').count() > 0;
    await goTo(page, 'log');
    const inLog = /welfare|Checks/.test(await pageText(page));
    await openSheet(page, 'round'); await page.waitForTimeout(150);
    const formGone = !/welfare check/i.test(await page.innerText('body'));
    check('Welfare checks are gone from Home, Record, profiles and the shift log', !onHome && !inRecord && !onProfile && !inLog && formGone, JSON.stringify({ onHome, inRecord, onProfile, inLog, formGone }));
    check('Welfare check removal: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- real accounts (with the test stand-in for Firebase)
  {
    const { ctx, page } = await newPage();
    await page.route('**/app/auth-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.PLACEMENT_HUB_FIREBASE={apiKey:"test",authDomain:"test.firebaseapp.com",projectId:"test",appId:"1",sdkBase:"/__mock/"};' }));
    await page.goto(`${APP}#signup`); await page.waitForTimeout(600);
    check('Real accounts: Create account form shows', await page.locator('form[data-form=signup]').count() === 1);
    await page.fill('#suName', 'Test Person'); await page.fill('#suEmail', 'test@example.com'); await page.fill('#suPassword', 'longenough1');
    await page.check('[name=agree]');
    await page.click('form[data-form=signup] button[type=submit]'); await page.waitForTimeout(500);
    check('Real accounts: sends a confirmation email and asks to check it', (await page.title()).startsWith('Check your email') && await page.evaluate(() => window.__mock.sent.some(x => x.type === 'verify')));
    await page.click('[data-check-verified]'); await page.waitForTimeout(250);
    check('Real accounts: can’t get in before confirming', (await page.innerText('.notice.bad')).includes('can’t see the confirmation'));
    await page.evaluate(() => window.__mock.verify('test@example.com'));
    await page.click('[data-check-verified]'); await page.waitForTimeout(400);
    check('Real accounts: gets in after confirming', await page.locator('.tabbar').count() === 1);
    check('Real accounts: no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('Checks ran to the end', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks FAILED` : `\nALL CHECKS PASSED (${results.length})`);
process.exit(failed.length ? 1 : 0);
