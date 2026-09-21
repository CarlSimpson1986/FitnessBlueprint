"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWorkoutTemplate } from "./actions";

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWorkoutTemplate(templateId);
      if (!result.error) {
        startTransition(() => {
          router.refresh();
        });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-[10px] font-mono uppercase tracking-wide text-red-400 hover:text-red-300 disabled:opacity-50"
    >
      Delete
    </button>
  );
}
