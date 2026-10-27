# Quick Reference Card - Education System API

## Core Classes

### **EducationGameManager**
Main coordinator for all education systems.

```typescript
// Initialize
const manager = new EducationGameManager({
  enableMovementTokens: true,
  enableAmmoCurrency: true,
  enablePowerUpQuestions: true,
  questionFrequency: 'moderate'
});

// Lifecycle
manager.startLevel(levelNumber)      // Initialize level
manager.update(deltaTime)            // Call each frame
manager.completeLevel()              // Called on level victory

// Movement
manager.canMove(): boolean           // Check if player can move
const tokens = manager.getMovementTokens()
const maxTokens = manager.getMaxMovementTokens()

// Shooting
manager.canFire(): boolean           // Check if player can shoot
manager.attemptFire(): boolean       // Try to fire (triggers question if no ammo)

// Tracking
manager.bulletFired(): void          // Record bullet created
manager.enemyDefeated(): void        // Record enemy defeated
manager.setPlayerHealth(hp): void    // Record health at level end

// Power-ups
manager.powerupCollected(type): void // Trigger power-up question

// Events
manager.onQuestionAnswered.addObserver((event) => {
  // event.isCorrect: boolean
  // event.question: EnglishQuestion
});

manager.onMovementFrozen.addObserver(() => { ... });
manager.onMovementUnfrozen.addObserver(() => { ... });
manager.onLevelComplete.addObserver((feedback) => {
  // feedback.title: string
  // feedback.messages: string[]
  // feedback.performanceRating: 'Bronze'|'Silver'|'Gold'|'Platinum'
  // feedback.earnedPoints: number
});
```

---

### **MovementTokenSystem**
Implements movement gating.

```typescript
// Create
const tokens = new MovementTokenSystem({
  tokensPerQuestion: 1,
  secondsPerToken: 4,
  autoRefillOnWrongAnswer: false
});

// Use in game loop
tokens.update(deltaTime);

// Check
if (tokens.canMove()) { movePlayer(); }

// Manual control
tokens.freeze()                    // Freeze movement
tokens.unfreeze()                  // Unfreeze movement
tokens.awardTokens(count)          // Award tokens
tokens.refillTokens(amount)        // Reset at level start
tokens.setMaxTokens(max)           // Increase difficulty
tokens.reset()                     // Reset system

// Read
tokens.getTokenCount(): number     // Current tokens
tokens.getMaxTokens(): number      // Max tokens
tokens.isFrozen(): boolean         // Is currently frozen

// Events
tokens.onTokensChanged.addObserver((tokenCount) => { ... });
tokens.onFrozen.addObserver(() => { ... });
tokens.onUnfrozen.addObserver(() => { ... });
```

---

### **AmmoCurrencySystem**
Implements ammo/shooting gating.

```typescript
// Create
const ammo = new AmmoCurrencySystem({
  ammoPerCorrectAnswer: 3,
  maxAmmo: 10,
  autoRefillOnWrongAnswer: false
});

// Use
if (ammo.canFire()) { fireWeapon(); }
if (ammo.attemptFire()) {
  // Successful shot (ammo -= 1)
} else {
  // No ammo (question triggered by manager)
}

// Manual control
ammo.awardAmmo(count)             // Award bullets
ammo.wrongAnswerNoAmmo()          // Called on wrong answer
ammo.refillAmmo(amount)           // Reset at level start
ammo.setMaxAmmo(max)              // Increase difficulty
ammo.reset()                      // Reset system

// Read
ammo.getAmmo(): number            // Current ammo
ammo.getMaxAmmo(): number         // Max ammo

// Events
ammo.onAmmoChanged.addObserver((count) => { ... });
ammo.onAmmoEmpty.addObserver(() => { ... });
```

---

### **QuestionUIController**
Renders and manages question pop-ups.

