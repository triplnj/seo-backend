import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';

import {
  validateLicenseForProduct
} from '../services/lemonLicense.js';

dotenv.config();

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizeText(value) {
  return String(value ?? '').trim();
}

router.post('/', async (req, res) => {
  /*
   * Glavni daljinski prekidač.
   */
  if (
    process.env.EXTENSION_ENABLED !== 'true'
  ) {
    return res.status(503).json({
      error:
        'The service is temporarily unavailable.'
    });
  }

  const {
    keyword,
    pageType,
    language = 'sr',
    mode = 'brief',
    audience = '',
    tone = '',
    licenseKey,
    instanceId
  } = req.body || {};

  const normalizedKeyword =
    normalizeText(keyword);

  const normalizedPageType =
    normalizeText(pageType);

  const normalizedLanguage =
    normalizeText(language) || 'sr';

  const normalizedMode =
    normalizeText(mode) || 'brief';

  const normalizedAudience =
    normalizeText(audience);

  const normalizedTone =
    normalizeText(tone);

  const normalizedLicenseKey =
    normalizeText(licenseKey);

  const normalizedInstanceId =
    normalizeText(instanceId);

  if (
    !normalizedKeyword ||
    !normalizedPageType ||
    !normalizedLanguage
  ) {
    return res.status(400).json({
      error:
        'Keyword, page type and language are required.'
    });
  }

  /*
   * Stare verzije ekstenzije ne šalju licencu,
   * pa će automatski biti blokirane.
   */
  if (
    !normalizedLicenseKey ||
    !normalizedInstanceId
  ) {
    return res.status(403).json({
      error:
        'An active Pro subscription is required.',
      code: 'LICENSE_REQUIRED'
    });
  }

  /*
   * Provera Lemon Squeezy licence pre OpenAI
   * poziva, da se tvoj API kredit ne troši na
   * neautorizovane zahteve.
   */
  let licenseValidation;

  try {
    licenseValidation =
      await validateLicenseForProduct({
        licenseKey: normalizedLicenseKey,
        instanceId: normalizedInstanceId
      });
  } catch (error) {
    console.error(
      'License validation service error:',
      error?.message || error
    );

    return res.status(
      error?.statusCode || 503
    ).json({
      error:
        'Unable to verify the subscription.',
      code: 'LICENSE_SERVICE_ERROR'
    });
  }

  if (!licenseValidation.valid) {
    return res.status(403).json({
      error:
        licenseValidation.error ||
        'The subscription is inactive or expired.',
      code: 'LICENSE_INVALID'
    });
  }

  const briefPrompts = {
    sr: `Napravi SEO brief za Shopify ${normalizedPageType} stranicu. Koristi ključnu reč: "${normalizedKeyword}" (prevedi je na srpski ako nije već na srpskom).
Ciljna grupa: ${normalizedAudience || 'generalna populacija'}.
Ton: ${normalizedTone || 'profesionalan'}.
Odgovori u sledećem formatu:
1. Naslov (H1)
2. Meta opis
3. Ključne reči
4. Struktura teksta
5. CTA
6. Dužina
7. Ton pisanja`,

    en: `Create an SEO brief for a Shopify ${normalizedPageType} page. Use the keyword: "${normalizedKeyword}" (translate it to English if needed).
Target audience: ${normalizedAudience || 'general public'}.
Tone of voice: ${normalizedTone || 'professional'}.
Respond with:
1. Title (H1)
2. Meta description
3. Keywords
4. Content structure
5. Call to action
6. Length
7. Tone of voice`,

    de: `Erstelle ein SEO-Brief für eine Shopify ${normalizedPageType}-Seite. Verwende das Keyword: "${normalizedKeyword}" (übersetze es ins Deutsche, falls nötig).
Zielgruppe: ${normalizedAudience || 'breite Öffentlichkeit'}.
Ton: ${normalizedTone || 'professionell'}.
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
    sr: `Napiši kompletan SEO optimizovani blog za Shopify ${normalizedPageType} stranicu koristeći ključnu reč: "${normalizedKeyword}" (prevedi je na srpski ako nije već na srpskom).
Ciljna grupa: ${normalizedAudience || 'generalna populacija'}.
Ton: ${normalizedTone || 'prijateljski i informativan'}.
Blog treba da sadrži:
- naslov (H1)
- uvod
- 3 do 5 sekcija sa podnaslovima (H2)
- meta opis
- poziv na akciju
- prirodnu upotrebu ključne reči
Jezik: srpski.`,

    en: `Write a complete SEO-optimized blog for a Shopify ${normalizedPageType} page using the keyword: "${normalizedKeyword}" (translate it to English if needed).
Target audience: ${normalizedAudience || 'general public'}.
Tone of voice: ${normalizedTone || 'friendly and helpful'}.
The blog should include:
- Title (H1)
- Introduction
- 3 to 5 sections with H2s
- Meta description
- Call to action
- Natural usage of the keyword
Language: English.`,

    de: `Schreibe einen vollständigen SEO-optimierten Blog für eine Shopify ${normalizedPageType}-Seite mit dem Keyword: "${normalizedKeyword}" (übersetze es ins Deutsche, falls nötig).
Zielgruppe: ${normalizedAudience || 'breite Öffentlichkeit'}.
Ton: ${normalizedTone || 'informativ und vertrauenswürdig'}.
Der Blog sollte enthalten:
- Titel (H1)
- Einleitung
- 3 bis 5 Abschnitte mit H2
- Meta-Beschreibung
- Call to Action
- Natürliche Verwendung des Keywords
Sprache: Deutsch.`
  };

  const prompt =
    normalizedMode === 'full'
      ? fullPrompts[normalizedLanguage] ||
        fullPrompts.sr
      : briefPrompts[normalizedLanguage] ||
        briefPrompts.sr;

  try {
    const chat =
      await openai.chat.completions.create({
        model:
          process.env.OPENAI_MODEL ||
          'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert SEO content strategist. Follow the requested language and format precisely.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

    const result =
      chat.choices[0]?.message?.content?.trim();

    if (!result) {
      throw new Error(
        'OpenAI returned an empty response.'
      );
    }

    return res.json({
      brief: result
    });
  } catch (error) {
    const errorDetails =
      error?.response?.data ||
      error?.error ||
      error?.message ||
      error;

    console.error(
      'OpenAI error:',
      errorDetails
    );

    console.error(
      'OpenAI status:',
      error?.status ||
        error?.response?.status
    );

    console.error(
      'OpenAI code:',
      error?.code
    );

    return res
      .status(
        error?.status ||
          error?.response?.status ||
          500
      )
      .json({
        error:
          error?.response?.data?.error
            ?.message ||
          error?.response?.data?.message ||
          error?.error?.message ||
          error?.message ||
          'Failed to generate brief.',
        code:
          error?.response?.data?.error
            ?.code ||
          error?.code ||
          null
      });
  }
});

export default router;