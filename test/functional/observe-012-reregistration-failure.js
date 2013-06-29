/*
 Handle a failed re-registration of an observer after Max-Age ends:

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
 Uri-Path: expire
 ==============================================================================

 2. Server adds the #1 request as an observer and sends a piggy-backed response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 1
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 5
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
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 5
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

 6. The #1 request emits the `response` event.

 7. After Max-Age ends (5s), client emits the `exchange timeout` event and
 the #1 request emits the `timeout` event.

 8. Client resends the #1 request with an updated message ID and token
 (a new exchange is created):
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
 Uri-Path: expire
 ==============================================================================

 9. Server reboots with Observe support disabled...

 10. Server receives the #8 request and sends a piggy-backed response, but
 without an Observe option:
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

 11. Client receives the #10 response. The #8 request emits the `acknowledged`
 event, the `response` event and the `cancelled` event.
 */

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

  var expectedRequest1 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/observer/expire',
    observe: 0
  };
  var expectedResponse1 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedRequest1.id,
    token: expectedRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 5,
    observe: 1,
    payload: new Buffer('1')
  };
  var expectedNotification1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: expectedRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 5,
    observe: 2,
    payload: new Buffer('2')
  };
  var expectedNotificationAck1 = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: expectedNotification1.id
  };
  var expectedRequest2 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    token: new Buffer([0x01]),
    uri: '/observer/expire',
    observe: 0
  };
  var expectedResponse2 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedRequest2.id,
    token: expectedRequest2.token,
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer('2')
  };

  ctx.socket.expectRequest(expectedRequest1);
  ctx.socket.scheduleResponse(50, expectedResponse1);
  ctx.socket.scheduleResponse(2050, expectedNotification1);
  ctx.socket.expectRequest(2050, expectedNotificationAck1);
  ctx.socket.expectRequest(7050, expectedRequest2);
  ctx.socket.scheduleResponse(7100, expectedResponse2);

  var req = ctx.client.request(Message.fromObject(expectedRequest1));

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 7);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(eventSpy, 'cancelled');

    var c = -1;

    eventSpy.args[++c][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[c][1], expectedResponse1, "Invalid ACK #1."
    );

    eventSpy.args[++c][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[c][1], expectedResponse1, "Invalid `response` #1."
    );

    eventSpy.args[++c][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[c][1], expectedNotification1, "Invalid notification #1."
    );

    eventSpy.args[++c][0].should.be.equal('timeout');

    eventSpy.args[++c][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[c][1], expectedResponse2, "Invalid ACK #2."
    );

    eventSpy.args[++c][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[c][1], expectedResponse2, "Invalid `response` #2."
    );

    eventSpy.args[++c][0].should.be.equal('cancelled');
  };
});
