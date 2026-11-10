// Kilograms or pounds. Weights are always stored in kg; these convert for showing and typing.
export const LB_PER_KG = 1 / 0.45359237;
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const unitRound = (v, step) => Math.round(v / step) * step;
const unitTidy = (v) => Math.round(v * 1000) / 1000;

export const isLb = (units) => units === 'lb';
export const unitLabel = (units) => (isLb(units) ? 'lb' : 'kg');

// Stored kg -> the number shown. Empty stays empty.
export function fromKg(kg, units) {
  if (kg === '' || kg === null || kg === undefined) return '';
  const n = Number(kg);
  if (!Number.isFinite(n)) return '';
  return isLb(units) ? unitTidy(unitRound(n * LB_PER_KG, 0.1)) : unitTidy(unitRound(n, 0.01));
}
// A number typed in the user's unit -> kg to store.
export function toKg(v, units) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return isLb(units) ? unitTidy(n / LB_PER_KG) : n;
}
// "62.5 kg" / "135 lb".
export const fmtWeight = (kg, units) => `${fromKg(kg, units)} ${unitLabel(units)}`;

// Bar, plates and steps in the user's unit. The bar setting is stored as 20 or 15 kg.
export const barFor = (units, barKg = 20) => (isLb(units) ? (Number(barKg) === 15 ? 35 : 45) : Number(barKg) || 20);
export const platesFor = (units, kgPlates) => (isLb(units) ? PLATES_LB : kgPlates);
// The smallest sensible jump in weight for progression and warm-ups.
export function weightStep(units, equipment = 'gym') {
  if (isLb(units)) return equipment === 'bodyweight' ? 0 : 5;
  return { gym: 2.5, home: 2, bodyweight: 0 }[equipment] ?? 2.5;
}
// Warm-up thresholds (heavy, medium working weights) in the user's unit.
export const warmupOptions = (units, barKg, barbell) => (isLb(units)
  ? { bar: barFor(units, barKg), step: 5, barbell, heavy: 135, mid: 65 }
  : { bar: barFor(units, barKg), step: barbell ? 2.5 : 2, barbell, heavy: 60, mid: 30 });
