/** Mirrors jfc-admin-portal/jfc-support-portal's identical helper — plain
 * rupee amounts in every mock dataset here too (not @jfc/shared's
 * paise-integer formatINR; see TaxClosePage's note in jfc-admin-portal for
 * why the two shouldn't be conflated). */
export function formatINR(rupees: number): string {
  if (rupees < 100_000) return '₹' + rupees.toLocaleString('en-IN');
  return '₹' + (rupees / 100_000).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + 'L';
}
