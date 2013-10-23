#!/bin/sh

/*jshint -W015,maxlen:999*/

'use strict';

var http = require('http');
var coap = require('../lib');

var args = [].concat(process.argv);

args.shift();
args.shift();

if (args.length === 1 && args[0] === '--help')
{
  console.log('Usage: node http-proxy.js [options]');
  console.log();
  console.log('Proxy server options:');
  console.log(' --help: display this message');
  console.log(' --port: port to listen on for HTTP connections (defaults to 1337)');
  console.log(' --host: hostname to listen on for HTTP connections (defaults to 0.0.0.0)');
  console.log();
  console.log('CoAP exchange options:');
  console.log(' --blockSize');
  console.log(' --maxRetransmit');
  console.log(' --transactionTimeout');
  console.log(' --exchangeTimeout');

  process.exit(0);
}

var options = {
  httpPort: 1337,
  httpHost: '0.0.0.0'
};

while (args.length)
{
  if (args.length < 2)
  {
    break;
  }

  var optionValue = parseValue(args.pop());
  var optionName = args.pop().replace(/^-+/, '');

  options[optionName] = optionValue;
}

var coapClient = new coap.Client(options);

coapClient.on('error', prettyEvent('coapClient', 'error'));
coapClient.on('transaction timeout', function(req)
{
  console.log('[coapClient#transaction timeout]');
  console.log(req.toPrettyString());
});
coapClient.on('exchange timeout', function(req)
{
  console.log('[coapClient#exchange timeout]');
  console.log(req.toPrettyString());
});
coapClient.on('message sent', function(message, retries)
{
  console.log('[coapClient#message sent]');

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
coapClient.on('message received', function(message)
{
  console.log('[coapClient#message received]');
  console.log(message.toPrettyString());
});

var httpServer = http.createServer();

httpServer.on('listening', function()
{
  console.log(
    "[httpServer#listening] host=%s port=%d", options.httpHost, options.httpPort
  );
});

httpServer.on('error', function(err)
{
  console.error("[httpServer#error] %s", err.message);
  process.exit(1);
});

httpServer.on('request', function(httpReq, httpRes)
{
  console.log("[httpServer#request]");
  console.log("==============================================================================");
  console.log("Method: %s", httpReq.method);
  console.log("URL   : %s", httpReq.url);
  console.log("------------------------------------------------------------------------------");

  var coapReqOptions = {
    code: httpReq.method,
    uri: httpReq.url,
    payload: []
  };
  var payloadLength = 0;

  Object.keys(httpReq.headers).forEach(function(headerName)
  {
    var headerValue = httpReq.headers[headerName];

    console.log("%s: %s", headerName, headerValue);

    headerName = camelize(headerName.replace(/^Coap\-?/i, ''));

    coapReqOptions[headerName] = parseValue(headerValue);
  });

  console.log("==============================================================================");

  httpReq.on('readable', function()
  {
    var chunk = httpReq.read();

    coapReqOptions.payload.push(chunk);

    payloadLength += chunk.length;
  });

  httpReq.on('end', function()
  {
    if (payloadLength > 0)
    {
      coapReqOptions.payload = Buffer.concat(
        coapReqOptions.payload, payloadLength
      );
    }

    var coapReq;

    try
    {
      coapReq = coap.Message.fromObject(coapReqOptions, coapReqOptions);
    }
    catch (err)
    {
      console.log('[coapReq#error] %s', err.message);

      var body = err.stack;

      httpRes.writeHead(400, {
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'text/plain'
      });
      httpRes.end(body);

      return;
    }

    coapReq.setObserve(false);

    coapReq.on('error', function(err)
    {
      console.log('[coapReq#error] %s', err.message);

      var body = err.stack;

      httpRes.writeHead(500, {
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'text/plain'
      });
      httpRes.end(body);
    });

    coapReq.on('timeout', function()
    {
      console.log('[coapReq#timeout]');

      httpRes.writeHead(504);
      httpRes.end();
    });

    coapReq.on('acknowledged', prettyEvent('coapReq', 'acknowledged'));
    coapReq.on('reset', prettyEvent('coapReq', 'reset'));
    coapReq.on('cancelled', prettyEvent('coapReq', 'cancelled'));

    coapReq.on('response', function(coapRes)
    {
      console.log('[coapReq#response]');
      console.log(coapRes.toPrettyString());

      var statusCode = mapCoapToHttpCode(coapRes.getCode());
      var headers = {};

      coapRes.getAllOptions().forEach(function(option)
      {
        headers[option.getName()] = serializeOptionValue(option);
      });

      if (coapRes.getPayloadLength() > 0)
      {
        headers['Content-Length'] = coapRes.getPayloadLength();
      }

      httpRes.writeHead(statusCode, headers);
      httpRes.end(coapRes.getPayload());
    });

    coapClient.request(coapReq);
  });
});

httpServer.listen(options.httpPort, options.httpHost);

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

function mapCoapToHttpCode(coapCode)
{
  return ((coapCode & 224) >> 5) * 100 + (coapCode & 7);
}

function camelize(str)
{
  // https://github.com/jprichardson/string.js/blob/master/lib/string.js
  return str.trim().replace(/(\-|_|\s)+(.)?/g, function(mathc, sep, c)
  {
    return c ? c.toUpperCase() : '';
  });
}

function parseValue(value)
{
  var numericValue = parseInt(value, 10);

  if (!isNaN(numericValue))
  {
    value = numericValue;
  }
  else if (value === 'true' || value === 'false')
  {
    value = value === 'true';
  }

  return value;
}

function serializeOptionValue(option)
{
  var def = option.getDefinition();

  switch (def.propertyName)
  {
    case 'ifNoneMatch':
      return '*';

    case 'ifMatch':
    case 'eTag':
      return option.getData().toString('hex');

    default:
      return option.toString(false);
  }
}
