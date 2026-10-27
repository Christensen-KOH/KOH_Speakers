# Example: HUD Display & CSS

## CSS Styles for Education HUD

Add this to your stylesheet or `public/main.css`:

```css
/* ===== Education HUD ===== */

.education-hud {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: Arial, sans-serif;
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  pointer-events: none;
}

/* Movement Tokens Section */
.education-hud-tokens {
  display: flex;
  align-items: center;
  gap: 12px;
}

.education-hud-tokens-label {
  font-size: 14px;
  font-weight: bold;
  color: #FFC107;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.education-hud-tokens-bar {
  display: flex;
  gap: 6px;
}

.education-hud-token {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 2px solid #fff;
  transition: background 0.3s ease;
}

.education-hud-token.active {
  background: #4CAF50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
}

.education-hud-token.inactive {
  background: #999;
  opacity: 0.4;
}

/* Ammo Display Section */
.education-hud-ammo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.education-hud-ammo-label {
  font-size: 14px;
  font-weight: bold;
  color: #FFC107;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.education-hud-ammo-bar {
  display: flex;
  gap: 4px;
}

.education-hud-ammo-bullet {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #fff;
  transition: background 0.2s ease;
}

.education-hud-ammo-bullet.loaded {
  background: #FF5722;
  box-shadow: 0 0 6px rgba(255, 87, 34, 0.6);
}

.education-hud-ammo-bullet.empty {
  background: #666;
  opacity: 0.3;
}

/* Frozen Indicator */
.education-hud-frozen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.2);
  pointer-events: none;
  z-index: 500;
  display: none;
  align-items: center;
  justify-content: center;
  animation: pulse-frozen 0.5s ease-in-out infinite;
}

.education-hud-frozen.active {
  display: flex;
}

.education-hud-frozen-text {
  background: rgba(244, 67, 54, 0.9);
  color: white;
  padding: 20px 40px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  animation: scale-up 0.4s ease-out;
}

@keyframes pulse-frozen {
  0%, 100% { background: rgba(0, 0, 0, 0.2); }
  50% { background: rgba(244, 67, 54, 0.1); }
}

@keyframes scale-up {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Question Overlay */
.education-question-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 300ms ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.question-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 30px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: slideUp 300ms ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.question-card h2 {
  margin: 0 0 25px 0;
  font-size: 20px;
  color: #333;
  text-align: center;
}

.question-timer {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #4CAF50;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.question-timer.warning {
  background: #FFC107;
  color: #333;
  box-shadow: 0 0 10px rgba(255, 193, 7, 0.5);
}

.question-timer.critical {
  background: #F44336;
  color: white;
  animation: pulse-timer 0.5s ease-in-out infinite;
}

@keyframes pulse-timer {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.question-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
}

.question-options button {
  padding: 12px 16px;
  background: #f0f0f0;
  border: 2px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 200ms ease;
  text-align: left;
  font-family: Arial, sans-serif;
}

.question-options button:hover:not(:disabled) {
  background: #e8e8e8;
  border-color: #999;
  transform: translateX(4px);
}

.question-options button:active:not(:disabled) {
  transform: translateX(2px);
}

.question-options button:disabled {
  cursor: default;
}

.question-options button.correct {
  background: #4CAF50;
  color: white;
  border-color: #388E3C;
}

.question-options button.incorrect {
  background: #F44336;
  color: white;
  border-color: #D32F2F;
}

/* Category Badge */
.question-card span {
  display: inline-block;
  margin-top: 20px;
  padding: 4px 12px;
  background: #e3f2fd;
  color: #1976d2;
  font-size: 12px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: bold;
  letter-spacing: 0.5px;
}

/* Learning Feedback Modal */
.learning-feedback-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.learning-feedback-content {
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 600px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: slideUp 400ms ease-out;
}

.learning-feedback-content h1 {
  margin: 0 0 20px 0;
  font-size: 32px;
  color: #333;
}

.learning-feedback-messages {
  margin: 20px 0;
  font-size: 16px;
  color: #666;
}

.learning-feedback-messages p {
  margin: 10px 0;
  line-height: 1.5;
}

.learning-feedback-points {
  font-size: 28px;
  font-weight: bold;
  color: #4CAF50;
  margin: 25px 0;
}

.learning-feedback-rating {
  font-size: 18px;
  font-weight: bold;
  color: #FFC107;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 15px 0;
}

.learning-feedback-button {
  padding: 14px 40px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 20px;
  transition: all 200ms ease;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.learning-feedback-button:hover {
  background: #45a049;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.learning-feedback-button:active {
  transform: translateY(0);
}
```

