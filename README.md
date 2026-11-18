# Placement Hub

A phone-first app for staff in supported accommodation for 16 and 17 year olds, and a website that explains it.

**This is a prototype.** Every young person, staff member and record in it is made up. Don't enter real information about anyone.

## What's in this folder

| Folder or file | What it is |
|---|---|
| `site/index.html` | The website |
| `site/privacy.html` | The privacy notice (linked from the bottom of the website) |
| `site/site-config.js` | Put your contact email here to show "Get in touch" on the website and the privacy page |
| `site/app/` | The staff app (the website's "Try the demo" opens it) |
| `site/app/auth-config.js` | Where your Firebase settings go to switch on real accounts |
| `tests/` | Automatic checks that click through the app |

## See it on your computer

You need [Node.js](https://nodejs.org) installed once.

```bash
npm install
npm run serve
```

Then open http://localhost:4173 for the website, or http://localhost:4173/app/ for the app.

## Run the checks

```bash
npx playwright install chromium   # first time only
npm test
```

## Put it online (Netlify)

- **Quickest:** zip the `site` folder and drop the zip on https://app.netlify.com/drop
- **Better for ongoing work:** put this folder on GitHub and connect it to Netlify. `netlify.toml` already tells Netlify to publish the `site` folder.

## Switch on real accounts (email confirmation)

1. Go to https://console.firebase.google.com and create a project (you can turn Google Analytics off).
2. Open **Build > Authentication > Get started**. On **Sign-in method**, switch on **Email/Password**.
3. Open **Project settings > General > Your apps**, click the web icon `</>` and register the app. Copy `apiKey`, `authDomain`, `projectId` and `appId`.
4. Paste them into `site/app/auth-config.js`. They aren't passwords. They only tell the app which Firebase project to use.
5. Publish the site, then in Firebase go to **Authentication > Settings > Authorized domains** and add your Netlify address.
6. Optional: **Authentication > Templates** lets you change the sender name and wording of the emails.

Once that's done, people create an account with their own email, click the link in the confirmation email, then sign in. "Forgot your password?" sends a real reset email. While `auth-config.js` is empty, the app uses the demo accounts instead (password `demo1234`).

## Before it's used for real

Accounts can be real, but the records still live only on each person's own device. Real use needs a secure shared database with access rules, a record of who changed what, backups, roles set by managers, a privacy notice and a data protection review.
