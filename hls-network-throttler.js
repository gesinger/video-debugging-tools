const origXhr = videojs.xhr;

const config = {
  // options: allow, random, none
	cacheMethod: 'random',
  maxDelaySeconds: 20,
  // options: random, outliers, none
  delayMethod: 'random',
};

const requestUris = [];

// adapted from:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/
//  random#Getting_a_random_integer_between_two_values_inclusive
const randomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const delay = (method, max) => {
  switch (method) {
    case 'random':
      return Math.floor(Math.random() * max) * 1000;
    case 'outliers':
      return (Math.random() > 0.5 ? randomInt(max - 3, max) : randomInt(0, 3)) * 1000;
    case 'none':
      return 0;
  }
};

videojs.xhr = (options, callback) => {
  const requestStart = Date.now();

  return origXhr(options, (error, response, body) => {
    if (error ||
        // only delay segment requests
        options.responseType !== 'arraybuffer') {
      callback(error, response, body);
      return;
    }

    const segmentPath = options.uri.substring(options.uri.lastIndexOf('/'));
    const useCache = config.cacheMethod === 'allow' ||
      (config.cacheMethod === 'random' && Math.random() > 0.5);

    if (useCache && requestUris.includes(options.uri)) {
      console.log(`Allowing cache with 0 delay for ${segmentPath}`);
      callback(error, response, body);
      return;
    }

    requestUris.push(options.uri);

    const delayMillis = delay(config.delayMethod, config.maxDelaySeconds);
    const downloadMillis =  Date.now() - requestStart;
    const bytes =
      response.rawRequest.response.byteLength || response.rawRequest.response.length;
    const bandwidth = Math.floor(bytes / downloadMillis * 8 * 1000);
    const delayBandwidth = Math.floor(bytes / (downloadMillis + delayMillis) * 8 * 1000);

    console.log(
      `Delaying request to ${segmentPath} by ${delayMillis}ms, ` +
      `changing bandwidth from ${bandwidth} to ${delayBandwidth}`);

    setTimeout(() => {
      callback(error, response, body);
    }, delayMillis);
  });
};
