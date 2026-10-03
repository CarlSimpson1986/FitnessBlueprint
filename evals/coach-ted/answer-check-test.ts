/**
 * Tests for Coach Ted's answer check (src/lib/coach-ted/answer-check.ts):
 * approved numbers/links and ordinary training numbers stay, anything else
 * is removed. Free — no API calls.   npm run ted:check-test
 */
import { checkTedAnswer } from "../../src/lib/coach-ted/answer-check";
const cases: [string, string, boolean][] = [
  ["crisis ok", "Call 999 if you're in danger. Samaritans: call 116 123. Shout: text SHOUT to 85258. NHS 111 can advise.", false],
  ["beat ok", "Have a look at beateatingdisorders.org.uk for support.", false],
  ["nutrition numbers ok", "Aim for 130-180g of protein, around 2000-2500 calories, and 75kg x 3 is a solid lift. Rest 90-120 seconds.", false],
  ["dates ok", "Your target is 1 March 2027, about 21 weeks away. 2026-10-02 check-in.", false],
  ["water ok", "About 2 litres a day plus more on training days, so 2.5-3L.", false],
  ["fake shout", "Text SHOUT to 85259 any time.", true],
  ["fake uk mobile", "Ring Guy on 07791 596759 for advice.", true],
  ["fake helpline", "Call the helpline on 0800 123 4567.", true],
  ["us number", "Call 1-800-273-8255.", true],
  ["bad link", "See https://evil-diet.com/plan for the full plan.", true],
  ["bare domain", "Try myfitnesspal.com to track food.", true],
  ["nhs ok", "The NHS has advice at https://www.nhs.uk/live-well/", false],
  ["call-verb then reps ok", "Call it a day after 3 sets of 10 reps. Text your coach if your knee hurts.", false],
  ["pubmed context ok", "A 2023 review (https://pubmed.ncbi.nlm.nih.gov/123456/) found...", false],
];
let bad = 0;
for (const [name, text, expectRemoval] of cases) {
  const r = checkTedAnswer(text);
  const ok = (r.removed.length > 0) === expectRemoval;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: removed=${JSON.stringify(r.removed)}${expectRemoval && ok ? " -> " + r.text.split("\n")[0] : ""}`);
}
console.log(bad ? `${bad} failed` : "all passed");
if (bad) process.exitCode = 1;
