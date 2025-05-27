import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const prompt = "Napiši SEO brief za ključnu reč 'muški kaiš'";

const test = async () => {
  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    console.log(chat.choices[0].message.content);
  } catch (error) {
    console.error('OpenAI ERROR:', error.response?.data || error.message);
  }
};

test();
