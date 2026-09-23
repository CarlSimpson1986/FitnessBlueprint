/**
 * The owner's "test as coach / member" accounts — see
 * src/app/admin/test-accounts/actions.ts. `.invalid` is a reserved TLD,
 * so these can never receive (or be confused with) real email.
 */
export type TestAccountKind = "coach" | "member";

export const TEST_ACCOUNTS: Record<
  TestAccountKind,
  { email: string; fullName: string; role: "coach" | "member" }
> = {
  coach: { email: "test-coach@fitnessblueprints.invalid", fullName: "Test Coach", role: "coach" },
  member: { email: "test-member@fitnessblueprints.invalid", fullName: "Test Member", role: "member" },
};

/** httpOnly cookie holding the owner's refresh token while testing. */
export const OWNER_RETURN_COOKIE = "fb_owner_return";
