/**
 * Test runner - runs all tests
 */

async function runTests() {
  console.log('='.repeat(60));
  console.log('Running Light Queue Test Suite');
  console.log('='.repeat(60));
  console.log();

  const tests = [
    './Job.test.js',
    './Backoff.test.js',
    './MemoryStore.test.js',
    './FileStore.test.js',
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await import(test);
      passed++;
    } catch (error) {
      console.error(`❌ Test failed: ${test}`);
      console.error(error);
      failed++;
    }
  }

  console.log('='.repeat(60));
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
