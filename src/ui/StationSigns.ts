import * as config from '../config';

import { battleCamera } from './Camera';

import './styles/stations.css';

export interface StationSign {
  text: string;
  color: string;
  // Station centre, field coordinates.
  x: number;
  y: number;
}

// Sign floats this far above the station centre (field px).
const SIGN_OFFSET_Y = 46;

/**
 * Floating "GADGETS" / "SHIELD STATION" / "REPAIR BAY" signs over the
 * on-map stations, drawn in the DOM so they stay crisp at any zoom and
 * placed through the follow camera every frame.
 */
export class StationSigns {
  private readonly layer = document.createElement('div');
  private readonly signs: { sign: StationSign; node: HTMLDivElement }[] = [];

  constructor(container: HTMLElement, signs: StationSign[]) {
    this.layer.className = 'tk-station-signs';
    this.layer.setAttribute('aria-hidden', 'true');
    signs.forEach((sign) => {
      const node = document.createElement('div');
      node.className = 'tk-station-sign';
      node.textContent = sign.text;
      node.style.setProperty('--tk-station-color', sign.color);
      this.layer.append(node);
      this.signs.push({ sign, node });
    });
    container.append(this.layer);
  }

  public update(): void {
    this.signs.forEach(({ sign, node }) => {
      const point = battleCamera.canvasToLayer(
        config.BORDER_LEFT_WIDTH + sign.x,
        config.BORDER_TOP_BOTTOM_HEIGHT + sign.y - SIGN_OFFSET_Y,
      );
      node.hidden = point === null;
      if (point !== null) {
        node.style.left = `${point.left.toFixed(1)}px`;
        node.style.top = `${point.top.toFixed(1)}px`;
      }
    });
  }

  public destroy(): void {
    this.layer.remove();
  }
}
