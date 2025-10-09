async function getFetch() {
  if (globalThis.fetch) return globalThis.fetch;
  const mod = await import('node-fetch');
  return mod.default || mod;
}

async function run() {
  const fetch = await getFetch();
  const res = await fetch('http://localhost:3000/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: '+1555123456', text: 'balance' })
  });
  const j = await res.json();
  console.log('smoke result', j);
}

run().catch(e => { console.error(e); process.exit(1); });
