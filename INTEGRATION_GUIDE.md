# Integration Guide - Adding Education Systems to Battle City

This guide shows how to integrate the English-learning systems into the existing Battle City codebase with minimal changes.

---

## Step 1: Initialize Education Manager in main.ts

**Location**: `src/main.ts` (after other managers are created)

```typescript
import { EducationGameManager } from './education';

// After GameStorage and other managers:
const educationManager = new EducationGameManager({
  enableMovementTokens: true,
  enableAmmoCurrency: true,
  enablePowerUpQuestions: true,
  questionFrequency: 'moderate'
});

// Add to game loop update:
gameLoop.onTick.addObserver((deltaTime: number) => {
  // ... existing updates ...
  
  educationManager.update(deltaTime);
});
```

---

## Step 2: Hook Movement Gating into PlayerTankBehavior

**File**: `src/gameObjects/tank/player/PlayerTankBehavior.ts`

### Before Movement Update:
```typescript
export class PlayerTankBehavior {
  private educationManager: EducationGameManager;

  constructor(educationManager: EducationGameManager) {
    this.educationManager = educationManager;
  }

  public update(updateArgs: GameUpdateArgs): void {
    const inputManager = updateArgs.inputManager;

    // ... rotation logic ...

    // MOVEMENT GATING: Check if player can move
    if (educationManager.canMove()) {
      if (inputManager.isPressed(InputControl.MoveUp)) {
        this.tank.move(Direction.Up);
      } else if (inputManager.isPressed(InputControl.MoveDown)) {
        this.tank.move(Direction.Down);
      } else if (inputManager.isPressed(InputControl.MoveLeft)) {
        this.tank.move(Direction.Left);
      } else if (inputManager.isPressed(InputControl.MoveRight)) {
        this.tank.move(Direction.Right);
      } else {
        this.tank.idle();
      }
    } else {
      // Movement frozen (question is displayed)
      this.tank.idle();
    }
  }
}
```

---

## Step 3: Hook Shooting Gating into Tank.ts or Fire Method

**File**: `src/gameObjects/tank/Tank.ts` or `src/gameObjects/tank/player/PlayerTankBehavior.ts`

### Option A: Intercept Fire Call
```typescript
export class PlayerTankBehavior {
  public update(updateArgs: GameUpdateArgs): void {
    // ... movement code ...

    // FIRING: Check ammo before attempting to fire
    if (inputManager.isPressed(InputControl.Fire)) {
      if (this.educationManager.attemptFire()) {
        // Fire successful (ammo available)
        this.tank.fire();
      }
      // If attemptFire() returns false, a question was triggered
      // Player must answer to get ammo
    }
  }
}
```

### Option B: Modify Tank.fire() Method (Alternative)
```typescript
export class Tank {
  public fire(updateArgs: GameUpdateArgs): void {
    // Check ammo via education manager
    if (!educationManager.canFire()) {
      // Trigger question
      educationManager.attemptFire(); // Returns false, shows question
      return;
    }

    // Consume ammo
    educationManager.bulletFired();

    // Create bullet as normal
    const bullet = new Bullet({
      position: this.getFirePosition(),
      direction: this.direction,
      speed: 150
    });
    updateArgs.gameObjects.push(bullet);
  }
}
```

---

## Step 4: Hook Power-Up Questions

**File**: `src/gameObjects/modals/PowerupScript.ts` or relevant powerup handler

```typescript
export class PowerupScript extends Script {
  private educationManager: EducationGameManager;

  constructor(educationManager: EducationGameManager) {
    super();
    this.educationManager = educationManager;
  }

  public onPowerupCollected(powerup: Powerup, player: PlayerTank): void {
    // Trigger question before powerup activates
    this.educationManager.powerupCollected(powerup.type);

    // Question answered → powerup activates in callback
    this.educationManager.onQuestionAnswered.addObserver(
      (event) => {
        if (event.isCorrect) {
          // Apply powerup
          player.applyPowerup(powerup.type);
          powerup.deactivate();
        } else {
          // Powerup disappears (no activation)
          powerup.deactivate();
        }
      },
      { once: true } // Only subscribe once
    );
  }
}
```

