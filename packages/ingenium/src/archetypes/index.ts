/**
 * The archetype table.
 *
 * One file per archetype under this directory, each exporting its dials, and
 * this lookup from the archetype name. Only the Recluse exists in Milestone
 * 0; the other six arrive with M3, when all seven are placed on the street.
 * Asking for one before then is a programming error, not a fallback case,
 * so it throws rather than returning some default disposition.
 */

import type { BrainDials } from "../brain/dials.ts";
import type { Archetype } from "../run.ts";
import { RECLUSE_BRAIN } from "./recluse.ts";

/** The brain dials for an archetype. */
export function brainDialsFor(archetype: Archetype): BrainDials {
  switch (archetype) {
    case "recluse":
      return RECLUSE_BRAIN;
    default:
      throw new RangeError(`archetype "${archetype}" has no brain dials yet (they arrive with M3)`);
  }
}
