const LEMON_LICENSE_API =
  'https://api.lemonsqueezy.com/v1/licenses';

const validationCache = new Map();

function normalizeValue(value) {
  return String(value ?? '').trim();
}

function getCacheTtl() {
  const configuredValue = Number(
    process.env.LICENSE_CACHE_TTL_MS
  );

  if (
    Number.isFinite(configuredValue) &&
    configuredValue >= 0
  ) {
    return configuredValue;
  }

  return 120000;
}

function getExpectedProduct() {
  const productId = normalizeValue(
    process.env.LEMON_SQUEEZY_PRODUCT_ID
  );

  const variantId = normalizeValue(
    process.env.LEMON_SQUEEZY_VARIANT_ID
  );

  if (!productId || !variantId) {
    const error = new Error(
      'Lemon Squeezy product configuration is missing.'
    );

    error.statusCode = 500;
    throw error;
  }

  return {
    productId,
    variantId
  };
}

function belongsToExpectedProduct(meta) {
  const { productId, variantId } =
    getExpectedProduct();

  return (
    normalizeValue(meta?.product_id) === productId &&
    normalizeValue(meta?.variant_id) === variantId
  );
}

function getCacheKey(licenseKey, instanceId) {
  return `${licenseKey}:${instanceId}`;
}

function getCachedValidation(licenseKey, instanceId) {
  const cacheKey = getCacheKey(
    licenseKey,
    instanceId
  );

  const cachedItem = validationCache.get(cacheKey);

  if (!cachedItem) {
    return null;
  }

  if (cachedItem.expiresAt <= Date.now()) {
    validationCache.delete(cacheKey);
    return null;
  }

  return cachedItem.value;
}

function cacheValidation(
  licenseKey,
  instanceId,
  validation
) {
  const ttl = getCacheTtl();

  if (ttl <= 0 || !validation.valid) {
    return;
  }

  const cacheKey = getCacheKey(
    licenseKey,
    instanceId
  );

  validationCache.set(cacheKey, {
    value: validation,
    expiresAt: Date.now() + ttl
  });
}

export function clearCachedValidation(
  licenseKey,
  instanceId
) {
  if (licenseKey && instanceId) {
    validationCache.delete(
      getCacheKey(licenseKey, instanceId)
    );

    return;
  }

  validationCache.clear();
}

