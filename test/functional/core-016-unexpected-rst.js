/*
 Handle an unexpected reset response to a confirmable GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 1  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | NON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: reject
 ==============================================================================

 2. Client loses its state (it's destroyed and reinitialized).

 3. Server receives the request but rejects it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x0001
 1       | RST  | 0 bytes      | Empty           | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 4. Client receives the RST and ignores it as it doesn't match anything.
*/

'use strict';

var sinon = require('sinon');
var helpers = require('../helpers');
var coap = require(helpers.LIB_DIR);
var Message = coap.Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.NON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/reject'
  };
  var expectedResponse = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: 0x0001
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResponse);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  var eventSpy = sinon.spy(req, 'emit');

  setTimeout(ctx.reinitializeClient, 25);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();
    sinon.assert.notCalled(eventSpy);
  };
});
