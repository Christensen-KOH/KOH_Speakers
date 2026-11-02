import { GameUpdateArgs } from '../../game';
import { PlayerTank, TankState } from '../../gameObjects';
import { LevelPlayInputContext } from '../../input';
import { analogDrive } from '../../input/analogDrive';

import { TankBehavior } from '../TankBehavior';

export class PlayerTankBehavior extends TankBehavior {
  public setup(tank: PlayerTank): void {
    // Local players drive in 360° and slide around walls
    tank.omni = true;
  }

  public update(tank: PlayerTank, updateArgs: GameUpdateArgs): void {
    const { deltaTime, inputManager, overlayGate, session } = updateArgs;

    let inputMethod = inputManager.getActiveMethod();

    // If multiplayer - use user-specific input variant based on player index
    if (session.isMultiplayer()) {
      const playerSession = session.getPlayer(tank.partyIndex);
      const playerInputVariant = playerSession.getInputVariant();
      inputMethod = inputManager.getMethodByVariant(playerInputVariant);
    }

    // WARNING: order is important. Make sure to keep fire updates before
    // movement updates. Fire places bullet based on tank position.
    // Tank position changes during movement, and later can be corrected by
    // collision resolution algorithm after update phase. This order issue
    // can be fixed by adding some post-collide callback and place fire code
    // in there.
    if (inputMethod.isDownAny(LevelPlayInputContext.Fire)) {
      tank.fire();
    }
    if (inputMethod.isHoldAny(LevelPlayInputContext.RapidFire)) {
      tank.fire();
    }

    if (tank.isSliding() || tank.isStunned()) {
      return;
    }

    // Keys / D-pad: 8 directions (moveVector normalizes diagonals)
    let dx = 0;
    let dy = 0;
    if (inputMethod.isHoldAny(LevelPlayInputContext.MoveLeft)) {
      dx -= 1;
    }
    if (inputMethod.isHoldAny(LevelPlayInputContext.MoveRight)) {
      dx += 1;
    }
    if (inputMethod.isHoldAny(LevelPlayInputContext.MoveUp)) {
      dy -= 1;
    }
    if (inputMethod.isHoldAny(LevelPlayInputContext.MoveDown)) {
      dy += 1;
    }

    // Stick, mouse or touch drive: any angle
    const analog =
      session.isMultiplayer() || (overlayGate && !overlayGate.isFree())
        ? null
        : analogDrive.get();
    if (analog !== null) {
      dx = analog.x;
      dy = analog.y;
    }

    if (dx !== 0 || dy !== 0) {
      tank.moveVector(dx, dy, deltaTime);
    } else if (tank.state !== TankState.Idle) {
      tank.idle();
    }
  }
}
