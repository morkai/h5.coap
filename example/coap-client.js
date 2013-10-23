#!/bin/sh

/*jshint -W015*/

'use strict';

var coap = require('../lib');

var args = [].concat(process.argv);

args.shift();
args.shift();

if (args.length === 0)
{
  console.log('Usage: node coap-client.js [options] uri [< payload-file]');
  console.log();
  console.log('Request options:');
  console.log(' --type:          CON (default) or NON');
  console.log(' --code:          GET (default), POST, PUT or DELETE');
  console.log(' --accept:        media type from the Content-Format registry');
  console.log(' --contentFormat: media type from the Content-Format registry');
  console.log(' --observe:       true');
  console.log(' --ifNoneMatch:   true');
  console.log(' --ifMatch:       hex string (e.g. 00aa1e23)');
  console.log(' --eTag:          hex string (e.g. 00aa1e23)');
  console.log(' --uriHost:       IPv4 or IPv6 address (e.g. 2222::3)');
  console.log(' --uriPort:       number (e.g. 1337)');
  console.log(' --uriPath:       string (e.g. /foo/bar/baz)');
  console.log(' --uriQuery:      string (e.g. foo=bar&baz=1)');
  console.log(' --locationPath:  string (e.g. /foo/bar/baz)');
  console.log(' --locationQuery: string (e.g. foo=bar&baz=1)');
  console.log(' --payload:       string or - for stdin');
  console.log();
  console.log('Exchange options:');
  console.log(' --blockSize');
  console.log(' --maxRetransmit');
  console.log(' --transactionTimeout');
  console.log(' --exchangeTimeout');
  console.log();
  console.log('Example URIs:');
  console.log(' > coap://[2222::3]:5683/.well-known/core?href=foo&bar=baz');
  console.log(' > coap://127.0.0.1/.well-known/core');
  console.log(' > /temperature');

  process.exit(0);
}

var options = {
  type: coap.Message.Type.CON,
  code: coap.Message.Code.GET
};

if (args.length > 0 && args.length % 2 === 1)
{
  options.uri = args.pop();
}

while (args.length)
{
  var optionValue = args.pop();
  var optionName = args.pop().replace(/^-+/, '');

  switch (optionName)
  {
    case 'ifMatch':
    case 'eTag':
    case 'token':
      optionValue = createBufferFromHexString(optionValue);
      break;

    default:
      var numericValue = parseInt(optionValue, 10);

      if (!isNaN(numericValue))
      {
        optionValue = numericValue;
      }
      else if (optionValue === 'true' || optionValue === 'false')
      {
        optionValue = optionValue === 'true';
      }
  }

  options[optionName] = optionValue;
}

if (typeof options.observe !== 'undefined')
{
  options.observe = 0;
}

var responseCount = 0;
var responseLimit = options.limit > 0 ? options.limit : 0;

var client = new coap.Client();

client.on('error', prettyEvent('client', 'error'));
client.on('transaction timeout', function(req)
{
  console.log('[client#transaction timeout]');
  console.log(req.toPrettyString());
});
client.on('exchange timeout', function(req)
{
  console.log('[client#exchange timeout]');
  console.log(req.toPrettyString());
});
client.on('message sent', function(message, retries)
{
  console.log('[client#message sent]');

  if (retries > 0)
  {
    console.log(
      "Retransmission of %s (%d of %d)",
      message.getTransactionKey(),
      retries,
      options.maxRetransmit || 4
    );
  }
  else
  {
    console.log(message.toPrettyString());
  }
});
client.on('message received', function(message)
{
  console.log('[client#message received]');
  console.log(message.toPrettyString());
});

var req;

try
{
  req = coap.Message.fromObject(options);
}
catch (err)
{
  console.error(err.stack);
  process.exit(1);
}

if (options.payload === '-')
{
  process.stdin.resume();
  process.stdin.on('data', function(payload)
  {
    process.stdin.pause();

    req.setPayload(payload);

    client.request(req, options);
  });
}
else
{
  client.request(req, options);
}

req.on('error', prettyEvent('req', 'error'));
req.on('timeout', function()
{
  console.log('[req#timeout]');

  client.destroy();
});
req.on('acknowledged', prettyEvent('req', 'acknowledged'));
req.on('reset', prettyEvent('req', 'reset'));
req.on('cancelled', prettyEvent('req', 'cancelled'));
req.on('response', function(res)
{
  ++responseCount;

  console.log('[req#response]');
  console.log(res.toPrettyString());

  var isObserver = res.getObserve() > 0;

  if (!isObserver
    || (responseLimit > 0 && responseCount === responseLimit))
  {
    if (isObserver)
    {
      client.cancel(req);
    }

    client.destroy();
  }
});

function prettyEvent(eventSource, eventName)
{
  return function()
  {
    console.log('[%s#%s]', eventSource, eventName);

    if (arguments.length > 0)
    {
      console.log('%s', arguments[0].toString());
    }
  };
}

function createBufferFromHexString(hexString)
{
  var buffer = new Buffer(
    (hexString.length + (hexString.length % 2 ? 1 : 0)) / 2
  );

  for (var i = 0, b = 0, l = hexString.length; i < l; i += 2, b += 1)
  {
    buffer[b] = parseInt('0x' + hexString.substr(i, 2), 16);
  }

  return buffer;
}
