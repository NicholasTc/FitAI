# FitAI AI Plan

## 1. Purpose

FitAI uses AI to help users decide the smartest level of effort for the day.

The goal is not to tell users to “grind harder” or “do nothing.” The goal is to help users stay consistently productive without overpushing into burnout, sickness, or multi-day crashes.

FitAI should help users answer:

* Should I push today?
* Should I maintain a moderate pace?
* Should I recover while still making the day useful?
* What should I prioritize?
* What should I reduce, move, or replace?
* How can I protect tomorrow’s energy?

The core product philosophy is:

> FitAI helps users preserve momentum while protecting recovery.

---

## 2. AI Feature Direction

The first AI feature should be a fixed coach panel, not a freeform chatbot.

The AI should appear as a focused section inside the Today dashboard, likely called:

## Today’s Strategy

This panel should have three main actions:

1. Explain
2. Adjust Day
3. Protect Tomorrow

The AI should feel integrated into the product workflow, not like a separate generic assistant.

---

## 3. Productive Recovery Concept

FitAI should avoid two bad extremes:

### Extreme 1: Overpush

The user ignores recovery signals, forces heavy studying/workout/work, then crashes or gets sick for several days.

### Extreme 2: Underuse the Day

The user assumes they must completely rest, loses momentum, and feels guilty or behind.

FitAI should guide the user toward a middle path:

> Make today useful, but do not create recovery debt.

This is especially important for users who cannot afford to completely rest because they have school, work, deadlines, job applications, personal projects, workouts, errands, or life responsibilities.

---

## 4. AI System Layers

FitAI should use three layers.

### Layer 1: Data Layer

This collects the user’s raw daily signals.

Potential data includes:

* Sleep duration
* Sleep average
* Resting heart rate
* Resting heart rate baseline
* HRV status
* Energy check-in
* Stress check-in
* Motivation check-in
* Workload level
* Soreness or fatigue
* Big deadline status
* Workout yesterday status
* Planned tasks
* Past history
* Reflection feedback

This layer answers:

> What is happening with the user today?

---

### Layer 2: Decision Logic Layer

This layer should be normal deterministic code, not AI.

It calculates the user’s daily status:

* Push Day
* Maintain Day
* Recover Day

It should also calculate a readiness score and identify the major positive and limiting signals.

Example:

* Low sleep lowers readiness
* Low stress improves readiness
* Lower resting HR improves readiness
* High workload lowers capacity
* High motivation improves ability to push
* High soreness lowers workout intensity recommendation

This layer answers:

> What is the user’s current state?

This layer must be predictable, explainable, and debuggable.

AI should not be the main calculator for Push / Maintain / Recover.

---

### Layer 3: AI Coach Layer

This layer receives structured data from the app and converts it into useful guidance.

The AI should not randomly decide the user’s health state. It should use the deterministic status and explain what to do next.

Example AI input:

```json
{
  "status": "Maintain Day",
  "readiness": 68,
  "sleep": "3h 44m",
  "averageSleep": "7h 17m",
  "restingHR": 63,
  "averageRestingHR": 67,
  "hrv": "processing",
  "energy": 5,
  "stress": 1,
  "motivation": 8,
  "workload": "moderate",
  "goal": "stay productive without crashing",
  "plannedTasks": [
    "Database final review",
    "Heavy gym session",
    "FitAI coding task"
  ]
}
```

Example AI output:

> Today is a Maintain Day, not a full rest day. Your sleep is well below average, which limits recovery, but your stress is low and resting heart rate is better than baseline. You can still make progress, but avoid stacking multiple hard tasks. Prioritize one important study block, keep your workout light, and move the most demanding coding work to another day.

This layer answers:

> What should the user actually do with this information?

---

## 5. AI Panel Actions

### 5.1 Explain

Purpose:

> Explain why the user received Push, Maintain, or Recover.

The response should summarize:

* Main reason for today’s status
* Positive signals
* Limiting signals
* Missing or uncertain data
* Confidence level

Example:

> You are in Maintain mode because your signals are mixed. Your sleep was much lower than your average, which limits recovery. However, your stress is low, motivation is high, and resting heart rate is better than usual. This suggests you can still handle one important focused task, but today is not ideal for stacking deep work and a heavy workout.

---

### 5.2 Adjust Day

Purpose:

> Convert the user’s recovery state into practical priority guidance.

This is the most important AI feature.

The AI should infer task difficulty automatically from task names and context to reduce cognitive load.

The user should not need to manually label tasks as hard, medium, or easy.

The AI should categorize tasks into guidance such as:

* Keep
* Reduce
* Move
* Replace
* Do first
* Avoid today

Example:

```txt
Keep:
- Database final review

Reduce:
- FitAI coding task → focus only on UI polish, not complex backend work

Move:
- Heavy gym session → move to tomorrow or replace with light mobility

Replace:
- Long deep work session → one focused 60–90 minute block
```

The app should provide priority guidance first, not a detailed hourly schedule.

Future versions can include calendar-based scheduling, but the MVP should focus on practical prioritization.

---

### 5.3 Protect Tomorrow

Purpose:

> Help the user avoid sacrificing the next few days for short-term productivity.

This feature should suggest recovery-aware actions that maintain momentum.

Example:

