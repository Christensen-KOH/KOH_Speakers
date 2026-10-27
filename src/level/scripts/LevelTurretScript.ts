import { AutoTurret } from '../../entities/AutoTurret';
import * as config from '../../config';

import { LevelScript } from '../LevelScript';

/** Owns the base Auto-Turret gadget (one per level, bought in the shop). */
export class LevelTurretScript extends LevelScript {
  private turret: AutoTurret = null;

  public hasTurret(): boolean {
    return this.turret !== null;
  }

  /** Mounts the turret above the base. Returns false if one is already up. */
  public placeTurret(ownerIndex: number): boolean {
    if (this.turret !== null) {
      return false;
    }

    this.turret = new AutoTurret(ownerIndex);
    this.turret.position.set(
      config.TURRET_POSITION.x,
      config.TURRET_POSITION.y,
    );
    this.world.field.add(this.turret);

    return true;
  }

  protected setup(): void {
    this.eventBus.baseDied.addListener(() => {
      this.turret?.destroy();
      this.turret = null;
    });
  }
}
