# Advent Academy LMS

Galina's English-teaching platform. Production: **https://lms.advent-academy.online**, on server `srv3.advent-academy.online` (91.239.6.107), root SSH via `~/.ssh/lms_deploy`. Everything runs in Docker from `/opt/srv3/` (Caddy + app + Postgres). Repo: `svirinagalina/english-lms` (private, push over SSH).

## Stack
- `client/`: React 18 + Vite, plain CSS (`styles.css` + `styles/whiteboard.css`), React Router.
- `server/`: Node/Express (ESM), Prisma/PostgreSQL, Socket.io for the whiteboard and calls.
- Deploy: `git push` then `./deploy/deploy.sh` (builds, runs prisma migrate deploy, restarts the container, health-checks). Always commit with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (or the model name the session shows).

## Local dev
- `psql english_lms` for the local Postgres DB (same schema as prod, different data).
- Client dev server: `npx vite --port 5199` inside `client/`. Server: `node --env-file=.env src/index.js` inside `server/` — **does not hot-reload**; restart it after any server-side edit before testing, or you'll silently test stale code (this has bitten me more than once this session).
- Test accounts locally: `galina@test.com` / `localtest` (OWNER), `petr1789323310144@test.com` / `localtest` (STUDENT), others under `*@test.com`.
- Browser-pane camera/mic is blocked in this environment; mock `navigator.mediaDevices.getUserMedia` via `javascript_tool` before testing call/board flows (see call pages for the pattern used throughout this project).

## Working on production data safely
Never ask the user to paste `DATABASE_URL` or any credential into chat. I already have SSH access; either:
- run SQL via `docker exec srv3-lms-db psql -U $(docker exec srv3-lms-db printenv POSTGRES_USER) -d $(docker exec srv3-lms-db printenv POSTGRES_DB) -f /tmp/x.sql` after `scp`-ing the file up, or
- for a script that needs Prisma, `docker cp` it into `srv3-lms-app:/app/scripts/` and `docker exec -w /app srv3-lms-app node scripts/<name>.js` — `DATABASE_URL` is already set correctly inside that container.
Read logs with `docker logs --since 1h srv3-lms-app | grep '\[diag\]'` for call diagnostics (see below).

## Architecture notes (read before touching these areas)

**Boards, one per student (redesigned 2026-09-20/21).** A student's cabinet shows exactly one board, given to them via **Assign** (a checklist of students on any board in "My boards" — checking a name attaches this board and detaches whatever that student had before, moving the old one back to the teacher's own shelf, never deleting it; a board can be checked for several students at once for pair/group lessons). There is no "Extra board" button anymore — `POST /classrooms/:id/boards` refuses to create a board directly in a student's classroom. `home` for a displaced board must be `ensurePersonalSpace(target.teacherId, ...)`, **not** the acting user's — I shipped a bug where an admin managing another teacher's student sent the displaced board to the admin's own shelf; fixed, but if you touch `assign` again, re-check this. A `Board.scratch` flag marks boards auto-created for a "call without a student" (colleague/group call); they're excluded from every board listing and deleted when that call ends (`signaling.js`, the 15-min-after-empty cleanup).

**Noise removal and blur (`client/src/utils/noiseSuppressor.js`, `videoProcessor.js`).** Chain: browser filter → GTCRN neural denoiser (RNNoise fallback) → a custom "quiet-gate" AudioWorklet (−48/−54 dBFS) that was the fix that actually mattered — GTCRN alone left audible residue. Both sender and receiver denoise (VideoGrid denoises incoming audio too). Never awaited at join (plain mic first, swapped in when ready). Blur: mediapipe selfie segmenter; iPhone/iPad force the CPU delegate and the frame is copied to a canvas before compositing (Safari ignores `globalCompositeOperation` on a `<video>` source) — both were real bugs found via the `/api/diag` log, not guesswork. **Diagnostics are the fastest way to debug a "doesn't work for the student" report**: the browser POSTs to `/api/diag`, read with `docker logs ... | grep '\[diag\]'`; `blur.mask` events even carry a base64 thumbnail of what was actually composited. Trust this over guessing, and over the user's own uncertain description of what's wrong — but *do* trust the user's plain sensory report ("I can still hear the fan") over my own instrumentation if they conflict; that once turned out to mean the instrumentation was reading the wrong signal, not that the user was wrong.

**Exercise grading (`server/src/answerCheck.js`).** `checkAnswer()` is shared by grammar-unit exercises (`units.js`) and the mistake-notebook drill (`mistakes.js`) — a fix here covers both. Fixed 2026-09-21: a "no article needed" exercise stores its answer as an em dash `—`, which normalises to an empty string; the code used to reject any empty-normalised answer outright before comparing, so no student input could ever match. Lone `-`/`_` now normalise the same way `—` does (only when they stand alone as a "word" — `well-known` is untouched), and the empty-vs-empty case is judged like any other instead of short-circuited.

**Content quality.** The seeded textbook (`server/data/englishtime.json`, 34 units) has real prompt/answer mismatches beyond typos — found two confirmed cases (wrong negation, wrong pronoun) and one unresolved ambiguous one ("She __ the very girl I saw yesterday." — duplicate "the", unclear whether the answer key or the prompt is wrong) while fixing the grading bug above. Don't bulk-edit exercise content on a guess; it's Galina's paid curriculum. A background task (`task_6702da67`, `server/scripts/audit-exercise-content.js`) is auditing this — check whether it's finished and what it found before starting a fresh audit.

**Vocabulary.** The personal set that words picked from the board/Writing land in is titled **"From my board"** (renamed from "My words" 2026-09-21 — if you ever see "My words" in code or copy, it's stale). `Study` (in `VocabSet.jsx`) supports `cram` mode — "Practice all cards", every card in deck order regardless of the spaced-repetition schedule, which deliberately never calls `reviewCard` so it can't disturb real due dates.

**UI panels.** Every cabinet list (My students, boards, invitations, etc.) is wrapped in `<Panel>` (`client/src/components/Panel.jsx`) — collapsible, remembers open/closed per browser via localStorage keyed by the `id` prop. When adding a new list to a page, wrap it in `Panel`, and make sure any "nothing here yet" empty-state text lives *inside* the panel, not floating above it (I've fixed this mistake twice already).

**Server hardening reminder:** every query must filter by `schoolId`; only OWNER/PARTNER (`isAdmin()`) cross school-internal teacher boundaries, and even then double-check who ends up owning any data that moves as a result (see the Assign bug above — the general pattern is "whose thing is this, not who clicked the button").

## Known open items
- The background content-audit task may still be running or have produced `server/reports/exercise-audit.md` — check it before re-auditing.
- "She __ the very girl I saw yesterday." exercise content needs Galina's call, not an automated fix.
- Login button on the advent-academy.ru marketing site (different server, Tilda) still needs to point at `lms.advent-academy.online/login` — last discussed, not confirmed fixed on her end.