```typescript
// Create
const questionUI = new QuestionUIController({
  displayDuration: 5000,
  fadeInDuration: 300,
  fadeOutDuration: 300
});

// Use in game loop
questionUI.update(deltaTime);

// Show/hide
questionUI.displayQuestion(question: EnglishQuestion)
questionUI.hideQuestion(wasCorrect: boolean)

// Manual selection (usually triggered by user click)
questionUI.selectAnswer(optionId: string)

// Status
questionUI.isQuestionDisplayed(): boolean
questionUI.getCurrentQuestion(): EnglishQuestion | null

// Cleanup
questionUI.clear()

// Events
questionUI.onQuestionDisplayed.addObserver((question) => { ... });
questionUI.onAnswerSelected.addObserver((event) => {
  // event.questionId: string
  // event.optionId: string
  // event.isCorrect: boolean
});
questionUI.onQuestionHidden.addObserver(() => { ... });
```

---

### **LearningFeedbackSystem**
Tracks performance and generates feedback.

```typescript
// Create
const feedback = new LearningFeedbackSystem();

// Track during gameplay
feedback.trackQuestionAnswered(isCorrect: boolean)
feedback.trackFrozenTime(seconds: number)
feedback.trackEnemyDefeated()
feedback.trackBulletFired()
feedback.setHealthRemaining(health: number)

// Generate at level end
const levelFeedback = feedback.generateFeedback()
// Returns LevelFeedback with:
// - title: string ('💪 Nice Work!', etc)
// - messages: string[] (performance messages)
// - performanceRating: 'Bronze'|'Silver'|'Gold'|'Platinum'
// - earnedPoints: number

// Access raw data
const perf = feedback.getPerformance()
// Returns LevelPerformance with:
// - totalQuestionsAnswered: number
// - correctAnswers: number
// - wrongAnswers: number
// - accuracyPercent: number
// - timeSpentFrozen: number
// - enemiesDefeated: number
// - bulletsFired: number
// - healthRemaining: number

// Reset
feedback.reset()

// Events
feedback.onLevelComplete.addObserver((feedback) => { ... });
```

---

### **EnglishQuestion** (Data Type)
```typescript
interface EnglishQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'word_matching' | 'grammar_correction';
  prompt: string;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
  }[];
  category: 'vocabulary' | 'grammar' | 'comprehension' | 'phrasal_verbs';
  level: 'A1' | 'A2' | 'B1' | 'B2';
  explanation?: string;
  timeLimit: number; // seconds
}
```

---

## Integration Patterns

### Pattern 1: Movement Gating
```typescript
// In PlayerTankBehavior.update()
if (educationManager.canMove()) {
  if (inputManager.isPressed(InputControl.MoveUp)) {
    tank.move(Direction.Up);
  }
  // ... other directions
}
```

### Pattern 2: Shooting Gating
```typescript
// In PlayerTankBehavior.update()
if (inputManager.isPressed(InputControl.Fire)) {
  if (educationManager.attemptFire()) {
    tank.fire();
  }
  // If false, question was triggered automatically
}
```

### Pattern 3: Power-Up Questions
```typescript
// In PowerupScript or collision handler
educationManager.powerupCollected(powerupType);

educationManager.onQuestionAnswered.addObserver((event) => {
  if (event.isCorrect) {
    powerup.activate();
  } else {
    powerup.deactivate();
  }
}, { once: true });
```

### Pattern 4: Enemy Defeat Tracking
```typescript
// When enemy is destroyed
educationManager.enemyDefeated();
```

### Pattern 5: Level Completion
```typescript
// On level victory
educationManager.setPlayerHealth(remainingHealth);
educationManager.completeLevel();

educationManager.onLevelComplete.addObserver((feedback) => {
  showFeedbackModal(feedback);
  goToNextLevel();
});
```

---

## Difficulty By Level Quick Guide

| Level | Movement | Ammo | Question | Enemy | Notes |
|-------|----------|------|----------|-------|-------|
| 1-3   | 3 tokens | 5    | A1 (2-3s) | 5    | Basics |
| 4-6   | 4 tokens | 8    | A2 (3-4s) | 6-8  | Past tense |
| 7-9   | 4 tokens | 10   | B1 (4-5s) | 8-10 | Phrasal verbs |
| 10+   | 5 tokens | 15   | B2 (5s+)  | 10+  | Complex grammar |

---

## Common Integration Points

### In main.ts
```typescript
const educationManager = new EducationGameManager({...});

gameLoop.onTick.subscribe((deltaTime) => {
  educationManager.update(deltaTime);
});
```

