import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ZodError } from "zod";

export function applyZodErrors<TFieldValues extends FieldValues>(
  form: {
    clearErrors(): void;
    setError: UseFormSetError<TFieldValues>;
  },
  error: ZodError<TFieldValues>
) {
  form.clearErrors();

  const seenPaths = new Set<string>();

  for (const issue of error.issues) {
    const path = issue.path.join(".");

    if (!path || seenPaths.has(path)) {
      continue;
    }

    form.setError(path as Path<TFieldValues>, {
      type: "manual",
      message: issue.message
    });
    seenPaths.add(path);
  }
}

export function readFormString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

export function readFormCheckbox(formData: FormData, name: string) {
  return formData.get(name) !== null;
}
