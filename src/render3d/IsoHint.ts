// Tells the 3D view what a plain sprite object stands for. Used by objects
// that are not real Tank/Bullet/BaseHeart instances, e.g. the co-op replica
// built from network snapshots.
export interface IsoHint {
  kind: 'tank' | 'bullet' | 'base';
  // TankColor value for tanks
  color?: string;
  // Facing in degrees, 0 = up
  facing?: number;
  dead?: boolean;
}

export interface IsoHinted {
  iso: IsoHint | null;
}

export function getIsoHint(object: unknown): IsoHint | null {
  const hint = (object as Partial<IsoHinted>).iso;
  return hint === undefined ? null : hint;
}
