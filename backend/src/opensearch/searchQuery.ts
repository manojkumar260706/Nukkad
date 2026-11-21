type PriceOperator = 'gt' | 'gte' | 'lt' | 'lte';

const priceClause = /\b(at least|at most|up to|less than|more than|under|below|over|above)\s+(?:₹\s*|(?:rs\.?|inr)\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)[ \t]*(k\b|thousand\b)?(?!\w|[.,]\d)/gi;

const operators: Record<string, PriceOperator> = {
  'at least': 'gte', 'at most': 'lte', 'up to': 'lte',
  'less than': 'lt', 'more than': 'gt',
  under: 'lt', below: 'lt', over: 'gt', above: 'gt'
};

export function parsePriceQuery(input: string) {
  const range: Partial<Record<PriceOperator, number>> = {};
  const text = input.replace(priceClause, (clause, phrase: string, amount: string, unit?: string) => {
    const value = Number(amount.replace(/,/g, '')) * (unit ? 1000 : 1);
    if (!Number.isFinite(value)) return clause;
    const operator = operators[phrase.toLowerCase()];
    const previous = range[operator];
    range[operator] = previous === undefined ? value :
      operator.startsWith('g') ? Math.max(previous, value) : Math.min(previous, value);
    return ' ';
  }).trim().replace(/\s+/g, ' ');
  return { text, range };
}
