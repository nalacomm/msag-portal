export default function handler(req, res) {
  const checks = {
    HARVEST_ACCOUNT_ID:    process.env.HARVEST_ACCOUNT_ID    ? '✓ set' : '✗ missing',
    HARVEST_ACCESS_TOKEN:  process.env.HARVEST_ACCESS_TOKEN  ? '✓ set' : '✗ missing',
    HARVEST_PROJECT_ID:    process.env.HARVEST_PROJECT_ID    ? '✓ set' : '✗ missing',
    SMTP_USER:             process.env.SMTP_USER             ? '✓ set' : '✗ missing',
    SMTP_PASS:             process.env.SMTP_PASS             ? '✓ set' : '✗ missing',
    NOTIFY_EMAIL:          process.env.NOTIFY_EMAIL          ? '✓ set' : '✗ missing',
  };
  const allGood = Object.values(checks).every(v => v === '✓ set');
  res.status(allGood ? 200 : 500).json({ status: allGood ? 'ok' : 'misconfigured', checks });
}
