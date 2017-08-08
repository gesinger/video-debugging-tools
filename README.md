# Video Debugging Tools

A collection of useful tools for debugging videojs players and video related files.

## HLS Debugging Tools

### Manifest and Segments

[segar](https://github.com/gesinger/segar) - A tool for downloading and finding differences in audio and video timing between segments and renditions.

### videojs-contrib-hls

[chaos-mixtape](https://github.com/gesinger/chaos-mixtape) - Tools for creating a series of chaotic player actions, then replaying them.

## In this repo

### xhr-throttler.js

Takes an [xhr](https://github.com/naugtur/xhr) module and overrides it to throttle
'arraybuffer' requests with an array of bandwidth measurements. Bandwidth measrurements
are of the form \[timestamp, bitrate\].

Example:
```javascript
videojs.xhr = window.throttledXhr(videojs.xhr, [
  [0, 7500000],
  [2000, 10],
  [300000000000, 7500000],
], {
  doNotThrottleSeenUris: true,
});
```
