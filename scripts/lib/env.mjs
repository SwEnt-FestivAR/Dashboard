// Configuration from environment variables (documented at the top of scripts/fetch-data.mjs) and the
// git helper used on the FestivAR clone.

import { execFileSync } from 'node:child_process';

// Each value comes from the env variable of the same role (see the Env section of fetch-data.mjs).
export const REPO = process.env.REPO || 'SwEnt-FestivAR/FestivAR';
export const SRC = process.env.FESTIVAR_DIR || 'festivar';
export const OUT = process.env.OUT || 'site/data.json';
export const TOKEN = process.env.GITHUB_TOKEN || '';
export const CACHE = process.env.CACHE_DIR || '';
export const SITE_REPO = process.env.GITHUB_REPOSITORY || 'SwEnt-FestivAR/General-information';

/** Runs a git command inside the FestivAR clone and returns stdout (stderr is captured, not printed). */
export const git = (...args) => execFileSync('git', ['-C', SRC, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
