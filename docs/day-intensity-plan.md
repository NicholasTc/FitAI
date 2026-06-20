# Day Intensity Plan — Gear + Intensity Model

> Goal: keep the simple **Push / Maintain / Recover** headline, but give the user
> actionable guidance on **how hard** to go today — not just which bucket they are in.

This plan addresses a product gap: three day types answer *"what gear am I in?"* but not
*"how should I use that gear?"* The statistical readiness model (`lib/readiness.ts`) already
computes a 0–100 score with per-metric breakdown; `lib/guardrails.ts` already maps that score
to **6 bands** with domain-specific limits. This document defines how to present that richer
layer as the primary planning surface.

---

## Problem statement

| Question | Push / Maintain / Recover answers it? |
|---|---|
| What gear am I in overall? | Yes |
| How hard can I train? | No |
| How much deep work is realistic? | No |
| Can I stack hard gym + hard study? | No |
| What should I protect tonight? | Partially (via guardrails, easy to miss) |

A score of **72** and **74** both read as "Maintain Day" but imply very different risk budgets.
Borderline Push days (75–78) feel mislabeled when the user still has limited margin.

**Root cause:** one scalar score is collapsed into one coarse label. The finer logic already
exists in guardrails — it is not yet the thing the UI leads with.

---

## Mental model

Two layers, not twelve day types:

| Layer | Values | Role |
|---|---|---|
| **Gear** | Push · Maintain · Recover | Memorable headline — overall direction |
| **Intensity** | Peak · Standard · Low (within gear) | Dose — how much room you have today |

- **Gear change** = different *strategy*
- **Intensity change** = different *dose* within the same strategy

Avoid proliferating top-level labels (Push+, Push++, etc.). Use gear for summary, intensity
for planning.

---

## Mapping to existing score bands

`lib/guardrails.ts` already implements six bands. This plan renames them for product copy
while keeping the same score cutoffs.

| Score | Existing band (`guardrails.ts`) | Gear | Intensity (product label) |
|---|---|---|---|
| 90–100 | `push-peak` | Push | **Peak** |
| 75–89 | `push` | Push | **Standard** |
| 62–74 | `maintain-high` | Maintain | **High** (or "Strong") |
| 50–61 | `maintain-low` | Maintain | **Low** (or "Steady") |
| 32–49 | `recover` | Recover | **Standard** |
| 0–31 | `rest` | Recover | **Low** (or "Rest") |

Day type cutoffs in `lib/readiness.ts` remain unchanged for compatibility:

- Push ≥ 75
- Maintain 50–74
- Recover < 50

**UI copy example:** hero shows *"Maintain Day — Strong"* (band `maintain-high`, score 72)
instead of only *"Maintain Day."*

---

## What each intensity signifies

### Push gear (score ≥ 75)

Net-positive state. The question is how much capacity you can spend without creating
recovery debt tomorrow.

#### Push — Peak (90–100)

**Signifies:** Rare all-systems-go days. Strong recovery signals and subjective readiness
aligned. Low overreach risk if the day is used well.

**Typical signals:**
- Sleep at or above personal norm; good deep/REM proportion
- HRV at or above baseline (often ≥ +1σ when z-scoring is active)
- RHR at or below baseline
- High energy/motivation, low stress
- Training load ratio in safe zone (ACWR not spiking)

**Practical meaning:**
- Can stack hard efforts — with discipline, not recklessness
- Full-intensity training supported
- Multiple deep work blocks realistic
- Main risk: ego overreach on low-priority tasks

| Domain | Guidance |
|---|---|
| Training | Heavy / PR attempts / long session OK |
| Deep work | Up to 3 focused blocks |
| Light work | Unrestricted |
| Evening | Still protect sleep — peak ≠ skip recovery |

**One-liner:** *Use the capacity; don't waste it on low-priority work.*

---

#### Push — Standard (75–89)

**Signifies:** Legitimate Push day, but not an empty-the-tank day. One major hard effort
at a time is the safer default.

**Typical signals:**
- Most metrics good; one neutral (e.g. good HRV, average sleep)
- Check-in positive but not perfect
- Score above Push threshold without dominant margin (e.g. 76–85)

**Practical meaning:**
- Hard workout **or** big study push — stacking both is the risk
- Up to 2 deep blocks, not 3
- No spare capacity for surprise stress (late night, extra commitments)

