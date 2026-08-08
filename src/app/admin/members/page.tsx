import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { AssignMembershipForm } from "./AssignMembershipForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function OwnerMembersPage() {
  const { supabase } = await requireOwner();

  const [{ data: members }, { data: plans }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("role", "member")
      .order("full_name"),
    supabase
      .from("membership_plans")
      .select("id, name, price_pence, credit_pack_size")
      .eq("is_active", true)
      .order("name"),
    supabase.from("member_memberships").select("member_id, plan_id, status").eq("status", "active"),
  ]);

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const activeMembershipByMember = new Map((memberships ?? []).map((m) => [m.member_id, m]));

  return (
    <main className="blueprint-grid min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Owner
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-2">Members</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Assign a plan after payment&apos;s been taken outside the app (Stripe link, GoCardless
          mandate). Credit-pack plans grant the credits immediately.
        </p>

        <CreateMemberForm />

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
                  <p className="text-xs text-blueprint-muted mt-1">
                    {activePlan ? `Active: ${activePlan.name}` : "No active plan"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ResetPasswordButton memberId={member.id} />
                  <AssignMembershipForm memberId={member.id} plans={plans ?? []} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
