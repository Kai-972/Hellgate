// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// y = 2a + 0.002(b - 2000), where a is about 1 and b is in the thousands. Training targets carry
// noise; the hidden test targets are the clean rule.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const rule = (a, b) => 2 * a + 0.002 * (b - 2000);
  const make = (n, noisy) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const a = gauss();
      const b = 1000 + 2000 * rng();
      x.push([a, b]);
      y.push(rule(a, b) + (noisy ? 0.1 * gauss() : 0));
    }
    return [x, y];
  };
  const [trainX, trainY] = make(trainSize, true);
  const [testX, testY] = make(testSize, false);
  return { trainX, trainY, testX, testY };
}
