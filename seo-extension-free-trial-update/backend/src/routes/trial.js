import express from 'express';
import {
  getTrialStatus
} from '../services/trialUsage.js';

const router = express.Router();

router.post('/status', async (req, res) => {
  try {
    const status = await getTrialStatus(
      req.body?.deviceId
    );

    return res.json(status);
  } catch (error) {
    console.error(
      'Trial status error:',
      error?.message || error
    );

    return res
      .status(error?.statusCode || 500)
      .json({
        error:
          error?.message ||
          'Unable to load trial status.'
      });
  }
});

export default router;
