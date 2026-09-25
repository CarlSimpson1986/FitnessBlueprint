import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { memberFeed, ownerFeed } from "@/lib/calendar-feed";

/**
 * Calendar subscription feed (.ics). Calendar apps fetch this with no
 * session, so the long random token in the URL (calendar_feed_tokens,
 * 0034) is the credential — looked up with the admin client, the same
 * reason a webhook uses it. The owner's token returns the whole-gym feed;
 * anyone else's returns only their own bookings.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (token.length < 20) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: feed } = await admin.from("calendar_feed_tokens").select("profile_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Not found", { status: 404 });

  const { data: profile } = await admin.from("profiles").select("role").eq("id", feed.profile_id).maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL;
  const body = profile.role === "owner" ? await ownerFeed(admin, siteUrl) : await memberFeed(admin, feed.profile_id, siteUrl);

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="fitness-blueprint.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
