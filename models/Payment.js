const { getDB } = require('../config/database');

function mapPayment(row) {
  if (!row) return null;
  return {
    _id: row.id, id: row.id,
    userId: row.user_id,
    razorpayPaymentId: row.razorpay_payment_id,
    razorpayOrderId: row.razorpay_order_id,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    razorpaySignature: row.razorpay_signature,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    plan: row.plan,
    planAmount: row.plan_amount,
    billingCycle: row.billing_cycle,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    invoiceUrl: row.invoice_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

const Payment = {
  async create(fields) {
    const { data, error } = await getDB().from('payments').insert({
      user_id:                  fields.userId,
      razorpay_payment_id:      fields.razorpayPaymentId || null,
      razorpay_order_id:        fields.razorpayOrderId || null,
      razorpay_subscription_id: fields.razorpaySubscriptionId || null,
      razorpay_signature:       fields.razorpaySignature || null,
      amount:                   fields.amount,
      currency:                 fields.currency || 'INR',
      status:                   fields.status || 'created',
      plan:                     fields.plan || 'monthly',
      plan_amount:              fields.planAmount || null,
      billing_cycle:            fields.billingCycle || 'monthly',
      period_start:             fields.periodStart || null,
      period_end:               fields.periodEnd || null,
      notes:                    fields.notes || null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapPayment(data);
  },

  async findByUser(userId, limit = 20) {
    const { data } = await getDB().from('payments').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).map(mapPayment);
  },

  async totalRevenue() {
    const { data } = await getDB().from('payments').select('amount').eq('status', 'captured');
    return (data || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  },
};

module.exports = Payment;
