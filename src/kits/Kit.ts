import { CefrLevel, Question } from './Question';

/**
 * A "Kit" is a named question set the host picks before a match, either
 * built in or created/imported by a teacher and saved in localStorage.
 */
export interface Kit {
  id: string;
  name: string;
  level: CefrLevel;
  description?: string;
  builtIn: boolean;
  questions: Question[];
}
