import { GameObject } from '../core';
import * as config from '../config';

export class Field extends GameObject {
  constructor() {
    super(config.FIELD_WIDTH, config.FIELD_HEIGHT);
  }
}