> Your biggest risk today is sleep debt. Protect tomorrow by setting a hard stop tonight, avoiding intense exercise late, and finishing only your highest-priority task. The goal is not maximum output today. The goal is to stay functional and consistent tomorrow.

The advice should focus on:

* Sleep protection
* Reducing late-night intensity
* Avoiding unnecessary overload
* Choosing a minimum effective workload
* Maintaining consistency

---

## 6. Recover Day Behavior

Recover Day should not mean “do nothing” by default.

FitAI should include a concept called:

## Minimum Useful Day

When the user is in Recover mode, the AI should recommend 1–3 low-energy tasks that preserve momentum without adding too much strain.

Example:

> Today should be a Minimum Useful Day. Do one essential task, one light maintenance task, and one recovery action. Avoid heavy workouts, complex coding, and unnecessary commitments.

Example Recover Day output:

```txt
Minimum Useful Day:
1. Complete the one task that would reduce the most stress.
2. Do 20–30 minutes of light review or admin work.
3. Take a walk, hydrate, and create an earlier sleep window.
```

Recover Day should feel encouraging, not discouraging.

The message should be:

> You are not failing today. You are protecting your ability to show up tomorrow.

---

## 7. Tone and Personality

The AI should sound:

* Supportive
* Realistic
* Encouraging
* Calm
* Clear
* Slightly firm when needed

The AI should not sound:

* Overly soft
* Harsh
* Medical
* Robotic
* Generic
* Motivational-speaker-like
* Overconfident

Preferred tone:

> You can still make today useful, but do not spend your limited energy on low-priority tasks. One focused block is enough to maintain momentum.

Avoid tone like:

> You are exhausted. Stop everything.

Avoid tone like:

> Push through. No excuses.

The ideal voice is:

> supportive + realistic + encouraging.

---

## 8. Medical and Safety Boundaries

FitAI must not make medical claims.

The AI should not diagnose, treat, or claim certainty about health conditions.

Avoid phrases like:

* You are sick
* You have burnout
* Your HRV means you are unhealthy
* This heart rate means something is wrong
* You medically need rest

Use safer phrases like:

* This may suggest
* Based on available signals
* For productivity planning
* A lighter day may be safer
* Your recovery signals are limited today
* Consider seeking medical advice if symptoms are severe or persistent

FitAI should be framed as lifestyle and productivity guidance, not medical advice.

---

## 9. AI Output Structure

AI responses should be slightly longer than a tiny card, but still UI-friendly.

The output should feel like a mini coach explanation.

Recommended structure:

```json
{
  "title": "Maintain momentum, avoid overload",
  "summary": "Today is useful, but not a day to stack hard efforts.",
  "reasoning": [
    "Sleep was far below your average, which limits recovery.",
    "Stress is low, so you still have mental headroom.",
    "Resting HR is better than baseline, which supports a moderate day."
  ],
  "recommendedFocus": "Do one important focused block first.",
  "adjustments": {
    "keep": ["Database final review"],
    "reduce": ["FitAI coding task"],
    "move": ["Heavy gym session"],
    "replace": ["Complex backend work with UI polish or light review"]
  },
  "avoid": [
    "Stacking deep work and intense gym on the same day",
    "Starting a difficult task late at night"
  ],
  "protectTomorrow": [
    "Set a hard stop tonight",
    "Keep workout light",
    "Prioritize sleep recovery"
  ],
  "confidence": "Medium",
  "disclaimer": "This is productivity guidance based on available signals, not medical advice."
}
```

The UI can display this as beautiful cards instead of raw text.

---

## 10. UI Expectations

The AI feature should have beautiful UI.

It should not look like a basic chatbot box.

The AI panel should feel like a premium product feature.

Possible UI components:

* Segmented control: Explain / Adjust Day / Protect Tomorrow
* Main coach card with title and summary
* Reasoning bullets with signal badges
* Keep / Reduce / Move / Replace cards
* Confidence indicator
* Soft recommendation chips
* “Regenerate” or “Update with new check-in” button
* Light, calm, polished visual style

The AI should be embedded inside the Today page and feel connected to the user’s readiness score.

---

## 11. MVP AI Scope

The first AI version should include:

* Fixed AI panel on Today page
* Three buttons: Explain, Adjust Day, Protect Tomorrow
* AI uses existing health/check-in data
* AI can use manually entered tasks
* AI infers task difficulty automatically
* AI outputs structured JSON
* UI displays output in clean cards
* No freeform chatbot yet
* No calendar integration yet
* No full scheduling yet
* No medical claims

---

## 12. Later AI Features

Future versions can add:

* Freeform follow-up questions
* Calendar integration
* Todo/task integration
* Automatic task rescheduling
* Job application / life admin planning
* Weekly pattern insights
* Personalized baselines
* AI learning from night reflections
* More advanced recovery-risk prediction
* Wearable data integration from Fitbit, Apple Health, or Google Fit

These should come later after the fixed AI panel feels useful.

---

## 13. Core Product Principle

FitAI should not answer:

> Am I healthy?

FitAI should answer:

> What is the smartest level of effort today?

The AI exists to translate recovery signals into practical daily decisions.

The strongest product promise is:

> FitAI helps you stay consistent by choosing the right amount of effort for today.
