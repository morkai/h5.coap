/*
 Handle an acknowledgement by a separate response to a confirmable GET request
 (lost empty ACK):

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

 2. Server acknowledges the #1 request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x0001
 1       | ACK  | 0 bytes      | Empty           | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 3. The #2 empty ACK is lost along the way...

 4. After 1s, server sends a separate confirmable response to the #1 request:
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

 5. Client acknowledges the #4 response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 6. Client receives the #4 response. Request emits the `acknowledgement` event
 and the `response` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/temperature'
  };
  var expectedResponse = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest.token,
    payload: new Buffer('22.3 C')
  };
  var expectedAckRequest = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: expectedResponse.id
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(1000, expectedResponse);
  ctx.socket.expectRequest(expectedAckRequest);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 2);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResponse, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], expectedResponse, "Invalid `response`."
    );
  };
});
