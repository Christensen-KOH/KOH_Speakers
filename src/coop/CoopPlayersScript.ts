import { Timer, Vector } from '../core';
import { GameUpdateArgs } from '../game';
import { PlayerTank } from '../gameObjects';
import { gameBalance } from '../match/GameBalance';
import { LevelScript } from '../level/LevelScript';
import { LevelPlayerSpawnCompletedEvent } from '../level/events';
import { TankFactory, TankParty, TankType } from '../tank';
import { TerrainType } from '../terrain';
import * as config from '../config';

import { CoopRoster, CoopSeat } from './CoopRoster';
import { RemoteTankBehavior } from './RemoteTankBehavior';

// Spawn cells (top-left, 64px) around the base, by slot. The first two are
// the classic Battle City spawns; the map is cleared at all of them.
export const COOP_SPAWNS = [
  { x: 256, y: 768 },
  { x: 512, y: 768 },
  { x: 256, y: 704 },
  { x: 512, y: 704 },
  { x: 192, y: 768 },
  { x: 576, y: 768 },
  { x: 192, y: 704 },
  { x: 576, y: 704 },
];

const RESPAWN_DELAY = 2;
const THINKING_SHIELD = 0.6;

interface SlotState {
  playerId: string | null;
  tank: PlayerTank | null;
  spawning: boolean;
  respawn: Timer;
  loadoutKey: string;
}

/**
 * Students' tanks on the host: spawns a tank for every seat, applies their
 * loadout, respawns them after a death (lives never run out) and shields
 * students who park on a pad while answering questions.
 */
export class CoopPlayersScript extends LevelScript {
  private readonly roster: CoopRoster;
  private readonly slots: SlotState[] = COOP_SPAWNS.map(() => ({
    playerId: null,
    tank: null,
    spawning: false,
    respawn: new Timer(),
    loadoutKey: '',
  }));

  constructor(roster: CoopRoster) {
    super();
    this.roster = roster;
  }

  public getTank(slot: number): PlayerTank | null {
    return this.slots[slot]?.tank ?? null;
  }

  protected setup(): void {
    this.eventBus.playerSpawnCompleted.addListener(this.handleSpawnCompleted);
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.slots.forEach((state, slot) => {
      const seat = this.roster.bySlot(slot);

      // Seat freed or handed to someone else: the old tank leaves
      if (state.playerId !== (seat ? seat.playerId : null)) {
        this.removeTank(slot);
        state.playerId = seat ? seat.playerId : null;
        state.spawning = false;
        state.respawn.stop();
      }
      if (seat === null) {
        return;
      }

      state.respawn.update(deltaTime);
      if (state.tank === null && !state.spawning && !state.respawn.isActive()) {
        this.requestSpawn(slot);
      }

      const { tank } = state;
      if (tank === null) {
        return;
      }

      const key = JSON.stringify(seat.input.loadout);
      if (key !== state.loadoutKey) {
        state.loadoutKey = key;
        tank.setRemoteLoadout(seat.input.loadout);
      }

      // Studying Shield: invulnerable anywhere while the Hub is open
      if (seat.input.thinking && tank.shield === null) {
        tank.activateShield(THINKING_SHIELD);
      }
    });
  }

  private requestSpawn(slot: number): void {
    const { x, y } = COOP_SPAWNS[slot];
    this.slots[slot].spawning = true;
    this.eventBus.playerSpawnRequested.notify({
      type: TankType.PlayerA(),
      partyIndex: slot,
      position: new Vector(x, y),
    });
  }

  private handleSpawnCompleted = (event: LevelPlayerSpawnCompletedEvent): void => {
    if (event.type.party !== TankParty.Player) {
      return;
    }
    const slot = event.partyIndex;
    const state = this.slots[slot];
    const seat = this.roster.bySlot(slot);
    state.spawning = false;
    if (seat === null || seat.playerId !== state.playerId) {
      return;
    }

    const tank = TankFactory.createPlayer(slot, TankType.PlayerA(), new RemoteTankBehavior(seat));
    tank.setRemoteLoadout(seat.input.loadout);
    state.loadoutKey = JSON.stringify(seat.input.loadout);
    // Teacher Studio: starting HP on top of the classic single hit
    tank.attributes.health += gameBalance.startingHp - 1;
    tank.updateMatrix();
    tank.setCenter(event.centerPosition);
    tank.updateMatrix();
    tank.activateShield(config.SHIELD_SPAWN_DURATION);

    tank.died.addListener(() => this.handleDied(slot, tank, seat));

    state.tank = tank;
    this.world.addPlayerTank(slot, tank);
  };

  private handleDied(slot: number, tank: PlayerTank, seat: CoopSeat): void {
    this.eventBus.playerDied.notify({
      type: tank.type,
      centerPosition: tank.getCenter(),
      partyIndex: slot,
    });
    const state = this.slots[slot];
    if (state.tank === tank) {
      this.removeTank(slot);
      if (state.playerId === seat.playerId) {
        state.respawn.reset(RESPAWN_DELAY);
      }
    }
  }

  private removeTank(slot: number): void {
    const state = this.slots[slot];
    if (state.tank !== null) {
      state.tank.collider.unregister();
      state.tank.removeSelf();
      state.tank = null;
      this.world.removePlayerTank(slot);
    }
  }

  private isOnPad(tank: PlayerTank): boolean {
    const center = tank.getCenter();
    return this.world.field.children.some(
      (child) =>
        'type' in child &&
        ((child as { type: unknown }).type === TerrainType.RechargePad ||
          (child as { type: unknown }).type === TerrainType.UpgradePad) &&
        child.getBoundingBox().containsPoint(center),
    );
  }
}
