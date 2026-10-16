# AutoPearson

**Language / Ngôn ngữ:** [English](README.en.md) | [Tiếng Việt](README.md)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/anhtuank9/AutoPearson?quickstart=1)

AutoPearson is a Playwright tool that runs on your computer or in GitHub Codespaces to work through open assignments in Pearson English Connect. It signs in, visits assignments in order of their most recent due dates, works on lessons below 100%, uses **Save & Exit**, then reloads the list to check scores.

> This is an independent project. It is not affiliated with or endorsed by Pearson. Use it only with accounts and content you are authorized to access.

© 2026 anhtuank9. You may copy, use, and share the source code for noncommercial purposes under the [LICENSE](LICENSE). Copying or using it for profit requires prior written permission from the owner. For product information and licensing, [contact anhtuank9 directly](https://github.com/anhtuank9).

## Choose how to run it

| Method | Best for |
| --- | --- |
| **Option 1 — GitHub Codespaces** | Run entirely on a GitHub virtual machine with headless Chromium |
| **Option 2 — Your computer** | See and interact with the Chrome or Edge window |

## Option 1 — GitHub Codespaces

Codespaces runs the tool on a GitHub virtual machine with headless Chromium. You do not need to install Node.js or Chrome on your computer.

### Open with one click

After creating the two secrets described below:

1. Click **[Open AutoPearson in GitHub Codespaces](https://codespaces.new/anhtuank9/AutoPearson?quickstart=1)**.
2. Wait for the Codespace to start and install the Node dependencies and Chromium automatically.
3. Run this in the terminal:

```bash
npm start
```

At startup, the terminal displays the `anhtuank9` copyright notice, the noncommercial use restriction, and the contact link before the tool signs in to Pearson.

### Set up secrets for the first time

1. Open **[GitHub Codespaces settings](https://github.com/settings/codespaces)**.
2. Create a secret named `PEARSON_USERNAME` with your Pearson username.
3. Create a secret named `PEARSON_PASSWORD` with your Pearson password.
4. Grant each secret access to the `anhtuank9/AutoPearson` repository.
5. Return to the **Open AutoPearson in GitHub Codespaces** link above.

GitHub provides the secrets as environment variables; they are not written to the source code. Headless mode requires both a username and password because manual sign-in is unavailable in that mode.

## Option 2 — Your computer

### Requirements

- Git and Node.js 20 or newer.
- Google Chrome, or Microsoft Edge with `PEARSON_BROWSER=msedge`.
- An account with access to Pearson English Connect.

### Windows

```powershell
git clone https://github.com/anhtuank9/AutoPearson.git
cd AutoPearson
npm ci
Copy-Item .env.example .env
notepad .env
.\run.ps1
```

### macOS or Linux

```bash
git clone https://github.com/anhtuank9/AutoPearson.git
cd AutoPearson
npm ci
cp .env.example .env
# Open .env in an editor and enter your credentials for automatic sign-in.
npm start
```

Set both `PEARSON_USERNAME` and `PEARSON_PASSWORD` for automatic sign-in. Leave both blank to sign in manually in the browser window. `.env` is excluded from Git.

To use Playwright-managed Chromium:

```bash
npx playwright install chromium
```

Then set `PEARSON_BROWSER=chromium` in `.env`.

## How it works

- Open assignments are processed by most recent due date first.
- `Submitted` or `Completed` assignments, lessons at 100%, and locked `START` or `CONTINUE` buttons are skipped and reported in the result.
- Reference pages without questions are passed with **Next**.
- Pages with a **Done** button are completed with that button.
- Question pages are **Check**ed up to `PEARSON_CHECK_LIMIT` times. When **Show Answers** appears, the tool reads the displayed answers, hides them, resets the page if needed, and fills them in again.
- Supported question types include text inputs, dropdowns, single and multiple choices, drag and drop, ordering, word highlighting, radio grids, multiple gaps, and canvas pair matching.
- After the final lesson, the tool uses **Save & Exit** and checks the score in the list. It retries lessons below 100% up to three times.
- The tool does not click the assignment-wide `SUBMIT` button.

If it encounters an unsupported question type or a changed Pearson interface, the tool stops on that page and writes data to `diagnostics/` instead of silently skipping the question.

### My Content (preview)

Run `npm run my-content` to list courses. Set `PEARSON_COURSE_FILTER` to part of a course name to list its lessons, or to `*` to list lessons from all courses. Preview mode **does not open lessons, fill answers, or click Check**. Lessons with only one Check attempt need a restricted scope and confirmation before answers are submitted automatically.

To work on lessons in the selected scope, run `npm run my-content:solve`. This command may click Check up to five times to reveal Show Answers, fill in the answers, click Check once more, and use Save & Exit. It skips pages already at 100%, records diagnostics for pages it cannot handle, and continues to the next lesson. **You must set `PEARSON_COURSE_FILTER`**; use `*` to include all courses. Some listening, recording, free-writing, and one-Check activities may still remain incomplete.

If a run is interrupted, `PEARSON_MY_CONTENT_START_AT` lets you resume from a lesson ordinal in the log for the same course list. For example, `PEARSON_MY_CONTENT_START_AT=18` skips the first 17 lessons; set it back to `1` for a full scan. Resume only when the course list and filter have not changed.

To retry several failed lessons in one sign-in session, set `PEARSON_MY_CONTENT_ORDINALS` to a comma-separated list such as `86,125,205`. The ordinals appear in log entries as `My Content lesson N`; keep the same course filter when retrying.

Example in a Codespaces terminal:

```bash
PEARSON_COURSE_FILTER='Speakout A2+ – Online Practice' npm run my-content
# Run all of My Content after reviewing the scope:
PEARSON_COURSE_FILTER='*' npm run my-content:solve
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PEARSON_USERNAME` | empty | Username; must be provided together with the password |
| `PEARSON_PASSWORD` | empty | Password; must be provided together with the username |
| `PEARSON_BROWSER` | `chrome` | `chrome`, `msedge`, a beta/dev/canary channel, or `chromium` |
| `PEARSON_HEADLESS` | `0` | Set to `1` to run without a visible browser; enabled automatically in Codespaces |
| `PEARSON_START_URL` | English Connect URL | Starting point; only English Connect domains are accepted |
| `PEARSON_MAX_ASSIGNMENTS` | `100` | Limit on assignment-list iterations |
| `PEARSON_MAX_PAGES` | `300` | Limit on pages per lesson |
| `PEARSON_CHECK_LIMIT` | `5` | Maximum Check attempts before Show Answers |
| `PEARSON_ASSIGNMENT_FILTER` | empty | Process only assignments whose names contain this text |
| `PEARSON_LESSON_FILTER` | empty | Process only lessons whose names contain this text |
| `PEARSON_SECTION` | `assignments` | `assignments`, `my-content` (preview), or `my-content-solve` |
| `PEARSON_COURSE_FILTER` | empty | Show My Content lessons in matching courses; `*` selects all courses |
| `PEARSON_MAX_MY_CONTENT_LESSONS` | `500` | Limit on lessons visited in one `my-content:solve` run |
| `PEARSON_MY_CONTENT_START_AT` | `1` | Start at this lesson ordinal within the filtered scope |
| `PEARSON_MY_CONTENT_ORDINALS` | empty | Process only these comma-separated lesson ordinals in one sign-in session |
| `PEARSON_VIEWPORT_HEIGHT` | `900` | Browser viewport height |
| `PEARSON_TRACE_ANSWERS` | `0` | Write detailed answer traces when set to `1` |

## Exit codes

- `0`: no open assignments remain within the selected filter.
- `1`: sign-in, interface, question type, or browser interaction error.
- `2`: the run finished, but a lesson could not be opened or an assignment closed below 100%.

## Verify the project

```bash
npm run verify
```

`npm run check` checks syntax. `npm test` runs browser tests for configuration, Check/Reset/Uncheck, Show Answers, text inputs, dropdowns, drag and drop, Done, Save & Exit, and pair matching.

## Privacy and diagnostics

- Do not commit `.env`, `diagnostics/`, or browser profiles.
- Diagnostic files may contain course names, questions, answers, and information visible on screen. Review and remove personal data before sharing them in an issue.
- The tool runs locally; credentials are used only to fill in the Pearson sign-in form in the browser session.

## Limitations

Pearson may change its interface and lesson content. Recording activities, embedded third-party content, and new question types may require additional handlers. The tool cannot reopen assignments that a teacher has closed or locked after the due date.

## Contributions and copyright

Read [CONTRIBUTING.md](CONTRIBUTING.md) before sending changes. The source code is provided under the [noncommercial license](LICENSE); all commercial rights belong to the owner and require prior written permission. For product inquiries, contact anhtuank9 through [their GitHub profile](https://github.com/anhtuank9).
