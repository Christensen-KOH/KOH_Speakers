import { SceneMenu, SceneMenuTitle, TextMenuItem } from '../../gameObjects';

import { GameScene } from '../GameScene';
import { GameSceneType } from '../GameSceneType';

export class ModesMenuScene extends GameScene {
  private title: SceneMenuTitle;
  private hostLiveItem: TextMenuItem;
  private joinLiveItem: TextMenuItem;
  private kitsItem: TextMenuItem;
  private customItem: TextMenuItem;
  private backItem: TextMenuItem;
  private menu: SceneMenu;

  protected setup(): void {
    this.title = new SceneMenuTitle('MODES');
    this.root.add(this.title);

    this.hostLiveItem = new TextMenuItem('HOST LIVE CLASS');
    this.hostLiveItem.selected.addListener(() =>
      this.navigator.push(GameSceneType.LiveHost),
    );

    this.joinLiveItem = new TextMenuItem('JOIN LIVE CLASS');
    this.joinLiveItem.selected.addListener(() =>
      this.navigator.push(GameSceneType.LiveJoin),
    );

    this.kitsItem = new TextMenuItem('ENGLISH KITS');
    this.kitsItem.selected.addListener(this.handleKitsSelected);

    this.customItem = new TextMenuItem('CUSTOM MAPS');
    this.customItem.selected.addListener(this.handleCustomSelected);

    this.backItem = new TextMenuItem('BACK');
    this.backItem.selected.addListener(this.handleBackSelected);

    const menuItems = [
      this.hostLiveItem,
      this.joinLiveItem,
      this.kitsItem,
      this.customItem,
      this.backItem,
    ];

    this.menu = new SceneMenu();
    this.menu.setItems(menuItems);
    this.root.add(this.menu);
  }

  private handleKitsSelected = (): void => {
    this.navigator.push(GameSceneType.ModesKits);
  };

  private handleCustomSelected = (): void => {
    this.navigator.push(GameSceneType.ModesCustom);
  };

  private handleBackSelected = (): void => {
    this.navigator.back();
  };
}
