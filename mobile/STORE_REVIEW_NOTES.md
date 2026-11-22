# Store review notes (Apple App Review / Google Play)

Concrete, factual content to use when submitting Waha for review — not
generic advice. Everything below describes what the code actually does;
update it if the safety mechanisms change.

## Suggested age rating

**17+ / Mature 17+ (Apple), Teen or Mature 17+ depending on region (Google
Play content rating questionnaire).**

Rationale: the app discusses self-harm and suicide as part of its core
safety feature (crisis detection and response), and mentions real crisis
helpline numbers. This alone typically pushes both stores toward their
"infrequent/mild" or "frequent/intense" references to self-harm category,
even though the app never depicts or encourages it — it exists specifically
to *detect and redirect away from* self-harm risk. Apple's and Google's
own rating guidelines treat this content category conservatively
regardless of intent, so plan for 17+ rather than a lower tier; a reviewer
bumping a lower self-selected rating up is a common rejection reason for
apps in this space.

## What to paste in Apple's "App Review Notes" / a Google Play reviewer note

> Waha is a mental-wellness app (not therapy, not a medical device) that
> offers CBT/ACT-based exercises, mood tracking, and an AI chat companion.
> Because any free-text chat feature in this space can encounter genuine
> crisis disclosures, the app has layered, deterministic safety measures
> that do not depend on the AI model's own judgment:
>
> 1. A keyword-based crisis detector (netlify/functions/chat.js,
>    `detectCrisis()`) runs on every message, in every input mode, before
>    any AI call and before rate limiting — a match always returns a fixed,
>    pre-written response with real crisis-helpline numbers (Germany's
>    TelefonSeelsorge, the UAE's 800-HOPE, and findahelpline.com for every
>    other country), never an AI-generated reply.
> 2. A second, AI-based risk classifier (`runRiskCheck()`) reads the whole
>    conversation (not just one message) to catch indirect or dialectal
>    phrasing the keyword list would miss, and overrides the AI's reply
>    with the same fixed crisis text at high/imminent risk.
> 3. A "Safe Claims Layer" (`containsUnsafeClaim()`) scans every AI reply
>    afterward and replaces it with a safe fallback if it contains any
>    diagnostic, treatment, or medication-related claim.
> 4. A self-attestation age gate appears before any other content.
> 5. The in-app disclaimer states plainly that Waha is not a substitute
>    for diagnosis or treatment and directs anyone in crisis to local
>    emergency services.
>
> We're glad to walk through any of this in more detail if useful for
> review.

(Edit the helpline list if you add or change countries — keep this note
in sync with `CRISIS_RESPONSES` in `netlify/functions/chat.js`.)

## Google Play Data safety / content rating questionnaire — relevant answers

- **Does your app reference self-harm or suicide?** Yes — informational
  and safety-response context only (crisis detection and helpline
  referral), never depicted, never encouraged.
- **Medical/health claims?** No diagnosis, prescription, or treatment
  claims are made; this is enforced in code (Safe Claims Layer), not just
  asserted in the privacy policy.
- **Does the app collect health information?** Yes, optionally — see
  `PRIVACY_LABELS.md` (same folder level as this file, at the repo root)
  for the exact, current list of what's collected, with whom it's shared,
  and the consent gate in front of each category.

## Apple Privacy Nutrition Label / Google Data Safety form

See `PRIVACY_LABELS.md` at the repo root — it maps every real data flow
in the current code to both stores' disclosure categories directly, so
the declared labels can't drift from what the app actually does.
