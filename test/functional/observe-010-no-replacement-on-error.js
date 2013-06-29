/*
 Handle an error response to a request with an Observe option to a resource that
 is being observed:

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

 4. After 2s, server sends the first notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | CON  | 0 bytes      | 2.05 Content    | 17185
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

 5. Client receives the #4 notification. Request emits the `response` event.

 6. Client acknowledges the #4 notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 7. Client sends another request for the same resource with an Observe option:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 1 byte       | GET             | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe : 0
 Uri-Path: observer
 ==============================================================================

 8. Server receives the #7 request, doesn't replace the #1 observer and sends
 an error response:
 ==============================================================================
 Version | Type | Token Length | Code                       | Message ID
 0 1     | 1 0  | 0 0 0 1      | 1 0 1 0 0 0 0 0            | 0x0002
 1       | ACK  | 1 byte       | 5.00 Internal Server Error | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 ------------------------------------------------------------------------------
 Payload (21 bytes)
 Internal Server Error
 ==============================================================================

 9. Client receives the #8 response. The #1 observer doesn't emit
 the `cancelled` event. The #7 observer emits the `acknowledged` event,
 the `cancelled` event and the `response` event.

 10. Server sends the second notification for the #1 observer:
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

 11. Client receives the #10 notification. The #1 request emits
 the `response` event.

 12. Client acknowledges the #10 notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 13. Client cancels the #1 observer. The #1 observer emits the `cancelled`
 event.

 14. Servers sends the third notification for the #1 observer:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4323
 1       | CON  | 0 bytes      | 2.05 Content    | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 4
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 4
 ==============================================================================

 15. Client receives the #14 notification, but resets it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4323
 1       | RST  | 0 bytes      | Empty           | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 16. Server receives the #15 reset and removes the #1 observer.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

  var subscriptionRequest1 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/observer',
    observe: 0
  };
  var subscriptionResponse1 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: subscriptionRequest1.id,
    token: subscriptionRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 1,
    payload: new Buffer('1')
  };
  var notification1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: subscriptionRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    payload: new Buffer('2')
  };
  var notificationAck1 = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: notification1.id
  };
  var subscriptionRequest2 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    token: new Buffer([0x01]),
    uri: subscriptionRequest1.uri,
    observe: 0
  };
  var subscriptionResponse2 = {
    type: Message.Type.ACK,
    code: Message.Code.INTERNAL_SERVER_ERROR,
    id: subscriptionRequest2.id,
    token: subscriptionRequest2.token,
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer('Internal Server Error')
  };
  var notification2 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: subscriptionRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 3,
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
    token: subscriptionRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 4,
    payload: new Buffer('4')
  };
  var notificationRst3 = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: notification3.id
  };

  ctx.socket.expectRequest(subscriptionRequest1);
  ctx.socket.scheduleResponse(50, subscriptionResponse1);
  ctx.socket.scheduleResponse(2050, notification1);
  ctx.socket.expectRequest(2050, notificationAck1);
  ctx.socket.expectRequest(3000, subscriptionRequest2);
  ctx.socket.scheduleResponse(3050, subscriptionResponse2);
  ctx.socket.scheduleResponse(4050, notification2);
  ctx.socket.expectRequest(4050, notificationAck2);
  ctx.socket.scheduleResponse(6050, notification3);
  ctx.socket.expectRequest(6050, notificationRst3);

  var subscriptionReq1 = Message.fromObject(subscriptionRequest1);
  var subscriptionReq2 = Message.fromObject(subscriptionRequest2);

  var subscription1EventSpy = sinon.spy(subscriptionReq1, 'emit');
  var subscription2EventSpy = sinon.spy(subscriptionReq2, 'emit');

  ctx.client.request(subscriptionReq1);

  setTimeout(function() { ctx.client.request(subscriptionReq2); }, 3000);
  setTimeout(function() { ctx.client.cancel(subscriptionReq1); }, 5000);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(subscription1EventSpy, 5);
    sinon.assert.callCount(subscription2EventSpy, 3);

    sinon.assert.calledWith(
      subscription1EventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      subscription1EventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(subscription1EventSpy, 'cancelled');
    sinon.assert.calledWith(
      subscription2EventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      subscription2EventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(subscription2EventSpy, 'cancelled');

    subscription1EventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      subscription1EventSpy.args[0][1],
      subscriptionResponse1,
      "Invalid observer #1 ACK."
    );

    subscription1EventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscription1EventSpy.args[1][1],
      subscriptionResponse1,
      "Invalid `response` #1."
    );

    subscription1EventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscription1EventSpy.args[2][1],
      notification1,
      "Invalid `response` #2."
    );

    subscription1EventSpy.args[3][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscription1EventSpy.args[3][1],
      notification2,
      "Invalid `response` #3."
    );

    subscription1EventSpy.args[4][0].should.be.equal('cancelled');

    subscription2EventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      subscription2EventSpy.args[0][1],
      subscriptionResponse2,
      "Invalid observer #2 ACK."
    );

    subscription2EventSpy.args[1][0].should.be.equal('cancelled');

    subscription2EventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      subscription2EventSpy.args[2][1],
      subscriptionResponse2,
      "Invalid `response` #4."
    );
  };
});
