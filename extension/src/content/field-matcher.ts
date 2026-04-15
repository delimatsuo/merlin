/**
 * Field matcher — maps form labels/placeholders to profile data fields.
 */

import { FormField } from "../lib/types";

/**
 * Given a form field, returns the matching profile value or null.
 */
export function matchField(_field: FormField): string | null {
  // TODO: Implement label-based matching with fuzzy logic
  return null;
}
