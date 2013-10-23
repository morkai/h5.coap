'use strict';

var http = require('http');

var options = {
  hostname: '127.0.0.1',
  port: 1337,
  // 134.102.218.16=coap.me
  path: 'coap://134.102.218.16/query?foo=quas&bar=wex&baz=exort',
  method: 'GET',
  // Headers correspond to properties of an object passed to
  // `h5.coap.Message.fromObject()` and can optionally be prefixed
  // with `Coap-`.
  headers: {
    'Coap-Type': 'NON',
    'Accept': 'text/plain;charset=utf-8'
  }
};

var req = http.request(options, function(res)
{
  console.log('Status : %d', res.statusCode);
  console.log('Headers: %s', JSON.stringify(res.headers, null, 2));
  console.log('Payload:');

  res.on('data', function(chunk)
  {
    process.stdout.write(chunk);
  });
});

req.on('error', function(err)
{
  console.error("[req#error] %s", err.message);
});

req.end();