---

## HTML Example for HUD

Add this somewhere in your game container (e.g., inside the canvas wrapper):

```html
<!-- Game Canvas -->
<div id="game-container">
  <canvas id="game-canvas"></canvas>
  
  <!-- Education HUD -->
  <div class="education-hud">
    <!-- Movement Tokens -->
    <div class="education-hud-tokens">
      <span class="education-hud-tokens-label">MOVES:</span>
      <div class="education-hud-tokens-bar" id="tokens-bar">
        <!-- Dynamic: tokens added here -->
      </div>
    </div>
    
    <!-- Ammo Display -->
    <div class="education-hud-ammo">
      <span class="education-hud-ammo-label">AMMO:</span>
      <div class="education-hud-ammo-bar" id="ammo-bar">
        <!-- Dynamic: bullets added here -->
      </div>
    </div>
  </div>
  
  <!-- Frozen Indicator -->
  <div class="education-hud-frozen" id="frozen-indicator">
    <div class="education-hud-frozen-text">ANSWER TO CONTINUE</div>
  </div>
</div>
```

---

## TypeScript HUD Renderer

Create a file: `src/education/EducationHUDRenderer.ts`

```typescript
import { EducationGameManager } from './EducationGameManager';

export class EducationHUDRenderer {
  private tokensBarElement: HTMLElement | null;
  private ammoBarElement: HTMLElement | null;
  private frozenIndicatorElement: HTMLElement | null;
  private educationManager: EducationGameManager;

  constructor(educationManager: EducationGameManager) {
    this.educationManager = educationManager;
    this.tokensBarElement = document.getElementById('tokens-bar');
    this.ammoBarElement = document.getElementById('ammo-bar');
    this.frozenIndicatorElement = document.getElementById('frozen-indicator');

    // Subscribe to education events
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.educationManager.onMovementFrozen.addObserver(() => {
      this.showFrozenIndicator();
    });

    this.educationManager.onMovementUnfrozen.addObserver(() => {
      this.hideFrozenIndicator();
    });
  }

  /**
   * Update HUD display (call once per frame).
   */
  public update(): void {
    this.updateTokensBar();
    this.updateAmmoBar();
  }

  private updateTokensBar(): void {
    if (!this.tokensBarElement) return;

    const tokens = this.educationManager.getMovementTokens();
    const maxTokens = this.educationManager.getMaxMovementTokens();

    // Clear existing
    this.tokensBarElement.innerHTML = '';

    // Render token blocks
    for (let i = 0; i < maxTokens; i++) {
      const tokenDiv = document.createElement('div');
      tokenDiv.className = 'education-hud-token';

      if (i < tokens) {
        tokenDiv.classList.add('active');
      } else {
        tokenDiv.classList.add('inactive');
      }

      this.tokensBarElement.appendChild(tokenDiv);
    }
  }

  private updateAmmoBar(): void {
    if (!this.ammoBarElement) return;

    const ammo = this.educationManager.getAmmo();
    const maxAmmo = this.educationManager.getMaxAmmo();

    // Clear existing
    this.ammoBarElement.innerHTML = '';

    // Render ammo bullets (max display: 10)
    const displayCount = Math.min(maxAmmo, 15);
    for (let i = 0; i < displayCount; i++) {
      const bulletDiv = document.createElement('div');
      bulletDiv.className = 'education-hud-ammo-bullet';

      if (i < ammo) {
        bulletDiv.classList.add('loaded');
      } else {
        bulletDiv.classList.add('empty');
      }

      this.ammoBarElement.appendChild(bulletDiv);
    }
  }

  private showFrozenIndicator(): void {
    if (this.frozenIndicatorElement) {
      this.frozenIndicatorElement.classList.add('active');
    }
  }

  private hideFrozenIndicator(): void {
    if (this.frozenIndicatorElement) {
      this.frozenIndicatorElement.classList.remove('active');
    }
  }

  public destroy(): void {
    // Cleanup if needed
  }
}
```

