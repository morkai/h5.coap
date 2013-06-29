/*
 Handle a cancellation of an Observe request after a successful response to
 another request for the same resource but without an Observe option:

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
 Observe       : 10
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 1
 ==============================================================================

 3. Client receives the #2 response. Request emits the `acknowledged` event
 and the `response` event.

 4. After 2s, server sends the first notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | CON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 11
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 2
 ==============================================================================

 5. Client receives the #4 notification. Request emits the `response` event.

 6. Client acknowledges the #4 notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 7. Client sends a request for the same resource but without an Observe option:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 1 byte       | GET             | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: observer
 ==============================================================================

 8. Server receives the #7 request, removes the #1 observer and sends a response
 (without an Observe option):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 1 byte       | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 ------------------------------------------------------------------------------
 Payload (1 byte)
 3
 ==============================================================================

 9. Client receives the #8 response. The #1 request emits the `cancelled` event.
 The #7 request emits the `acknowledged` and the `response` event.

 10. No more notifications are sent.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var subscriptionRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/observer',
    observe: 0
  };
  var subscriptionResponse = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: subscriptionRequest.id,
    token: subscriptionRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 10,
    payload: new Buffer('1')
  };
  var notification1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: subscriptionRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 11,
    payload: new Buffer('2')
  };
  var notificationAck1 = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: notification1.id
  };
  var cancelRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    token: new Buffer([0x01]),
    uri: subscriptionRequest.uri
  };
  var cancelResponse = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: cancelRequest.id,
    token: cancelRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer('3')
  };

  ctx.socket.expectRequest(subscriptionRequest);
  ctx.socket.scheduleResponse(50, subscriptionResponse);
  ctx.socket.scheduleResponse(2050, notification1);
  ctx.socket.expectRequest(2050, notificationAck1);
  ctx.socket.expectRequest(3000, cancelRequest);
  ctx.socket.scheduleResponse(3050, cancelResponse);

  var subscriptionReq = Message.fromObject(subscriptionRequest);
  var cancelReq = Message.fromObject(cancelRequest);

  var subscriptionEventSpy = sinon.spy(subscriptionReq, 'emit');
  var cancelEventSpy = sinon.spy(cancelReq, 'emit');

  ctx.client.request(subscriptionReq);

  setTimeout(function() { ctx.client.request(cancelReq); }, 3000);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(subscriptionEventSpy, 4);
    sinon.assert.callCount(cancelEventSpy, 2);

    sinon.assert.calledWith(
      subscriptionEventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      subscriptionEventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(subscriptionEventSpy, 'cancelled');
    sinon.assert.calledWith(
      cancelEventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      cancelEventSpy, 'response', sinon.match.instanceOf(Message)
    );

    subscriptionEventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      subscriptionEventSpy.args[0][1],
      subscriptionResponse,
      "Invalid subscription ACK."
    );

    subscriptionEventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscriptionEventSpy.args[1][1],
      subscriptionResponse,
      "Invalid subscription `response`."
    );

    subscriptionEventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscriptionEventSpy.args[2][1],
      notification1,
      "Invalid notification."
    );

    subscriptionEventSpy.args[3][0].should.be.equal('cancelled');

    cancelEventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      cancelEventSpy.args[0][1],
      cancelResponse,
      "Invalid cancel ACK."
    );

    cancelEventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      cancelEventSpy.args[1][1],
      cancelResponse,
      "Invalid cancel `response`."
    );
  };
});
