/*
 Handle a cancellation of an Observe request by calling the `Client.cancel`
 method:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe : 0
 Uri-Path: observer
 ==============================================================================

 2. Server sends a piggy-backed response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 1
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 1
 ==============================================================================

 3. Client receives the #2 response. Request emits the `acknowledged` event
 and the `response` event.

 4. Client cancels the subscription. Request emits the `cancelled` event.

 5. After 2s, server sends the first, non-confirmable notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 1  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | NON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 2
 ==============================================================================

 6. Client receives the #5 notification, but ignores it as it's a NON and the
 subscription was cancelled.

 7. After another 2s, server sends the second, confirmable notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4322
 1       | CON  | 0 bytes      | 2.05 Content    | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 3
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 3
 ==============================================================================

 8. Client receives the #7 notification, but resets it as it's a CON and the
 subscription was cancelled:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | RST  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================
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
    uri: '/observer',
    observe: 0
  };
  var expectedResponse = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedRequest.id,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 1,
    payload: new Buffer('1')
  };
  var expectedNonNotification = {
    type: Message.Type.NON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    payload: new Buffer('2')
  };
  var expectedConNotification = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 3,
    payload: new Buffer('3')
  };
  var expectedNotificationRst = {
    type: Message.Type.RST,
    code: Message.Type.EMPTY,
    id: expectedConNotification.id
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResponse);
  ctx.socket.scheduleResponse(2050, expectedNonNotification);
  ctx.socket.scheduleResponse(4050, expectedConNotification);
  ctx.socket.expectRequest(4050, expectedNotificationRst);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  setTimeout(function() { ctx.client.cancel(req); }, 1000);

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 3);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'cancelled'
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResponse, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], expectedResponse, "Invalid `response`."
    );

    eventSpy.args[2][0].should.be.equal('cancelled');
  };
});
