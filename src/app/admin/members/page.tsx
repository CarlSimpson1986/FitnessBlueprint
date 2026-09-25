import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { fetchClassesByCoach } from "@/lib/time-off";
import { AssignMembershipForm } from "./AssignMembershipForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { ResetPasswordButton } from "./ResetPasswordButton";
import { DeletePersonButton } from "./DeletePersonButton";

export default async function OwnerMembersPage() {
  const { supabase } = await requireOwner();

  const [{ data: members }, { data: plans }, { data: memberships }, { data: staff }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, email")
      .eq("role", "member")
      .order("full_name"),
    supabase
      .from("membership_plans")
      .select("id, name, price_pence, credit_pack_size")
      .eq("is_active", true)
      .order("name"),
    supabase.from("member_memberships").select("member_id, plan_id, status").eq("status", "active"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["owner", "coach"])
      // View-as test accounts are managed by the switch, not by hand.
      .not("email", "like", "%.invalid")
      .order("role", { ascending: false })
      .order("full_name"),
  ]);

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));

  // "Teaches" on each staff row — derived from the classes they're
  // scheduled on (src/lib/time-off.ts), not a list to maintain.
  const [classesByCoach, { data: classTypes }] = await Promise.all([
    fetchClassesByCoach(supabase),
    supabase.from("session_templates").select("id, name").order("name"),
  ]);
  const teaches = (personId: string) =>
    (classTypes ?? []).filter((c) => classesByCoach.get(personId)?.has(c.id)).map((c) => c.name);
  const activeMembershipByMember = new Map((memberships ?? []).map((m) => [m.member_id, m]));

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">
          Owner
        </p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Members</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Assign a plan after payment&apos;s been taken outside the app (Stripe link, GoCardless
          mandate). Credit-pack plans grant the credits immediately.
        </p>

        <CreateMemberForm />

        <p className="fb-eyebrow mb-3">Staff ({(staff ?? []).length})</p>
        <ul className="space-y-2 mb-10">
          {(staff ?? []).map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-3"
            >
              <div>
                <p className="text-blueprint-ink font-medium">
                  {person.full_name}{" "}
                  <span className="text-[10px] font-mono uppercase tracking-wide text-blueprint-accent">
                    {person.role}
                  </span>
                </p>
                <p className="text-xs text-blueprint-muted mt-1">{person.email}</p>
                <p className="text-xs text-blueprint-muted mt-1">
                  {teaches(person.id).length ? `Teaches: ${teaches(person.id).join(", ")}` : "Not scheduled on any classes yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ResetPasswordButton memberId={person.id} />
                <DeletePersonButton personId={person.id} name={person.full_name} />
              </div>
            </li>
          ))}
        </ul>

        <p className="fb-eyebrow mb-3">Members ({(members ?? []).length})</p>

        {(members ?? []).length === 0 && (
          <p className="text-blueprint-muted text-sm">
            No members yet — they show up here once they sign up.
          </p>
        )}

        <ul className="space-y-4">
          {(members ?? []).map((member) => {
            const activeMembership = activeMembershipByMember.get(member.id);
            const activePlan = activeMembership ? planById.get(activeMembership.plan_id) : null;

            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-4"
              >
                <div>
                  <p className="text-blueprint-ink font-medium">{member.full_name}</p>
                  <p className="text-xs text-blueprint-muted mt-1">{member.email}</p>
                  <p className="text-xs text-blueprint-muted mt-1">
                    {activePlan ? `Active: ${activePlan.name}` : "No active plan"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ResetPasswordButton memberId={member.id} />
                  <AssignMembershipForm memberId={member.id} plans={plans ?? []} />
                  <DeletePersonButton personId={member.id} name={member.full_name} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
