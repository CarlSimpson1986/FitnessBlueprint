#!/usr/bin/env bash
#
# PreToolUse hook for Bash commands.
#
# Claude Code passes tool call details as JSON on stdin and reads this
# script's exit code: 0 = allow, 2 = block and feed stderr back to Claude
# as the reason. This is the hard-constraint layer from claude-md-blueprint.md
# — rules that must never be broken don't belong in CLAUDE.md as prose,
# they belong here where they're actually enforced.
#
# This is a starting point, not exhaustive. Add patterns as new risks
# come up; treat a bypass the same way you'd treat a CLAUDE.md miss —
# as a bug in this script to fix, not a one-off to shrug at.

set -uo pipefail

INPUT=$(cat)

# Extract the command string from the tool_input JSON. Try jq first, then
# python3, then node — don't assume any one of them is installed. If none
# are available, fall back to matching against the raw JSON blob, which
# is why every pattern below is written to tolerate trailing junk (no
# `$` end-anchors) rather than requiring a clean isolated string.
CMD=""
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
fi
if [ -z "$CMD" ] && command -v python3 >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("command", ""))
except Exception:
    pass
' 2>/dev/null)
fi
if [ -z "$CMD" ] && command -v node >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | node -e '
let data = "";
process.stdin.on("data", d => data += d);
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(data);
    process.stdout.write(parsed.tool_input && parsed.tool_input.command ? parsed.tool_input.command : "");
  } catch (e) {}
});
' 2>/dev/null)
fi
if [ -z "$CMD" ]; then
  # Last resort: no parser available, scan the raw JSON blob.
  # Every pattern below avoids end-anchors so this still works.
  CMD="$INPUT"
fi

block() {
  echo "🚫 Blocked by .claude/hooks/pre-bash-guard.sh: $1" >&2
  echo "If this command is genuinely needed, run it manually outside Claude Code, or edit the hook." >&2
  exit 2
}

# --- Destructive filesystem operations --------------------------------
# Matches rm with -r and -f in either order/combination, targeting root,
# home, or a bare wildcard. No end-anchor — works even against raw JSON.
if echo "$CMD" | grep -qE '\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(/|\$HOME|~|\*)([[:space:]"]|$)'; then
  block "recursive force-delete targeting root, home, or a wildcard"
fi

# --- Secrets exposure ---------------------------------------------------
if echo "$CMD" | grep -qE '\b(cat|less|more|head|tail)\b[^&|;]*\.env(\.[a-zA-Z]+)?\b'; then
  block "reading a .env file directly — secrets shouldn't be echoed into the transcript"
fi

if echo "$CMD" | grep -qE '\bprintenv\b|(^|;|&&|\|)\s*env\s*($|;|&&|\|)'; then
  block "dumping the full environment — likely to include secrets"
fi

# --- Git history / branch protection ------------------------------------
if echo "$CMD" | grep -qE 'git\s+push\b[^&|;]*(--force\b|--force-with-lease\b|\s-[a-zA-Z]*f[a-zA-Z]*(\s|$))' && echo "$CMD" | grep -qE '\b(main|master)\b'; then
  block "force-push to main/master"
fi

if echo "$CMD" | grep -qE 'git\s+reset\s+--hard\s+(origin/)?(main|master)\b'; then
  block "hard reset of main/master — likely to discard unpushed work"
fi

# --- Supply-chain risk ----------------------------------------------------
if echo "$CMD" | grep -qE 'curl[^&|;]*\|\s*(sudo\s+)?(bash|sh)\b'; then
  block "piping a remote script straight into a shell — fetch it, read it, then run it"
fi

# --- Production database ---------------------------------------------------
if echo "$CMD" | grep -qE 'supabase\s+db\s+push' && echo "$CMD" | grep -qE '\b(prod|production)\b'; then
  block "supabase db push against something referencing 'production' — run this manually with a reviewed diff instead"
fi

exit 0
