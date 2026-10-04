export const LOAN_PERIOD_DAYS = 14;
export const LATE_FINE_PER_DAY = 25;

export function getDueDateFromNow(referenceDate = new Date()) {
  const nextDueDate = new Date(referenceDate);
  nextDueDate.setDate(nextDueDate.getDate() + LOAN_PERIOD_DAYS);
  return nextDueDate;
}

export function calculateFineAmount(dueAt: Date, returnedAt = new Date()) {
  const dueTime = new Date(dueAt).getTime();
  const returnTime = new Date(returnedAt).getTime();
  const lateDays = Math.max(0, Math.ceil((returnTime - dueTime) / (1000 * 60 * 60 * 24)));
  return lateDays * LATE_FINE_PER_DAY;
}

export function buildFineSummary(transactions: Array<{ fineAmount: number | string | null }>) {
  return transactions.reduce((total, transaction) => {
    const amount = Number(transaction.fineAmount ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}
