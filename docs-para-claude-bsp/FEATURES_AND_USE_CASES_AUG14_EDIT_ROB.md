# Binge Senpai — Feature & Use-Case Map (August 2026)

**Purpose of this document.** A faithful, complete description of what the product is, every feature it ships today, the use cases it was designed for, and how well each is actually served (grounded in production usage data). Written as input for market/user research: compare this against what anime/manga fans ask for online (Reddit, MAL/AniList forums, app-store reviews of competitors, TikTok/YouTube comments) to find use cases we're missing, use cases we serve badly, and features that should change. A list of specific research questions is at the end.

---

## 1. What the product is

**Binge Senpai** (bingesenpai.com) is a web-based **anime and manga tracker with a built-in AI assistant ("Senpai")**. Users keep a library of what they've watched/read, are watching/reading, and plan to watch/read; log episode/chapter progress; score titles; and get personal recommendations — either from an AI chat that knows their taste or from recommendation rails computed from their library. It is positioned deliberately close to **Letterboxd's ethos applied to anime** (taste-first, editorial voice, art-forward dark UI) and against the mass-market database feel of MyAnimeList/AniList.

Explicit positioning choices (stated on the landing page and enforced in the product):
- **Free, indie, ad-free.** No subscription today, no ads. (There is no monetization live at all.)
- **It does not stream or host anything.** When users come looking for a place to watch or read, the product honestly says so and points them to legal streaming/reading services ("honest exit"), positioning itself as the tracker layer above wherever you watch.
- **One-click import** from other trackers as a headline promise.
- **Your data is exportable / not locked in** (stated promise on landing).
- **Opinionated design**: single 10-point integer rating scale (no stars/halves), dark-mode-first magazine aesthetic, "no anxiety metrics" (no backlog-guilt counters), editorial copy voice.

**Scale context for the research:** ~1,900 registered users, ~500 signups/month (mostly organic + some Reddit), ~2/3 of signups on mobile browsers. Catalog: ~30k anime, ~87k manga (sourced from MAL/Jikan data, enriched). A small daily-active core (~15–25 people) uses it as a genuine daily habit.

## 2. Platforms & access

- **Responsive web app** (Rails + Hotwire). Dark mode primary; light mode exists.
- **Installable PWA** ("add to home screen") with web-push support; prompted via an install sheet. No offline mode. **No native iOS/Android apps.**
- Mobile web gets a dedicated 5-tab bottom nav: **Home (library board) · Airing · Senpai (chat) · Browse · Menu**; desktop gets a top nav plus a floating "✦ Ask Senpai" pill on every page.
- Login: email + password (Devise). Email verification is required for email features but login works unverified for 3 months. No social login (no Google/Apple sign-in), no passwordless login.
- Title-language preference: English / romaji / native titles.
- Interface is English-only today (title language is configurable, UI language is not).

## 3. Feature inventory

### 3a. The library (core tracking)

- **Library entries** for anime and manga with: status (**watching/reading ("consuming"), completed, planning, paused, dropped**), score (1–10 integers, with opinionated labels from "Awful" to "Masterpiece"), episode progress (chapters for manga, with volumes as a secondary track), started-on / finished-on dates (auto-filled sensibly; reaching the final episode auto-completes the entry).
- **Ways to add/edit:** a detail editor on every title page (status + score + progress + dates); one-tap quick actions from catalog cards (a hover/long-press "toolbar": add to library, add to a collection, favorite); logging through chat ("add Frieren to my list", "I'm on episode 8"); episode +1 buttons on library surfaces; a batch editor for multi-entry updates; a **multi-season flow** to log a whole sequel chain at once; a mobile quick-log sheet (long-press the Home tab; shows your 3 most recent in-progress shows).
- **Library views**: grid/list modes with filters (medium, status, genre, text search) and sorts (status priority, recently updated, alphabetical, score, least progress). The library home stacks ~10 personalized rails: Continue Watching, Continue Reading, This Week (your airing shows), Up Next in Plan, Forgotten Gems, Started Last Week, Because You Loved, Your Collections, Recently Added, Plan Shelf.
- **"Not for me" (avoided titles):** users can exclude a title so it never gets recommended again — via chat or import. (Barely discovered: 5 users have ever used it.)
- **The Tonight Board** — the library home's first viewport and the product's daily-habit surface. Three slots, redrawn deterministically every evening at 3pm local: **(1) Continue** — the best "pick up where you left off" show with next-episode info; **(2) Tonight's Pick** — one recommendation *not* in your library, with a data-grounded reason and a trust line, re-rollable; **(3) New for you** — what moved today: new episodes of your shows, premiere news for planned titles, backlog nudges.
- **Diary** — a chronological activity log with range filters (90 days/month/year), kind filters (watched/finished/rated/added), and an activity heatmap.
- **Stats** — genre and studio distributions, rating histogram, time-spent totals, activity heatmap, and an editorial "taste sentence" headline summarizing the user.
- **Wrapped** — a monthly, Spotify-Wrapped-style recap (up to 14 "stanzas," each only shown if the user earned it that month).
- **Weekly Shelf Report** — an auto-generated Sunday recap of the user's week (episodes logged, milestones), viewable in-app with a share door.
- **History honesty:** imports back-date the diary using real dates from the source export where they exist, instead of pretending everything happened on import day.