---

## Step 5: Track Enemy Defeats

**File**: `src/gameObjects/EnemyTank.ts` or `src/gameObjects/modals/EnemyScript.ts`

```typescript
export class EnemyScript extends Script {
  private educationManager: EducationGameManager;

  public onEnemyDefeated(enemy: EnemyTank): void {
    // Track for learning feedback
    this.educationManager.enemyDefeated();

    // Continue with normal enemy death logic
    // (explosion, score update, etc.)
  }
}
```

---

## Step 6: Handle Level Progression

**File**: `src/scenes/LevelPlayScene.ts` or game state manager

```typescript
export class LevelPlayScene {
  private educationManager: EducationGameManager;

  public startLevel(levelNumber: number): void {
    // Initialize education systems for this level
    this.educationManager.startLevel(levelNumber);

    // Start gameplay as normal
    this.setupLevel(levelNumber);
  }

  public onLevelVictory(): void {
    // Track final health and complete level
    const playerHealth = this.getPlayerHealth();
    this.educationManager.setPlayerHealth(playerHealth);
    this.educationManager.completeLevel();

    // Show feedback modal
    const feedback = await this.getLatestFeedback();
    this.showLearningFeedbackModal(feedback);

    // Transition to next level or menu
  }
}
```

---

## Step 7: Create HUD Display for Tokens & Ammo

**File**: `src/core/GameRenderer.ts` or create new `EducationHUDRenderer.ts`

```typescript
export class EducationHUDRenderer {
  private educationManager: EducationGameManager;
  private canvas: HTMLCanvasElement;

  public render(ctx: CanvasRenderingContext2D): void {
    const tokens = this.educationManager.getMovementTokens();
    const maxTokens = this.educationManager.getMaxMovementTokens();
    const ammo = this.educationManager.getAmmo();
    const maxAmmo = this.educationManager.getMaxAmmo();

    // Draw tokens (top-left)
    const tokenX = 10;
    const tokenY = 10;
    ctx.fillStyle = '#FFC107'; // Yellow
    ctx.font = 'bold 14px Arial';
    ctx.fillText('MOVES:', tokenX, tokenY);
    
    for (let i = 0; i < maxTokens; i++) {
      const filled = i < tokens;
      ctx.fillStyle = filled ? '#4CAF50' : '#ddd';
      ctx.fillRect(tokenX + 60 + (i * 20), tokenY - 10, 16, 16);
    }

    // Draw ammo (top-right)
    const ammoX = this.canvas.width - 100;
    const ammoY = 10;
    ctx.fillStyle = '#FFC107';
    ctx.fillText('AMMO:', ammoX, ammoY);
    
    for (let i = 0; i < Math.min(maxAmmo, 10); i++) {
      const filled = i < ammo;
      ctx.fillStyle = filled ? '#FF5722' : '#ddd';
      ctx.fillRect(ammoX + 60 + (i * 12), ammoY - 10, 10, 10);
    }

    // Show "FROZEN" indicator if movement is locked
    if (!this.educationManager.canMove() && 
        this.educationManager.isQuestionDisplayed()) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        'ANSWER TO CONTINUE',
        this.canvas.width / 2,
        30
      );
    }
  }
}
```

---

## Step 8: Learning Feedback Modal

**File**: Create new `src/debug/LearningFeedbackModal.ts`

