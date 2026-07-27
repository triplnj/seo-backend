import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

import briefRouter from './routes/generateBrief.js';
import licenseRouter from './routes/license.js';
import trialRouter from './routes/trial.js';
import connectDB from './mongodb/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  })
);

app.use(
  express.json({
    limit: '1mb'
  })
);

app.get('/health', (req, res) => {
  return res.json({
    ok: true,
    service: 'SEO Brief Backend',
    extensionEnabled:
      process.env.EXTENSION_ENABLED ===
      'true'
  });
});

app.use('/api/license', licenseRouter);
app.use('/api/trial', trialRouter);
app.use('/api/brief', briefRouter);

app.post(
  '/api/send-email',
  async (req, res) => {
    const email = String(
      req.body?.email ?? ''
    ).trim();

    const content = String(
      req.body?.content ?? ''
    ).trim();

    if (!email || !content) {
      return res.status(400).json({
        error: 'Nedostaju podaci.'
      });
    }

    try {
      const transporter =
        nodemailer.createTransport({
          host: 'mail.smtp2go.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

      await transporter.sendMail({
        from:
          `"SEO Ekstenzija" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'SEO Brief',
        text: content
      });

      return res.json({
        message: 'Email uspešno poslat!'
      });
    } catch (error) {
      console.error(
        'Greška pri slanju mejla:',
        error?.message || error
      );

      return res.status(500).json({
        error: 'Greška pri slanju mejla.'
      });
    }
  }
);

app.use((req, res) => {
  return res.status(404).json({
    error: 'Route not found.'
  });
});

app.use((error, req, res, next) => {
  console.error(
    'Unhandled server error:',
    error
  );

  return res.status(500).json({
    error: 'Internal server error.'
  });
});

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(
      `Server running on port ${PORT}`
    );
  });
}

startServer().catch(error => {
  console.error(
    'Unable to start server:',
    error
  );
  process.exit(1);
});
