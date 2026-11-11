# Bolajon menu bot on Cloudflare: setup

You need three free accounts: Telegram, GitHub and Cloudflare. No bank card is needed.
The whole setup takes about 15 minutes.

**Important:** the bot token is like a password. Never put it in GitHub, in a file, or in a chat.
It goes in one place only: Cloudflare, as a secret (step 4).

## 1. Create the bot in Telegram
1. Open **@BotFather** in Telegram and send `/newbot`.
2. Give it a name and a username that ends with `bot`.
3. BotFather gives you a token. Keep it for step 4.
   If a token was ever shown to anyone, send `/revoke` to BotFather first and use the new one.

## 2. Put the code on GitHub
1. On github.com create a new **private** repository, for example `bolajon-menu-bot`.
2. Upload everything from this `cloudflare-bot` folder, keeping the same layout:
   `wrangler.toml`, `package.json`, `.gitignore`, and the `src` folder with `worker.js`, `data.js`, `app.js`.
   (The `build` folder and this file are optional.)

## 3. Connect Cloudflare to GitHub
1. Sign up at dash.cloudflare.com.
2. Go to **Workers & Pages**, press **Create**, then **Import a repository**.
3. Choose your GitHub repository and press **Save and Deploy**. Leave the build settings as they are
   (deploy command `npx wrangler deploy`).
4. When it finishes you get an address like `https://bolajon-menu-bot.YOURNAME.workers.dev`.

If the deploy stops with a message about the KV namespace: go to **Storage & Databases > KV**,
create a namespace called `bolajon`, copy its ID, add the line `id = "THE_ID"` under
`binding = "KV"` in `wrangler.toml` on GitHub, and it deploys again by itself.

## 4. Add the token as a secret
1. Open the Worker, then **Settings > Variables and Secrets > Add**.
2. Type: **Secret**. Name: `BOT_TOKEN`. Value: the token from BotFather. Press **Deploy**.

## 5. Switch the bot on
1. In a browser open `https://YOUR-ADDRESS.workers.dev/setup`.
   It should say "Ready!". This connects Telegram to the bot.
2. In Telegram send `/start` to your bot. **The first person to do this becomes the admin**, so do it yourself.
3. Choose the language: O'zbekcha or English.

## 6. Add your wife
1. She opens the bot and sends `/start`.
2. You get a message with an **Allow** button. Press it.
3. She chooses her own language. Each person can have a different language.

## What the bot does
- 12:00, 16:00 and 20:00 (Korea time): today's list with the progress bar and a button that opens the mini app.
- Each time a food is ticked in the mini app, both of you get a short note: what is done and what is left.
- 21:00: a gentle note only if some food is still not ticked.
- When everything is ticked: a warm thank you, the benefit for the baby and a hadith.
- No messages on days without a menu (Sundays).

## Commands
| Uzbek | English | What it does |
|---|---|---|
| `/bugun` | `/today` | Today's list |
| `/ertaga` | `/tomorrow` | The next menu day |
| `/til` | `/language` | Choose Uzbek or English |
| `/tarix` | `/history` | Admin only. Last 7 days. Also `/tarix 5`, `/tarix 5-12`, `/tarix 28.11-3.12` |

In the mini app, the **EN / UZ** button at the top changes the language too.

## Every new month
Send the new daycare menu photo to Claude. You get a new `src/data.js` and `src/app.js`.
Replace those two files on GitHub. Cloudflare updates the bot by itself in about a minute.

## If something does not work
- `/setup` shows an error: the `BOT_TOKEN` secret is missing or wrong. Fix it in step 4 and open `/setup` again.
- The bot does not answer: open `/setup` again, then send `/start`.
- To see errors: open the Worker in Cloudflare and look at **Logs**.
