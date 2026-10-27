# Battle City English Learning Game - Design Document

## System Overview

The educational layer adds English-learning mechanics to Battle City while **preserving all original gameplay mechanics**. The system is modular and can be toggled on/off via configuration.

### Core Principles
✅ **Game First** — Arcade gameplay remains primary; education is embedded, not interrupting
✅ **Non-Punitive** — Wrong answers cause strategic pressure, not instant failure
✅ **Fast Interactions** — Questions take 2-5 seconds (multiple choice, true/false, word matching)
✅ **Difficulty Scaling** — Question difficulty increases with game level (A1→A2→B1→B2)
✅ **Enemies Don't Pause** — Only the player tank freezes; enemies continue attacking normally

---

## Architecture

### 1. **EnglishQuestion.ts**
Data structure for English questions with type definitions and a question bank.

**Key Classes:**
- `EnglishQuestion` — Question data (prompt, options, category, difficulty level, time limit)
- `selectQuestionForLevel()` — Picks appropriate question based on game level

**Question Types:**
- Multiple Choice (primary)
- True/False (fast)
- Word Matching
- Grammar Correction

**Difficulty Levels:**
- **A1** (Levels 1-3): Basic vocabulary, present tense
- **A2** (Levels 4-6): Everyday objects/actions, simple past
- **B1** (Levels 7-9): Complex grammar, phrasal verbs
- **B2** (Levels 10+): Advanced vocabulary, conditionals

---

### 2. **MovementTokenSystem.ts**
Implements movement gating via tokens.

**How It Works:**
1. Player gets `N` tokens at level start (increases with difficulty)
2. Each token allows ~4 seconds of free movement
3. When tokens expire, player tank freezes
4. A question appears (non-skippable)
5. Correct answer → 1 token awarded + movement unfrozen
6. Wrong answer → No token, must answer again
7. Enemies **continue moving and shooting** while player is frozen

**Key Methods:**
```typescript
canMove(): boolean                    // Check if movement is allowed
freeze(): void                        // Freeze player (trigger question)
awardTokens(count): void             // Award tokens (called on correct answer)
update(deltaTime): void              // Called each frame to consume tokens
```

**Configuration:**
```typescript
{
  tokensPerQuestion: 1,              // Tokens awarded per correct answer
  secondsPerToken: 4,                // How long each token lasts
  autoRefillOnWrongAnswer: false     // No free tokens on wrong answer
}
```

---

### 3. **AmmoCurrencySystem.ts**
Implements shooting/ammo gating.

**How It Works:**
1. Player starts with limited/zero ammo
2. Correct answer to question → bullets added
3. Wrong answer → no ammo awarded (but no freeze)
4. Pressing fire with no ammo triggers a question pop-up
5. Enemies are **NOT paused** during ammo question

**Key Methods:**
```typescript
canFire(): boolean                           // Check if ammo available
attemptFire(): boolean                       // Try to fire (consumes ammo)
awardAmmo(count): void                      // Award bullets (on correct answer)
wrongAnswerNoAmmo(): void                   // Called on wrong answer (no penalty)
```

**Configuration:**
```typescript
{
  ammoPerCorrectAnswer: 3,          // Bullets per correct answer
  maxAmmo: 10,                       // Max bullets per level (increases with difficulty)
  autoRefillOnWrongAnswer: false    // No free ammo on wrong answer
}
```

---

### 4. **QuestionUIController.ts**
Renders question pop-ups with interactive options.

**Features:**
- Easy-to-tap buttons (2-5 option choices)
- Color-coded timer (green → yellow → red)
- Auto-timeout if no selection
- Visual feedback on selection (green highlight)
- Category badge (vocabulary, grammar, etc.)

**Responsive Design:**
- Centered overlay on canvas
- Mobile-friendly tap targets
- Smooth fade in/out animations

**Example Rendering:**
```
┌─────────────────────────────┐
│  [TIMER]                    │
│                             │
│   What is this? 🐱          │
│                             │
│  ✓ Cat                      │
│    Dog                      │
│    Bird                     │
│                             │
│  [VOCABULARY]               │
└─────────────────────────────┘
```

---

