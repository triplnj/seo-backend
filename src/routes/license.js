import express from 'express';

import {
  activateLicenseForProduct,
  deactivateLicenseInstance,
  validateLicenseForProduct
} from '../services/lemonLicense.js';

const router = express.Router();

function normalizeText(value) {
  return String(value ?? '').trim();
}

function sendServiceError(res, error) {
  console.error(
    'License service error:',
    error?.message || error
  );

  return res
    .status(error?.statusCode || 500)
    .json({
      success: false,
      error:
        error?.message ||
        'License service error.'
    });
}

/*
 * Frontend preko ove rute može dobiti aktuelne
 * checkout i billing linkove bez objavljivanja nove
 * verzije ekstenzije.
 */
router.get('/config', (req, res) => {
  return res.json({
    checkoutUrl:
      process.env.LEMON_SQUEEZY_CHECKOUT_URL ||
      '',
    billingUrl:
      process.env.LEMON_SQUEEZY_BILLING_URL ||
      '',
    priceLabel:
      process.env.LEMON_SQUEEZY_PRICE_LABEL ||
      '€9.99/month'
  });
});

/*
 * POST /api/license/activate
 *
 * Body:
 * {
 *   "licenseKey": "...",
 *   "instanceName": "Chrome abc123"
 * }
 */
router.post('/activate', async (req, res) => {
  const licenseKey = normalizeText(
    req.body?.licenseKey
  );

  const instanceName = normalizeText(
    req.body?.instanceName
  );

  if (!licenseKey) {
    return res.status(400).json({
      success: false,
      error: 'License key is required.'
    });
  }

  if (!instanceName) {
    return res.status(400).json({
      success: false,
      error: 'Instance name is required.'
    });
  }

  if (
    licenseKey.length > 200 ||
    instanceName.length > 100
  ) {
    return res.status(400).json({
      success: false,
      error: 'Invalid license data.'
    });
  }

  try {
    const activation =
      await activateLicenseForProduct({
        licenseKey,
        instanceName
      });

    if (!activation.valid) {
      return res.status(403).json({
        success: false,
        error:
          activation.error ||
          'License activation failed.'
      });
    }

    return res.json({
      success: true,
      instanceId: activation.instanceId,
      status: activation.status,
      expiresAt: activation.expiresAt,
      activationLimit:
        activation.activationLimit,
      activationUsage:
        activation.activationUsage,
      productName: activation.productName,
      variantName: activation.variantName
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
});

/*
 * POST /api/license/validate
 *
 * Body:
 * {
 *   "licenseKey": "...",
 *   "instanceId": "..."
 * }
 */
router.post('/validate', async (req, res) => {
  const licenseKey = normalizeText(
    req.body?.licenseKey
  );

  const instanceId = normalizeText(
    req.body?.instanceId
  );

  if (!licenseKey || !instanceId) {
    return res.status(400).json({
      valid: false,
      error:
        'License key and instance ID are required.'
    });
  }

  try {
    const validation =
      await validateLicenseForProduct({
        licenseKey,
        instanceId
      });

    return res.json(validation);
  } catch (error) {
    return sendServiceError(res, error);
  }
});

/*
 * POST /api/license/deactivate
 *
 * Body:
 * {
 *   "licenseKey": "...",
 *   "instanceId": "..."
 * }
 */
router.post(
  '/deactivate',
  async (req, res) => {
    const licenseKey = normalizeText(
      req.body?.licenseKey
    );

    const instanceId = normalizeText(
      req.body?.instanceId
    );

    if (!licenseKey || !instanceId) {
      return res.status(400).json({
        success: false,
        error:
          'License key and instance ID are required.'
      });
    }

    try {
      const result =
        await deactivateLicenseInstance({
          licenseKey,
          instanceId
        });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

export default router;