/**
 * FormData → plain object for zod, dropping blank fields. An empty optional
 * input must mean "not given": `z.coerce.number()` would otherwise turn ''
 * into 0 (failing `.positive()`, or silently storing lat/lon 0,0).
 */
export function formFields(fd: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(
    [...fd.entries()].filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
  );
}
