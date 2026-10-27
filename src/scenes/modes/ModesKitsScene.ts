import { GameUpdateArgs } from '../../game';
import { SceneMenuTitle } from '../../gameObjects';
import { InputManager } from '../../input';
import { KitManagerPanel } from '../../ui/KitManagerPanel';

import { GameScene } from '../GameScene';

/** Hosts the DOM Kit Manager over the canvas. */
export class ModesKitsScene extends GameScene {
  private panel: KitManagerPanel;
  private inputManager: InputManager;

  protected setup({ inputManager, kitLibrary, uiRoot }: GameUpdateArgs): void {
    this.root.add(new SceneMenuTitle('ENGLISH KITS'));

    // The panel has text fields; keep keystrokes away from the game menus.
    this.inputManager = inputManager;
    this.inputManager.unlisten();

    this.panel = new KitManagerPanel(uiRoot.getLayer(), kitLibrary);
    this.panel.backRequested.addListener(this.handleBack);
  }

  private handleBack = (): void => {
    this.panel.destroy();
    this.inputManager.listen();
    this.navigator.back();
  };
}
