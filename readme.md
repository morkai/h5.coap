# h5.coap

Implementation of the Constrained Application Protocol (CoAP) client for node.js.

[![Build Status](https://travis-ci.org/morkai/h5.coap.png?branch=master)](https://travis-ci.org/morkai/h5.coap)

## Example

```
npm install h5.coap h5.linkformat
```

```js
var coap = require('h5.coap');
var linkformat = require('h5.linkformat');

var client = new coap.Client();

var req = client.get('coap://127.0.0.1/.well-known/core', {
  accept: 'application/link-format'
});

req.on('response', function(res)
{
  if (res.isSuccess())
  {
    console.log(linkformat.parse(res.getPayload().toString()));
  }
  else
  {
    console.log(res.toPrettyString());
  }
});
```

## TODO

  - Tests
  - Readme
  - Documentation
  - npm publish

## License

This project is released under the
[MIT License](https://raw.github.com/morkai/h5.coap/master/license.md).
