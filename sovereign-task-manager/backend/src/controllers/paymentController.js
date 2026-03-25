const User = require('../models/User');

const createCheckoutSession = async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ message: 'Payment service not configured' });

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { priceId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      customer_email: req.user.email
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ message: 'Payment error' });
  }
};

const handleWebhook = async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ message: 'Payment service not configured' });

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        const user = await User.findOne({ email: session.customer_email });
        if (user) {
          user.subscription = { status: 'active', plan: 'pro', stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription };
          await user.save();
        }
        break;
      case 'customer.subscription.deleted':
        const sub = event.data.object;
        await User.updateOne({ 'subscription.stripeSubscriptionId': sub.id }, { 'subscription.status': 'cancelled' });
        break;
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: 'Webhook error' });
  }
};

const getSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ subscription: user.subscription });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ message: 'Payment service not configured' });

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const user = await User.findById(req.user._id);

    if (user.subscription?.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
      user.subscription.status = 'cancelled';
      await user.save();
    }

    res.json({ message: 'Subscription cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createCheckoutSession, handleWebhook, getSubscription, cancelSubscription };