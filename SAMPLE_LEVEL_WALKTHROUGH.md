# Sample Level Walkthrough - Education System in Action

## Level 3: A1 Vocabulary Challenge

### Level Setup
- **Game Level**: 3 (A1 English difficulty)
- **Player Starting Health**: 3 hearts
- **Starting Movement Tokens**: 3
- **Starting Ammo**: 2 bullets
- **Enemy Count**: 5 tanks
- **Time Goal**: 3 minutes

---

## Gameplay Timeline

### T=0:00 — Level Start

**HUD Display:**
```
MOVES: [█] [█] [█]          AMMO: [●] [●]
```

**Scenario:**
- Player tank appears at bottom-center
- 5 enemy tanks spawn around edges
- Movement tokens beginning countdown (4 seconds per token)

---

### T=0:00–0:08 — First Movement Sequence

**Player Action:** Navigates up, dodging bullets, pressing directional keys

**System:** 
- First movement token consuming
- `MovementTokenSystem.update()` decrements time
- `canMove() = true` ✓ Movement allowed

**HUD Update (T=0:04):**
```
MOVES: [█] [█] [□]          AMMO: [●] [●]
```
(Token 1 expired → Token 2 active)

---

### T=0:15 — Player Attempts to Fire

**Player Action:** Presses FIRE button

**System Flow:**
```
educationManager.attemptFire()
  ├─ ammoCurrency.canFire() → true (has 2 ammo)
  ├─ ammoCurrency.attemptFire() → true
  │  └─ ammo: 2 → 1
  └─ Create Bullet ✓

HUD: AMMO: [●] [●] → [●]
```

**Result:** Bullet fires, hits enemy tank
- Enemy tank destroyed
- `educationManager.enemyDefeated()` tracked
- Performance: +1 kill

---

### T=0:18 — Second Token Expires (Movement Frozen)

**System State:**
- Tokens consumed: Move up → Move right → Move left
- Time elapsed: ~4 seconds per token
- Token count: 0/3

**Animation:**
```
PLAYER TANK: moves to position [freezes]
ENEMIES: continue attacking (not paused!)

HUD overlay appears:
═══════════════════════════════════════
    FROZEN — ANSWER TO CONTINUE
═══════════════════════════════════════

       What is a color?
       
       ├─ Blue  ✓
       ├─ Run
       └─ Jump
       
       VOCABULARY  [Timer: 3s]
```

**Event Chain:**
```typescript
movementTokens.onFrozen.notify()
  ├─ educationManager.requestQuestion('movement')
  ├─ selectQuestionForLevel(3) → A1 vocab question
  └─ questionUI.displayQuestion(question)
```

**Player State:**
- Tank frozen in place
- **Enemies continue moving and shooting** ← Critical!
- Player takes hit from enemy bullet (health: 3 → 2)
- Player sees flashing "FROZEN" warning

---

### T=0:20 — Player Answers Correctly

**Player Action:** Clicks "Blue" button

**System Flow:**
```typescript
questionUI.onAnswerSelected.notify({
  questionId: 'a1_vocab_003',
  optionId: 'opt_b',
  isCorrect: true
})

educationManager.handleAnswerSelected(true)
  ├─ feedback.trackQuestionAnswered(true)
  ├─ movementTokens.awardTokens(1)
  │  └─ tokens: 0 → 1
  ├─ ammoCurrency.awardAmmo(3)
  │  └─ ammo: 1 → 4
  └─ movementTokens.unfreeze()
```

**Visual Feedback:**
```
Green highlight on "Blue"
Fade out overlay
HUD updates:

MOVES: [█] [□] [□]          AMMO: [●] [●] [●] [●]
```

**Performance Tracked:**
- Question answered: 1
- Correct answers: 1
- Frozen time: 2 seconds
- Accuracy: 100%

---

### T=0:22 — Gameplay Resumes

**Player Tank:** Unfrozen, can move again

**Enemies:** Still attacking (no pause recovery)

**Player Action:** Moves right to dodge, then presses FIRE