| Domain | Guidance |
|---|---|
| Training | Hard session OK (RPE 7–8), not necessarily max effort |
| Deep work | Up to 2 blocks |
| Light work | Normal |
| Evening | Wind down on time |

**One-liner:** *Push on your top priority; protect everything else.*

---

#### Push — borderline note (75–78)

Scores just above the Push cutoff may behave like **Maintain — High** in practice. When
subjective energy or a key metric is soft, prefer Maintain-High guardrails even if the
headline says Push. Future improvement: surface "borderline" in copy, not a new day type.

---

### Maintain gear (score 50–74)

Functional and productive, but recovery is the constraint. **Intensity split matters most**
here — this is where most days live.

#### Maintain — High / Strong (62–74)

**Signifies:** Solid productive day. Not rest, not peak. Train and work, but volume and
stacking are capped.

**Typical signals:**
- Mixed signals: good sleep + soft HRV, or good HRV + energy only 6/10
- Score in low 70s common (e.g. 72 = Maintain-High, not borderline Push)
- Stress manageable, motivation decent

**Practical meaning:**
- One deep work block is the sweet spot; a second is possible but costly
- Training: moderate–hard OK, not maximal
- Main risk: treating like Push (gym + long coding + late night)

| Domain | Guidance |
|---|---|
| Training | Moderate–hard (RPE 6–7, avoid failure sets) |
| Deep work | 1–2 blocks; cap total deep time |
| Light work | Batch/admin, ~90 min cap |
| Evening | Protect sleep — tomorrow matters |

**One-liner:** *Make today useful; don't make tomorrow expensive.*

---

#### Maintain — Low / Steady (50–61)

**Signifies:** Above Recover, limited reserves. Progress only if selective and conservative.

**Typical signals:**
- Several muted signals: short sleep, HRV down, energy 4–5, elevated stress
- Missing wearable data + mediocre check-in
- Body functional but not cooperative

**Practical meaning:**
- One focused block max — highest-leverage task only
- Training: moderate only (RPE 5–6) or swap for mobility/light cardio
- Decline optional commitments
- Main risk: guilt-driven overwork → tomorrow becomes Recover

| Domain | Guidance |
|---|---|
| Training | Moderate only — no heavy compounds to failure |
| Deep work | 1 block max |
| Light work | 2 shorter sessions; urgent items first |
| Evening | Non-negotiable wind-down |

**One-liner:** *Minimum effective day — one win, then protect the rest.*

---

#### Maintain — High vs Low (quick contrast)

| | Maintain — High (62–74) | Maintain — Low (50–61) |
|---|---|---|
| Feel | "I can do real work today" | "I can do *something* today" |
| Training | Moderate–hard OK | Moderate only |
| Deep work | 1–2 blocks | 1 block max |
| Stacking hard tasks | Risky but sometimes fine | Almost always bad |
| Tomorrow risk if overdone | Medium | High |

---

### Recover gear (score < 50)

System is taxed. Shift from performance to damage control + minimum momentum.

#### Recover — Standard (32–49)

**Signifies:** Below baseline. Not an emergency, but the body is asking for a lighter day.
"Minimum useful day" territory.

**Typical signals:**
- Poor sleep, HRV notably down, high stress, low energy/motivation
- Accumulated fatigue (high ACWR) dragging score
- User may still *want* to work — common trap

**Practical meaning:**
- No hard training — walk, stretch, mobility
- Deep work: light only (review, reading, planning — not hard creation/debugging)
- One task that reduces tomorrow's stress
- Main risk: pushing through → 2–3 bad days after

| Domain | Guidance |
|---|---|
| Training | Walk / stretch / mobility only |
| Deep work | Light reading, review — avoid hard problems |
| Light work | Urgent items only |
| Evening | In bed on time — recovery is the work |

**One-liner:** *You're not failing — you're investing in showing up tomorrow.*

---

#### Recover — Low / Rest (0–31)

**Signifies:** Genuine depletion. High risk of illness, injury, or multi-day crash if pushed.

**Typical signals:**
- Very poor sleep + bad HRV + elevated RHR + awful check-in
- Multiple overload days catching up
- Possible early illness signal

**Practical meaning:**
- Defer non-essential everything
- Gentle walk at most
- One tiny maintenance task optional
- Sleep, hydration, food — that is the plan

