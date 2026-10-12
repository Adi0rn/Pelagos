import { simulate } from './model.js';

// Keep the detailed planetary calculation off the UI thread.
self.onmessage = ({ data: { settings, revision } }) => {
  const world = simulate(settings);
  const buffers = Object.values(world)
    .filter(value => ArrayBuffer.isView(value))
    .map(value => value.buffer);
  self.postMessage({ world, settings, revision }, buffers);
};