**System:** 
- Has 4 ammo ✓ Can fire
- Creates bullet → Hits enemy tank
- `attemptFire()` → ammo: 4 → 3

---

### T=0:45 — Third Token Expires (Second Freeze)

**Scenario:**
- Player has moved around, firing, dodging
- Third token now expired
- Enemies alive: 3 remaining (2 destroyed)

**Question Appears:**
```
═══════════════════════════════════════
    FROZEN — ANSWER TO CONTINUE
═══════════════════════════════════════

    Complete: "I ___ a student"
    
    ├─ is
    ├─ are
    └─ am  ✓
    
    GRAMMAR  [Timer: 3s]
```

---

### T=0:47 — Player Answers WRONG

**Player Action:** Clicks "is" (incorrect choice)

**System Flow:**
```typescript
educationManager.handleAnswerSelected(false)
  ├─ feedback.trackQuestionAnswered(false)
  ├─ ammoCurrency.wrongAnswerNoAmmo()
  │  └─ ammo stays 3 (no penalty, but no award)
  └─ questionUI stays open, same question loops?
     OR next question appears
```

**Visual Feedback:**
```
Red flash on selected button
Continue animation: shake effect
Same frozen state (still frozen!)

HUD:
MOVES: [█] [□] [□]          AMMO: [●] [●] [●]
```

**Enemies:** Keep attacking during this time!
- Player takes another hit (health: 2 → 1)
- Situation getting critical

**Performance Tracked:**
- Question answered: 2
- Correct answers: 1
- Wrong answers: 1
- Accuracy: 50%

---

### T=0:50 — Second Attempt on Same Question

**Player:** Still frozen, same question or new one appears

**Player Action:** Clicks "am" (correct)

**System:**
```
movementTokens.awardTokens(1)
  └─ tokens: 1 → 2
ammoCurrency.awardAmmo(3)
  └─ ammo: 3 → 6
movementTokens.unfreeze()
```

**HUD Update:**
```
MOVES: [█] [█] [□]          AMMO: [●] [●] [●] [●] [●] [●]
```

**Performance:**
- Accuracy: 67% (2/3 correct)
- Ammo recovered
- Movement token replenished

---

### T=1:30 — Power-Up Collection

**Scenario:** Player collects "RAPID FIRE" power-up

**System Flow:**
```typescript
gameObjects.onPowerupCollected(powerup)
  └─ educationManager.powerupCollected('rapid_fire')
     ├─ selectQuestionForLevel(3) → new Q
     └─ questionUI.displayQuestion(question)
```

**Question Appears:**
```
═══════════════════════════════════════
    You found a power-up!
    Answer to activate...
═══════════════════════════════════════

    Which is a color? 🌈
    
    ├─ Run
    ├─ Red  ✓
    └─ Jump
    
    VOCABULARY  [Timer: 3s]
```

**Player Action:** Clicks "Red" → CORRECT ✓

```typescript
correctAnswer → Powerup activates
  ├─ Player gains rapid-fire ability
  ├─ Visual effect: power-up glow
  └─ Feedback: "Rapid fire activated! ⚡"
```

**Note:** If player answered wrong, powerup would disappear (no activation).

---

### T=2:30 — Low on Ammo Again

**Scenario:**
- Player fires rapidly with power-up (uses bullets fast)
- Ammo: 1 bullet remaining
- Enemy tank approaching

**Player Action:** Presses FIRE with 1 bullet

**System:**
```
attemptFire()
  ├─ canFire() → true (has 1)
  └─ Create bullet, ammo: 1 → 0
```

**Next Fire Attempt (T=2:32):**

```
attemptFire()
  ├─ canFire() → false (has 0)
  └─ requestQuestion('shooting')
```

**Question Appears:**
```
═══════════════════════════════════════
    No ammo! Answer to get bullets
═══════════════════════════════════════

    What do you use to write?
    
    ├─ Fork
    ├─ Pen  ✓
    └─ Spoon
    
    VOCABULARY  [Timer: 4s]
```

