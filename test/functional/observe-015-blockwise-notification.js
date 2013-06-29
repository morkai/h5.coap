/*
 Handle a blockwise notification:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 1 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 2 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe : 0
 Uri-Path: observer
 Uri-Path: blocks
 ==============================================================================

 2. Server sends a piggy-backed response with a Block2 option:
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
 Block2        : NUM: 0, M: true, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 1111111111111111
 ==============================================================================

 3. Client receives the #2 response. Request emits the `acknowledged` event and
 the `block received` event.

 4. Server sends the second block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | CON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 1
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 Block2        : NUM: 1, M: false, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 2222222222222222
 ==============================================================================

 5. Client receives the #4 block and sends the acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 6. The #1 request emits the `block received` event and the `response` event.

 7. After 2s, server sends the first block of the first notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4322
 1       | CON  | 0 bytes      | 2.05 Content    | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 Block2        : NUM: 0, M: true, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 3333333333333333
 ==============================================================================

 8. Client receives the #7 message and sends an acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 9. The #1 request emits the `block received` event.

 10. Server receives the #8 acknowledgement and sends the next block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4323
 1       | CON  | 0 bytes      | 2.05 Content    | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 Block2        : NUM: 1, M: false, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 4444444444444444
 ==============================================================================

 11. Client receives the #10 message and acknowledges it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4323
 1       | ACK  | 0 bytes      | Empty           | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 12. The #1 request emits the `block received` event and the `response` event.

 13. Client cancels the #1 observer. The #1 request emits the `cancelled` event.

 14. After 2s, server sends the first block of the second notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4324
 1       | CON  | 0 bytes      | 2.05 Content    | 17188
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 3
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 Block2        : NUM: 0, M: true, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 5555555555555555
 ==============================================================================

 15. Client receives the #14 message but resets it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4324
 1       | RST  | 0 bytes      | Empty           | 17188
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 16. Server receives the #15 reset and removes the #1 observer. No more
 notifications are sent.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

  var request = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/observer/blocks',
    observe: 0
  };
  var responseBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: request.id,
    token: request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 1,
    block2: {num: 0, m: true, szx: 0},
    payload: new Buffer('1111111111111111')
  };
  var responseBlock1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 1,
    block2: {num: 1, m: false, szx: 0},
    payload: new Buffer('2222222222222222')
  };
  var responseBlock1Ack = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: responseBlock1.id
  };
  var response = {
    type: responseBlock1.type,
    code: responseBlock1.code,
    id: responseBlock1.id,
    token: responseBlock1.token,
    contentFormat: responseBlock1.contentFormat,
    maxAge: responseBlock1.maxAge,
    observe: responseBlock1.observe,
    block2: responseBlock1.block2,
    payload: Buffer.concat([responseBlock0.payload, responseBlock1.payload])
  };
  var notification1Block0 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    block2: {num: 0, m: true, szx: 0},
    payload: new Buffer('3333333333333333')
  };
  var notification1Block0Ack = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: notification1Block0.id
  };
  var notification1Block1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4323,
    token: request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    block2: {num: 1, m: false, szx: 0},
    payload: new Buffer('4444444444444444')
  };
  var notification1Block1Ack = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: notification1Block1.id
  };
  var notification1Response = {
    type: notification1Block1.type,
    code: notification1Block1.code,
    id: notification1Block1.id,
    token: notification1Block1.token,
    contentFormat: notification1Block1.contentFormat,
    maxAge: notification1Block1.maxAge,
    observe: notification1Block1.observe,
    block2: notification1Block1.block2,
    payload: Buffer.concat([
      notification1Block0.payload,
      notification1Block1.payload
    ])
  };
  var notification2Block0 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4324,
    token: request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 3,
    block2: {num: 0, m: true, szx: 0},
    payload: new Buffer('5555555555555555')
  };
  var notification2Block0Rst = {
    type: Message.Type.RST,
    code: Message.Type.EMPTY,
    id: notification2Block0.id
  };

  ctx.socket.expectRequest(request);
  ctx.socket.scheduleResponse(50, responseBlock0);
  ctx.socket.scheduleResponse(75, responseBlock1);
  ctx.socket.expectRequest(75, responseBlock1Ack);
  ctx.socket.scheduleResponse(2050, notification1Block0);
  ctx.socket.expectRequest(2050, notification1Block0Ack);
  ctx.socket.scheduleResponse(2075, notification1Block1);
  ctx.socket.expectRequest(2075, notification1Block1Ack);
  ctx.socket.scheduleResponse(4050, notification2Block0);
  ctx.socket.expectRequest(4050, notification2Block0Rst);

  var req = ctx.client.request(Message.fromObject(request));

  setTimeout(function() { ctx.client.cancel(req); }, 3000);

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
      eventSpy.args[0][1], responseBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], responseBlock0, "Invalid `block received` #1."
    );

    eventSpy.args[2][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], responseBlock1, "Invalid `block received` #2."
    );

    eventSpy.args[3][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[3][1], response, "Invalid `response` #1."
    );

    eventSpy.args[4][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[4][1], notification1Block0, "Invalid `block received` #3."
    );

    eventSpy.args[5][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[5][1], notification1Block1, "Invalid `block received` #4."
    );

    eventSpy.args[6][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[6][1], notification1Response, "Invalid `response` #2."
    );

    eventSpy.args[7][0].should.be.equal('cancelled');
  };
});
