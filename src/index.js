// 📁 index.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes/generateBrief.js';
import nodemailer from 'nodemailer';
import User from './models/User.js';
import connectDB from './mongodb/db.js';
import Stripe from 'stripe';

// 📌 Učitaj .env pre svega ostalog
dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🌐 Poveži se na MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// 🧠 Stripe webhook mora doći PRE express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('✅ Webhook event:', event.type);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const email = event.data.object.customer_email;
    console.log('📩 Customer Email:', email);

    if (email) {
      try {
        await User.findOneAndUpdate(
          { email },
          { isPro: true },
          { upsert: true, new: true }
        );
        console.log('✅ User updated in DB');
      } catch (dbErr) {
        console.error('❌ MongoDB update error:', dbErr.message);
      }
    }
  }

  res.json({ received: true });
});

// ✅ Ostali middlewari posle webhooka
app.use(express.json());
app.use(cors());

// 📦 Rute
app.use('/api/brief', router);

// 📬 Email slanje
app.post('/api/send-email', async (req, res) => {
  const { email, content } = req.body;
  if (!email || !content) return res.status(400).json({ error: "Nedostaju podaci." });

  try {
    const transporter = nodemailer.createTransport({
      host: "mail.smtp2go.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: `"SEO Ekstenzija" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "SEO Brief",
      text: content
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Email uspešno poslat!" });
  } catch (error) {
    console.error("Greška pri slanju mejla:", error.message);
    res.status(500).json({ error: "Greška pri slanju mejla." });
  }
});

// ✅ Provera Pro statusa korisnika
app.get('/api/pro-status', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const user = await User.findOne({ email });
    res.json({ isPro: user?.isPro || false });
  } catch (err) {
    console.error('MongoDB error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Kreiranje Stripe checkout sesije
app.post('/api/create-checkout-session', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription', // koristiš SUBSCRIPTION jer koristiš price ID sa recurring
      customer_email: email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 🖥️ Startuj server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
