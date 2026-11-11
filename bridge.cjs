'use strict';

/**
 * CommonJS bridge so maraki_bingo/server.js can mount the ESM lottery module.
 */
function lotteryEnabled() {
  const v = String(process.env.LOTTERY_ENABLED ?? 'yes').trim().toLowerCase();
  return !(v === 'no' || v === 'false' || v === '0' || v === 'off');
}

async function attachLottery(app) {
  if (!lotteryEnabled()) {
    console.log('[lottery] disabled (LOTTERY_ENABLED=no)');
    return { enabled: false };
  }
  try {
    const mod = await import('./mount.mjs');
    return await mod.attachLottery(app);
  } catch (err) {
    console.error('[lottery] failed to mount — bingo continues without lottery:', err.message);
    if (process.env.LOTTERY_STRICT === 'yes') throw err;
    return { enabled: false, error: err.message };
  }
}

async function stopLottery() {
  try {
    const mod = await import('./mount.mjs');
    await mod.stopLottery();
  } catch {
    /* ignore */
  }
}

module.exports = {
  lotteryEnabled,
  attachLottery,
  stopLottery,
};
