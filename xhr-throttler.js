(() => {
  const PROGRESS_MILLIS = 250;

  const millisToDownloadBits = (bandwidthSamples, startTime, segmentBits) => {
    const startingSampleIndex = bandwidthSamples.indexOf(bandwidthSamples.find(
      (sample) => sample.startTime <= startTime && sample.endTime > startTime));

    if (startingSampleIndex === -1) {
      return null;
    }

    let remainingBits = segmentBits;
    let millis = 0;

    for (let i = startingSampleIndex; i < bandwidthSamples.length; i++) {
      const sample = bandwidthSamples[i];
      const sampleMillis = i === startingSampleIndex ? sample.endTime - startTime :
        sample.endTime - sample.startTime;
      const maxBitsForSample = sample.bandwidth * (sampleMillis / 1000);
      const bitsToDownload = maxBitsForSample > remainingBits ?
        remainingBits : maxBitsForSample;

      millis += bitsToDownload / sample.bandwidth * 1000;
      remainingBits -= bitsToDownload;

      if (remainingBits === 0) {
        break;
      }
    }

    if (remainingBits > 0) {
      return null;
    }
    return millis;
  };

  const bitsDownloadedForMillis = (bandwidthSamples, startTime, millis) => {
    const startingSampleIndex = bandwidthSamples.indexOf(bandwidthSamples.find(
      (sample) => sample.startTime <= startTime && sample.endTime > startTime));

    if (startingSampleIndex === -1) {
      return null;
    }

    let remainingMillis = millis;
    let bits = 0;

    for (let i = startingSampleIndex; i < bandwidthSamples.length; i++) {
      const sample = bandwidthSamples[i];
      const millisToUseFromSample =
        i === startingSampleIndex ? sample.endTime - startTime :
          sample.endTime - sample.startTime > remainingMillis ? remainingMillis :
            sample.endTime - sample.startTime;

      bits += Math.floor(millisToUseFromSample / 1000) * sample.bandwidth;
      remainingMillis -= millisToUseFromSample;

      if (remainingMillis === 0) {
        break;
      }
    }

    if (remainingMillis > 0) {
      return null;
    }
    return bits;
  };

  const createBandwidthSamples = (samplesArray) => {
    let samples = [];

    for (let i = 1; i < samplesArray.length; i++) {
      samples.push({
        startTime: samplesArray[i - 1][0],
        endTime: samplesArray[i][0],
        bandwidth: samplesArray[i - 1][1],
      });
    }

    return samples;
  };

  // expects bandwidthSamplesArray to be an array of arrays, where the inner array has 2
  // ints, the first being the time of the sample, the second being the sampled
  // bandwidth (in bits/s)
  const throttledXhr = (origXhr, bandwidthSamplesArray, config) => {
    const bandwidthSamples = createBandwidthSamples(bandwidthSamplesArray);
    const startTime = Date.now();
    const translatedStartTime = bandwidthSamples[0].startTime;
    const seenUris = [];

    return (options, callback) => {
      const translatedRequestStartTime = translatedStartTime + Date.now() - startTime;
      let eventListeners = {};
      let throttleTimeout;
      let progressTimeout;

      const request = origXhr(options, (error, response, body) => {
        if (error ||
            // only delay segment requests
            options.responseType !== 'arraybuffer') {
          callback(error, response, body);
          return;
        }

        if (config.doNotThrottleSeenUris) {
          if (seenUris.includes(options.uri)) {
            console.log('Ignoring seen URI');
            callback(error, response, body);
            return;
          }
          seenUris.push(options.uri);
        }

        const bytes =
          response.rawRequest.response.byteLength || response.rawRequest.response.length;
        const bits = bytes * 8;
        const throttledDownloadMillis =
          millisToDownloadBits(bandwidthSamples, translatedRequestStartTime, bits);
        const downloadMillis =  Date.now() - startTime;

        if (throttledDownloadMillis === null) {
          console.warn('Need more sample time to complete throttle.');
          callback(error, response, body);
          return;
        }

        if (throttledDownloadMillis < downloadMillis) {
          console.warn('Sample bandwidth was greater than real bandwidth, ' +
            `${throttledDownloadMillis} vs ${downloadMillis}`);
          callback(error, response, body);
          return;
        }

        const delayMillis = throttledDownloadMillis - downloadMillis;
        const origBandwidth = Math.floor(bits / (downloadMillis / 1000));
        const resultingBandwidth = Math.floor(bits / (throttledDownloadMillis / 1000));
        const segmentPath = options.uri.substring(options.uri.lastIndexOf('/'));

        console.log(
          `Delaying request to ${segmentPath} by ${Math.floor(delayMillis)}ms, ` +
          `changing bandwidth from ${origBandwidth} to ${resultingBandwidth}`);

        throttleTimeout = setTimeout(() => {
          clearTimeout(progressTimeout);
          callback(error, response, body);
        }, delayMillis || 0);

        const progressEvent = () => {
          const bitsLoaded = bitsDownloadedForMillis(
            bandwidthSamples,
            translatedRequestStartTime,
            translatedStartTime + Date.now() - startTime);

          eventListeners.progress.forEach((listener) => {
            listener({
              target: request,
              total: bytes,
              loaded: Math.floor(bitsLoaded / 8),
            });
          });

          progressTimeout = setTimeout(progressEvent, PROGRESS_MILLIS);
        };

        progressTimeout = setTimeout(progressEvent, PROGRESS_MILLIS);
      });
      const origAbort = request.abort.bind(request);

      request.abort = () => {
        clearTimeout(throttleTimeout);
        clearTimeout(progressTimeout);
        origAbort();
      };

      request.addEventListener = (name, callback) => {
        if (!eventListeners[name]) {
          eventListeners[name] = [];
        }

        eventListeners[name].push(callback);
      };

      return request;
    };
  };

  window.throttledXhr = throttledXhr;
})();
