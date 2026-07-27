import crypto from 'crypto';
import TrialUsage from '../models/TrialUsage.js';

export const FREE_TRIAL_LIMIT = Math.max(
  0,
  Number.parseInt(
    process.env.FREE_TRIAL_LIMIT || '3',
    10
  ) || 3
);

function normalizeDeviceId(deviceId) {
  return String(deviceId ?? '').trim();
}

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getDeviceHash(deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    throw createServiceError(
      'Device ID is required.',
      400
    );
  }

  if (normalizedDeviceId.length > 200) {
    throw createServiceError(
      'Invalid device ID.',
      400
    );
  }

  return crypto
    .createHash('sha256')
    .update(normalizedDeviceId)
    .digest('hex');
}

function formatStatus(count = 0) {
  const used = Math.min(
    Math.max(Number(count) || 0, 0),
    FREE_TRIAL_LIMIT
  );

  return {
    limit: FREE_TRIAL_LIMIT,
    used,
    remaining: Math.max(
      FREE_TRIAL_LIMIT - used,
      0
    )
  };
}

export async function getTrialStatus(deviceId) {
  const deviceHash = getDeviceHash(deviceId);

  const usage = await TrialUsage.findOne({
    deviceHash
  }).lean();

  return formatStatus(usage?.count || 0);
}

async function incrementExistingUsage(deviceHash) {
  return TrialUsage.findOneAndUpdate(
    {
      deviceHash,
      count: { $lt: FREE_TRIAL_LIMIT }
    },
    {
      $inc: { count: 1 },
      $set: { lastUsedAt: new Date() }
    },
    {
      new: true
    }
  ).lean();
}

export async function reserveTrialAttempt(deviceId) {
  const deviceHash = getDeviceHash(deviceId);

  if (FREE_TRIAL_LIMIT <= 0) {
    return {
      allowed: false,
      ...formatStatus(FREE_TRIAL_LIMIT)
    };
  }

  let usage = await incrementExistingUsage(
    deviceHash
  );

  if (!usage) {
    try {
      usage = await TrialUsage.create({
        deviceHash,
        count: 1,
        lastUsedAt: new Date()
      });

      usage = usage.toObject();
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      usage = await incrementExistingUsage(
        deviceHash
      );
    }
  }

  if (!usage) {
    const status = await getTrialStatus(
      deviceId
    );

    return {
      allowed: false,
      ...status
    };
  }

  return {
    allowed: true,
    ...formatStatus(usage.count)
  };
}

export async function rollbackTrialAttempt(deviceId) {
  const deviceHash = getDeviceHash(deviceId);

  await TrialUsage.findOneAndUpdate(
    {
      deviceHash,
      count: { $gt: 0 }
    },
    {
      $inc: { count: -1 }
    }
  );

  return getTrialStatus(deviceId);
}
