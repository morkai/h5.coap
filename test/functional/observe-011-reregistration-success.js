/*
 Handle a re-registration of an observer after Max-Age ends:

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

 9. Server replaces the #1 observer with the #8 one and sends a piggy-backed
 response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 1 byte       | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 5
 ------------------------------------------------------------------------------
 Payload (1 byte)
 2
 ==============================================================================

 10. Client receives the #9 response. The #8 request emits the `acknowledged`
 event and the `response` event.

 11. After 2s, server sends another notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x4322
 1       | CON  | 1 byte       | 2.05 Content    | 17186
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 3
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 5
 ------------------------------------------------------------------------------
 Payload (1 byte)
 3
 ==============================================================================

 12. Client receives the #11 notification and sends an acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 13. Client cancels the #8 observer, which in turn emits the `cancelled` event.
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
    maxAge: 5,
    observe: 2,
    payload: new Buffer('2')
  };
  var expectedNotification2 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: expectedRequest2.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 5,
    observe: 3,
    payload: new Buffer('3')
  };
  var expectedNotificationAck2 = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: expectedNotification2.id
  };

  ctx.socket.expectRequest(expectedRequest1);
  ctx.socket.scheduleResponse(50, expectedResponse1);
  ctx.socket.scheduleResponse(2050, expectedNotification1);
  ctx.socket.expectRequest(2050, expectedNotificationAck1);
  ctx.socket.expectRequest(7050, expectedRequest2);
  ctx.socket.scheduleResponse(7100, expectedResponse2);
  ctx.socket.scheduleResponse(9100, expectedNotification2);
  ctx.socket.expectRequest(9100, expectedNotificationAck2);

  var req = ctx.client.request(Message.fromObject(expectedRequest1));

  setTimeout(function() { ctx.client.cancel(req); }, 10000);

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 8);

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
      eventSpy.args[0][1], expectedResponse1, "Invalid ACK #1."
    );

    eventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], expectedResponse1, "Invalid `response` #1."
    );

    eventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], expectedNotification1, "Invalid notification #1."
    );

    eventSpy.args[3][0].should.be.equal('timeout');

    eventSpy.args[4][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[4][1], expectedResponse2, "Invalid ACK #2."
    );

    eventSpy.args[5][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[5][1], expectedResponse2, "Invalid `response` #2."
    );

    eventSpy.args[6][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[6][1], expectedNotification2, "Invalid notification #2."
    );

    eventSpy.args[7][0].should.be.equal('cancelled');
  };
});
