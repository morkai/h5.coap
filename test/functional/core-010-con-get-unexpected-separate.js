/*
 Handle an unexpected confirmable separate response to a confirmable
 GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: temperature
 ==============================================================================

 2. Client loses its state (it's destroyed and reinitialized).

 3. Server receives the request and sends an empty acknowledgement message:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x0001
 1       | ACK  | 0 bytes      | Empty           | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 4. Client receives the empty ACK, but ignores it.

 5. After 5s, server sends the separate confirmable response to the #1 request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | CON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Payload (6 bytes)
 22.3 C
 ==============================================================================

 6. Client receives the #5 response, but rejects it by sending a reset message:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | RST  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================
*/

'use strict';

var sinon = require('sinon');
var helpers = require('../helpers');
var coap = require(helpers.LIB_DIR);
var Message = coap.Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/temperature'
  };
  var expectedAckResponse = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: expectedRequest.id
  };
  var expectedResponse = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest.token,
    payload: new Buffer('22.3 C')
  };
  var expectedRstRequest = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: expectedResponse.id
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedAckResponse);
  ctx.socket.scheduleResponse(5000, expectedResponse);
  ctx.socket.expectRequest(expectedRstRequest);

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
