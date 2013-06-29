/*
 Handle a single Block2 confirmable notification:

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

 3. Client receives the #2 response. The #1 request emits the `acknowledged`
 event and the `response` event.

 4. After 2s, server sends the first notification with a Block2 option:
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
 Block2        : NUM: 0, M: false, SZX: 16
 ------------------------------------------------------------------------------
 Payload (1 byte)
 2
 ==============================================================================

 5. Client receives the #4 notification and sends an acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 6. The #1 request emits the `block received` event and the `response` event.

 7. Client cancels the #1 observer. The #1 request emits the `cancelled` event.
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
  var expectedNotification = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    block2: {num: 0, m: false, szx: 0},
    payload: new Buffer('2')
  };
  var expectedNotificationAck = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: expectedNotification.id
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResponse);
  ctx.socket.scheduleResponse(2050, expectedNotification);
  ctx.socket.expectRequest(2050, expectedNotificationAck);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  setTimeout(function() { ctx.client.cancel(req); }, 2500);

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 5);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'block received', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'cancelled'
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResponse, "Invalid `acknowledged`."
    );

    eventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], expectedResponse, "Invalid `response` #1."
    );

    eventSpy.args[2][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], expectedNotification, "Invalid `block received`."
    );

    eventSpy.args[3][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[3][1], expectedNotification, "Invalid `response` #2."
    );

    eventSpy.args[4][0].should.be.equal('cancelled');
  };
});
