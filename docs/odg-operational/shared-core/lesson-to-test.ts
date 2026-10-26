// @ts-nocheck
// SHARED-CORE lesson->test generation (Domain-B) — turn a captured LESSON (an input that once produced a wrong
// result + the recorded correct answer) into an INDEPENDENT, deterministic regression test that can ACTUALLY FAIL.
// Closes the Domain-B inventory gap: lessons were captured (patch-memory) but no mechanism generated prevention
// tests from them. Pure, €0. Complements runtime/core patch-memory (storage) — this converts a lesson into a guard.
//
// INDEPENDENCE INVARIANT: the generated test's oracle is the lesson's RECORDED `expected` value (ground truth
// captured at fix time) — it NEVER recomputes the oracle by calling the subject-under-test's (possibly buggy)
// logic. A test that derived its expectation from the same code it checks would not be an independent verification.

const defaultEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// lesson = { id, description, input, expected, comparator? }. Returns a runnable test case bound to that lesson.
export function generateTestCase(lesson) {
  if (lesson == null || lesson.id == null) throw new Error('INVALID_LESSON: missing id');
  if (!('expected' in lesson)) throw new Error(`INVALID_LESSON ${lesson.id}: no recorded "expected" oracle`);
  const eq = lesson.comparator || defaultEq;
  return {
    id: `regress:${lesson.id}`,
    description: lesson.description || `regression guard for ${lesson.id}`,
    // subject is the function under test; we feed the recorded input and compare to the recorded expected.
    run(subject) {
      let actual, error = null;
      try { actual = subject(lesson.input); } catch (e) { error = String(e && e.message || e); }
      const status = error == null && eq(actual, lesson.expected) ? 'PASS' : 'FAIL';
      return { id: this.id, status, expected: lesson.expected, actual: error == null ? actual : `THREW: ${error}`, independentOracle: true };
    },
  };
}

// Generate + run a battery from many lessons against a subject resolver (lessonId -> subject fn).
export function runGeneratedTests(lessons, resolveSubject) {
  const results = lessons.map(l => generateTestCase(l).run(resolveSubject(l.id, l)));
  const failed = results.filter(r => r.status === 'FAIL');
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, results, allPass: failed.length === 0 };
}