async function callLicenseApi(action, parameters) {
  const formData = new URLSearchParams();

  Object.entries(parameters).forEach(
    ([key, value]) => {
      const normalizedValue = normalizeValue(value);

      if (normalizedValue) {
        formData.set(key, normalizedValue);
      }
    }
  );

  let response;

  try {
    response = await fetch(
      `${LEMON_LICENSE_API}/${action}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      }
    );
  } catch (error) {
    const serviceError = new Error(
      'Unable to contact Lemon Squeezy.'
    );

    serviceError.statusCode = 503;
    serviceError.cause = error;

    throw serviceError;
  }

  const rawResponse = await response.text();

  let data;

  try {
    data = rawResponse
      ? JSON.parse(rawResponse)
      : {};
  } catch {
    const serviceError = new Error(
      `Lemon Squeezy returned an invalid response (${response.status}).`
    );

    serviceError.statusCode = 502;
    throw serviceError;
  }

  if (!response.ok) {
    const serviceError = new Error(
      data?.error ||
        `Lemon Squeezy returned status ${response.status}.`
    );

    serviceError.statusCode =
      response.status >= 500
        ? 502
        : response.status;

    serviceError.lemonResponse = data;

    throw serviceError;
  }

  return data;
}

export async function activateLicenseForProduct({
  licenseKey,
  instanceName
}) {
  const normalizedKey = normalizeValue(licenseKey);
  const normalizedName = normalizeValue(instanceName);

  if (!normalizedKey) {
    return {
      valid: false,
      error: 'License key is required.'
    };
  }

  if (!normalizedName) {
    return {
      valid: false,
      error: 'Instance name is required.'
    };
  }

  const data = await callLicenseApi(
    'activate',
    {
      license_key: normalizedKey,
      instance_name: normalizedName
    }
  );

  const productMatches =
    belongsToExpectedProduct(data.meta);

  const instanceId = normalizeValue(
    data?.instance?.id
  );

  /*
   * Ako je korisnik uneo validnu licencu nekog drugog
   * proizvoda, uklanjamo upravo kreiranu aktivaciju.
   */
  if (!productMatches && instanceId) {
    try {
      await callLicenseApi('deactivate', {
        license_key: normalizedKey,
        instance_id: instanceId
      });
    } catch (cleanupError) {
      console.error(
        'Unable to clean up wrong product activation:',
        cleanupError?.message || cleanupError
      );
    }
  }

  const valid =
    data?.activated === true &&
    productMatches &&
    data?.license_key?.status === 'active' &&
    Boolean(instanceId);

  return {
    valid,
    instanceId: valid ? instanceId : null,
    status: data?.license_key?.status || null,
    expiresAt:
      data?.license_key?.expires_at || null,
    activationLimit:
      data?.license_key?.activation_limit ?? null,
    activationUsage:
      data?.license_key?.activation_usage ?? null,
    productName:
      data?.meta?.product_name || null,
    variantName:
      data?.meta?.variant_name || null,
    error: valid
      ? null
      : !productMatches
        ? 'This license belongs to another product.'
        : data?.error ||
          'The license could not be activated.'
  };
}

export async function validateLicenseForProduct({
  licenseKey,
  instanceId
}) {
  const normalizedKey = normalizeValue(licenseKey);
  const normalizedInstanceId =
    normalizeValue(instanceId);

  if (!normalizedKey || !normalizedInstanceId) {
    return {
      valid: false,
      error:
        'License key and instance ID are required.'
    };
  }

  const cachedValidation =
    getCachedValidation(
      normalizedKey,
      normalizedInstanceId
    );

  if (cachedValidation) {
    return cachedValidation;
  }

  const data = await callLicenseApi(
    'validate',
    {
      license_key: normalizedKey,
      instance_id: normalizedInstanceId
    }
  );

  const productMatches =
    belongsToExpectedProduct(data.meta);

  const returnedInstanceId = normalizeValue(
    data?.instance?.id
  );

  const valid =
    data?.valid === true &&
    productMatches &&
    data?.license_key?.status === 'active' &&
    returnedInstanceId === normalizedInstanceId;

  const validation = {
    valid,
    status: data?.license_key?.status || null,
    expiresAt:
      data?.license_key?.expires_at || null,
    activationLimit:
      data?.license_key?.activation_limit ?? null,
    activationUsage:
      data?.license_key?.activation_usage ?? null,
    productName:
      data?.meta?.product_name || null,
    variantName:
      data?.meta?.variant_name || null,
    error: valid
      ? null
      : !productMatches
        ? 'This license belongs to another product.'
        : data?.error ||
          'The license is invalid or expired.'
  };

  cacheValidation(
    normalizedKey,
    normalizedInstanceId,
    validation
  );

  return validation;
}

export async function deactivateLicenseInstance({
  licenseKey,
  instanceId
}) {
  const normalizedKey = normalizeValue(licenseKey);
  const normalizedInstanceId =
    normalizeValue(instanceId);

  if (!normalizedKey || !normalizedInstanceId) {
    return {
      success: false,
      error:
        'License key and instance ID are required.'
    };
  }

  const data = await callLicenseApi(
    'deactivate',
    {
      license_key: normalizedKey,
      instance_id: normalizedInstanceId
    }
  );

  clearCachedValidation(
    normalizedKey,
    normalizedInstanceId
  );

  return {
    success: data?.deactivated === true,
    status: data?.license_key?.status || null,
    error:
      data?.deactivated === true
        ? null
        : data?.error ||
          'The license instance could not be deactivated.'
  };
}