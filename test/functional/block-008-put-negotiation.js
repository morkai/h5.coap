/*
 Handle an atomic response with a different block size to a confirmable,
 blockwise PUT request:

 1. User sends a request with the `blockSize` option set to `128`:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | PUT             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Uri-Path      : 32
 Content-Format: text/plain;charset=utf-8
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |
 |-------------------------------------------------------------|
 |                           BLOCK 2                           |
 ==============================================================================

 2. Client recognizes that the payload of the #1 request is bigger than
 the specified block size, so it constructs and sends the first Block1 request
 instead:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 0 bytes      | PUT             | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Uri-Path      : 32
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 0, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |

 ==============================================================================

 3. Server confirms the first block, but returns a lesser block size (32 instead
 of 128):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0002
 1       | ACK  | 0 bytes      | 2.04 Changed    | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 0, M: true, SZX: 1 (32 bytes)
 ==============================================================================

 4. Client receives the #3 confirmation. Request emits the `acknowledged` event
 and the `block sent` event.

 5. Client sends a request with the 5th block (128 bytes were already sent, then
 the server changed the block size to 32 bytes: 128/32=4):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0003
 1       | CON  | 0 bytes      | PUT             | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Uri-Path      : 32
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 4, M: true, SZX: 1 (32 bytes)
 ------------------------------------------------------------------------------
 Payload (32 bytes)
 |-------------------------------
 ==============================================================================

 6. Servers confirms the 5th block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0003
 1       | ACK  | 0 bytes      | 2.04 Changed    | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 4, M: true, SZX: 1 (32 bytes)
 ==============================================================================

 7. Client receives the #6 confirmation. Request emits the `block sent`.

 8. Client sends a request with the 6th block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0004
 1       | CON  | 0 bytes      | PUT             | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Uri-Path      : 32
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 5, M: true, SZX: 1 (32 bytes)
 ------------------------------------------------------------------------------
 Payload (32 bytes)
 ------------------------------|

 ==============================================================================

 9. Server confirms the 6th block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0004
 1       | ACK  | 0 bytes      | 2.04 Changed    | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 5, M: true, SZX: 1 (32 bytes)
 ==============================================================================

 10. Client receives the #9 confirmation. Request emits the `block sent` event.

 11. Client sends a request with the 7th block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0005
 1       | CON  | 0 bytes      | PUT             | 5
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Uri-Path      : 32
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 6, M: true, SZX: 1 (32 bytes)
 ------------------------------------------------------------------------------
 Payload (32 bytes)
 |                           BLOC
 ==============================================================================

 12. Server confirms the 7th block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0005
 1       | ACK  | 0 bytes      | 2.04 Changed    | 5
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 6, M: true, SZX: 1 (32 bytes)
 ==============================================================================

 13. Client receives the #12 confirmation. Request emits the `block sent` event.

 14. Client sends a request with the 8th, last block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0006
 1       | CON  | 0 bytes      | PUT             | 6
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Uri-Path      : 32
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 7, M: false, SZX: 1 (32 bytes)
 ------------------------------------------------------------------------------
 Payload (31 bytes)
 K 2                           |
 ==============================================================================

 15. Server confirms the last block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0006
 1       | ACK  | 0 bytes      | 2.04 Changed    | 6
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 7, M: false, SZX: 1 (32 bytes)
 ==============================================================================

 16. Client receives the #15 confirmation. Request emits the `block sent` event
 and the `response` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:99*/

  var request = {
    type: Message.Type.CON,
    code: Message.Code.PUT,
    uri: '/blocks/put/32',
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 1                           |\n' +
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 2                           |'
    )
  };
  var reqWithBlock0 = {
    type: request.type,
    code: request.code,
    id: 0x0002,
    uri: request.uri,
    block1: {num: 0, m: true, szx: 3},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(0 * 128, 1 * 128)
  };
  var resToBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock0.id,
    block1: {num: 0, m: true, szx: 1}
  };
  var reqWithBlock4 = {
    type: request.type,
    code: request.code,
    id: 0x0003,
    uri: request.uri,
    block1: {num: 4, m: true, szx: 1},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(4 * 32, 5 * 32)
  };
  var resToBlock4 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock4.id,
    block1: {num: 4, m: true, szx: 1}
  };
  var reqWithBlock5 = {
    type: request.type,
    code: request.code,
    id: 0x0004,
    uri: request.uri,
    block1: {num: 5, m: true, szx: 1},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(5 * 32, 6 * 32)
  };
  var resToBlock5 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock5.id,
    block1: {num: 5, m: true, szx: 1}
  };
  var reqWithBlock6 = {
    type: request.type,
    code: request.code,
    id: 0x0005,
    uri: request.uri,
    block1: {num: 6, m: true, szx: 1},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(6 * 32, 7 * 32)
  };
  var resToBlock6 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock6.id,
    block1: {num: 6, m: true, szx: 1}
  };
  var reqWithBlock7 = {
    type: request.type,
    code: request.code,
    id: 0x0006,
    uri: request.uri,
    block1: {num: 7, m: false, szx: 1},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(7 * 32, 8 * 32)
  };
  var resToBlock7 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock7.id,
    block1: {num: 7, m: false, szx: 1}
  };

  ctx.socket.expectRequest(reqWithBlock0);
  ctx.socket.scheduleResponse(50, resToBlock0);
  ctx.socket.expectRequest(50, reqWithBlock4);
  ctx.socket.scheduleResponse(100, resToBlock4);
  ctx.socket.expectRequest(100, reqWithBlock5);
  ctx.socket.scheduleResponse(150, resToBlock5);
  ctx.socket.expectRequest(150, reqWithBlock6);
  ctx.socket.scheduleResponse(200, resToBlock6);
  ctx.socket.expectRequest(200, reqWithBlock7);
  ctx.socket.scheduleResponse(250, resToBlock7);

  var req = ctx.client.request(Message.fromObject(request), {
    blockSize: 128
  });

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
      eventSpy, 'block sent', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], resToBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], resToBlock0, "Invalid `block sent` (#1)."
    );

    eventSpy.args[2][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], resToBlock4, "Invalid `block sent` (#2)."
    );

    eventSpy.args[3][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[3][1], resToBlock5, "Invalid `block sent` (#3)."
    );

    eventSpy.args[4][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[4][1], resToBlock6, "Invalid `block sent` (#4)."
    );

    eventSpy.args[5][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[5][1], resToBlock7, "Invalid `block sent` (#5)."
    );

    eventSpy.args[6][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[6][1], resToBlock7, "Invalid `response`."
    );
  };
});
