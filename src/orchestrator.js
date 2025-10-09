// Very small orchestrator for prototype
const sessionStore = require('./sessionStore');
const mockBank = require('./mockBank');

async function handleIncoming(event) {
  // event expected shape: { from: '+1234', text: 'show my balance' }
  const from = event.from;
  const text = (event.text || '').trim();

  if (!from || !text) {
    return { text: "I didn't understand that. Send 'help' for commands." };
  }

  const session = sessionStore.getOrCreate(from);

  // Simple intent detection
  const normalized = text.toLowerCase();
  if (normalized.includes('balance')) {
    const accounts = mockBank.getAccountsForUser(session.userId);
    const lines = accounts.map(a => `${a.name}: $${a.balance.toFixed(2)}`).join('\n');
    return { text: `You have ${accounts.length} accounts.\n${lines}` };
  }

  if (normalized.includes('transactions') || normalized.includes('recent')) {
    const txs = mockBank.getTransactionsForUser(session.userId);
    const list = txs.slice(0,5).map(t => `${t.date} ${t.desc} $${t.amount.toFixed(2)}`).join('\n');
    return { text: `Recent transactions:\n${list}` };
  }

  if (normalized === 'help') {
    return { text: "Commands:\n- 'balance'\n- 'transactions'\n- 'help'" };
  }

  // Fallback
  return { text: "Sorry, I can't handle that yet. Try 'help' to see supported commands." };
}

module.exports = { handleIncoming };
