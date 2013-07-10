# h5.coap

Implementation of the Constrained Application Protocol (CoAP) client for node.js.

[![Build Status](https://travis-ci.org/morkai/h5.coap.png?branch=master)](https://travis-ci.org/morkai/h5.coap)

Implemented client-side features:

  - [draft-ietf-core-coap-18](http://tools.ietf.org/html/draft-ietf-core-coap-18)
  - [draft-ietf-core-block-12](http://tools.ietf.org/html/draft-ietf-core-block-12)
    - Block1 + Block2 (server initiative)
  - [draft-ietf-core-observe-08](http://tools.ietf.org/html/draft-ietf-core-observe-08)
    - Observe + Block2 (server initiative)
    - Re-registration after a Max-Age expiration
    - Re-registration after a blockwise timeout
  - See the [test/functional/](test/functional/) directory for a list of tested scenarios.

## Example

```
npm install git://github.com/morkai/h5.coap git://github.com/morkai/h5.linkformat
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

  - More tests
  - Readme
  - Documentation
  - npm publish

## License

This project is released under the
[MIT License](https://raw.github.com/morkai/h5.coap/master/license.md).