### 5. **LearningFeedbackSystem.ts**
Tracks performance and generates end-of-level arcade-style feedback.

**Tracks:**
- Total questions answered
- Correct/wrong answer ratio
- Time spent frozen (waiting for questions)
- Enemies defeated
- Bullets fired
- Health remaining

**Performance Ratings:**
- **Bronze** (60-74%): "Nice Work!"
- **Silver** (75-89%): "Good Job!"
- **Gold** (90%+): "Excellent!"
- **Platinum** (Perfect): "Perfect Run!"

**Arcade Tone Messages:**
- Accuracy-based: "Your English is sharp! Keep it up!"
- Combat-based: "Destroyed 18 enemies—dominator!"
- Survival-based: "You survived! Excellent defense!"
- Speed bonus: "Lightning-fast answers! ⚡"

**Points System:**
- Base points: 500-1500 (by performance rating)
- Accuracy bonus: +5 points per accuracy %
- Enemy bonus: +10 points per enemy
- Survival bonus: +50 × health remaining

---

### 6. **EducationGameManager.ts**
Central coordinator that ties all systems together.

**Responsibilities:**
- Initializes sub-systems at level start
- Routes questions from tokens/ammo/powerups
- Tracks performance and level completion
- Adjusts difficulty based on level number

**Key Methods:**
```typescript
startLevel(levelNumber): void           // Initialize new level
update(deltaTime): void                 // Update all systems
canMove(): boolean                      // Check movement availability
attemptFire(): boolean                  // Check ammo, trigger question if needed
powerupCollected(type): void            // Trigger powerup question
enemyDefeated(): void                   // Track kill
completeLevel(): void                   // End level, generate feedback
```

**Events:**
```typescript
onQuestionAnswered          // Emits when question answered
onMovementFrozen            // Emits when freeze occurs
onMovementUnfrozen          // Emits when player unfrozen
onLevelComplete             // Emits with LevelFeedback
```

---

## Integration Points

### 1. **In PlayerTankBehavior**
```typescript
// Before allowing movement:
if (!educationManager.canMove()) {
  return; // Movement blocked, wait for question
}

// Track movement as normal
tank.move(...);
```

### 2. **In Tank.fire() or Bullet Creation**
```typescript
// Before creating a bullet:
if (!educationManager.attemptFire()) {
  return; // No ammo, question triggered
}

// Fire normally
new Bullet(...);
```

### 3. **In PowerupScript**
```typescript
// When powerup is picked up:
public onPowerupPicked(powerup: Powerup) {
  // Trigger a quick question
  educationManager.powerupCollected(powerup.type);
  
  // Question must be answered before powerup activates
  // See questionUI delay logic
}
```

### 4. **In Game Loop (main.ts or GameLoop)**
```typescript
// Every frame:
educationManager.update(deltaTime);

// When level complete:
gameSceneRouter.on('levelComplete', () => {
  educationManager.completeLevel();
  // Show feedback modal with performance data
});
```

### 5. **UI Layer (HUD)**
```typescript
// Display current status:
movementTokens: [■ ■ □]    // 2/3 tokens remaining
ammo: [● ● ●]              // 3 bullets

// Show when frozen:
"Answer to continue..."
```

---

## Difficulty Progression

### By Level
| Level | Movement Tokens | Max Ammo | Question Level | Notes |
|-------|-----------------|----------|---|---|
| 1-3   | 3               | 5        | A1 | Basics, short time limits |
| 4-6   | 4               | 8        | A2 | Compound sentences, past tense |
| 7-9   | 4               | 10       | B1 | Phrasal verbs, conditionals |
| 10+   | 5               | 15       | B2 | Advanced vocab, complex grammar |

### Time Limits
- **A1/A2**: 2-4 seconds (fast!)
- **B1**: 4-5 seconds (slightly harder questions)
- **B2**: 5+ seconds (more complex)

---

## Flow Diagrams

### Movement Token Flow
```
Start Level
    ↓
Player has N tokens
    ↓
    └─→ MOVING → Tokens countdown
            ↓
        Tokens = 0?
            ↓
          YES → FROZEN
                  ↓
              Question shown
                  ↓
              Answer?
                  ↓
          Correct → Unfreeze + 1 token → MOVING
          Wrong   → Stay frozen, show question again
```

