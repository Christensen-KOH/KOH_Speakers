import * as config from '../../config';

import { MapConfig } from '../MapConfig';
import { MapDto } from '../MapDto';
import { MapManifest } from '../MapManifest';
import { MapListReader } from '../MapListReader';

const SPAWN_SIZE = config.TILE_SIZE_LARGE;

// Flips a map left-to-right. The base sits on the centre line, so it stays put.
function mirrorMap(dto: MapDto): MapDto {
  const mirrorX = (x: number, width: number): number => {
    return config.MAP_SIZE - x - width;
  };
  const mirrorLocations = (locations = []) => {
    return locations.map((location) => ({
      ...location,
      x: mirrorX(location.x, SPAWN_SIZE),
    }));
  };

  return {
    ...dto,
    spawn: {
      ...dto.spawn,
      enemy: {
        ...dto.spawn?.enemy,
        locations: mirrorLocations(dto.spawn?.enemy?.locations),
      },
      player: {
        ...dto.spawn?.player,
        locations: mirrorLocations(dto.spawn?.player?.locations),
      },
    },
    terrain: {
      ...dto.terrain,
      regions: (dto.terrain?.regions ?? []).map((region) => ({
        ...region,
        x: mirrorX(region.x, region.width),
      })),
    },
  };
}

// Used to load out-of-the-box maps.
// Reads map list from JSON manifest. Maps are loaded over HTTP.
export class ManifestMapListReader extends MapListReader {
  private readonly manifest: MapManifest;

  constructor(manifest: MapManifest) {
    super();

    this.manifest = manifest;
  }

  public async readAsync(levelNumber: number): Promise<void> {
    const index = levelNumber - 1;
    // Stages past the last map start another lap over the same maps; every
    // second lap is mirrored (difficulty keeps rising with the stage number).
    const mapCount = this.manifest.list.length;
    const item =
      index >= 0 && index < this.getCount()
        ? this.manifest.list[index % mapCount]
        : undefined;
    if (item === undefined) {
      this.error.notify(new Error(`Level "${levelNumber} not found`));
      return;
    }

    try {
      const response = await fetch(item.file);
      let data: MapDto = await response.json();
      if (Math.floor(index / mapCount) % 2 === 1) {
        data = mirrorMap(data);
      }

      const config = new MapConfig();

      config.fromDto(data);

      this.loaded.notify(config);
    } catch (err) {
      this.error.notify(err);
    }
  }

  public getCount(): number {
    return this.manifest.list.length * config.STAGE_LAPS;
  }
}