| Domain | Guidance |
|---|---|
| Training | Full rest |
| Deep work | Avoid |
| Light work | Defer if possible |
| Evening | Earliest reasonable bedtime |

**One-liner:** *Rest is the task today.*

---

## What intensity changes vs what gear changes

**Same gear, different intensity** = same strategy, different dose.

Example — both Maintain, different plans:

> **Maintain — High (72):** Gym at RPE 7, then one 90-min study block.  
> **Maintain — Low (55):** Walk instead of gym, one 60-min block on easiest task.

**Different gear** = different framing:

> At Recover — Standard, "how should I push?" is the wrong question.  
> Reframe: *"What is the lightest useful thing?"*

---

## Recommended daily output (product surface)

Demote the 3-type label from *the answer* to *the summary*. Promote:

1. **Gear + intensity** — e.g. *Maintain Day — Strong* (`maintain-high`)
2. **Today's Limits** — per-domain caps (already in `computeGuardrails`)
3. **Top limiter** — metric or check-in signal capping capacity today
4. **Top enabler** — signal you can lean on (e.g. low stress, good HRV)
5. **One-sentence plan** — AI coach layer, grounded in 1–4

### Limiter / enabler (future enhancement)

Derived from `readiness.reasons` and z-score breakdown — no new day types required.

Example:

> **Limiter:** HRV slightly below your norm.  
> **Enabler:** Low stress, motivation 7/10.  
> **Plan:** Moderate gym OK; cap deep work to one block.

### Optional: cognitive vs physical split (later)

For study + 4–5×/week training, one scalar often mislabels one domain.

| | Physical | Cognitive |
|---|---|---|
| Signals | HRV, RHR, training load | Energy, stress, sleep quality |
| Example output | Push | Maintain |

Use when limiter/enabler disagree across domains — not required for v1 of this plan.

---

## Relationship to existing systems

| Artifact | Role in this plan |
|---|---|
| `lib/readiness.ts` | Computes score, day type, reasons, breakdown — unchanged cutoffs |
| `lib/guardrails.ts` | **Source of truth** for intensity bands and per-domain limits |
| `ScoreAudit` | Stores score + breakdown for calibration over time |
| `Reflection` | Future: tune personal cutoffs when user disagrees with band |
| AI Strategy panel | Explains and adjusts day using gear + limits + limiter/enabler |

### What already exists (reuse)

- Six score bands and guardrail rows per band
- `BAND_SUBLABEL` copy in `TodayView` (e.g. "Maintain Day · Strong")
- Today's Limits card on dashboard

### What is missing (implement when ready)

- Hero prominently shows **gear + intensity**, not gear alone
- Limiter / enabler chips derived from `readiness.reasons`
- Reflection feedback tied to **band** (not just 3-type day type)
- Optional cognitive vs physical sub-scores (design only for now)

---

## Design principles

1. **Three gears stay memorable** — don't add Push+ / Push++ labels.
2. **Intensity is dose, not a new taxonomy** — 6 bands, 2 product words (gear + intensity).
3. **Limits are the product** — training RPE, deep blocks, evening protection.
4. **Explain the bottleneck** — users act on limiters more than on score alone.
5. **Keep scoring explainable** — no black-box ML for day judgment; statistical model stays interpretable.

---

## Success criteria

- User can answer *"how hard should I go?"* without opening AI chat
- Maintain — High vs Maintain — Low feel meaningfully different in UI copy and limits
- Borderline scores (70–78) no longer feel arbitrary
- Night reflections can be tagged to band (`maintain-high`) for future calibration
- No breaking change to `ReadinessResult.dayType` or API contracts

---

## Open questions

1. **Product labels:** "High / Low" vs "Strong / Steady" within Maintain — user preference?
2. **Borderline Push (75–78):** show subtle "borderline" chip or always trust band?
3. **Two-axis readiness:** worth building before or after limiter/enabler surfacing?
4. **Personalized cutoffs:** should Push threshold move per user (e.g. 73 vs 75) based on reflections?

---

## References

- `lib/guardrails.ts` — band definitions and per-domain limits
- `lib/readiness.ts` — score composition and day type cutoffs
- `docs/readiness-accuracy-plan.md` — statistical model and phased accuracy work
- `docs/AI-PLAN.md` — coach tone and "minimum useful day" philosophy
