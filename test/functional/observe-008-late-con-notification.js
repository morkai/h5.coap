/*
 Handle a late confirmable notification to an Observe request:

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
 Uri-Path: late
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

 5. After another 2s, server sends the second notification:
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

 6. Client receives the #5 notification and sends the acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 7. Request emits the `response` event.

 8. After 1s, client receives the #4 notification, ignores it because it's
 a late one (no `response` event), but still sends the acknowledgement
 (so the server can stop the retransmissions):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 9. Client cancels the #1 observer. Request emits the `cancelled` event.
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
    uri: '/observer/late',
    observe: 0
  };
  var expectedResponse = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedRequest.id,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 10,
    payload: new Buffer('1')
  };
  var expectedLateNotification = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 11,
    payload: new Buffer('2')
  };
  var expectedLateNotificationAck = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: expectedLateNotification.id
  };
  var expectedOnTimeNotification = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 12,
    payload: new Buffer('3')
  };
  var expectedOnTimeNotificationAck = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: expectedOnTimeNotification.id
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResponse);
  ctx.socket.scheduleResponse(4050, expectedOnTimeNotification);
  ctx.socket.expectRequest(4050, expectedOnTimeNotificationAck);
  ctx.socket.scheduleResponse(5050, expectedLateNotification);
  ctx.socket.expectRequest(5050, expectedLateNotificationAck);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  setTimeout(function() { ctx.client.cancel(req); }, 6000);

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 4);

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

    eventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[2][1],
      expectedOnTimeNotification,
      "Invalid on time notification."
    );

    eventSpy.args[3][0].should.be.equal('cancelled');
  };
});
