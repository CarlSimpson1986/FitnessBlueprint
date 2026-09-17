"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateProfileState = { error?: string };

export async function createProfile(
  _prevState: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.email) {
    return { error: "Your account has no email on file — contact the owner." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) {
    return { error: "Full name is required." };
  }

  const optional = (field: string) => {
    const value = String(formData.get(field) ?? "").trim();
    return value.length > 0 ? value : null;
  };

  // role is deliberately omitted — defaults to 'member' in the schema, and
  // the RLS insert policy (0004) rejects anything else from a self-insert.
  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email,
    full_name: fullName,
    phone: optional("phone"),
    emergency_contact_name: optional("emergency_contact_name"),
    emergency_contact_phone: optional("emergency_contact_phone"),
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
