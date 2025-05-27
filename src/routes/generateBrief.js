import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
process.env.NODE_ENV === 'production';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

router.post('/', async (req, res) => {
    const { keyword, pageType, language = 'sr', mode = 'brief', audience='', tone='' } = req.body;
  
    const briefPrompts = {
      sr: `Napravi SEO brief za Shopify ${pageType} stranicu. Koristi ključnu reč: "${keyword}" (prevedi je na srpski ako nije već na srpskom).
  Ciljna grupa: ${audience || 'generalna populacija'}.
  Ton: ${tone || 'profesionalan'}.
  Odgovori u sledećem formatu:
  1. Naslov (H1)
  2. Meta opis
  3. Ključne reči
  4. Struktura teksta
  5. CTA
  6. Dužina
  7. Ton pisanja`,
  
      en: `Create an SEO brief for a Shopify ${pageType} page. Use the keyword: "${keyword}" (translate it to English if needed).
    Target audience: ${audience || 'general public'}.
    Tone of voice: ${tone || 'professional'}.
  Respond with:
  1. Title (H1)
  2. Meta description
  3. Keywords
  4. Content structure
  5. Call to action
  6. Length
  7. Tone of voice`,
  
      de: `Erstelle ein SEO-Brief für eine Shopify ${pageType}-Seite. Verwende das Keyword: "${keyword}" (übersetze es ins Deutsche, falls nötig).
  Zielgruppe: ${audience || 'breite Öffentlichkeit'}.
Ton: ${tone || 'professionell'}.
  Antwort mit:
  1. Titel (H1)
  2. Meta-Beschreibung
  3. Schlüsselwörter
  4. Inhaltsstruktur
  5. Call-to-Action
  6. Länge
  7. Schreibstil`
    };
  
    const fullPrompts = {
      sr: `Napiši kompletan SEO optimizovani blog za Shopify ${pageType} stranicu koristeći ključnu reč: "${keyword}" (prevedi je na srpski ako nije već na srpskom).
    Ciljna grupa: ${audience || 'generalna populacija'}.
  Ton: ${tone || 'prijateljski i informativan'}.
      Blog treba da sadrži:
  - naslov (H1)
  - uvod
  - 3 do 5 sekcija sa podnaslovima (H2)
  - meta opis
  - poziv na akciju
  - prirodnu upotrebu ključne reči
  Jezik: srpski.`,
  
      en: `Write a complete SEO-optimized blog for a Shopify ${pageType} page using the keyword: "${keyword}" (translate it to English if needed).
  Target audience: ${audience || 'general public'}.
Tone of voice: ${tone || 'friendly and helpful'}.
      The blog should include:
  - Title (H1)
  - Introduction
  - 3 to 5 sections with H2s
  - Meta description
  - Call to action
  - Natural usage of the keyword
  Language: English.`,
  
      de: `Schreibe einen vollständigen SEO-optimierten Blog für eine Shopify ${pageType}-Seite mit dem Keyword: "${keyword}" (übersetze es ins Deutsche, falls nötig).
  Zielgruppe: ${audience || 'breite Öffentlichkeit'}.
Ton: ${tone || 'informativ und vertrauenswürdig'}.
      Der Blog sollte enthalten:
  - Titel (H1)
  - Einleitung
  - 3 bis 5 Abschnitte mit H2
  - Meta-Beschreibung
  - Call to Action
  - Natürliche Verwendung des Keywords
  Sprache: Deutsch.`
    };
  
    const prompt = mode === 'full'
      ? fullPrompts[language] || fullPrompts.sr
      : briefPrompts[language] || briefPrompts.sr;
  
    console.log("Prompt:", prompt);
  

    try {
        const chat = await openai.chat.completions.create({
            model: 'gpt-4.1-mini-2025-04-14',
            messages: [{ role: 'user', content: prompt }],
        });

        const result = chat.choices[0]?.message?.content || 'No response.';
        res.json({ brief: result, usedPrompt: prompt });
    } catch (error) {
        console.error('OpenAI error:', error?.response.data || error.message || error);
        res.status(500).json({ error: 'AI request failed' });
    }
});

export default router;