**Important:** 
- Player tank is NOT frozen (movement still works)
- Enemies NOT paused (still attacking!)
- Player must answer while evading

**Player Action:** Clicks "Pen" → CORRECT ✓

```
ammoCurrency.awardAmmo(3)
  └─ ammo: 0 → 3
Player can now fire again
```

---

### T=2:58 — Level Victory

**Scenario:**
- All enemy tanks defeated
- Player health: 1 heart remaining
- Time used: 2:58 (have 2 seconds to spare)

**System Triggers:**

```typescript
gameSceneRouter.onLevelVictory()
  ├─ educationManager.setPlayerHealth(1)
  ├─ educationManager.completeLevel()
  └─ feedback.generateFeedback()
```

---

### T=3:00 — Learning Feedback Modal

**Performance Summary:**
```
Correct answers: 5
Wrong answers: 1
Total questions: 6
Accuracy: 83%

Enemies defeated: 5
Frozen time: 12 seconds
Health remaining: 1
```

**Feedback Generated:**

```
═══════════════════════════════════════════════════════════
                    ⭐ GOOD JOB!
═══════════════════════════════════════════════════════════

Your English is sharp! Keep it up!

Destroyed 5 enemies—solid gameplay!

You survived! Excellent defense!

═══════════════════════════════════════════════════════════
Performance Rating: Silver
Earned: 950 points
═══════════════════════════════════════════════════════════

[CONTINUE →]
```

**Points Breakdown:**
- Base (Silver): 750 points
- Accuracy bonus: 83% × 5 = +415 points
- Enemy bonus: 5 × 10 = +50 points
- Survival bonus: 1 × 50 = +50 points
- **Total: 950 points**

---

## Performance Data Collected

```typescript
LevelPerformance {
  totalQuestionsAnswered: 6,
  correctAnswers: 5,
  wrongAnswers: 1,
  accuracyPercent: 83,
  timeSpentFrozen: 12000, // ms
  enemiesDefeated: 5,
  bulletsFired: 12,
  healthRemaining: 1
}
```

---

## Key Observations

### ✅ Game-First Design
- Gameplay dominated timeline (~145 seconds)
- Questions only ~15 seconds total (10% of playtime)
- Arcade flow maintained

### ✅ Strategic Pressure
- Frozen state created vulnerability (enemies attacked)
- Wrong answer forced another attempt
- Player felt consequence without harsh punishment

### ✅ Learning Happened
- 83% accuracy shows player learning vocabulary/grammar
- Answer pressure mimics game difficulty (survival tied to English)
- Spaced repetition via power-up question reinforced vocab

### ✅ Enemies Didn't Pause
- Enemies continued attacking while frozen
- Created strategic tension (answer correctly to survive)
- Discouraged careless clicking

### ✅ Difficulty Matched Level
- All questions: A1 (appropriate for Level 3)
- Time limits: 3-4 seconds (fast, manageable)
- Question types: vocabulary focus (beginner-appropriate)

---

## What Happens at Higher Levels?

### Level 7 (B1 Complexity)

**Changes:**
- More movement tokens (4 instead of 3)
- More ammo (8 instead of 5)
- Harder questions (B1 grammar, conditionals)
- Longer time limits (4-5 seconds)
- Enemy count increases

**Example Question:**
```
Complete: "If I ___ you were sick, 
           I would have helped."

├─ knew
├─ had known  ✓
└─ would know

GRAMMAR  [Timer: 5s]
```

**Difficulty Scaling:**
- More enemies = more pressure
- Harder questions = more thought needed
- Balanced by more tokens/ammo

---

## Summary Table

| Aspect | Level 3 (A1) | Level 7 (B1) |
|--------|---|---|
| Movement Tokens | 3 | 4 |
| Max Ammo | 8 | 10 |
| Enemy Count | 5 | 8-10 |
| Q. Difficulty | Vocab | Grammar |
| Time Limit | 2-3s | 4-5s |
| Expected Accuracy | 70%+ | 60%+ |

---

This walkthrough shows how the education system integrates seamlessly with arcade gameplay, creating a game-first experience with embedded learning!
