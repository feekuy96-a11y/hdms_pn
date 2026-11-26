export type FloodSaveTarget =
  | "flood-road-side"
  | "flood-section-name-input"
  | "flood-geometry-validation-target"
  | "flood-water-level-single"
  | "flood-water-level-forward"
  | "flood-water-level-reverse";

export type FloodSaveValidation = { target: FloodSaveTarget; message: string };

export function FloodSaveError({ validation, target }: { validation?: FloodSaveValidation | null; target: FloodSaveTarget }) {
  if (validation?.target !== target) return null;
  return <p id="flood-save-validation-message" role="alert" className="my-2 rounded-lg border border-rose-500/50 bg-rose-950/50 px-2.5 py-2 text-sm font-medium text-rose-100">{validation.message}</p>;
}
