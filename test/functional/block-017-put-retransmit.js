/*
 Handle retransmission of a confirmable, blockwise PUT request:

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
 Content-Format: text/plain;charset=utf-8
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |
 |-------------------------------------------------------------|
 |                           BLOCK 2                           |
 |-------------------------------------------------------------|
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
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 0, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |

 ==============================================================================

 3. Server confirms the first block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0002
 1       | ACK  | 0 bytes      | 2.04 Changed    | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 0, M: true, SZX: 3 (128 bytes)
 ==============================================================================

 4. Client receives the #3 confirmation. Request emits the `acknowledged` event
 and the `block sent` event.

 5. Client sends a request with the second block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0003
 1       | CON  | 0 bytes      | PUT             | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 1, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 2                           |

 ==============================================================================

 6. The #5 request is lost along the way...

 7. Client retransmits the #5 request...

 8. Servers receives the #5 request and confirms the second block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0003
 1       | ACK  | 0 bytes      | 2.04 Changed    | 3
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 1, M: true, SZX: 3 (128 bytes)
 ==============================================================================

 9. Client receives the #8 confirmation. The #1 request emits the `block sent`
 event.

 10. Client sends a request with the third, last block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0004
 1       | CON  | 0 bytes      | PUT             | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path      : blocks
 Uri-Path      : put
 Content-Format: text/plain;charset=utf-8
 Block1        : NUM: 2, M: false, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (63 bytes)
 |-------------------------------------------------------------|
 ==============================================================================

 11. Server confirms the last block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 0 | 0x0004
 1       | ACK  | 0 bytes      | 2.04 Changed    | 4
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Block1: NUM: 2, M: false, SZX: 3 (128 bytes)
 ==============================================================================

 12. Client receives the #11 confirmation. The #1 request emits the `block sent`
 event and the `response` event.
 */

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var request = {
    type: Message.Type.CON,
    code: Message.Code.PUT,
    uri: '/blocks/put',
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
        '|                           BLOCK 1                           |\n' +
        '|-------------------------------------------------------------|\n' +
        '|                           BLOCK 2                           |\n' +
        '|-------------------------------------------------------------|'
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
    block1: {num: 0, m: true, szx: 3}
  };
  var reqWithBlock1 = {
    type: request.type,
    code: request.code,
    id: 0x0003,
    uri: request.uri,
    block1: {num: 1, m: true, szx: 3},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(1 * 128, 2 * 128)
  };
  var resToBlock1 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock1.id,
    block1: {num: 1, m: true, szx: 3}
  };
  var reqWithBlock2 = {
    type: request.type,
    code: request.code,
    id: 0x0004,
    uri: request.uri,
    block1: {num: 2, m: false, szx: 3},
    contentFormat: request.contentFormat,
    payload: request.payload.slice(2 * 128, 3 * 128)
  };
  var resToBlock2 = {
    type: Message.Type.ACK,
    code: Message.Code.CHANGED,
    id: reqWithBlock2.id,
    block1: {num: 2, m: false, szx: 3}
  };

  ctx.socket.expectRequest(reqWithBlock0);
  ctx.socket.scheduleResponse(50, resToBlock0);
  ctx.socket.expectRequest(50, reqWithBlock1);
  ctx.socket.expectRequest(2050, reqWithBlock1);
  ctx.socket.scheduleResponse(2100, resToBlock1);
  ctx.socket.expectRequest(2100, reqWithBlock2);
  ctx.socket.scheduleResponse(2150, resToBlock2);

  var req = ctx.client.request(Message.fromObject(request), {
    blockSize: 128
  });

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
      eventSpy.args[2][1], resToBlock1, "Invalid `block sent` (#2)."
    );

    eventSpy.args[3][0].should.be.equal('block sent');
    sinon.assert.coapMessage(
      eventSpy.args[3][1], resToBlock2, "Invalid `block sent` (#3)."
    );

    eventSpy.args[4][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[4][1], resToBlock2, "Invalid `response`."
    );
  };
});
