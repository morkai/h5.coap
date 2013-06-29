/*
 Handle a duplicate response to a non-confirmable GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 1  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | NON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: temperature
 ==============================================================================

 2. Server sends a response to the #1 request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | NON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Payload (6 bytes)
 22.3 C
 ==============================================================================

 3. Client receives the #2 response. Request emits the `response` event.

 4. Magic happens... The #2 response was duplicated along the way.

 5. Client receives the duplicate response and ignores it (no `response` event
 is emitted).
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.NON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/temperature'
  };
  var expectedResponse = {
    type: Message.Type.NON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest.token,
    payload: new Buffer('22.3 C')
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResponse);
  ctx.socket.scheduleResponse(75, expectedResponse);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 1);

    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );

    eventSpy.args[0][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResponse, "Invalid `response`."
    );
  };
});