### In GameSceneRouter
```typescript
sceneRouter.onLevelStart.subscribe((levelNum) => {
  educationManager.startLevel(levelNum);
});

sceneRouter.onLevelVictory.subscribe(() => {
  educationManager.completeLevel();
  showFeedback(educationManager.getLatestFeedback());
});
```

### In HUD Renderer
```typescript
function drawEducationHUD(ctx: CanvasRenderingContext2D) {
  const tokens = educationManager.getMovementTokens();
  const maxTokens = educationManager.getMaxMovementTokens();
  const ammo = educationManager.getAmmo();
  const maxAmmo = educationManager.getMaxAmmo();
  
  renderTokenBar(ctx, tokens, maxTokens);
  renderAmmoBar(ctx, ammo, maxAmmo);
}
```

---

## Question Selection
```typescript
import { selectQuestionForLevel } from './education';

// Get appropriate question for current level
const question = selectQuestionForLevel(currentLevel);
// Returns: EnglishQuestion

// Levels 1-3: A1 questions
// Levels 4-6: A2 questions
// Levels 7-9: B1 questions
// Levels 10+: B2 questions
```

---

## Event Flow Diagram

```
Game Start
  ↓
educationManager.startLevel(1)
  ├─ movementTokens.refillTokens(3)
  ├─ ammoCurrency.refillAmmo(5)
  └─ feedback.reset()
  ↓
Game Loop Every Frame
  ↓
educationManager.update(deltaTime)
  ├─ movementTokens.update(deltaTime)
  ├─ questionUI.update(deltaTime)
  └─ Check: canMove(), attemptFire()
  ↓
Player Actions
  ├─ Move → canMove()? → If no: freeze
  └─ Fire → canFire()? → If no: show question UI
  ↓
Question Answered
  ├─ onAnswerSelected event
  ├─ awardTokens() OR wrongAnswerNoAmmo()
  └─ Continue gameplay
  ↓
Level Complete
  ↓
educationManager.completeLevel()
  ├─ generateFeedback()
  └─ onLevelComplete event → Show modal
  ↓
Next Level
```

---

## Troubleshooting

**Q: Movement is always frozen**
- Check: `educationManager.startLevel()` was called
- Verify: `movementTokens.refillTokens()` runs on level start

**Q: Fire works even without ammo**
- Check: `attemptFire()` is called (not just `canFire()`)
- Verify: Return value is used to gate Bullet creation

**Q: Questions don't appear**
- Check: `educationManager.update()` is called in game loop
- Verify: Movement/ammo systems are enabled in config

**Q: Feedback has wrong accuracy**
- Verify: `trackQuestionAnswered()` called BEFORE answer reward
- Check: Only correct answers increment `correctAnswers`

**Q: Enemies pause during frozen**
- This is WRONG! Check your enemy update code
- Enemies should only respond to freeze freeze via visual indicator, not game logic pause

---

## Performance Notes

- **Movement Token System**: O(1) per frame
- **Ammo System**: O(1) per frame  
- **Question UI**: One-time DOM creation, CSS animations
- **Feedback**: O(n) where n = number of tracked metrics (typically 8)
- **Total Overhead**: <1ms per frame at 60 FPS

No impact on game performance.

---

## File Structure
```
src/education/
  ├─ EnglishQuestion.ts        (Questions + bank)
  ├─ MovementTokenSystem.ts    (Movement gating)
  ├─ AmmoCurrencySystem.ts     (Ammo gating)
  ├─ QuestionUIController.ts   (Question UI)
  ├─ LearningFeedback.ts       (Feedback/tracking)
  ├─ EducationGameManager.ts   (Coordinator)
  └─ index.ts                  (Exports)
```

---

## Import Statement
```typescript
import {
  EducationGameManager,
  MovementTokenSystem,
  AmmoCurrencySystem,
  QuestionUIController,
  LearningFeedbackSystem,
  selectQuestionForLevel,
  EnglishQuestion,
  QuestionType
} from './education';
```

---

**All 6 systems in one place. Start with EducationGameManager, everything else is handled internally!**
