/*
 Handle a cancellation of an Observe request after a 2.02 Deleted
 (non 2.03 Valid or 2.05 Content) notification:

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
 Uri-Path: deletable
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

 7. Different client removes the observed resource.

 8. Server removes the #1 observer from the list and sends a notification
 with code 2.03 Deleted:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x4322
 1       | CON  | 0 bytes      | 2.02 Deleted    | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 9. Client receives the #8 notification and acknowledges it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 10. The #1 request emits the `cancelled` event and the `response` event.
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
    uri: '/observer/deletable',
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
  var notification2 = {
    type: Message.Type.CON,
    code: Message.Code.DELETED,
    id: 0x4322,
    token: subscriptionRequest.token
  };
  var notificationAck2 = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: notification2.id
  };

  ctx.socket.expectRequest(subscriptionRequest);
  ctx.socket.scheduleResponse(50, subscriptionResponse);
  ctx.socket.scheduleResponse(2050, notification1);
  ctx.socket.expectRequest(2050, notificationAck1);
  ctx.socket.scheduleResponse(4050, notification2);
  ctx.socket.expectRequest(4050, notificationAck2);

  var req = Message.fromObject(subscriptionRequest);
  var eventSpy = sinon.spy(req, 'emit');

  ctx.client.request(req);

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 5);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(eventSpy, 'cancelled');

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1],
      subscriptionResponse,
      "Invalid subscription ACK."
    );

    eventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[1][1],
      subscriptionResponse,
      "Invalid subscription `response`."
    );

    eventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[2][1],
      notification1,
      "Invalid notification #1."
    );

    eventSpy.args[3][0].should.be.equal('cancelled');

    eventSpy.args[4][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[4][1],
      notification2,
      "Invalid notification #2."
    );
  };
});
