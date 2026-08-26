const Stream = require('../models/Stream');

const scheduledStarts = new Map();
const scheduledTerminations = new Map();
const SCHEDULE_CHECK_INTERVAL = 15000;
const DURATION_CHECK_INTERVAL = 30000;
const MAX_TIMEOUT_MS = 2147483647; // 2^31 - 1 (~24.8 days)

let streamingService = null;
let initialized = false;
let scheduleIntervalId = null;
let durationIntervalId = null;

async function init(streamingServiceInstance) {
  if (initialized) {
    return;
  }

  streamingService = streamingServiceInstance;
  streamingService.setSchedulerService(module.exports);
  initialized = true;

  // Register exact timers for existing scheduled streams and live streams with end_time
  await syncAllScheduledStreams();
  await syncAllLiveStreamsEndTime();

  // Polling intervals as secondary safety-net
  scheduleIntervalId = setInterval(checkScheduledStreams, SCHEDULE_CHECK_INTERVAL);
  durationIntervalId = setInterval(checkStreamDurations, DURATION_CHECK_INTERVAL);

  checkScheduledStreams();
  checkStreamDurations();
}

async function syncAllScheduledStreams() {
  try {
    const scheduledStreams = await Stream.findAll(null, 'scheduled');
    for (const stream of scheduledStreams) {
      if (stream.schedule_time) {
        scheduleStreamStart(stream.id, stream.schedule_time);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error syncing scheduled streams:', err);
  }
}

async function syncAllLiveStreamsEndTime() {
  try {
    const liveStreams = await Stream.findAll(null, 'live');
    for (const stream of liveStreams) {
      if (stream.end_time) {
        scheduleStreamTerminationByEndTime(stream.id, stream.end_time, stream.user_id);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error syncing live streams end time:', err);
  }
}

function scheduleStreamStart(streamId, scheduleTime) {
  cancelStreamStart(streamId);
  if (!scheduleTime) return;

  const targetTime = new Date(scheduleTime).getTime();
  if (isNaN(targetTime)) return;

  const now = Date.now();
  const delayMs = targetTime - now;

  if (delayMs <= 0) {
    // Exact start time reached or passed
    startScheduledStreamNow(streamId);
    return;
  }

  if (delayMs < MAX_TIMEOUT_MS) {
    const timeoutId = setTimeout(() => {
      scheduledStarts.delete(streamId);
      startScheduledStreamNow(streamId);
    }, delayMs);

    scheduledStarts.set(streamId, {
      timeoutId,
      targetTime
    });
  }
}

function cancelStreamStart(streamId) {
  if (scheduledStarts.has(streamId)) {
    const item = scheduledStarts.get(streamId);
    if (item.timeoutId) {
      clearTimeout(item.timeoutId);
    }
    scheduledStarts.delete(streamId);
    return true;
  }
  return false;
}

async function startScheduledStreamNow(streamId) {
  try {
    if (!streamingService) return;
    if (streamingService.isStreamActive(streamId) || streamingService.isStreamStarting(streamId)) return;

    const stream = await Stream.findById(streamId);
    if (!stream || stream.status !== 'scheduled') return;

    const baseUrl = process.env.BASE_URL || 'http://localhost:7575';
    console.log(`[Scheduler] 🚀 Exact-Time Trigger: Starting scheduled stream "${stream.title}" (${streamId})`);
    const result = await streamingService.startStream(streamId, false, baseUrl);
    if (!result.success) {
      console.error(`[Scheduler] Failed to start stream ${streamId}:`, result.error);
    }
  } catch (err) {
    console.error(`[Scheduler] Error in startScheduledStreamNow for ${streamId}:`, err);
  }
}

function scheduleStreamTerminationByEndTime(streamId, endTime, userId = null) {
  cancelStreamTermination(streamId);
  if (!endTime) return;

  const targetEndTime = new Date(endTime).getTime();
  if (isNaN(targetEndTime)) return;

  const now = Date.now();
  const delayMs = targetEndTime - now;

  if (delayMs <= 0) {
    stopLiveStreamNow(streamId, userId);
    return;
  }

  if (delayMs < MAX_TIMEOUT_MS) {
    const timeoutId = setTimeout(() => {
      scheduledTerminations.delete(streamId);
      stopLiveStreamNow(streamId, userId);
    }, delayMs);

    scheduledTerminations.set(streamId, {
      timeoutId,
      targetEndTime,
      userId
    });
  }
}

function scheduleStreamTermination(streamId, durationMinutes, userId = null) {
  if (typeof durationMinutes !== 'number' || Number.isNaN(durationMinutes) || durationMinutes < 0) {
    return;
  }
  const durationMs = Math.max(0, durationMinutes * 60 * 1000);
  const targetEndTime = new Date(Date.now() + durationMs);
  return scheduleStreamTerminationByEndTime(streamId, targetEndTime, userId);
}

function cancelStreamTermination(streamId) {
  if (scheduledTerminations.has(streamId)) {
    const scheduled = scheduledTerminations.get(streamId);
    if (scheduled.timeoutId) {
      clearTimeout(scheduled.timeoutId);
    }
    scheduledTerminations.delete(streamId);
    return true;
  }
  return false;
}

async function stopLiveStreamNow(streamId, userId = null) {
  try {
    if (!streamingService) return;
    const stream = await Stream.findById(streamId);
    if (!stream || stream.status !== 'live') {
      scheduledTerminations.delete(streamId);
      return;
    }

    console.log(`[Scheduler] 🛑 Exact-Time Trigger: Ending scheduled stream "${stream.title}" (${streamId})`);
    await streamingService.stopStream(streamId);
    scheduledTerminations.delete(streamId);
  } catch (err) {
    console.error(`[Scheduler] Error in stopLiveStreamNow for ${streamId}:`, err);
    scheduledTerminations.delete(streamId);
  }
}

function getScheduledTermination(streamId) {
  const scheduled = scheduledTerminations.get(streamId);
  if (!scheduled) return null;

  return {
    streamId,
    targetEndTime: scheduled.targetEndTime,
    remainingMs: scheduled.targetEndTime ? scheduled.targetEndTime - Date.now() : null
  };
}

function handleStreamStopped(streamId) {
  cancelStreamTermination(streamId);
  cancelStreamStart(streamId);
}

function syncStreamSchedule(stream) {
  if (!stream) return;
  if (stream.status === 'scheduled' && stream.schedule_time) {
    scheduleStreamStart(stream.id, stream.schedule_time);
  } else {
    cancelStreamStart(stream.id);
  }

  if (stream.status === 'live' && stream.end_time) {
    scheduleStreamTerminationByEndTime(stream.id, stream.end_time, stream.user_id);
  } else if (stream.status !== 'live') {
    cancelStreamTermination(stream.id);
  }
}

async function checkScheduledStreams() {
  try {
    if (!streamingService) {
      return;
    }

    const now = new Date();
    const streams = await Stream.findScheduledInRange(null, now);

    for (const stream of streams) {
      if (streamingService.isStreamActive(stream.id) || streamingService.isStreamStarting(stream.id)) {
        continue;
      }

      const currentStream = await Stream.findById(stream.id);
      if (!currentStream || currentStream.status !== 'scheduled') {
        continue;
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:7575';
      const result = await streamingService.startStream(stream.id, false, baseUrl);

      if (!result.success) {
        console.error(`[Scheduler] Failed to start stream ${stream.id}: ${result.error}`);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled streams:', error);
  }
}

async function checkStreamDurations() {
  try {
    if (!streamingService) {
      return;
    }

    const liveStreams = await Stream.findAll(null, 'live');

    for (const stream of liveStreams) {
      if (!stream.end_time) {
        continue;
      }

      const endTime = new Date(stream.end_time);
      const now = new Date();
      const timeUntilEnd = endTime.getTime() - now.getTime();

      if (timeUntilEnd <= 0) {
        scheduledTerminations.delete(stream.id);

        try {
          await streamingService.stopStream(stream.id);
        } catch (e) {
          await Stream.updateStatus(stream.id, 'offline', stream.user_id);
        }
      } else if (!scheduledTerminations.has(stream.id)) {
        scheduleStreamTerminationByEndTime(stream.id, stream.end_time, stream.user_id);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking stream durations:', error);
  }
}

function shutdown() {
  if (scheduleIntervalId) {
    clearInterval(scheduleIntervalId);
  }
  if (durationIntervalId) {
    clearInterval(durationIntervalId);
  }

  for (const [streamId, scheduled] of scheduledStarts) {
    if (scheduled.timeoutId) {
      clearTimeout(scheduled.timeoutId);
    }
  }
  scheduledStarts.clear();

  for (const [streamId, scheduled] of scheduledTerminations) {
    if (scheduled.timeoutId) {
      clearTimeout(scheduled.timeoutId);
    }
  }
  scheduledTerminations.clear();
}

module.exports = {
  init,
  scheduleStreamStart,
  cancelStreamStart,
  scheduleStreamTermination,
  scheduleStreamTerminationByEndTime,
  cancelStreamTermination,
  getScheduledTermination,
  handleStreamStopped,
  syncStreamSchedule,
  checkScheduledStreams,
  checkStreamDurations,
  shutdown
};
