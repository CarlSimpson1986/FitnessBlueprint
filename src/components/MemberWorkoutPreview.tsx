import { SEGMENT_TYPE_ACCENT, SEGMENT_TYPE_LABEL, type SegmentDraft } from "@/lib/workout-content";

/**
 * Read-only "what a member would see" preview, phone-framed. Renders
 * straight from the in-editor draft state — not a save-then-fetch
 * round trip — so it updates live as a coach builds, including
 * content that hasn't been saved yet. Deliberately not a reuse of the
 * real LiveLogging component: that one has real input fields wired to
 * real logging actions, which makes no sense for previewing content
 * that may not even be saved. This mirrors its visual structure only.
 */
export function MemberWorkoutPreview({ title, segments }: { title: string; segments: SegmentDraft[] }) {
  return (
    <div className="shrink-0" style={{ width: 300 }}>
      <p className="fb-eyebrow mb-2 text-center">Member preview</p>
      <div className="rounded-[28px] border-4 border-blueprint-line bg-black p-2 mx-auto sticky top-4" style={{ width: 300 }}>
        <div className="rounded-[20px] overflow-hidden bg-black" style={{ height: 560 }}>
          <div className="h-full overflow-y-auto px-4 py-5">
            <p className="text-[10px] text-blueprint-muted uppercase tracking-wide mb-1">with your coach</p>
            <h2 className="text-lg font-semibold text-blueprint-ink mb-4 truncate">{title || "Session"}</h2>

            {segments.length === 0 ? (
              <p className="text-xs text-blueprint-muted">Nothing built yet.</p>
            ) : (
              <div className="space-y-3">
                {segments.map((segment) => (
                  <div
                    key={segment.key}
                    className="rounded overflow-hidden border border-blueprint-line"
                    style={{ borderTop: `3px solid ${SEGMENT_TYPE_ACCENT[segment.type]}` }}
                  >
                    <div className="bg-blueprint-raised/60 px-3 py-1.5">
                      <p className="text-[11px] text-blueprint-muted">
                        {segment.label || SEGMENT_TYPE_LABEL[segment.type]}
                      </p>
                    </div>
                    <div className="p-2 space-y-2.5">
                      {segment.exercises.map((exercise) => (
                        <div key={exercise.key}>
                          <p className="text-xs text-blueprint-ink font-medium truncate">
                            {exercise.name.trim() || "Untitled exercise"}
                            {exercise.eachSide ? " (each side)" : ""}
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {exercise.sets.map((set, i) => (
                              <li key={set.key} className="text-[10px] text-blueprint-muted flex justify-between gap-2">
                                <span className="truncate">
                                  Set {i + 1}
                                  {set.target ? `: ${set.target}` : ""}
                                </span>
                                {set.restSeconds ? <span className="shrink-0">{set.restSeconds}s rest</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
