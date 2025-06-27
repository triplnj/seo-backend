import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes/generateBrief.js';
import nodemailer from 'nodemailer';
dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use('/api/brief', router);


app.post("/api/send-email", async (req, res) => {
  const { email, content } = req.body;

  if (!email || !content) {
    return res.status(400).json({ error: "Nedostaju podaci." });
  }

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
    console.error("Greška pri slanju mejla:", error.message, error.response);
    res.status(500).json({ error: "Greška pri slanju mejla." });
  }
});

app.listen(PORT, () => {
  console.log(`Server radi na portu ${PORT}`);
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