```typescript
export class LearningFeedbackModal {
  public static show(feedback: LevelFeedback): Promise<void> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 40px;
        max-width: 600px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      `;

      // Title
      const title = document.createElement('h1');
      title.textContent = feedback.title;
      title.style.cssText = 'margin: 0 0 20px 0; font-size: 32px; color: #333;';
      content.appendChild(title);

      // Messages
      const messagesDiv = document.createElement('div');
      messagesDiv.style.cssText = 'margin: 20px 0; font-size: 16px; color: #666;';
      feedback.messages.forEach((msg) => {
        const p = document.createElement('p');
        p.textContent = msg;
        p.style.margin = '10px 0';
        messagesDiv.appendChild(p);
      });
      content.appendChild(messagesDiv);

      // Points
      const points = document.createElement('div');
      points.style.cssText = 'font-size: 24px; font-weight: bold; color: #4CAF50; margin: 20px 0;';
      points.textContent = `+${feedback.earnedPoints} points`;
      content.appendChild(points);

      // Continue button
      const button = document.createElement('button');
      button.textContent = 'CONTINUE →';
      button.style.cssText = `
        padding: 12px 32px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 20px;
      `;
      button.onclick = () => {
        document.body.removeChild(modal);
        resolve();
      };
      content.appendChild(button);

      modal.appendChild(content);
      document.body.appendChild(modal);
    });
  }
}
```

---

## Step 9: Wire Everything in GameSceneRouter

**File**: `src/scenes/GameSceneRouter.ts` (modifications)

```typescript
export class GameSceneRouter {
  private educationManager: EducationGameManager;

  public async startLevel(levelNumber: number): Promise<void> {
    // Initialize education systems
    this.educationManager.startLevel(levelNumber);

    // Start playing
    const scene = new LevelPlayScene(
      levelNumber,
      this.educationManager  // Pass reference to scene
    );

    scene.onVictory.addObserver(() => {
      // Get feedback and show
      const feedback = this.educationManager.generateLevelFeedback?.();
      LearningFeedbackModal.show(feedback).then(() => {
        // Go to next level
        this.startLevel(levelNumber + 1);
      });
    });
  }
}
```

---

## Step 10: Testing Checklist

- [ ] Movement tokens count down properly (timer visual)
- [ ] Player freezes when tokens = 0
- [ ] Question appears correctly
- [ ] Correct answer unfreezes player + awards token
- [ ] Wrong answer keeps player frozen, shows question again
- [ ] Enemies continue moving while player is frozen
- [ ] Pressing fire without ammo triggers question
- [ ] Correct answer awards ammo, allows shooting
- [ ] Power-up collection triggers question
- [ ] Correct answer = powerup activates
- [ ] Wrong answer = powerup disappears
- [ ] HUD displays tokens/ammo correctly
- [ ] End-of-level feedback appears
- [ ] Scores calculated correctly
- [ ] Level difficulty increases appropriately
- [ ] A1 → B2 questions as level progresses

---

## Optional Enhancements

### 1. Sound Effects for Questions
```typescript
// Add to QuestionUIController constructor
this.audioManager = audioManager;

// Play sound when question appears
public displayQuestion(question: EnglishQuestion): void {
  // ... existing code ...
  this.audioManager.play('question-chime.wav');
}

// Play sound on correct answer
private handleAnswerSelected(isCorrect: boolean): void {
  if (isCorrect) {
    this.audioManager.play('ding.wav');
  } else {
    this.audioManager.play('buzz.wav');
  }
}
```

### 2. Leaderboard Integration
```typescript
const performanceData = educationManager.getPerformance();
localStorage.setItem('battle-city-esl-scores', JSON.stringify({
  levelNumber: currentLevel,
  accuracy: performanceData.accuracyPercent,
  earnedPoints: feedback.earnedPoints,
  timestamp: Date.now()
}));
```

### 3. Difficulty Modes
```typescript
enum EducationMode {
  Relaxed = 'relaxed',      // More tokens, more ammo
  Challenge = 'challenge',  // Fewer tokens, less ammo
  Hardcore = 'hardcore'     // Minimal tokens, tight ammo
}
```

### 4. Language Selection
```typescript
// Allow players to select ESL level at start
const selectedLevel = showLanguageLevelSelector();
questionBank = QUESTION_BANK.filter(q => q.level === selectedLevel);
```

---

## Summary

The education system integrates with Battle City through:
1. **Movement gating** via `canMove()` check
2. **Ammo gating** via `attemptFire()` check
3. **Power-up questions** via event listeners
4. **Performance tracking** throughout gameplay
5. **Feedback modal** on level complete

All original mechanics remain unchanged—the educational layer is purely additive!
