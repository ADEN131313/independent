const stripe = require('stripe');

class PaymentService {
  constructor() {
    this.client = process.env.STRIPE_SECRET_KEY ? stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  async createCheckoutSession(user, priceId, successUrl, cancelUrl) {
    if (!this.client) throw new Error('Stripe not configured');
    const session = await this.client.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      metadata: { userId: user._id.toString() }
    });
    return session;
  }

  constructWebhookEvent(payload, signature) {
    if (!this.client) throw new Error('Stripe not configured');
    return this.client.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  }

  async cancelSubscription(subscriptionId) {
    if (!this.client) throw new Error('Stripe not configured');
    return await this.client.subscriptions.cancel(subscriptionId);
  }

  async getSubscription(subscriptionId) {
    if (!this.client) throw new Error('Stripe not configured');
    return await this.client.subscriptions.retrieve(subscriptionId);
  }
}

module.exports = new PaymentService();