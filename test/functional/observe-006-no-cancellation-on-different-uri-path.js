/*
 Handle a simple response to a GET request from an endpoint where a resource is
 being observed (unrelated GET should not cancel the observer):

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

 3. Client receives the #2 response. The #1 request emits the `acknowledged`
 event and the `response` event.

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

 5. Client receives the #4 notification. The #1 request emits the `response`
 event.

 6. Client acknowledges the #4 notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 7. Client sends a simple GET request for a different resource:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 1 byte       | GET             | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: observer
 Uri-Path: unrelated
 ==============================================================================

 8. Server responds to the #7 request:
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
 Payload (6 bytes)
 Hello!
 ==============================================================================

 9. Client receives the #8 response. The #1 request doesn't emit the `cancelled`
 event. The #7 request emits the `acknowledged` and the `response` event.

 10. Server sends the second notification to the #1 observer:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4322
 1       | CON  | 0 bytes      | 2.05 Content    | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 12
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 3
 ==============================================================================

 11. Client receives the #10 notification and acknowledges it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 12. The #1 request emits the `response` event.

 12. Client cancels the #1 observer. The #1 request emits the `cancelled` event.

 13. Server sends the third notification to #1 observer:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4323
 1       | CON  | 0 bytes      | 2.05 Content    | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 13
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 4
 ==============================================================================

 14. Client receives the #13 notification, but resets it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4323
 1       | RST  | 0 bytes      | Empty           | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 15. Server receives the #14 reset and removes the #1 observer.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

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
  var unrelatedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    token: new Buffer([0x01]),
    uri: '/observer/unrelated'
  };
  var unrelatedResponse = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: unrelatedRequest.id,
    token: unrelatedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer('Hello!')
  };
  var notification2 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: subscriptionRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 12,
    payload: new Buffer('3')
  };
  var notificationAck2 = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: notification2.id
  };
  var notification3 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4323,
    token: subscriptionRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 13,
    payload: new Buffer('4')
  };
  var notificationRst3 = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: notification3.id
  };

  ctx.socket.expectRequest(subscriptionRequest);
  ctx.socket.scheduleResponse(50, subscriptionResponse);
  ctx.socket.scheduleResponse(2050, notification1);
  ctx.socket.expectRequest(2050, notificationAck1);
  ctx.socket.expectRequest(3000, unrelatedRequest);
  ctx.socket.scheduleResponse(3050, unrelatedResponse);
  ctx.socket.scheduleResponse(4050, notification2);
  ctx.socket.expectRequest(4050, notificationAck2);
  ctx.socket.scheduleResponse(6050, notification3);
  ctx.socket.expectRequest(6050, notificationRst3);

  var subscriptionReq = Message.fromObject(subscriptionRequest);
  var unrelatedReq = Message.fromObject(unrelatedRequest);

  var subscriptionEventSpy = sinon.spy(subscriptionReq, 'emit');
  var unrelatedEventSpy = sinon.spy(unrelatedReq, 'emit');

  ctx.client.request(subscriptionReq);

  setTimeout(function() { ctx.client.request(unrelatedReq); }, 3000);
  setTimeout(function() { ctx.client.cancel(subscriptionReq); }, 5000);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(subscriptionEventSpy, 5);
    sinon.assert.callCount(unrelatedEventSpy, 2);

    sinon.assert.calledWith(
      subscriptionEventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      subscriptionEventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(subscriptionEventSpy, 'cancelled');
    sinon.assert.calledWith(
      unrelatedEventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      unrelatedEventSpy, 'response', sinon.match.instanceOf(Message)
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
      "Invalid notification #1."
    );

    subscriptionEventSpy.args[3][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscriptionEventSpy.args[3][1],
      notification2,
      "Invalid notification #2."
    );

    subscriptionEventSpy.args[4][0].should.be.equal('cancelled');

    unrelatedEventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      unrelatedEventSpy.args[0][1],
      unrelatedResponse,
      "Invalid cancel ACK."
    );

    unrelatedEventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      unrelatedEventSpy.args[1][1],
      unrelatedResponse,
      "Invalid cancel `response`."
    );
  };
});
