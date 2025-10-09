// Simple in-memory mock bank repository for prototype
const sampleAccounts = [
  { id: 'a1', name: 'Checking', balance: 2543.12 },
  { id: 'a2', name: 'Savings', balance: 10234.5 }
];

const sampleTx = [
  { date: '2025-09-25', desc: 'Coffee Shop', amount: -4.5 },
  { date: '2025-09-24', desc: 'Salary', amount: 2500.0 },
  { date: '2025-09-20', desc: 'Electric Bill', amount: -120.75 },
  { date: '2025-09-18', desc: 'Grocery', amount: -67.3 },
  { date: '2025-09-15', desc: 'Gym', amount: -35.0 }
];

function getAccountsForUser(userId) {
  // return copies
  return sampleAccounts.map(a => ({ ...a }));
}

function getTransactionsForUser(userId) {
  return sampleTx.map(t => ({ ...t }));
}

module.exports = { getAccountsForUser, getTransactionsForUser };