### 3b. Title pages (anime & manga)

- Full-bleed art detail pages with sticky section navigation: synopsis (plus an AI-written spoiler-free summary variant), metadata (season/year, studio, rating, duration), a "where to watch" strip, an **episode list with air dates**, characters (with an "affinity strip" showing overlap with your library), staff with career-arc timelines, studios/companies, news articles, image galleries and promo videos, **imported community reviews** (~300k from MAL, shown read-only with a consensus summary and spoiler/recommends filters — users cannot write reviews on-site), streaming/reading availability links per service, and related-works navigation. Characters, people, and studios each have their own browsable index and detail pages (voice actors by language, collaborations, filmographies).
- **Universe graph** — a visual map of a franchise (sequels, prequels, spin-offs, movies laid out in canonical order lanes) for "where do I start / what order" navigation.
- **Command card** — the tracking control on the show page (status, score, progress in one place).
- **"Start next season"** — one-tap continuation into a sequel when you finish a season.
- **Verdict taps** — lightweight seen-it/loved-it signals separate from full tracking (used by the sprint and some rails).
- **Appeal / "why you'd like this"** — an AI-generated personal read on a title ("Senpai's take"), generated on request per user + title.

### 3c. Discovery & recommendations

- **Catalog browse** for anime and manga: typo-tolerant search, genre filters, sorts (Trending / Top Rated / Most Tracked / Newest), season and year filters; zero-result searches get correction suggestions and reveal content-filtered matches; library search misses pivot into the full catalog. A semantic/AI search mode exists for natural-language-ish queries.
- **Recommendation rails** on the library home: "Because you loved X" (anchored to a specific title you scored highly — the best-performing rec unit in the product), popular-now, plus the board's Tonight's Pick.
- **Explore/Guide** page — curated editorial entry points.
- **Hidden-gems row** in the catalog.
- **Senpai chat** (see 3d) as the conversational discovery path.
- **Airing calendar**, three tabs: **Schedule** (day-by-day broadcast tape, timezone-correct, with "everything / my shows / tonight" lenses), **Catch-up** (aired-but-unwatched queue across your in-progress shows), and **Coming Soon** (next seasons' premieres browsable by season with genre chips); one-tap follow from calendar cards.
- **Content controls**: SFW mode; a persisted three-state **After-Dark mode** for adult content (off / on / discreet) with an age attestation gate; unrated titles are treated as safe rather than hidden.

### 3d. Senpai — the AI assistant

- A chat that can: **recommend** from mood/vibe/"more like X" prompts; **read the user's library and taste profile** and personalize accordingly; **write to the library** (add titles, update status/progress/scores) when asked; answer questions about titles; mark "not for me"; and hand off to product surfaces (title cards in chat are tappable and land on title pages).
- Thread management: conversation list, resume-last-thread, "continue or start new" launcher on every page.
- Onboarding-seeded conversations: new users with recommendation intent land in a pre-seeded chat; a **taste picker** (grid of posters, "pick what you've watched") can be invoked inside chat to give Senpai material.
- An AI-generated **taste profile** of the user powers personalization, plus per-title appeals.
- Rate limits/quotas exist server-side; the model stack is swappable (currently a frontier open-weights model with fallbacks).
- **Usage reality:** chat is a major but minority-of-users feature; "tracking via chat" (logging by telling Senpai) is the fastest-growing chat behavior. Known weakness: cold-start for brand-new users with empty libraries.

### 3e. Building a library fast (onboarding & import)

- **Mandatory one-question intent gate** at signup: "What brings you to Binge Senpai?" with 8 answers — switching trackers / help finding what to watch / track anime / track manga / keep up with airing / looking for somewhere to watch / looking for somewhere to read / just exploring. Each routes to a different first experience.
- **Shelf Sprint** — a full-screen rapid history builder: tap posters you've seen (one tap = logged, optional 1–10 rating), curated recognition sections + search, milestone meter. This is now the single shelf-builder surface.
- **Seeded Senpai chat** with taste picker for recommendation-intent users.
- **Importers (one-click list migration): MyAnimeList (XML export), AniList (username — no file needed), Crunchyroll (data export), Anime-Planet (export files).** Import handles gzip, malformed files, season-matching for Crunchyroll's odd data model, merge/skip/overwrite conflict strategies, progress UI, and ends in a seeded "here's what I noticed about your taste" conversation.
- **Unsupported trackers** (Kitsu, Simkl, Notify.moe, Trakt, TV Time, other): a "notify me when the importer ships" waitlist + a manual favorites path. Waitlist emails go out when an importer ships.
- **Airing welcome mat** for keep-up-with-airing intent: follow currently-airing shows in one tap, then the calendar.
- **Honest exits** for where-to-watch / where-to-read intents: a finder that returns the legal streaming/reading services for any title, by region, and links out.
- **Post-onboarding "Welcome Issue"**: a next-steps page introducing the board, the bell/calendar, and the shelf.

### 3f. Notifications, email & comeback mechanisms

- **Episode-aired pipeline**: broadcast schedules are tracked per show; when a new episode airs, followers who are watching that show get a notification card ("Ep 8 of Blue Lock is out") with an inline "mark watched / start next" action.
- **Premiere/planning news** ("X premieres tonight" for planned titles) and **backlog nudges** ("been a while, X has new episodes").
- **In-app bell** with unseen badge, panel, and a max-3-unread governor that collapses/suppresses overflow.
- **Web push** for the above (requires the user to grant permission via a primer sheet).
- **Evening Digest** — an opt-in daily email at the user's peak hour: continue-watching line, tonight's pick, new episodes. Email links are signed: clicking auto-verifies the address and signs the user in. One-click unsubscribe.
- **Weekly Shelf Report** notification.
- **Shareable Taste Card** — a public link (`/t/token`) with a generated image (2×2 favorite posters + taste blurb) for sharing your taste; also a weekly variant from the shelf report; og-image cards for sharing any title.
- **Usage reality (important for research):** these comeback mechanisms are all built but barely armed — ~9% of users verify email, 7 have push on, 19 receive the digest. Retention is the product's central problem (documented separately in PRODUCT_IMPROVEMENTS_AUG14.md).

### 3g. Collections, favorites, profile

- **Custom collections** (user-made lists of titles; 57 users have made 90 of them), each with computed stats (average score, genre mix, episode totals). System collections exist under the hood (watchlist, favorites, "set aside"). Collections are private; imported Crunchyroll custom lists become collections.
- **Favorites** for anime, manga, **characters**, people, and studios (anime favorites dominate; character favoriting exists and gets some use).
- **No public user profile page** in the Letterboxd sense — the Taste Card share link is the only public-facing identity artifact. No followers, no friends, no activity feed of other users, no comments, no community features of any kind.

### 3h. Account & data

- Settings: profile, password, **two-factor authentication**, intent revision, notification toggles (per-type: episodes, momentum, planning news, reports; digest on/off + send hour), per-show notification mutes, content modes (SFW/After-Dark/discreet), title language, theme. (A "connected accounts" OAuth page exists as framework boilerplate — no social-login providers are actually live.)
- **Announcements/changelog** page (new/fix/improvement posts with unread tracking), plus about/terms/privacy pages.
- **Account deletion** self-serve (recently rebuilt to actually purge everything reliably).
- A JSON API with token auth exists (Jumpstart boilerplate; 1 token ever created — effectively unused; no public API story, no third-party integrations).
- Data export: promised on the landing page; there is **no self-serve "download my data" button today** (imports in, but export out is not built) — a promise/reality gap worth noting.

## 4. Use cases we designed for — and how they're actually doing

The signup intent question gives us real demand distribution (n≈1,400 answers) and we can pair it with how well each cohort sticks (share who return within their first week):

| Use case (intent) | Demand share | Week-1 return | How it's served today | Honest assessment |
|---|---|---|---|---|
| **Track my anime** | ~24% | 14.7% | Sprint → library → board/diary/stats | Best-served path; still leaks most users |
| **Switching from another tracker** | ~14% | 16.4% | 4 importers + waitlists | Best retention of any intent; MAL dominates switch demand (82 of 176 answers), then Crunchyroll (26), AniList (23), Anime-Planet (17) |
| **Help me find what to watch (recs)** | ~20% | 7.1% | Seeded Senpai chat, rec rails | Weakly served: retention half that of trackers; chat cold-start is rough with an empty library |
| **Looking for somewhere to watch** | ~13% | 5.4% | Honest exit → streaming finder → link out | Serves the moment, then loses the person by design; no comeback hook |
| **Just exploring** | ~8% | 12.1% | Straight to the product | Middling |
| **Track my manga** | ~3.5% | 13.3% | Same library in manga mode | Works; manga is ~4% of tracked entries, 121 users |
| **Looking for somewhere to read manga** | ~3% | 8.3% | Honest exit (reading finder) | Same exit-without-return shape |
| **Keep up with airing** | ~1.4% picked it | 0% (n=6) | Calendar + follows + episode alerts | Almost nobody self-identifies with it at signup — yet *having* an airing show you're watching is the single strongest return predictor we've measured. The use case is real; the intent framing/placement isn't capturing it |

**Observed use cases nobody designed for (from usage data and chat logs):**
- **"Switching" from pirate streaming sites** — free-text switch answers include HiAnime, 9anime, Aniwatch, Anilab, StreameX, MangaPin: people's previous "tracker" was a streaming site's built-in watchlist/history. There is no import path or tailored story for them (no export exists on those sites — a "rebuild my list fast from memory" flow is the real need, which the Sprint partially is).
- **Tracking by talking** — logging progress via chat instead of UI taps is the fastest-growing chat behavior.
- **Looking up a specific title after seeing it elsewhere** (YouTube arrivals land on search/title pages) — the product as an IMDb-style reference stop.
- **TV Time refugees** (that app degraded mid-July): 6 switch answers + a Reddit ad audience; no TV Time importer exists (TV Time has no export; same "rebuild fast" need).
- **Rewatch logging** — the data model has no rewatch concept (a known competitor staple).

## 5. What we knowingly do NOT do (by design)

For the researcher: distinguish "gap" from "choice." These are choices:
- No streaming/hosting of any content; we link out to legal services instead.
- No ads, no paid tier (nothing to monetize yet — also means no Plex/Trakt-style VIP feature research target).
- No half-point or 100-point ratings; one 10-point integer scale.
- No backlog-guilt mechanics (no "you have 47 unwatched" counters), no streaks/gamification.
- No user-written reviews (community reviews are imported read-only), no forums.

## 6. Known gaps (candidate research targets)

Things that exist in competitors or in user demand signals but not here:
1. **No social layer at all** — no public profiles, friends/follows, activity feed, compare-taste-with-a-friend, or sharing beyond the Taste Card link. (Letterboxd's core engine; MAL/AniList have profiles+feeds; AniList has social embeds everywhere.)
2. **No native mobile apps** — and mobile-web retention is our weakest (two-thirds of demand, no reliable notification channel on iOS Safari without PWA install).
3. **No rewatch tracking**, no episode-level ratings/notes, no per-episode discussion.
4. **No importer for Kitsu/Simkl/Trakt/TV Time**; no ongoing **sync** with any tracker (import is one-shot; MAL/AniList users who keep using both have no bridge back).
5. **No data export** despite the landing promise.
6. **No public API / integrations** (competitors' APIs power bots, Discord rich presence, watch-party tools, spreadsheet nerds).
7. **No where-to-watch alerts** ("tell me when X hits Netflix in my region") — we show availability but never notify on changes; same for premiere-date alerts for planned titles from the honest-exit/recs crowds.
8. **No seasonal-planning ritual** — the Coming Soon tab lets you browse next season, but there's no "build my Fall watchlist" chart moment, no premiere-date alerts for planned titles as a headline flow, and no season-chart density (AniChart/LiveChart territory) — a big recurring community event we don't own.
9. **No manga-specific depth** (release tracking for chapters/volumes by publisher, "new chapter out" alerts exist only via the generic pipeline for airing anime — manga releases aren't broadcast-scheduled).
10. **No offline mode** in the PWA.
11. **UI is English-only** (title language is configurable; interface language is not) — relevant given visible non-English signups (Arabic free-text answers appear in the intent data).
12. **No watch-party / watch-together, no AI beyond chat** (e.g., no "explain this episode", no spoiler-safe episode recaps), no character/VA deep-dives as a feature (pages exist, thin data).


---

*Compiled Aug 14, 2026 from a full walk of the codebase (routes/controllers/views), the design guide, and production usage data (read-only). Companion docs: PRODUCT_IMPROVEMENTS_AUG14.md (retention diagnosis + ranked fixes), RETENTION_REVALIDATION_AUG13.md (analytics deep-dive).*
