/** Where the last problem is kept, so it survives a reload in the same tab. */
const STORAGE_KEY = 'stormrune:last-problem';

/** When the game last reloaded itself to recover (Date.now()), for the same tab. */
const RECOVERED_KEY = 'stormrune:recovered-at';

/**
 * Frames that fail one after another this many times mean the game is stuck
 * (about two seconds at 60 frames per second).
 */
const FAILED_FRAMES_BEFORE_RELOAD = 120;

/** The game reloads itself at most once in this long, so it can't reload in a loop (ms). */
const RELOAD_COOLDOWN_MS = 60000;

/** The last report, so an error that repeats on every event is recorded once. */
let previous = { key: '', at: 0 };

/**
 * Records an error the game survived: it goes to the console and is kept
 * as "the last problem", which the settings panel shows. On a phone with no
 * developer tools, that is how a player can report what went wrong.
 */
export function reportProblem(error, where) {
  const message = `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
  const key = `${where} ${message}`;
  const now = Date.now();
  const repeated = key === previous.key && now - previous.at < 1000;
  previous = { key, at: now };
  if (repeated) {
    return;
  }

  console.error(`Stormrune (${where}):`, error);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ message, where, at: new Date(now).toLocaleString() }));
  } catch {
    // Storage can be unavailable (private mode); the console still has it.
  }
}

/** The last problem recorded in this tab, or null. */
export function lastProblem() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Phaser asks the browser for each next frame only after the current one has
 * run, so a single error in a frame would stop the game for good: nothing
 * more is drawn and no tap gets an answer. The game's step is wrapped so a
 * frame that fails is reported and skipped, and the next one still comes.
 * If frames keep failing, the game is stuck anyway, and the page reloads.
 * Errors outside the game loop (in event handlers) are reported too.
 */
export function keepRunningAfterErrors(game) {
  const step = game.step;
  let failedFrames = 0;
  const safeStep = function (time, delta) {
    try {
      step.call(game, time, delta);
      failedFrames = 0;
    } catch (error) {
      failedFrames += 1;
      // A failure that repeats is the same problem: report it once.
      if (failedFrames === 1) {
        reportProblem(error, 'game frame');
      } else if (failedFrames === FAILED_FRAMES_BEFORE_RELOAD) {
        reloadToRecover();
      }
    }
  };
  // Phaser binds game.step when its loop starts, after the assets load.
  game.step = safeStep;
  if (game.loop.started) {
    game.loop.callback = safeStep;
  }

  window.addEventListener('error', (event) => reportProblem(event.error ?? event.message, 'page'));
  window.addEventListener('unhandledrejection', (event) => reportProblem(event.reason, 'page'));
}

/**
 * Reloads the page, which starts the game over from the menu: better than a
 * game frozen until the player closes it. The last problem stays recorded.
 * If the game got stuck again soon after reloading, reloading again would
 * not help, so it doesn't.
 */
function reloadToRecover() {
  try {
    const recoveredAt = Number(sessionStorage.getItem(RECOVERED_KEY));
    if (Date.now() - recoveredAt < RELOAD_COOLDOWN_MS) {
      return;
    }
    sessionStorage.setItem(RECOVERED_KEY, String(Date.now()));
  } catch {
    // Without storage there is no way to tell a loop apart: don't reload.
    return;
  }
  window.location.reload();
}
