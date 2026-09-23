# AIL Last Man Standing: setup guide

Everything here is done in a web browser. Allow about an hour. A laptop is easier than a phone for the setup.

## Part 1: GitHub (the website and fixture updates)

**1. Create the repository**
- Go to github.com, sign in, click **+** (top right) then **New repository**.
- Name it `ail-lms`. Set it to **Public**. Tick **Add a README file**. Click **Create repository**.

**2. Upload the files**
- In the new repository, click **Add file** then **Upload files**.
- Drag in `index.html`, `firestore.rules`, `SETUP.md`, and the `scripts` and `data` folders.
- Click **Commit changes**.

**3. Add the scheduled update**
The `.github` folder is often hidden on computers, so create this one by hand:
- Click **Add file** then **Create new file**.
- In the name box, type exactly: `.github/workflows/update-fixtures.yml` (the slashes create the folders).
- Open `update-fixtures.yml` from the download in Notepad or TextEdit, copy everything, and paste it in.
- Click **Commit changes**.

**4. Let the update save its changes**
- Go to **Settings** then **Actions** then **General**.
- Under **Workflow permissions**, choose **Read and write permissions**. Click **Save**.

**5. Run the first update**
- Go to the **Actions** tab. Click **Update fixtures** on the left, then **Run workflow**, then the green **Run workflow** button.
- After a minute it should show a green tick. Open the `data` folder: `fixtures.json` should now be full of fixtures and `health.json` should list all five divisions.
- From now on it runs by itself: every 20 minutes Friday to Sunday, and each morning the rest of the week.

**6. Turn on the website**
- Go to **Settings** then **Pages**.
- Under **Branch**, choose **main** and **/ (root)**, then **Save**.
- After a couple of minutes your site is live at `https://apk-repo.github.io/ail-lms/`. It will show an error until Part 2 is done.

## Part 2: Firebase (players, picks and results)

**7. Create the project**
- Go to console.firebase.google.com and click **Create a project**. Call it `ail-lms`. You can switch off Google Analytics.
- On the project home page, click the **</>** (web) icon. Give it any nickname and click **Register app**.
- You'll see a block of code containing `const firebaseConfig = { ... }`. Keep this page open.
- In GitHub, open `index.html` and click the pencil icon to edit it.
- Find the block marked `PASTE YOUR FIREBASE CONFIG BELOW` and replace the six `PASTE_HERE` lines with the values from Firebase, keeping the quote marks.
- Click **Commit changes**.

**8. Create the database**
- In Firebase, open **Build** then **Firestore Database**, then **Create database**.
- Choose location **europe-west1 (Belgium)** or **europe-west2 (London)**, then **Start in production mode**, then **Create**.
- Open the **Rules** tab. Delete what's there, paste in everything from `firestore.rules`, and click **Publish**.

**9. Turn on sign-in**
- Open **Build** then **Authentication**, then **Get started**.
- Under **Sign-in method**, enable **Google** (pick your email as the support email) and save.
- Also enable **Email/Password**, then switch on **Email link (passwordless sign-in)** and save. This is the backup for anyone without a Google account.
- Open the **Settings** tab, then **Authorized domains**, then **Add domain**, and add `apk-repo.github.io`.

## Part 3: Make yourself organiser

**10. Get your user ID**
- Open the site, sign in, and go to the **Rules** tab. Copy the user ID shown at the bottom.

**11. Add yourself as an organiser**
- In Firebase, go to **Firestore Database** then **Data**, then **Start collection**.
- Collection ID: `admins`. Click **Next**.
- Document ID: paste your user ID. Add a field called `role`, type string, value `organiser`. Click **Save**.
- Reload the site. An **Admin** tab appears.
- To add another organiser, have them sign in and send you their user ID, then add another document to `admins` the same way.

**12. Set up the game**
- In the **Admin** tab, fill in **Settings** (competition name, entry fee, Revolut link) and click **Save settings**.
- Check **Fixture feed** shows fixtures for all five divisions.
- Under **Start a new game**, choose Round 1 and click **Start game**.
- Share the link. People sign in, join, and pick.

## Each weekend

1. Players pick any time up to **3pm on Friday**. The deadline is shown at the top of the app. If a round has a game before Friday 3pm, picks close at that game's kickoff instead.
2. On Friday morning, open **Admin**. **Round picks** lists who hasn't picked. **Copy a reminder for WhatsApp** gives you a message to paste into the group.
3. At 3pm, picks close and everyone's picks appear on the **Board**.
4. After the final whistle on Saturday, open **Admin**. The scores fill in from the feed (the feed can lag an hour or two).
5. Check the scores, type in any that are missing, and tick **Postponed** for any game that didn't go ahead.
6. Click **Confirm Round results**. The app gives a random unused team to anyone who didn't pick, knocks out losers, and moves on to the next round.
7. In **Weekend roundup**, click **Create roundup**, then **Share to WhatsApp** and choose the group. **Make a new version** swaps in different jokes if you don't like the first set.
8. Mark people as paid in **Players** as the Revolut payments come in. Players can't pick until you do, so check Revolut before Friday 3pm.

When one player is left, the game ends and the board shows the winner. Start the next game from the **Admin** tab.

## Emergencies

In **Admin**, under **Round picks**, then **Emergency override**, you can:
- **Change the deadline** for the current round, for example if the app was down on Friday. **Back to Friday 3pm** undoes it. Each new round goes back to Friday 3pm by itself.
- **Enter a pick for a player**, for example if someone texts you their pick. This works even after picks have closed.

## If something goes wrong

- **"That wasn't allowed" when picking:** picks have closed, or the fixtures haven't been copied to Firebase. An organiser opening the Admin tab copies them automatically, or click **Sync fixtures now**.
- **Google sign-in fails:** the person may have opened the link inside Facebook or Instagram. Open it in Chrome or Safari instead, or use the email link.
- **Feed problem shown on Admin:** the scraper keeps the last good data, so nothing is lost. Scores can still be typed in by hand when confirming a round.
- **Check the automatic updates:** the **Actions** tab on GitHub shows every run. A red cross means that run failed; the next one usually recovers.

## Updating from an earlier version

1. Before replacing `index.html` on GitHub, copy your `firebaseConfig` block out of the old one. The new file has the `PASTE_HERE` placeholders again, so paste your values back in.
2. Paste the new `firestore.rules` into Firebase (**Firestore Database**, then **Rules**) and click **Publish**. The Friday deadline and the board reveal depend on these rules.
3. If you'd already saved a competition name in **Settings**, change it there to "Cill Dara Senior Men's AIL Last Man Standing". The new default only applies if no name has been saved.