---

## Integration into main.ts

```typescript
import { EducationGameManager } from './education';
import { EducationHUDRenderer } from './education/EducationHUDRenderer';

// After creating educationManager
const educationManager = new EducationGameManager({...});
const hudRenderer = new EducationHUDRenderer(educationManager);

// In game loop
gameLoop.onTick.subscribe((deltaTime) => {
  educationManager.update(deltaTime);
  hudRenderer.update();  // Update HUD display
});
```

---

## Result: Visual Layout

```
┌────────────────────────────────────────────────────────────────┐
│ MOVES: [█][█][█]                  AMMO: [●][●][●][●][●]       │
│                                                                │
│      ┌────────────────────────────────────────────────┐       │
│      │                                                │       │
│      │            GAME CANVAS (800x768)             │       │
│      │                                                │       │
│      │   [Tank]    [Enemies] ★ ★                    │       │
│      │                                                │       │
│      │                          ★                    │       │
│      │                                                │       │
│      │      [Base] ★★★                             │       │
│      │                                                │       │
│      └────────────────────────────────────────────────┘       │
│                                                                │
│   When Movement Frozen:                                        │
│   "ANSWER TO CONTINUE" flashes in red at top                  │
│                                                                │
│   When Question Open:                                          │
│   ┌────────────────────────────────┐                          │
│   │  [Timer: 3s]                   │                          │
│   │  What is this? 🐱               │                          │
│   │  ✓ Cat                         │                          │
│   │    Dog                         │                          │
│   │    Bird                        │                          │
│   │  [VOCABULARY]                  │                          │
│   └────────────────────────────────┘                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Color Scheme

- **Tokens (Active)**: `#4CAF50` (Green) ✓
- **Tokens (Inactive)**: `#999` (Gray)
- **Ammo (Loaded)**: `#FF5722` (Orange-Red) ●
- **Ammo (Empty)**: `#666` (Dark Gray)
- **Labels**: `#FFC107` (Yellow)
- **Frozen Indicator**: `#F44336` (Red)
- **Correct Answer**: `#4CAF50` (Green)
- **Wrong Answer**: `#F44336` (Red)
- **Timer (Caution)**: `#FFC107` (Yellow)
- **Timer (Critical)**: `#F44336` (Red)

---

## Responsive Design

```css
/* Mobile adjustments */
@media (max-width: 600px) {
  .education-hud {
    flex-direction: column;
    gap: 12px;
    left: 5px;
    right: 5px;
    top: 5px;
  }

  .question-card {
    width: 95%;
    padding: 20px;
  }

  .question-card h2 {
    font-size: 18px;
  }

  .question-options button {
    font-size: 14px;
    padding: 10px 12px;
  }
}
```

---

## Testing the HUD

1. Open browser DevTools
2. Add `style` tag with above CSS to `<head>`
3. Add HTML elements to game container
4. Instantiate `EducationHUDRenderer`
5. Tokens should update in real-time
6. Frozen indicator should flash when movement freezes
7. Ammo bar should decrease on fire, increase on correct answer

---

**Ready to use! Copy CSS and HTML, use EducationHUDRenderer class, everything updates automatically!**
