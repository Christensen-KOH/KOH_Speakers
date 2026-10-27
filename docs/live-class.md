# Live class: one shared battlefield on everyone's devices

The whole class plays **one co-op game**: every student's tank is on the same
map, fighting the same enemy waves and defending **one shared base**. If the
base falls, the game is over for everyone. Each student answers questions and
shops on their own device, and cash and accuracy appear on the teacher's
screen as a live leaderboard (Gimkit-style).

The teacher's computer **runs the battle** and shows it as the projector view.
Up to **8 tanks** share the map. Further students watch the battle and keep
answering questions, and get a tank as soon as a slot frees up.

## Requirements

- Node.js 22.18 or newer on the teacher's computer.
- Students on the **same network** as the teacher's computer (school Wi-Fi or
  LAN), on a laptop, Chromebook, tablet or phone. Landscape gives phones the
  biggest view.
- Some school networks block device-to-device traffic. If students can't open
  the link, ask IT to allow it, or deploy the server somewhere students can
  reach (see below).
- **Keep the teacher's game page open.** It keeps running behind other
  windows, but closing or reloading it pauses the battle until you click
  **Resume it**.

## Teacher

1. In the project folder, start the server:

   ```bash
   npm run live
   ```

   It builds the game and prints addresses like
   `Students (LAN): http://192.168.0.102:8787`. Windows may ask to allow Node
   through the firewall: allow it on **private** networks.
2. Open `http://localhost:8787` and choose **MODES → HOST LIVE CLASS**.
3. Choose the kit (custom kits work), the game length, an optional class cash
   goal, Reward per question and Movement costs fuel. Click **Create game**.
4. Show the screen: it lists the **6-digit join code** and the link(s)
   students open.
5. When everyone is in, click **Start game**. The battlefield fills the screen
   with a small card showing the code, the clock and the leaderboard; each
   tank carries its student's name, and 💭 while they are answering.
   **Details** opens the full leaderboard and most-missed questions.
6. The game ends when the clock runs out, when the base falls, or when you
   click **End**. Cleared stages move on to the next map automatically.
7. Results show a podium, class accuracy and the most-missed questions with
   pronunciation. **Download results (CSV)** saves the leaderboard.

## Students

1. Open the link the teacher shows (it ends in `?join=CODE`), or choose
   **MODES → JOIN LIVE CLASS** and type the code.
2. Enter a nickname (first names or nicknames only) and wait for the teacher.
3. Play together. Controls adapt to the device:
   - **Computer:** **WASD** or **arrows** to move. **Space** fires.
     **Left-click** on the battlefield turns toward the cursor and fires.
     **Right-click**, **Q** or **E** opens the questions. **B** opens the
     shop. Answer with **1–4** or the mouse.
   - **Tablet or phone:** touch anywhere on the **left half** and a joystick
     appears under your thumb; drag to drive. **Tap or hold the right half**
     to fire. Use the **⚡ +Ammo / $** and **🛒 Shop** pills for questions and
     the shop.
4. Shells, fuel and cash are your own: answer questions to refill them. Shop
   upgrades (weapons, speed, armor) apply to your tank. Base gadgets (Brick
   Builder, Steel Fortress, Auto-Turret, EMP) apply to the shared
   battlefield, and everyone sees a message like "🏰 Mia turned the base
   walls to steel!".
5. If your tank is destroyed it comes back after 2 seconds. Answering on a
   Recharge or Upgrade pad keeps a shield up, so park there first.
6. At the end each student gets their own report and Mistake Review Vault,
   plus their place in the class.

If a student's connection drops, the game reconnects by itself and keeps their
tank for 15 seconds. If the page reloads, they rejoin with the same code;
their earlier cash and answers still count on the leaderboard.

## Privacy and limits

- No accounts and no personal data: only nicknames, kept in the server's
  memory. Everything is gone when the server stops, or 30 minutes after
  everyone leaves (3 hours after a game ends).
- Nicknames are filtered for common profanity; the teacher can remove
  players.
- Up to 60 students per game, 8 of them with a tank at a time. Each
  connection is rate-limited, and inputs and stats a student sends are
  range-checked. A determined student could still send fake leaderboard
  stats, so treat the leaderboard as a game, not a grade.

## Hosting elsewhere

`npm run server` serves `dist/` (build it first with `npm run build`) and the
live socket at `/live` on `PORT` (default 8787). Any Node host works, but put
it behind HTTPS so browsers use `wss://`. The battle itself always runs in the
teacher's browser; the server only relays.

For development, run `npm run server` and `npm run dev` side by side; Vite
proxies `/live` to the server.
