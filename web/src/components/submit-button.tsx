"use client";

import { useFormStatus } from "react-dom";
import { btn } from "./ui";

export function SubmitButton({
  children,
  variant = "primary",
  className = "",
  confirm,
  name,
  value,
  formAction,
}: {
  children: React.ReactNode;
  variant?: keyof typeof btn;
  className?: string;
  /** Ask before submitting (for irreversible actions like cancelling or deleting). */
  confirm?: string;
  name?: string;
  value?: string;
  /** Submit the surrounding form to a different Server Action (e.g. Delete next to Save). */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      formNoValidate={!!formAction}
      disabled={pending}
      className={`${btn[variant]} ${className}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Menyimpan..." : children}
    </button>
  );
}