### Ammo and Shooting Flow
```
Player presses FIRE
    ↓
Has ammo?
    ├─→ YES → Bullets minus 1 → Create bullet → CONTINUES
    │
    └─→ NO → Question shown
            ↓
        Answer?
            ├─→ Correct → Award ammo → Can now fire
            └─→ Wrong   → No ammo, must answer again
```

### Power-Up Question Flow
```
Player collides with powerup
    ↓
Question appears
    ↓
Answer?
    ├─→ Correct → Powerup activates + visual feedback
    └─→ Wrong   → Powerup disappears, no activation
```

---

## Configurable Options

```typescript
const educationConfig = {
  enableMovementTokens: true,        // Enable movement gating
  enableAmmoCurrency: true,          // Enable ammo gating
  enablePowerUpQuestions: true,      // Questions on powerup collection
  questionFrequency: 'moderate'      // 'frequent', 'moderate', 'sparse'
};
```

---

## Design Rationale: Why This Maintains Arcade Flow

1. **Questions Are Brief** (2-5 seconds)
   - Not interrupting gameplay long
   - Keeps tension high

2. **Enemies Don't Pause**
   - Creates strategic pressure: when frozen, you're vulnerable
   - Incentivizes correct answers (faster unfreezing = survival)
   - Maintains arcade difficulty

3. **Wrong Answers Don't Punish Harshly**
   - Movement: stay frozen, answer again (learning happens through consequence)
   - Ammo: must answer to get bullets (tension, not punishment)
   - No health loss or game over for wrong answers

4. **Difficulty Scales with Progression**
   - Early levels: simple, forgiving (build confidence)
   - Later levels: complex questions, fewer tokens (skill requirement)

5. **UI Is Minimal**
   - Clean overlays, single-tap responses
   - No typing, no long text input
   - Matches arcade aesthetic

---

## Next Steps for Implementation

1. **Add EducationGameManager to main.ts**
   ```typescript
   const educationManager = new EducationGameManager({
     enableMovementTokens: true,
     enableAmmoCurrency: true,
     enablePowerUpQuestions: true
   });
   ```

2. **Hook into game loop**
   ```typescript
   gameLoop.on('tick', (delta) => educationManager.update(delta));
   ```

3. **Modify PlayerTankBehavior**
   - Add movement gating check
   - Track fire attempts

4. **Create HUD display** for tokens and ammo

5. **Add level completion handler** to show feedback modal

6. **Test with sample levels** (1, 5, 10, 20) to verify difficulty progression

---

## Example Session

**Level 3 (A1, Vocabulary)**

```
Player starts with: 3 movement tokens, 5 ammo

[Gameplay continues... player defeats 8 enemies]

Movement tokens nearly empty → Frozen → Question appears:
  "What is this? 🐱"
  ✓ Cat
    Dog
    Bird
  [TIMER: 3s]

Player taps "Cat" → CORRECT!
  → +1 token (now 1/3)
  → Movement unfrozen
  → Enemies still attacking!

Player continues gameplay...

[Later] Press FIRE with 0 ammo → Question appears:
  "Complete: I ___ a student"
  ✓ am
    is
    are
  [TIMER: 3s]

Player taps "am" → CORRECT!
  → +3 ammo
  → Can now fire

[Level Complete]
  ═══════════════════════════════════════
  ⭐ GOOD JOB!
  ═══════════════════════════════════════
  Your English is sharp! Keep it up!
  Destroyed 12 enemies—solid gameplay!
  You survived! Excellent defense!
  
  Accuracy: 75%
  Earned: 850 points
  ═══════════════════════════════════════
```

---

## Performance Considerations

- **Question rendering**: One-time DOM creation, minimal reflow
- **Timer updates**: CSS animation (GPU-accelerated)
- **System updates**: Called once per frame (60 FPS), O(1) operations
- **Question selection**: Random from filtered array, O(1)
- **Memory**: Minimal overhead (<1MB for question bank + UI)

No impact on game frame rate with proper implementation.
